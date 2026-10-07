// Preparación global de E2E: genera los archivos sintéticos y copia la llave de demostración de la
// autoridad al directorio temporal. El directorio y `keys.json` ya existen (ver `ensureWorkspace`).
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { fixturesDir, REPO_ROOT } from './environment.ts';
import {
  buildFakeDocx,
  buildMinimalPdf,
  FIXTURE_FILES,
  INVISIBLE_TEXT,
  withSyntheticExif,
} from './synthetic-files.ts';

/**
 * Dibuja una imagen en un lienzo de Chromium y la codifica como JPEG real.
 * Se hace en `about:blank`, sin red, para no depender de ninguna foto existente.
 */
async function renderBaseJpeg(): Promise<Uint8Array> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Sin lienzo 2D.');
      context.fillStyle = '#d8e4ef';
      context.fillRect(0, 0, 320, 240);
      context.fillStyle = '#245b8f';
      context.fillRect(40, 60, 240, 120);
      return canvas.toDataURL('image/jpeg', 0.9);
    });
    return new Uint8Array(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
  } finally {
    await browser.close();
  }
}

/** Escribe los archivos de prueba. */
export default async function globalSetup(): Promise<void> {
  const dir = fixturesDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, FIXTURE_FILES.photo), withSyntheticExif(await renderBaseJpeg()));
  writeFileSync(join(dir, FIXTURE_FILES.pdf), buildMinimalPdf());
  writeFileSync(join(dir, FIXTURE_FILES.docx), buildFakeDocx());
  writeFileSync(join(dir, FIXTURE_FILES.invisibleText), INVISIBLE_TEXT, 'utf8');
  copyFileSync(
    join(REPO_ROOT, 'apps/server/data/authority-demo-key.json'),
    join(dir, FIXTURE_FILES.authorityKey),
  );
}
