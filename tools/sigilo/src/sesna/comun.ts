// Estructura de la carpeta de la SESNA:
//   red.json             paquete de la red que se entrega a cada estado (público)
//   .env                 compose: imagen, usuario, perfil de TLS y dominio
//   config/              enrutador.env (0600: token de operación), Caddyfile, instalacion.json,
//                        testigos.json (observadores del directorio génesis)
//   datos/       (0700)  volumen del enrutador: operator-key.json, trust.json, directory.json,
//                        relay-secrets.json, node-credentials.json, web-config.json, enrutador.db
//   llaves/      (0700)  llave de enlace de la SESNA (no entra al volumen del enrutador)
//   testigos/            archivos públicos de cada testigo (testigo-<id>.publico.json)
//   propuestas/          directorio-propuesto-<n>.json y enlaces-<n>.json (públicos)
//   cofirmas/            cofirma-<testigo>-<n>.json que devuelven los testigos
//   altas/               expediente: solicitudes aceptadas (con su contacto) y enlaces.json
import { z } from 'zod';
import {
  DirectoryObserverSchema,
  NetworkTrustAnchorSchema,
  SignedAuthorityDirectorySchema,
} from '@sigilo/contracts';
import type { NetworkTrustAnchor, SignedAuthorityDirectory } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor } from '@sigilo/core';
import { NodeLinkKeySchema, signingPublicKeyOf } from '@sigilo/red';
import { existsSync } from 'node:fs';
import { CliError, inBase, readJson } from '../base.ts';
import type { Context } from '../base.ts';
import { TlsModeSchema } from '../plantillas.ts';

/** Rutas de la instalación de la SESNA. */
export function sesnaPaths(ctx: Pick<Context, 'base'>) {
  return {
    network: inBase(ctx, 'red.json'),
    env: inBase(ctx, '.env'),
    config: inBase(ctx, 'config'),
    routerEnv: inBase(ctx, 'config', 'enrutador.env'),
    caddyfile: inBase(ctx, 'config', 'Caddyfile'),
    record: inBase(ctx, 'config', 'instalacion.json'),
    observers: inBase(ctx, 'config', 'testigos.json'),
    data: inBase(ctx, 'datos'),
    operatorKey: inBase(ctx, 'datos', 'operator-key.json'),
    trust: inBase(ctx, 'datos', 'trust.json'),
    directory: inBase(ctx, 'datos', 'directory.json'),
    relaySecrets: inBase(ctx, 'datos', 'relay-secrets.json'),
    nodeCredentials: inBase(ctx, 'datos', 'node-credentials.json'),
    webConfig: inBase(ctx, 'datos', 'web-config.json'),
    keysDir: inBase(ctx, 'llaves'),
    linkKey: inBase(ctx, 'llaves', 'enlace-key.json'),
    witnesses: inBase(ctx, 'testigos'),
    proposals: inBase(ctx, 'propuestas'),
    cosignatures: inBase(ctx, 'cofirmas'),
    joins: inBase(ctx, 'altas'),
    links: inBase(ctx, 'altas', 'enlaces.json'),
    output: inBase(ctx, 'salida'),
    tls: inBase(ctx, 'tls'),
  };
}

/** Registro de la instalación de la SESNA, sin secretos. */
export const SesnaRecordSchema = z
  .object({
    v: z.literal(1),
    tipo: z.literal('sesna'),
    dominio: z.string(),
    operacion: z.string(),
    tls: TlsModeSchema,
    instalado: z.string(),
    version: z.string(),
  })
  .strict();
export type SesnaRecord = z.infer<typeof SesnaRecordSchema>;

/** Observadores del directorio génesis (los testigos). */
export const ObserversFileSchema = z
  .object({ v: z.literal(1), observadores: z.array(DirectoryObserverSchema).min(1) })
  .strict();

/** Llaves de enlace aceptadas de cada nodo (públicas), con su época. */
export const LinksFileSchema = z
  .object({ v: z.literal(1), nodos: z.record(z.string(), NodeLinkKeySchema) })
  .strict();
export type LinksFile = z.infer<typeof LinksFileSchema>;

/** Llave de enlace de la SESNA (`llaves/enlace-key.json`). */
export const SesnaLinkKeySchema = z
  .object({
    version: z.literal(1),
    keyId: z.string(),
    boxPublicKey: z.string(),
    boxPrivateKey: z.string(),
  })
  .strict();

export function readSesnaRecord(ctx: Pick<Context, 'base'>): SesnaRecord {
  const path = sesnaPaths(ctx).record;
  if (!existsSync(path)) {
    throw new CliError(
      'Este equipo no tiene la ventanilla instalada. Corre primero: ./sigilo-sesna instalar',
    );
  }
  return SesnaRecordSchema.parse(readJson(path, 'config/instalacion.json'));
}

export function readTrust(ctx: Pick<Context, 'base'>): NetworkTrustAnchor {
  return NetworkTrustAnchorSchema.parse(readJson(sesnaPaths(ctx).trust, 'datos/trust.json'));
}

/** Llave privada de la operación; comprueba que sea la de la raíz. */
export function readOperatorKey(ctx: Pick<Context, 'base'>): Uint8Array {
  const raw = readJson(sesnaPaths(ctx).operatorKey, 'la llave de la operación') as {
    signingPrivateKey?: string;
  };
  const key = fromBase64Url(raw.signingPrivateKey ?? '');
  if (key.length !== 32 || keyIdFor(signingPublicKeyOf(key)) !== readTrust(ctx).operatorKeyId) {
    throw new CliError('La llave de la operación no corresponde a la raíz de la red.');
  }
  return key;
}

/** Directorio publicado vigente, o `null` antes del primer alta. */
export function readPublished(ctx: Pick<Context, 'base'>): SignedAuthorityDirectory | null {
  const path = sesnaPaths(ctx).directory;
  return existsSync(path)
    ? SignedAuthorityDirectorySchema.parse(readJson(path, 'datos/directory.json'))
    : null;
}

export function readLinks(ctx: Pick<Context, 'base'>): LinksFile {
  const path = sesnaPaths(ctx).links;
  return existsSync(path)
    ? LinksFileSchema.parse(readJson(path, 'altas/enlaces.json'))
    : { v: 1, nodos: {} };
}

/** Llave privada de enlace de la SESNA. */
export function readSesnaLinkKey(ctx: Pick<Context, 'base'>): Uint8Array {
  const parsed = SesnaLinkKeySchema.parse(
    readJson(sesnaPaths(ctx).linkKey, 'la llave de enlace de la SESNA'),
  );
  const key = fromBase64Url(parsed.boxPrivateKey);
  if (keyIdFor(fromBase64Url(parsed.boxPublicKey)) !== parsed.keyId) {
    throw new CliError('La llave de enlace de la SESNA no corresponde a su identificador.');
  }
  return key;
}
