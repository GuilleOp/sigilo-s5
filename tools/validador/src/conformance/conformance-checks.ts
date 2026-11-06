// Verificaciones del modo conformidad contra un nodo que dice cumplir el estándar: cifrado de la
// identidad (PRV-14), folio impredecible (PRV-09), respuesta indistinguible del seguimiento
// (PRV-15) y errores con el esquema común (API-02). Envía solo denuncias sintéticas.
import { ApiErrorSchema, ROUTES, SubmitComplaintResponseSchema } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor, randomBytes, toBase64Url } from '@sigilo/core';
import { verifySubmission } from '../../../../apps/web/src/crypto/submission.ts';
import { result } from '../catalog.ts';
import type { CheckResult, Evidence, HttpExchange, PassiveCapture } from '../types.ts';
import type { ApiClient } from './api-client.ts';
import { jsonBodyOf } from './api-client.ts';
import {
  buildAnonymousComplaint,
  buildSealedComplaint,
  fetchPublicKeys,
  postComplaint,
  toPinnedKeys,
} from './synthetic-client.ts';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Recorta un cuerpo de respuesta para la evidencia. */
function clip(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function exchangeEvidence(exchange: HttpExchange, description: string): Evidence {
  return {
    kind: 'respuesta',
    description: `${description} (${exchange.method} → ${exchange.status}, ${exchange.durationMs} ms)`,
    url: exchange.url,
    snippet: clip(exchange.bodyText),
  };
}

function failure(id: 'PRV-14' | 'PRV-09' | 'PRV-15' | 'API-02', error: unknown): CheckResult {
  return result(id, {
    status: 'no_cumple',
    summary: `No se pudo completar la verificación: ${error instanceof Error ? error.message : 'error desconocido'}.`,
  });
}

/** Estado compartido entre verificaciones (folios creados). */
export interface ConformanceState {
  /** Folios de las denuncias sintéticas aceptadas, en orden de envío. */
  folios: string[];
}

/**
 * PRV-14: llaves públicas publicadas y válidas, fijadas en el código de la web, una denuncia
 * sellada con sobre HPKE aceptada con comprobante firmado y una sellada sin sobre rechazada.
 */
export async function checkIdentitySealing(
  client: ApiClient,
  capture: PassiveCapture | null,
  state: ConformanceState,
): Promise<CheckResult> {
  try {
    const evidence: Evidence[] = [];
    const problems: string[] = [];
    let warning: string | null = null;
    const { exchange, keys } = await fetchPublicKeys(client);
    evidence.push(exchangeEvidence(exchange, 'Llaves públicas publicadas.'));
    if (keys === null) {
      return result('PRV-14', {
        status: 'no_cumple',
        summary: `${ROUTES.keys} no publica un conjunto de llaves con el formato del estándar.`,
        evidence,
      });
    }
    const boxKey = fromBase64Url(keys.authority.boxPublicKey);
    if (boxKey.length !== 32 || keyIdFor(boxKey) !== keys.authority.keyId) {
      problems.push('la llave X25519 de la autoridad no mide 32 bytes o no corresponde a su keyId');
    }
    if (capture !== null) {
      const pinnedIn = capture.resources.find((resource) =>
        resource.body.includes(keys.authority.boxPublicKey),
      );
      if (pinnedIn === undefined) {
        warning = 'la llave de la autoridad no aparece fijada en el código descargado de la web';
      } else {
        evidence.push({
          kind: 'codigo',
          description: 'La llave pública de la autoridad está fijada en el paquete de la web.',
          url: pinnedIn.url,
          value: keys.authority.boxPublicKey,
        });
      }
    }
    const sealed = await buildSealedComplaint(keys);
    const accepted = await postComplaint(client, 'Denuncia sellada sintética', sealed.body);
    const parsed = SubmitComplaintResponseSchema.safeParse(jsonBodyOf(accepted));
    evidence.push(
      exchangeEvidence(accepted, 'Envío de una denuncia con la identidad en un sobre HPKE.'),
    );
    evidence.push({
      kind: 'nota',
      description: `Sobre enviado: suite ${sealed.body.sealedIdentity?.suite ?? '?'}, keyId ${sealed.body.sealedIdentity?.keyId ?? '?'}, ${sealed.body.sealedIdentity?.ct.length ?? 0} caracteres de texto cifrado; el nombre sintético no viaja en claro.`,
    });
    if (accepted.status !== 201 || !parsed.success) {
      problems.push(`la denuncia sellada no fue aceptada (estatus ${accepted.status})`);
    } else {
      state.folios.push(parsed.data.folio);
      if (!verifySubmission(sealed.body, parsed.data, toPinnedKeys(keys))) {
        problems.push('el comprobante no está firmado por la llave publicada del servidor');
      }
    }
    if (accepted.bodyText.includes('Sintética')) {
      problems.push('la respuesta contiene el nombre sintético en claro');
    }
    // Seguridad: una denuncia sellada sin sobre nunca debe aceptarse (la identidad viajaría aparte).
    const withoutEnvelope = { ...sealed.body };
    delete withoutEnvelope.sealedIdentity;
    const rejected = await postComplaint(
      client,
      'Denuncia sellada sin sobre (debe rechazarse)',
      withoutEnvelope,
    );
    evidence.push(exchangeEvidence(rejected, 'Envío en modo sellado sin sobre HPKE.'));
    if (rejected.status < 400 || rejected.status >= 500) {
      problems.push(
        `aceptó o falló al recibir una denuncia sellada sin sobre (estatus ${rejected.status})`,
      );
    }
    evidence.push({
      kind: 'nota',
      description:
        'Límite: el sobre lo arma el cliente sintético del validador con las llaves publicadas; el cifrado dentro de la interfaz lo cubren las pruebas E2E de la implementación.',
    });
    if (problems.length > 0) {
      return result('PRV-14', {
        status: 'no_cumple',
        summary: `Fallas: ${problems.join('; ')}.`,
        evidence,
      });
    }
    if (warning !== null) {
      return result('PRV-14', {
        status: 'advertencia',
        summary: `Casi todo cumple, pero ${warning}.`,
        evidence,
      });
    }
    return result('PRV-14', {
      status: 'cumple',
      summary:
        'Llaves publicadas y fijadas en la web; la identidad viaja en un sobre HPKE con comprobante firmado y el nodo rechaza el modo sellado sin sobre.',
      evidence,
    });
  } catch (error) {
    return failure('PRV-14', error);
  }
}

/** Decodifica un folio Base32 Crockford (ignorando guiones) a entero; `null` si no lo es. */
export function decodeFolio(folio: string): bigint | null {
  const symbols = folio.toUpperCase().replace(/-/g, '');
  if (symbols === '') return null;
  let value = 0n;
  for (const symbol of symbols) {
    const digit = CROCKFORD.indexOf(symbol);
    if (digit === -1) return null;
    value = value * 32n + BigInt(digit);
  }
  return value;
}

/** Diferencia mínima entre folios consecutivos para descartar un contador. */
const MIN_FOLIO_GAP = 1_000_000n;

/**
 * Analiza folios de envíos consecutivos. Heurística: descarta secuencias evidentes (contador,
 * año visible, prefijo común largo); tres muestras no prueban aleatoriedad.
 */
export function analyzeFolios(
  folios: readonly string[],
  now: Date = new Date(),
): {
  isPredictable: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (new Set(folios).size !== folios.length) reasons.push('se repitió un folio');
  const year = String(now.getFullYear());
  if (folios.some((folio) => folio.includes(year)))
    reasons.push(`el folio contiene el año ${year}`);
  const values = folios.map(decodeFolio);
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === null || previous === undefined || current === null || current === undefined) {
      continue;
    }
    const gap = current > previous ? current - previous : previous - current;
    if (gap < MIN_FOLIO_GAP) reasons.push(`folios consecutivos separados por solo ${gap}`);
  }
  const [first, ...rest] = folios;
  if (first !== undefined && rest.length > 0) {
    let common = 0;
    while (common < first.length && rest.every((folio) => folio[common] === first[common]))
      common += 1;
    if (common >= Math.ceil(first.length / 2)) {
      reasons.push(`los folios comparten un prefijo de ${common} caracteres`);
    }
  }
  return { isPredictable: reasons.length > 0, reasons };
}

