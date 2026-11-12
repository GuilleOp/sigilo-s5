// Credenciales OAuth 2.0 que cada nodo entregó a la SESNA (`node-credentials.json` en el
// directorio de datos del enrutador). Como en las APIs de la PDN, cada nodo es el proveedor y su
// propio servidor de autorización; la SESNA es el cliente.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { NodeIdSchema, PdnGrantTypeSchema } from '@sigilo/contracts';

/** Nombre del archivo en el directorio de datos del enrutador (lo genera `npm run red:demo`). */
export const NODE_CREDENTIALS_FILE_NAME = 'node-credentials.json';

const SecretSchema = z.string().min(16).max(256);

export const NodeCredentialSchema = z
  .object({
    clientId: z.string().min(3).max(64),
    clientSecret: SecretSchema,
    /** Flujo con que se pide el token: `client_credentials` (recomendado) o `password` (PDN). */
    grantType: PdnGrantTypeSchema.exclude(['refresh_token']),
    username: z.string().min(3).max(128).optional(),
    password: SecretSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.grantType !== 'password' ||
      (value.username !== undefined && value.password !== undefined),
    'El flujo password necesita usuario y contraseña.',
  );
export type NodeCredential = z.infer<typeof NodeCredentialSchema>;

export const NodeCredentialsFileSchema = z
  .object({ version: z.literal(1), nodes: z.record(NodeIdSchema, NodeCredentialSchema) })
  .strict();

/**
 * Lee las credenciales de cada nodo. Sin archivo, ninguna: el enrutador entrega sin token (los
 * nodos rechazan los sobres) y no consulta la estadística. Lanza error si el archivo no cumple su
 * esquema o si otros usuarios del sistema pueden leerlo.
 * Seguridad: los secretos solo viven en memoria del proceso y nunca se registran.
 */
export function loadNodeCredentials(dataDir: string): ReadonlyMap<string, NodeCredential> {
  const path = join(dataDir, NODE_CREDENTIALS_FILE_NAME);
  if (!existsSync(path)) return new Map();
  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0) {
    throw new Error(`${NODE_CREDENTIALS_FILE_NAME} debe tener permisos 0600.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`No se pudo leer ${NODE_CREDENTIALS_FILE_NAME}.`);
  }
  const parsed = NodeCredentialsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${NODE_CREDENTIALS_FILE_NAME} no tiene el formato esperado.`);
  }
  return new Map(Object.entries(parsed.data.nodes));
}
