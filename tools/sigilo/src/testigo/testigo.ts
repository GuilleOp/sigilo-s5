// Comandos de un testigo (CPC, ASF, academia…), cada uno en su propio equipo:
// - `sigilo testigo crear-llave`: su llave Ed25519. La privada (`testigo-<id>.llave.json`, con el
//   formato `witness-key.json` del proceso testigo) se queda con el testigo; la pública
//   (`testigo-<id>.publico.json`) va a la SESNA y su huella se confirma por teléfono.
// - `sigilo testigo cofirmar <propuesta>`: recalcula el resumen de cambios contra la versión
//   vigente (de la ventanilla o de `--vigente <archivo>`), pregunta y cofirma. Es la parte de la
//   ceremonia que no se automatiza sin debilitar el m de n.
import { join } from 'node:path';
import { z } from 'zod';
import {
  NETWORK_ROUTES,
  ObserverIdSchema,
  ObserverKindSchema,
  SignedAuthorityDirectorySchema,
} from '@sigilo/contracts';
import type { SignedAuthorityDirectory } from '@sigilo/contracts';
import { fromBase64Url, generateSigningKeyPair, keyIdFor, toBase64Url } from '@sigilo/core';
import { cosignDirectory, signingPublicKeyOf } from '@sigilo/red';
import type { DirectoryCosignatureFile, WitnessPublicFile } from '@sigilo/red';
import { CliError, flag, readJson, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { directoryChanges } from '../resumen-cambios.ts';
import { witnessFingerprint } from '../sesna/instalar.ts';

/** Archivo privado del testigo: el mismo formato que lee el proceso testigo (`witness-key.json`). */
const WitnessKeyFileSchema = z
  .object({
    version: z.literal(1),
    witnessId: z.string(),
    keyId: z.string(),
    signingPrivateKey: z.string(),
  })
  .strict();

function outputDir(ctx: Context): string {
  return flag(ctx, 'salida') ?? join(ctx.base, 'salida');
}

/** `sigilo testigo crear-llave`. */
export async function createWitnessKey(ctx: Context): Promise<number> {
  const { screen, answers } = ctx;
  const id = await answers.ask({
    key: 'id',
    text: 'Identificador del testigo (observer.<nombre>, por ejemplo observer.cpc-nacional)',
    validate: (value) =>
      ObserverIdSchema.safeParse(value).success ? null : 'Forma observer.<nombre>.',
  });
  const name = await answers.ask({
    key: 'nombre',
    text: 'Nombre oficial de la institución testigo',
  });
  const kind = await answers.ask({
    key: 'clase',
    text: 'Tipo: cpc, audit-institution, civil-society o academia',
    default: 'cpc',
    validate: (value) => (ObserverKindSchema.safeParse(value).success ? null : 'Tipo inválido.'),
  });
  const pair = generateSigningKeyPair();
  const keyId = keyIdFor(pair.publicKey);
  const directory = outputDir(ctx);
  const publicFile: WitnessPublicFile = {
    tipo: 'sigilo/testigo',
    v: 1,
    id,
    nombre: name,
    clase: ObserverKindSchema.parse(kind),
    signingKeyId: keyId,
    signingPublicKey: toBase64Url(pair.publicKey),
  };
  writeJson(join(directory, `testigo-${id}.llave.json`), {
    version: 1,
    witnessId: id,
    keyId,
    signingPrivateKey: toBase64Url(pair.privateKey),
  });
  writeJson(join(directory, `testigo-${id}.publico.json`), publicFile, 0o644);
  pair.privateKey.fill(0);
  screen.ok(`Llave privada → testigo-${id}.llave.json (guárdala fuera de línea; nunca la envíes)`);
  screen.ok(`Parte pública → testigo-${id}.publico.json (envíala a la SESNA)`);
  screen.line('La SESNA te llamará para confirmar esta huella:');
  screen.line(`        ${witnessFingerprint(publicFile.signingPublicKey)}`);
  return 0;
}

async function currentDirectory(ctx: Context): Promise<SignedAuthorityDirectory | null> {
  const file = flag(ctx, 'vigente');
  if (file !== undefined) {
    return file === 'ninguno'
      ? null
      : SignedAuthorityDirectorySchema.parse(readJson(file, 'el directorio vigente'));
  }
  const ventanilla = flag(ctx, 'ventanilla');
  if (ventanilla === undefined) {
    throw new CliError(
      'Indica contra qué versión comparas: --ventanilla https://<ventanilla> (la publicada), --vigente <archivo> o --vigente ninguno (la primera).',
    );
  }
  const response = await ctx.fetch(`${ventanilla}${NETWORK_ROUTES.directory}`, { method: 'GET' });
  if (!response.ok) throw new CliError(`La ventanilla respondió ${response.status}.`);
  return SignedAuthorityDirectorySchema.parse(await response.json());
}

/** `sigilo testigo cofirmar <propuesta> --llave <archivo>`. */
export async function cosign(ctx: Context): Promise<number> {
  const { screen, answers } = ctx;
  const proposalPath = ctx.args.positional[0];
  const keyPath = flag(ctx, 'llave');
  if (proposalPath === undefined || keyPath === undefined) {
    throw new CliError(
      'Uso: ./sigilo testigo cofirmar <directorio-propuesto-N.json> --llave testigo-<id>.llave.json',
    );
  }
  const key = WitnessKeyFileSchema.parse(readJson(keyPath, 'la llave del testigo'));
  const privateKey = fromBase64Url(key.signingPrivateKey);
  if (keyIdFor(signingPublicKeyOf(privateKey)) !== key.keyId) {
    throw new CliError('La llave del testigo no corresponde a su identificador.');
  }
  const proposal = SignedAuthorityDirectorySchema.parse(readJson(proposalPath, proposalPath));
  const current = await currentDirectory(ctx);
  const { serial } = proposal.directory;
  if (current !== null && serial !== current.directory.serial + 1) {
    throw new CliError(
      `La propuesta es la versión ${serial}, pero la vigente es ${current.directory.serial}.`,
    );
  }
  if (current !== null && proposal.directory.previousDigest !== current.digest) {
    throw new CliError('La propuesta no encadena con la versión vigente. No cofirmes.');
  }
  screen.line(`Directorio propuesto ${serial} (recalculado por ti contra la versión vigente):`);
  for (const line of directoryChanges(current?.directory ?? null, proposal.directory)) {
    screen.line(`    ${line}`);
  }
  const agrees = await answers.confirm('si', '¿Cofirmas esta versión?', false);
  if (!agrees) {
    screen.line('No se cofirmó.');
    return 1;
  }
  // `cosignDirectory` recalcula el digesto: se cofirma lo que se revisó, no lo que dice el archivo.
  const signed = cosignDirectory(proposal, key.witnessId, privateKey);
  privateKey.fill(0);
  const own = signed.witnessSignatures.find((item) => item.witnessId === key.witnessId);
  if (own === undefined) throw new CliError('No se pudo cofirmar.');
  const file: DirectoryCosignatureFile = {
    tipo: 'sigilo/cofirma-directorio',
    v: 1,
    serial,
    digest: signed.digest,
    cofirma: own,
  };
  const name = `cofirma-${key.witnessId}-${serial}.json`;
  writeJson(join(outputDir(ctx), name), file, 0o644);
  screen.ok(`Cofirma → ${name} (envíala a la SESNA)`);
  return 0;
}
