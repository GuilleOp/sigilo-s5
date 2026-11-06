// Orquestación de una corrida: captura pasiva, verificaciones en el orden del catálogo y, en modo
// conformidad, las verificaciones activas con denuncias sintéticas.
import { join } from 'node:path';
import { CHECKS, isImplemented, NOT_AUTOMATED_SUMMARY, result } from './catalog.ts';
import { capturePassive } from './capture/browser-capture.ts';
import { createRequestBudget, isPrivateAddress } from './capture/policy.ts';
import { redactReport, stripPrivateFields } from './report/redaction.ts';
import type { RedactionMode } from './report/redaction.ts';
import {
  checkCsp,
  checkFraming,
  checkHsts,
  checkPermissionsPolicy,
  checkReferrerPolicy,
} from './checks/header-checks.ts';
import {
  checkCookies,
  checkThirdPartyAssets,
  checkThirdPartyRequests,
} from './checks/network-checks.ts';
import {
  checkDraftStoragePassive,
  checkExternalMaps,
  checkFolioPatternPassive,
  checkSpeechRecognition,
  checkTrackers,
  collectObservations,
} from './checks/static-checks.ts';
import { createApiClient } from './conformance/api-client.ts';
import {
  checkErrorResponses,
  checkFolioUnpredictability,
  checkIdentitySealing,
  checkIndistinguishableTracking,
  createReflectionMarker,
  exercisePublicReads,
  provokeErrors,
} from './conformance/conformance-checks.ts';
import type { ConformanceState } from './conformance/conformance-checks.ts';
import { probeDraftStorage } from './conformance/draft-probe.ts';
import { checkOpenApiConformance } from './conformance/openapi-check.ts';
import type {
  CheckResult,
  CheckStatus,
  PassiveCapture,
  ValidationMode,
  ValidationReport,
} from './types.ts';
import { TOOL_NAME, TOOL_VERSION, USER_AGENT } from './version.ts';

/** Opciones de una corrida. */
export interface RunOptions {
  url: string;
  mode: ValidationMode;
  /** Ruta del formulario de denuncia, relativa al sitio. */
  formPath: string;
  maxRequests: number;
  navigationTimeoutMs: number;
  maxResourceBytes: number;
  allowThirdParty: boolean;
  /** Especificación OpenAPI para API-01. */
  openApiPath: string;
  /** Solo pruebas: reglas de resolución de Chromium (ver `CaptureOptions`). */
  hostResolverRules?: string;
  settleMs?: number;
  now?: () => Date;
  /**
   * Captura guardada con `--guardar-captura`: se analiza sin hacer ninguna petición (solo modo
   * pasivo). Permite regenerar un reporte con heurísticas corregidas sin volver a visitar el sitio.
   */
  savedCapture?: SavedCapture;
  /** Recibe la captura recién hecha, para guardarla. */
  onCapture?: (saved: SavedCapture) => void;
  /**
   * Modo conformidad contra un host que no es local: la persona declara que el nodo es suyo o que
   * tiene autorización (`--confirmo-nodo-propio`). Sin esto, se rechaza.
   */
  isOwnNodeConfirmed?: boolean;
  /**
   * Redacción de la evidencia de código: `auto` (por omisión) redacta las heurísticas de código si
   * el sitio no es local; `ninguna` no redacta; una lista de ids redacta solo esas verificaciones.
   */
  redaction?: RedactionMode;
}

/** Captura serializada en disco (`--guardar-captura`). */
export interface SavedCapture {
  schemaVersion: 1;
  capturedAt: string;
  pages: { label: string; url: string }[];
  capture: PassiveCapture;
}

/** Especificación OpenAPI del estándar en este repositorio (API-01). */
export const OPENAPI_PATH = join(import.meta.dirname, '..', '..', '..', 'estandar', 'openapi.yaml');

