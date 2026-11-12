// `sigilo-sesna publicar <propuesta> <cofirmas…|carpeta>`: junta las cofirmas de los testigos,
// verifica la versión contra la vigente (o contra la raíz, la primera vez), la instala en
// `datos/directory.json` y deriva los secretos de enlace de los nodos nuevos en
// `relay-secrets.json` y `node-credentials.json` (0600), con el formato que ya lee el enrutador.
// El envoltorio reinicia el enrutador.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SignedAuthorityDirectorySchema, WebRuntimeConfigSchema } from '@sigilo/contracts';
import type { SignedAuthorityDirectory, WitnessSignature } from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import {
  DirectoryCosignatureFileSchema,
  deriveLinkSecrets,
  verifyDirectoryUpdate,
  verifySignedDirectory,
} from '@sigilo/red';
import type { NodeLinkKey } from '@sigilo/red';
import { z } from 'zod';
import { NODE_CREDENTIALS_FILE_NAME } from '../../../../apps/enrutador/src/oauth/node-credentials.ts';
import { CliError, readJson, todayOf, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { directoryChanges } from '../resumen-cambios.ts';
import {
  LinksFileSchema,
  readLinks,
  readPublished,
  readSesnaLinkKey,
  readTrust,
  sesnaPaths,
} from './comun.ts';

const RelaySecretsSchema = z
  .object({ version: z.literal(1), secrets: z.record(z.string(), z.string()) })
  .strict();
const NodeCredentialsSchema = z
  .object({ version: z.literal(1), nodes: z.record(z.string(), z.unknown()) })
  .strict();

/**
 * Deriva y escribe los secretos de enlace de los nodos dados (alta o rotación) en los archivos del
 * enrutador, y guarda sus llaves públicas de enlace en `altas/enlaces.json`.
 */
export function applyLinks(ctx: Context, entries: Record<string, NodeLinkKey>): void {
  if (Object.keys(entries).length === 0) return;
  const paths = sesnaPaths(ctx);
  const linkKey = readSesnaLinkKey(ctx);
  const relay = existsSync(paths.relaySecrets)
    ? RelaySecretsSchema.parse(readJson(paths.relaySecrets, 'relay-secrets.json'))
    : { version: 1 as const, secrets: {} };
  const credentials = existsSync(paths.nodeCredentials)
    ? NodeCredentialsSchema.parse(readJson(paths.nodeCredentials, NODE_CREDENTIALS_FILE_NAME))
    : { version: 1 as const, nodes: {} };
  const links = readLinks(ctx);
  for (const [nodeId, link] of Object.entries(entries)) {
    const secrets = deriveLinkSecrets({
      ownPrivateKey: linkKey,
      peerPublicKey: fromBase64Url(link.boxPublicKey),
      nodeId,
      epoch: link.epoca,
    });
    relay.secrets[nodeId] = secrets.relaySecret;
    credentials.nodes[nodeId] = {
      clientId: 'sesna',
      clientSecret: secrets.oauthClientSecret,
      grantType: 'client_credentials',
    };
    links.nodos[nodeId] = link;
  }
  linkKey.fill(0);
  writeJson(paths.relaySecrets, relay, 0o600);
  writeJson(paths.nodeCredentials, credentials, 0o600);
  writeJson(paths.links, LinksFileSchema.parse(links), 0o644);
}

function cosignatureFiles(paths: readonly string[]): string[] {
  return paths.flatMap((path) =>
    existsSync(path) && statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.json'))
          .map((name) => join(path, name))
      : [path],
  );
}

/** Publica la propuesta con sus cofirmas. */
export function publish(ctx: Context): number {
  const { screen } = ctx;
  const [proposalPath, ...rest] = ctx.args.positional;
  if (proposalPath === undefined) {
    throw new CliError(
      'Uso: ./sigilo-sesna publicar propuestas/directorio-propuesto-N.json cofirmas/',
    );
  }
  const paths = sesnaPaths(ctx);
  const proposal = SignedAuthorityDirectorySchema.parse(readJson(proposalPath, proposalPath));
  const { serial } = proposal.directory;
  const signatures: WitnessSignature[] = [...proposal.witnessSignatures];
  for (const file of cosignatureFiles(rest.length === 0 ? [paths.cosignatures] : rest)) {
    const parsed = DirectoryCosignatureFileSchema.safeParse(readJson(file, file));
    // Las cofirmas de otra versión se ignoran (la carpeta puede tener las de versiones anteriores).
    if (!parsed.success || parsed.data.serial !== serial || parsed.data.digest !== proposal.digest)
      continue;
    signatures.push(parsed.data.cofirma);
  }
  const candidate: SignedAuthorityDirectory = {
    ...proposal,
    witnessSignatures: [...new Map(signatures.map((item) => [item.witnessId, item])).values()].sort(
      (left, right) => left.witnessId.localeCompare(right.witnessId),
    ),
  };
  const current = readPublished(ctx);
  const result =
    current === null
      ? verifySignedDirectory(candidate, readTrust(ctx), { today: todayOf(ctx) })
      : verifyDirectoryUpdate(current, candidate);
  if (!result.valid) {
    const trust = readTrust(ctx);
    const reason =
      result.reason === 'witnesses'
        ? `faltan cofirmas: se exigen ${trust.threshold} de ${trust.witnesses.length}`
        : result.reason === 'sequence'
          ? `no es la versión siguiente de la ${current?.directory.serial ?? 0}; rehaz la propuesta sobre la vigente`
          : result.reason;
    throw new CliError(`El directorio ${serial} no se puede publicar (${reason}).`, 2);
  }
  screen.ok(`Cofirmado por ${result.witnesses.join(', ')}`);
  for (const line of directoryChanges(current?.directory ?? null, candidate.directory)) {
    screen.line(`    ${line}`);
  }
  writeJson(paths.directory, candidate, 0o644);
  // Secretos de enlace de los nodos nuevos de esta versión.
  const pendingPath = join(paths.proposals, `enlaces-${serial}.json`);
  if (existsSync(pendingPath)) {
    applyLinks(ctx, LinksFileSchema.parse(readJson(pendingPath, pendingPath)).nodos);
  }
  // La ventanilla fija el serial mínimo que conoce (H10).
  if (existsSync(paths.webConfig)) {
    const webConfig = WebRuntimeConfigSchema.parse(readJson(paths.webConfig, 'web-config.json'));
    if (webConfig.networkTrust !== null) {
      writeJson(
        paths.webConfig,
        { ...webConfig, networkTrust: { ...webConfig.networkTrust, minDirectorySerial: serial } },
        0o644,
      );
    }
  }
  const added = candidate.directory.nodes
    .filter((node) => !current?.directory.nodes.some((item) => item.id === node.id))
    .map((node) => node.id);
  screen.ok(`Directorio ${serial} publicado en datos/directory.json`);
  screen.line(
    added.length > 0
      ? `Avísale a ${added.join(', ')} que ya puede correr ./sigilo iniciar`
      : 'Avisa a los estados que corran ./sigilo directorio actualizar (o espera la tarea diaria).',
  );
  return 0;
}
