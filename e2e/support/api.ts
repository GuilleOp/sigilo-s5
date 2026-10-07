// Ayudantes de API desde Node: siembra de denuncias anónimas con la misma criptografía que usa la
// web y consultas de la autoridad con el token bearer de prueba.
import type { APIRequestContext } from '@playwright/test';
import { ComplaintDetailSchema, ROUTES, SubmitComplaintResponseSchema } from '@sigilo/contracts';
import type { ComplaintDetail, ComplaintFacts } from '@sigilo/contracts';
import { buildSubmitRequest, createReceipt } from '../../apps/web/src/crypto/submission.ts';
import { API_ORIGIN, AUTHORITY_TOKEN } from './environment.ts';
import type { Receipt } from './report-wizard.ts';

/** Hechos sintéticos válidos para sembrar denuncias sin pasar por la interfaz. */
export function syntheticFacts(overrides: Partial<ComplaintFacts> = {}): ComplaintFacts {
  const now = new Date();
  return {
    stateCode: '22',
    entityId: 'VE-OBRAS',
    offenseCode: 'LGRA-52',
    occurredPeriod: `${now.getFullYear()}-01`,
    accused: 'La persona titular del área de compras de un ente ficticio',
    description: 'Hechos sintéticos de prueba: un contrato asignado sin licitación pública.',
    ...overrides,
  };
}

/**
 * Siembra una denuncia anónima: genera el recibo y las llaves igual que el navegador y la envía.
 * Devuelve el folio y las 8 palabras para dar seguimiento.
 */
export async function seedAnonymousComplaint(
  request: APIRequestContext,
  facts: ComplaintFacts = syntheticFacts(),
): Promise<Receipt> {
  const receipt = createReceipt();
  const body = buildSubmitRequest(
    { mode: 'anonymous', facts, evidence: [], protectionRequested: false },
    receipt.keys,
    undefined,
  );
  const response = await request.post(`${API_ORIGIN}${ROUTES.complaints}`, { data: body });
  if (!response.ok()) throw new Error(`No se pudo sembrar la denuncia: ${response.status()}`);
  const { folio } = SubmitComplaintResponseSchema.parse(await response.json());
  return { folio, words: receipt.words };
}

const AUTHORITY_HEADERS = { Authorization: `Bearer ${AUTHORITY_TOKEN}` };

/** Detalle de una denuncia tal como lo ve la autoridad. */
export async function fetchComplaintDetail(
  request: APIRequestContext,
  folio: string,
): Promise<ComplaintDetail> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.authorityComplaint(folio)}`, {
    headers: AUTHORITY_HEADERS,
  });
  if (!response.ok()) throw new Error(`No se pudo leer la denuncia: ${response.status()}`);
  return ComplaintDetailSchema.parse(await response.json());
}

/** Descarga una prueba con el token de la autoridad, desde su ruta de evidencia. */
export async function downloadEvidence(
  request: APIRequestContext,
  evidenceId: string,
): Promise<Buffer> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.authorityEvidence(evidenceId)}`, {
    headers: AUTHORITY_HEADERS,
  });
  if (!response.ok()) throw new Error(`No se pudo descargar la prueba: ${response.status()}`);
  return response.body();
}