/** PRV-09 (conformidad): dos denuncias anónimas más y análisis de los folios obtenidos. */
export async function checkFolioUnpredictability(
  client: ApiClient,
  state: ConformanceState,
): Promise<CheckResult> {
  try {
    const evidence: Evidence[] = [];
    for (let index = 0; index < 2; index += 1) {
      const exchange = await postComplaint(
        client,
        `Denuncia anónima sintética ${index + 1}`,
        buildAnonymousComplaint().body,
      );
      const parsed = SubmitComplaintResponseSchema.safeParse(jsonBodyOf(exchange));
      if (exchange.status === 201 && parsed.success) state.folios.push(parsed.data.folio);
      else evidence.push(exchangeEvidence(exchange, 'Envío anónimo no aceptado.'));
    }
    if (state.folios.length < 2) {
      return result('PRV-09', {
        status: 'no_cumple',
        summary: 'No se obtuvieron suficientes folios para analizarlos.',
        evidence,
      });
    }
    const analysis = analyzeFolios(state.folios);
    evidence.push({
      kind: 'respuesta',
      description: `Folios de ${state.folios.length} envíos consecutivos.`,
      value: state.folios.join(', '),
    });
    evidence.push({
      kind: 'nota',
      description:
        'Heurística: descarta contadores, año visible y prefijos comunes; no demuestra la calidad del generador aleatorio.',
    });
    if (analysis.isPredictable) {
      return result('PRV-09', {
        status: 'no_cumple',
        isHeuristic: true,
        summary: `Folio predecible: ${analysis.reasons.join('; ')}.`,
        evidence,
      });
    }
    return result('PRV-09', {
      status: 'cumple',
      isHeuristic: true,
      summary: 'Folios de envíos consecutivos sin secuencia, año ni prefijo común.',
      evidence,
    });
  } catch (error) {
    return failure('PRV-09', error);
  }
}