/** Valores por omisión de la CLI. */
export const DEFAULT_RUN_OPTIONS = {
  formPath: '/presentar-denuncia',
  maxRequests: 400,
  navigationTimeoutMs: 30_000,
  maxResourceBytes: 4 * 1024 * 1024,
  allowThirdParty: false,
  openApiPath: OPENAPI_PATH,
} as const;

/**
 * Arma las páginas a visitar. Lanza error si `formPath` es una URL de otro origen: el validador
 * solo visita el sitio indicado.
 */
export function pagesFor(url: string, formPath: string): { label: string; url: string }[] {
  const base = new URL(url);
  const home = new URL('/', base);
  if (new URL(formPath, base).origin !== base.origin) {
    throw new Error('--formulario debe ser una ruta del mismo sitio, no una URL de otro origen.');
  }
  return [
    { label: 'inicio', url: base.pathname === '/' ? home.href : base.href },
    { label: 'formulario', url: new URL(formPath, base).href },
  ];
}

function passiveResults(capture: PassiveCapture): Map<string, CheckResult> {
  const pages = capture.pages;
  const results: CheckResult[] = [
    checkThirdPartyRequests(capture),
    checkCsp(pages),
    checkHsts(pages),
    checkFraming(pages),
    checkReferrerPolicy(pages),
    checkPermissionsPolicy(pages),
    checkThirdPartyAssets(capture),
    checkSpeechRecognition(capture),
    checkFolioPatternPassive(capture),
    checkDraftStoragePassive(capture),
    checkExternalMaps(capture),
    checkCookies(capture),
    checkTrackers(capture),
  ];
  return new Map(results.map((item) => [item.id, item]));
}

/** Suma la evidencia del análisis pasivo a un resultado activo cuando el pasivo dio un indicio. */
function withPassiveHints(active: CheckResult, passive: CheckResult | undefined): CheckResult {
  if (passive === undefined || passive.status !== 'advertencia') return active;
  return {
    ...active,
    evidence: [
      ...active.evidence,
      { kind: 'nota', description: `Indicio del análisis estático: ${passive.summary}` },
      ...passive.evidence.filter((item) => item.kind !== 'nota').slice(0, 5),
    ],
  };
}

function countByStatus(checks: readonly CheckResult[]): Record<CheckStatus, number> {
  const summary: Record<CheckStatus, number> = {
    cumple: 0,
    no_cumple: 0,
    advertencia: 0,
    no_aplica: 0,
  };
  for (const check of checks) summary[check.status] += 1;
  return summary;
}

