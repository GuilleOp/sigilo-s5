// Pruebas cifradas en el panel de la autoridad: la cadena de custodia de una prueba subida coincide
// con lo anclado (pendiente el mismo día, comprobada contra la bitácora firmada al día siguiente),
// la descarga de la autoridad trae el contenedor cifrado y su navegador lo descifra a la misma
// imagen, y un contenedor alterado en el camino no se muestra.
import { crc32, deflateSync } from 'node:zlib';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  NODE_KEY_AUTHORITY_ID,
  POW_HEADER,
  ROUTES,
  EvidenceUploadResponseSchema,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import { generateFolio, sealEvidence } from '@sigilo/core';
import { buildSubmitRequest, createReceipt } from '../apps/web/src/crypto/submission.ts';
import { fetchPinnedKeys, solveProofOfWork, syntheticFacts } from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { advanceServerClockToNextDay } from './support/clock.ts';
import { API_ORIGIN } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';

/** Color del único píxel de la prueba: el navegador debe descifrarla y decodificarla igual. */
const PIXEL = [23, 129, 201, 255] as const;

function pngChunk(type: string, data: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** PNG real de 1×1 en RGBA con el color `PIXEL`. */
function pixelPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, ...PIXEL]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const PIXEL_PNG = pixelPng();

/**
 * Siembra, como lo hace el navegador de quien denuncia, una denuncia anónima con una prueba
 * cifrada hacia la llave fijada del nodo: el folio se elige antes, porque va en el AAD.
 */
async function seedWithEvidence(request: APIRequestContext) {
  const pinned = await fetchPinnedKeys(request);
  const folio = generateFolio();
  const sealed = await sealEvidence(
    new Uint8Array(PIXEL_PNG),
    { keyId: pinned.set.authority.keyId, publicKey: pinned.authorityBoxPublicKey },
    { folio, authorityId: NODE_KEY_AUTHORITY_ID, mediaType: 'image/png' },
  );
  const proof = await solveProofOfWork(request, 'complaint');
  const upload = await request.post(`${API_ORIGIN}${ROUTES.evidenceUpload}`, {
    data: Buffer.from(sealed.container),
    headers: { 'Content-Type': 'image/png', [POW_HEADER]: proof },
  });
  expect(upload.status()).toBe(201);
  const descriptor = EvidenceUploadResponseSchema.parse(await upload.json());
  const receipt = createReceipt();
  const body = buildSubmitRequest(
    {
      mode: 'anonymous',
      facts: syntheticFacts(),
      evidence: [descriptor],
      protectionRequested: false,
    },
    receipt.keys,
    undefined,
  );
  const response = await request.post(`${API_ORIGIN}${ROUTES.complaints}?folio=${folio}`, {
    data: body,
    headers: { [POW_HEADER]: proof },
  });
  expect(response.status()).toBe(201);
  expect(SubmitComplaintResponseSchema.parse(await response.json()).folio).toBe(folio);
  return { folio, descriptor, sealed };
}

async function openAsAuthority(page: Page, folio: string) {
  await loginAsAuthority(page);
  await openComplaint(page, folio);
}

test('la cadena de custodia coincide el mismo día y queda comprobada al publicarse', async ({
  page,
  request,
}) => {
  const { folio } = await seedWithEvidence(request);
  await openAsAuthority(page, folio);
  await expect(page.getByTestId('evidence-check')).toHaveText(
    'Descifrada aquí; coincide con lo anclado en la bitácora al recibirla.',
  );
  const status = page.getByTestId('custody-status');
  await expect(status).toContainText('Los digestos ya coinciden con el detalle.');
  await expect(page.getByTestId('custody-events')).toContainText(
    'pruebas recibidas y ancladas (se publica al cerrar el día).',
  );

  // Al día siguiente el anclaje está en la bitácora: el navegador lo comprueba contra la cadena
  // firmada por la llave fijada del servidor.
  await advanceServerClockToNextDay();
  await openAsAuthority(page, folio);
  await expect(status).toHaveText(
    'Comprobado: los digestos de las pruebas están en la bitácora pública, en la cadena firmada.',
  );
  await expect(status).not.toHaveClass(/field__error/u);
  await expect(page.getByTestId('custody-events')).toContainText(
    /\(evento \d+ de la bitácora\)\./u,
  );
});

test('la descarga de la autoridad trae el contenedor cifrado y su navegador lo descifra', async ({
  page,
  request,
}) => {
  const { folio, descriptor, sealed } = await seedWithEvidence(request);
  // Se observa la respuesta tal cual pasa (sin cambiarla) para leer los bytes de la red.
  const seen: Buffer[] = [];
  await page.route(`**${ROUTES.authorityEvidence(descriptor.evidenceId)}`, async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    seen.push(body);
    await route.fulfill({ response, body });
  });
  await openAsAuthority(page, folio);
  // Por la red viaja el contenedor SGEV, nunca la imagen.
  await expect.poll(() => seen.length).toBe(1);
  const wire = seen[0] ?? Buffer.alloc(0);
  expect(wire.equals(Buffer.from(sealed.container))).toBe(true);
  expect(wire.includes(PIXEL_PNG.subarray(16, 40))).toBe(false);

  // La miniatura y el enlace a tamaño completo son la imagen descifrada en este navegador.
  const image = page.getByTestId('authority-evidence').getByRole('img', { name: /^Prueba 1/u });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(1);
  // Es un objeto local del navegador (la CSP no deja leerlo con fetch): se lee su píxel.
  const href = await page.getByTestId('authority-evidence').getByRole('link').getAttribute('href');
  expect(href).toMatch(/^blob:/u);
  expect(await image.getAttribute('src')).toBe(href);
  const pixel = await image.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context?.drawImage(element as HTMLImageElement, 0, 0);
    return [...(context?.getImageData(0, 0, 1, 1).data ?? [])];
  });
  expect(pixel).toEqual([...PIXEL]);
});

test('un contenedor alterado en el camino no se muestra', async ({ page, request }) => {
  const { folio, descriptor } = await seedWithEvidence(request);
  await page.route(`**${ROUTES.authorityEvidence(descriptor.evidenceId)}`, async (route) => {
    const response = await route.fetch();
    const bytes = Buffer.from(await response.body());
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0x01;
    await route.fulfill({ response, body: bytes });
  });
  await openAsAuthority(page, folio);
  const gallery = page.getByTestId('authority-evidence');
  await expect(gallery).toContainText('El archivo no coincide con su digesto.');
  await expect(gallery.getByRole('img')).toHaveCount(0);
});
