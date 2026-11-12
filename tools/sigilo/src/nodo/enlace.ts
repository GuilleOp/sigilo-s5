// `sigilo rotar-llaves --enlace`: nueva época de los secretos de enlace con la SESNA. Genera una
// llave de enlace nueva (pendiente) y un archivo de rotación firmado por el nodo para la SESNA. Con
// `--aplicar`, cuando la SESNA confirma que ya la aceptó, la llave pendiente pasa a vigente y se
// derivan los secretos nuevos (relay-secret.json y oauth-clients.json). Los tokens vigentes vencen
// en 5 minutos; los sobres que no entren mientras tanto esperan en la cola de la SESNA.
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { KeysFileSchema, PDN_SCOPES } from '@sigilo/contracts';
import { fromBase64Url, generateBoxKeyPair, toBase64Url } from '@sigilo/core';
import { deriveLinkSecrets, encodePublicKey, signLinkRotation } from '@sigilo/red';
import { clientSecretDigest } from '../../../../apps/server/src/network/oauth-server.ts';
import { CliError, hasFlag, readJson, todayOf, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { nodePaths, readInstallRecord, readLinkKey, readNetworkPackage } from './comun.ts';
import type { LinkKeyFile } from './comun.ts';

/** Deriva y escribe los secretos de enlace de la época de la llave dada. */
export function writeLinkSecrets(
  ctx: Context,
  link: LinkKeyFile & { privateKey: Uint8Array },
): void {
  const paths = nodePaths(ctx);
  const pkg = readNetworkPackage(paths.network);
  const secrets = deriveLinkSecrets({
    ownPrivateKey: link.privateKey,
    peerPublicKey: fromBase64Url(pkg.enlace.boxPublicKey),
    nodeId: link.nodeId,
    epoch: link.epoca,
  });
  writeJson(paths.relaySecret, { version: 1, nodeId: link.nodeId, secret: secrets.relaySecret });
  writeJson(paths.oauthClients, {
    version: 1,
    clients: [
      {
        clientId: 'sesna',
        clientSecretDigest: clientSecretDigest(secrets.oauthClientSecret),
        scopes: [PDN_SCOPES.deliveries, PDN_SCOPES.statistics, PDN_SCOPES.health],
        grantTypes: ['client_credentials'],
      },
    ],
  });
}

/** `sigilo rotar-llaves --enlace [--aplicar]`. */
export function rotateLink(ctx: Context): number {
  if (!hasFlag(ctx, 'enlace')) {
    throw new CliError(
      'Por ahora solo se rota el enlace con la SESNA: ./sigilo rotar-llaves --enlace. Las autoridades rotan con «Crear mis llaves»; la llave de firma del nodo, en una versión futura.',
    );
  }
  const record = readInstallRecord(ctx);
  const paths = nodePaths(ctx);
  if (hasFlag(ctx, 'aplicar')) {
    if (!existsSync(paths.pendingLinkKey)) {
      throw new CliError(
        'No hay una rotación pendiente. Empieza con: ./sigilo rotar-llaves --enlace',
      );
    }
    const pending = readLinkKey(paths.pendingLinkKey);
    writeLinkSecrets(ctx, pending);
    renameSync(paths.pendingLinkKey, paths.linkKey);
    ctx.screen.ok(`Enlace con la SESNA en la época ${pending.epoca}: secretos nuevos derivados.`);
    ctx.screen.line('El envoltorio reinicia el nodo. Revisa con ./sigilo diagnostico.');
    return 0;
  }
  const current = readLinkKey(paths.linkKey);
  const epoch = current.epoca + 1;
  const pair = generateBoxKeyPair();
  const encoded = encodePublicKey(pair.publicKey);
  const pending: LinkKeyFile = {
    version: 1,
    nodeId: record.nodeId,
    epoca: epoch,
    keyId: encoded.keyId,
    boxPublicKey: encoded.publicKey,
    boxPrivateKey: toBase64Url(pair.privateKey),
  };
  pair.privateKey.fill(0);
  const keys = KeysFileSchema.parse(readJson(paths.keys, 'datos/keys.json'));
  const signingKey = fromBase64Url(keys.server.signingPrivateKey);
  const rotation = signLinkRotation(
    {
      tipo: 'sigilo/rotacion-enlace',
      v: 1,
      nodeId: record.nodeId,
      creada: todayOf(ctx),
      enlace: { keyId: encoded.keyId, boxPublicKey: encoded.publicKey, epoca: epoch },
    },
    signingKey,
  );
  signingKey.fill(0);
  writeJson(paths.pendingLinkKey, pending);
  const name = `rotacion-enlace-${record.slug}-e${epoch}.json`;
  writeJson(join(paths.output, name), rotation, 0o644);
  ctx.screen.ok(`Llave de enlace nueva (época ${epoch}), pendiente`);
  ctx.screen.ok(`Rotación firmada → salida/${name}`);
  ctx.screen.line(
    'Envíala a la SESNA. Cuando te confirme que la aceptó: ./sigilo rotar-llaves --enlace --aplicar',
  );
  return 0;
}