/** Folio con formato válido que casi seguro no existe (60 bits aleatorios). */
function randomFolio(): string {
  const bytes = randomBytes(12);
  const symbols = Array.from(bytes, (byte) => CROCKFORD[byte % 32] ?? '0').join('');
  return `${symbols.slice(0, 4)}-${symbols.slice(4, 8)}-${symbols.slice(8, 12)}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/** Diferencia de medianas (ms) a partir de la cual se advierte un canal de tiempo. */
const TIMING_WARNING_MS = 150;

/**
 * PRV-15: consulta con folio existente y secreto equivocado frente a folio inexistente; estatus,
 * cuerpo y tipo de contenido deben ser idénticos. Se informa además la diferencia de tiempos.
 */
export async function checkIndistinguishableTracking(
  client: ApiClient,
  state: ConformanceState,
): Promise<CheckResult> {
  const existing = state.folios[0];
  if (existing === undefined) {
    return result('PRV-15', {
      status: 'no_aplica',
      summary: 'No hay un folio existente (falló el envío sintético); no se pudo comparar.',
    });
  }
  try {
    const wrongSecret: HttpExchange[] = [];
    const unknownFolio: HttpExchange[] = [];
    for (let round = 0; round < 2; round += 1) {
      wrongSecret.push(
        await client.send({
          purpose: 'Seguimiento con folio existente y secreto equivocado',
          method: 'POST',
          path: ROUTES.tracking,
          json: { folio: existing, authKey: toBase64Url(randomBytes(32)) },
        }),
      );
      unknownFolio.push(
        await client.send({
          purpose: 'Seguimiento con folio inexistente',
          method: 'POST',
          path: ROUTES.tracking,
          json: { folio: randomFolio(), authKey: toBase64Url(randomBytes(32)) },
        }),
      );
    }
    const [a, b] = [wrongSecret[0], unknownFolio[0]];
    if (a === undefined || b === undefined) throw new Error('faltan respuestas');
    const evidence: Evidence[] = [
      exchangeEvidence(a, 'Folio existente, secreto equivocado.'),
      exchangeEvidence(b, 'Folio inexistente.'),
    ];
    const differences: string[] = [];
    if (a.status !== b.status) differences.push(`estatus ${a.status} frente a ${b.status}`);
    if (a.bodyText !== b.bodyText) differences.push('cuerpos distintos');
    if (a.contentType !== b.contentType) differences.push('tipos de contenido distintos');
    if (a.status < 400) differences.push(`el secreto equivocado fue aceptado (${a.status})`);
    const timeA = median(wrongSecret.map((exchange) => exchange.durationMs));
    const timeB = median(unknownFolio.map((exchange) => exchange.durationMs));
    evidence.push({
      kind: 'nota',
      description: `Mediana de tiempo: ${timeA} ms (secreto equivocado) frente a ${timeB} ms (folio inexistente), 2 muestras de cada caso. Las mediciones por red son ruidosas.`,
    });
    if (differences.length > 0) {
      return result('PRV-15', {
        status: 'no_cumple',
        summary: `La respuesta permite saber qué falló: ${differences.join('; ')}.`,
        evidence,
      });
    }
    if (Math.abs(timeA - timeB) > TIMING_WARNING_MS) {
      return result('PRV-15', {
        status: 'advertencia',
        summary:
          'Respuestas idénticas, pero con diferencia de tiempo apreciable entre ambos casos.',
        evidence,
      });
    }
    return result('PRV-15', {
      status: 'cumple',
      summary: 'Folio inexistente y secreto equivocado producen la misma respuesta.',
      evidence,
    });
  } catch (error) {
    return failure('PRV-15', error);
  }
}

/** Marca sintética que no debe reflejarse en los errores. */
export function createReflectionMarker(): string {
  return `SIGILOVALIDADOR${toBase64Url(randomBytes(6)).replace(/[-_]/g, 'x')}`;
}

/** Lecturas públicas (bitácora y datos abiertos) que amplían la cobertura de API-01. */
export async function exercisePublicReads(client: ApiClient): Promise<void> {
  await client.send({ purpose: 'Cabeza de la bitácora', method: 'GET', path: ROUTES.ledgerHead });
  await client.send({
    purpose: 'Eventos de la bitácora',
    method: 'GET',
    path: `${ROUTES.ledgerEvents}?from=0&limit=5`,
  });
  await client.send({
    purpose: 'Datos abiertos (CSV)',
    method: 'GET',
    path: ROUTES.openDataCsv,
  });
  // Rutas comunes no documentadas bajo el prefijo de la API: deben responder 404 (API-01).
  // Fuera del prefijo, una ventanilla de una sola página responde su index.html a todo.
  for (const path of UNDOCUMENTED_API_PATHS) {
    await client.send({ purpose: `Ruta no documentada ${path}`, method: 'GET', path });
  }
}

/** Rutas no documentadas que API-01 prueba. */
export const UNDOCUMENTED_API_PATHS = [
  '/api/v1/internal',
  '/api/v1/admin',
  '/api/v1/debug',
  '/api/v1/metrics',
  '/api/v1/swagger.json',
] as const;

/** Peticiones de error que API-02 provoca (además de los errores de las otras verificaciones). */
export async function provokeErrors(client: ApiClient, marker: string): Promise<void> {
  const requests = [
    { purpose: 'Ruta inexistente', method: 'GET' as const, path: `/api/v1/no-existe-${marker}` },
    {
      purpose: 'Propósito inválido en el reto',
      method: 'GET' as const,
      path: `${ROUTES.powChallenge}?purpose=${marker}`,
    },
    {
      purpose: 'JSON mal formado en el seguimiento',
      method: 'POST' as const,
      path: ROUTES.tracking,
      rawBody: `{"folio": "${marker}", `,
    },
    {
      purpose: 'Folio con formato inválido',
      method: 'POST' as const,
      path: ROUTES.tracking,
      json: { folio: marker, authKey: marker },
    },
    {
      purpose: 'Tipo de contenido no admitido',
      method: 'POST' as const,
      path: ROUTES.tracking,
      rawBody: marker,
      contentType: 'text/plain',
    },
    {
      purpose: 'Denuncia sin prueba de trabajo',
      method: 'POST' as const,
      path: ROUTES.complaints,
      json: { version: 1, marker },
    },
    {
      purpose: 'Panel de autoridad sin credenciales',
      method: 'GET' as const,
      path: ROUTES.authorityComplaints,
    },
    {
      purpose: 'Panel de autoridad con token inválido',
      method: 'GET' as const,
      path: ROUTES.authorityComplaints,
      headers: { Authorization: `Bearer ${marker}` },
    },
  ];
  for (const request of requests) await client.send(request);
}

/** Patrones de trazas, rutas internas y errores del motor que no deben aparecer en un error. */
const LEAK_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bat\s+[\w.<>$]+\s+\(?[^()\s]+:\d+:\d+\)?/, label: 'traza de pila' },
  {
    pattern: /(?:\/Users\/|\/home\/|[A-Z]:\\|node_modules|\.tsx?:\d+|\.m?js:\d+)/,
    label: 'ruta interna',
  },
  {
    pattern: /SQLITE_|SQL syntax|\bSELECT\b.+\bFROM\b|\bINSERT INTO\b/i,
    label: 'error de base de datos',
  },
  {
    pattern: /\b(?:TypeError|ReferenceError|SyntaxError|ZodError)\b|"issues"\s*:/,
    label: 'error interno o de validación detallado',
  },
];

/**
 * API-02: cada error de la API usa `{ error: { code, message } }` con JSON, no filtra trazas ni
 * rutas, no refleja la entrada y no revela la tecnología del servidor.
 */
export function checkErrorResponses(
  exchanges: readonly HttpExchange[],
  marker: string,
): CheckResult {
  const errors = exchanges.filter((exchange) => exchange.status >= 400);
  if (errors.length === 0) {
    return result('API-02', {
      status: 'no_aplica',
      summary: 'No se observó ninguna respuesta de error.',
    });
  }
  const evidence: Evidence[] = [];
  let failures = 0;
  let warnings = 0;
  for (const exchange of errors) {
    const problems: string[] = [];
    const body = jsonBodyOf(exchange);
    if (!exchange.contentType.toLowerCase().startsWith('application/json')) {
      problems.push(`tipo de contenido ${exchange.contentType || '(ausente)'}`);
    }
    if (!ApiErrorSchema.safeParse(body).success)
      problems.push('no sigue { error: { code, message } }');
    for (const { pattern, label } of LEAK_PATTERNS) {
      if (pattern.test(exchange.bodyText)) problems.push(`posible ${label}`);
    }
    if (exchange.bodyText.includes(marker)) problems.push('refleja la entrada enviada');
    if (problems.length > 0) {
      failures += 1;
      evidence.push(exchangeEvidence(exchange, `${exchange.purpose}: ${problems.join(', ')}.`));
    }
    const powered = exchange.headers['x-powered-by'];
    if (powered !== undefined) {
      warnings += 1;
      evidence.push({
        kind: 'cabecera',
        description: `${exchange.purpose}: revela la tecnología del servidor.`,
        url: exchange.url,
        name: 'x-powered-by',
        value: powered,
      });
    }
  }
  evidence.push({
    kind: 'nota',
    description: `Se revisaron ${errors.length} respuestas de error (estatus ${[...new Set(errors.map((exchange) => exchange.status))].sort().join(', ')}).`,
  });
  const sample = errors.find((exchange) => ApiErrorSchema.safeParse(jsonBodyOf(exchange)).success);
  if (sample !== undefined) evidence.push(exchangeEvidence(sample, `Ejemplo: ${sample.purpose}.`));
  if (failures > 0) {
    return result('API-02', {
      status: 'no_cumple',
      summary: `${failures} de ${errors.length} respuestas de error no cumplen el esquema común o filtran datos.`,
      evidence,
    });
  }
  if (warnings > 0) {
    return result('API-02', {
      status: 'advertencia',
      summary:
        'Errores con el esquema común, pero las cabeceras revelan la tecnología del servidor.',
      evidence,
    });
  }
  return result('API-02', {
    status: 'cumple',
    summary: `Las ${errors.length} respuestas de error usan el esquema común, sin trazas ni reflejo de la entrada.`,
    evidence,
  });
}