/** Ejecuta la corrida completa y devuelve el reporte. Nunca lanza por fallas del sitio. */
export async function runValidation(options: RunOptions): Promise<ValidationReport> {
  const now = options.now ?? ((): Date => new Date());
  if (options.savedCapture !== undefined && options.mode !== 'pasivo') {
    throw new Error('Una captura guardada solo puede analizarse en modo pasivo.');
  }
  const targetHost = new URL(options.url).hostname;
  if (
    options.mode === 'conformidad' &&
    !isPrivateAddress(targetHost) &&
    options.isOwnNodeConfirmed !== true
  ) {
    throw new Error(
      `El modo conformidad envía denuncias sintéticas: contra ${targetHost} exige --confirmo-nodo-propio (solo nodos propios o con autorización).`,
    );
  }
  const startedAt = options.savedCapture?.capturedAt ?? now().toISOString();
  const pages = options.savedCapture?.pages ?? pagesFor(options.url, options.formPath);
  // Seguridad: un solo contador para toda la corrida (navegador, cabeceras, API y sonda).
  const budget = createRequestBudget(options.maxRequests);
  const capture =
    options.savedCapture?.capture ??
    (await capturePassive({
      targetUrl: pages[0]?.url ?? options.url,
      pages,
      budget,
      navigationTimeoutMs: options.navigationTimeoutMs,
      maxResourceBytes: options.maxResourceBytes,
      allowThirdParty: options.allowThirdParty,
      ...(options.hostResolverRules === undefined
        ? {}
        : { hostResolverRules: options.hostResolverRules }),
      ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }),
    }));
  if (options.savedCapture === undefined) {
    options.onCapture?.({ schemaVersion: 1, capturedAt: startedAt, pages, capture });
  }
  const results = passiveResults(capture);
  const errors = [...capture.errors];
  const observations = collectObservations(capture);
  if (options.savedCapture !== undefined) {
    observations.push({
      kind: 'nota',
      description: `Reporte regenerado el ${now().toISOString()} a partir de la captura del ${startedAt}, sin hacer nuevas peticiones al sitio.`,
    });
  }

  if (options.mode === 'conformidad') {
    const client = createApiClient(capture.targetUrl, budget, options.navigationTimeoutMs);
    const state: ConformanceState = { folios: [] };
    results.set('PRV-14', await checkIdentitySealing(client, capture, state));
    results.set(
      'PRV-09',
      withPassiveHints(await checkFolioUnpredictability(client, state), results.get('PRV-09')),
    );
    results.set('PRV-15', await checkIndistinguishableTracking(client, state));
    const marker = createReflectionMarker();
    try {
      await exercisePublicReads(client);
      await provokeErrors(client, marker);
    } catch (error) {
      errors.push(
        `No se completaron las pruebas de errores: ${error instanceof Error ? error.message : 'error desconocido'}.`,
      );
    }
    results.set('API-01', checkOpenApiConformance(options.openApiPath, client.exchanges()));
    results.set('API-02', checkErrorResponses(client.exchanges(), marker));
    const formUrl = pages[1]?.url;
    if (formUrl !== undefined) {
      const probe = await probeDraftStorage({
        formUrl,
        marker: createReflectionMarker(),
        navigationTimeoutMs: options.navigationTimeoutMs,
        budget,
        ...(options.hostResolverRules === undefined
          ? {}
          : { hostResolverRules: options.hostResolverRules }),
      });
      results.set('PRV-10', withPassiveHints(probe, results.get('PRV-10')));
    }
  }

  // Una entrada por verificación del estándar, en el orden de `estandar/verificaciones.json`.
  const checks = CHECKS.map((definition) => {
    const evaluated = results.get(definition.id);
    if (evaluated !== undefined) return evaluated;
    if (!isImplemented(definition.id)) {
      return result(definition.id, { status: 'no_aplica', summary: NOT_AUTOMATED_SUMMARY });
    }
    return result(definition.id, {
      status: 'no_aplica',
      summary: definition.modes.includes(options.mode)
        ? 'No se evaluó.'
        : 'Se evalúa solo en modo conformidad (contra un nodo que dice cumplir el estándar).',
    });
  });
  const report: ValidationReport = {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, version: TOOL_VERSION, userAgent: USER_AGENT },
    mode: options.mode,
    target: { url: capture.targetUrl, pages },
    startedAt,
    finishedAt: now().toISOString(),
    limits: {
      maxRequests: options.maxRequests,
      navigationTimeoutMs: options.navigationTimeoutMs,
      maxResourceBytes: options.maxResourceBytes,
    },
    summary: countByStatus(checks),
    checks,
    observations,
    network: {
      requestCount: options.savedCapture === undefined ? budget.count() : capture.requestCount,
      isRequestLimitReached:
        options.savedCapture === undefined
          ? budget.isLimitReached()
          : capture.isRequestLimitReached,
      requests: capture.requests,
    },
    errors,
  };
  const redaction = options.redaction ?? 'auto';
  const shouldRedact =
    redaction === 'auto' ? !isPrivateAddress(targetHost) : redaction !== 'ninguna';
  return shouldRedact
    ? redactReport(report, redaction === 'auto' || redaction === 'ninguna' ? 'todas' : redaction)
    : stripPrivateFields(report);
}
