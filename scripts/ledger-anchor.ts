// Ancla la cabeza pública firmada de la bitácora en `anchors/AAAA-MM-DD.json` para versionarla en
// el repositorio público. Lee de la API pública con SIGILO_ANCHOR_URL (preferido: así se publican
// los días ya cerrados) o, sin ella, de la base local en solo lectura.
// Uso: SIGILO_ANCHOR_URL=http://127.0.0.1:8787 npm run ledger:anchor
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PublicKeySetSchema } from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import {
  anchorLedger,
  apiAnchorSource,
  databaseAnchorSource,
} from '../apps/server/src/ledger-anchor.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const ANCHORS_DIR = resolve(process.env.SIGILO_ANCHORS_DIR || join(ROOT, 'anchors'));
const PINNED_KEYS_PATH = resolve(
  process.env.SIGILO_PINNED_KEYS_FILE || join(ROOT, 'apps/web/src/config/pinned-keys.json'),
);
const API_URL = process.env.SIGILO_ANCHOR_URL ?? '';

async function main(): Promise<void> {
  // Seguridad: la cabeza se verifica con la llave FIJADA, no con la que publica el servidor.
  const pinned = PublicKeySetSchema.parse(JSON.parse(readFileSync(PINNED_KEYS_PATH, 'utf8')));
  const now = (): Date => new Date();
  if (API_URL === '') {
    console.warn(
      'Aviso: sin SIGILO_ANCHOR_URL se lee la base local y solo se ancla lo ya publicado. Se recomienda anclar desde la API pública.',
    );
  }
  const source = API_URL === '' ? databaseAnchorSource(DATA_DIR, now) : apiAnchorSource(API_URL);
  try {
    const result = await anchorLedger({
      source,
      serverPublicKey: fromBase64Url(pinned.server.signingPublicKey),
      anchorsDir: ANCHORS_DIR,
      now,
    });
    const relativePath = relative(process.cwd(), result.path);
    const path = relativePath.startsWith('..') ? result.path : relativePath;
    const { seq, hash } = result.anchor.head;
    console.log(
      result.created
        ? `Anclaje escrito en ${path} (seq ${seq}, hash ${hash}). Versiónalo en el repositorio público.`
        : `El anclaje de hoy ya existe en ${path} y coincide.`,
    );
  } finally {
    source.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo anclar la bitácora.');
  process.exit(1);
});
