// Estructura de la carpeta del nodo y lectura de lo que dejó `sigilo instalar`:
//   red.json              paquete de la red que entrega la SESNA (público)
//   .env                  compose: imagen, usuario, perfil de TLS y dominio
//   config/               nodo.env, Caddyfile, instalacion.json, tabla-de-funciones.csv,
//                         dias-inhabiles.csv (sin secretos)
//   datos/        (0700)  volumen del nodo: keys.json, red-node-key.json, relay-secret.json,
//                         oauth-clients.json, authority-accounts.json, network-trust.json,
//                         directory.json, web-config.json, dias-inhabiles.json, sigilo.db, evidence/
//   llaves/       (0700)  llave de enlace con la SESNA (no entra al volumen del nodo)
//   salida/               lo que se entrega: solicitud de alta, llave del buzón (para sacarla),
//                         tablas firmadas, rotaciones, respaldos y diagnósticos
//   tls/          (0700)  certificados de Caddy
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { NetworkStateKeySchema, NodeIdSchema } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor } from '@sigilo/core';
import { verifyNetworkPackage } from '@sigilo/red';
import type { NetworkPackage } from '@sigilo/red';
import { CliError, inBase, readJson } from '../base.ts';
import type { Context } from '../base.ts';
import { TlsModeSchema } from '../plantillas.ts';

/** Rutas de la instalación del nodo. */
export function nodePaths(ctx: Pick<Context, 'base'>) {
  return {
    network: inBase(ctx, 'red.json'),
    env: inBase(ctx, '.env'),
    config: inBase(ctx, 'config'),
    nodeEnv: inBase(ctx, 'config', 'nodo.env'),
    caddyfile: inBase(ctx, 'config', 'Caddyfile'),
    record: inBase(ctx, 'config', 'instalacion.json'),
    tableCsv: inBase(ctx, 'config', 'tabla-de-funciones.csv'),
    restDaysCsv: inBase(ctx, 'config', 'dias-inhabiles.csv'),
    data: inBase(ctx, 'datos'),
    keys: inBase(ctx, 'datos', 'keys.json'),
    nodeBoxKey: inBase(ctx, 'datos', 'red-node-key.json'),
    relaySecret: inBase(ctx, 'datos', 'relay-secret.json'),
    oauthClients: inBase(ctx, 'datos', 'oauth-clients.json'),
    accounts: inBase(ctx, 'datos', 'authority-accounts.json'),
    trust: inBase(ctx, 'datos', 'network-trust.json'),
    directory: inBase(ctx, 'datos', 'directory.json'),
    webConfig: inBase(ctx, 'datos', 'web-config.json'),
    restDays: inBase(ctx, 'datos', 'dias-inhabiles.json'),
    database: inBase(ctx, 'datos', 'sigilo.db'),
    keysDir: inBase(ctx, 'llaves'),
    linkKey: inBase(ctx, 'llaves', 'enlace-key.json'),
    pendingLinkKey: inBase(ctx, 'llaves', 'enlace-key.pendiente.json'),
    output: inBase(ctx, 'salida'),
    backups: inBase(ctx, 'salida', 'respaldos'),
    tls: inBase(ctx, 'tls'),
  };
}

/** Registro de la instalación (`config/instalacion.json`), sin secretos. */
export const InstallRecordSchema = z
  .object({
    v: z.literal(1),
    tipo: z.literal('nodo'),
    nodeId: NodeIdSchema,
    slug: z.string().min(1).max(60),
    estado: z.object({ code: NetworkStateKeySchema.nullable(), name: z.string() }).strict(),
    institucion: z.string().min(1),
    nombreNodo: z.string().min(1),
    dominio: z.string().min(1),
    tls: TlsModeSchema,
    buzonId: z.string().min(1),
    instalado: z.string(),
    version: z.string(),
  })
  .strict();
export type InstallRecord = z.infer<typeof InstallRecordSchema>;

/** Llave X25519 de enlace con la SESNA (`llaves/enlace-key.json`). */
export const LinkKeyFileSchema = z
  .object({
    version: z.literal(1),
    nodeId: NodeIdSchema,
    epoca: z.number().int().min(1),
    keyId: z.string(),
    boxPublicKey: z.string(),
    boxPrivateKey: z.string(),
  })
  .strict();
export type LinkKeyFile = z.infer<typeof LinkKeyFileSchema>;

/** Lee y verifica `red.json`. Lanza error si falta o su firma no verifica. */
export function readNetworkPackage(path: string): NetworkPackage {
  const pkg = verifyNetworkPackage(readJson(path, 'el paquete de la red (red.json)'));
  if (pkg === null) {
    throw new CliError(
      'red.json no es válido o su firma no verifica. No sigas: pide a la SESNA la descarga oficial.',
    );
  }
  return pkg;
}

/** Lee el registro de la instalación. Lanza error si el nodo no está instalado. */
export function readInstallRecord(ctx: Pick<Context, 'base'>): InstallRecord {
  const path = nodePaths(ctx).record;
  if (!existsSync(path)) {
    throw new CliError('Este equipo no tiene un nodo instalado. Corre primero: ./sigilo instalar');
  }
  const parsed = InstallRecordSchema.safeParse(readJson(path, 'config/instalacion.json'));
  if (!parsed.success) throw new CliError('config/instalacion.json no tiene el formato esperado.');
  return parsed.data;
}

/** Lee la llave de enlace (vigente o pendiente) y comprueba su identificador. */
export function readLinkKey(path: string): LinkKeyFile & { privateKey: Uint8Array } {
  const parsed = LinkKeyFileSchema.safeParse(readJson(path, 'la llave de enlace'));
  if (!parsed.success) throw new CliError('La llave de enlace no tiene el formato esperado.');
  const privateKey = fromBase64Url(parsed.data.boxPrivateKey);
  if (keyIdFor(fromBase64Url(parsed.data.boxPublicKey)) !== parsed.data.keyId) {
    throw new CliError('La llave de enlace no corresponde a su identificador.');
  }
  return { ...parsed.data, privateKey };
}
