// Tipos del validador: resultados de cada verificación, evidencia, capturas de red y reporte.

/** Resultado de una verificación. */
export type CheckStatus = 'cumple' | 'no_cumple' | 'advertencia' | 'no_aplica';

/** Modo de ejecución del validador. */
export type ValidationMode = 'pasivo' | 'conformidad';

/**
 * Identificadores de las verificaciones que este validador automatiza. El catálogo completo (con
 * las no automatizadas) está en `estandar/verificaciones.json`.
 */
export type CheckId =
  | 'PRV-01'
  | 'PRV-02'
  | 'PRV-03'
  | 'PRV-04'
  | 'PRV-05'
  | 'PRV-06'
  | 'PRV-07'
  | 'PRV-08'
  | 'PRV-09'
  | 'PRV-10'
  | 'PRV-11'
  | 'PRV-12'
  | 'PRV-13'
  | 'PRV-14'
  | 'PRV-15'
  | 'API-01'
  | 'API-02';

/** Tipo de evidencia que respalda un resultado. */
export type EvidenceKind =
  'cabecera' | 'red' | 'html' | 'codigo' | 'cookie' | 'almacenamiento' | 'respuesta' | 'nota';

/** Evidencia concreta: dónde se observó y qué se vio. */
export interface Evidence {
  kind: EvidenceKind;
  /** Explicación breve en español. */
  description: string;
  url?: string;
  /** Nombre de la cabecera, cookie o clave de almacenamiento. */
  name?: string;
  /** Valor observado (recortado). */
  value?: string;
  /** Fragmento de código, HTML o cuerpo de respuesta (recortado). */
  snippet?: string;
}

/** Severidad de una verificación: obligatoria (DEBE) o recomendada (DEBERÍA). */
export type CheckSeverity = 'obligatoria' | 'recomendada';

/** Definición de una verificación, tomada de `estandar/verificaciones.json`. */
export interface CheckDefinition {
  /** `PRV-nn`, `API-nn` o `SEC-nn`. */
  id: string;
  profile: 'privacidad' | 'seguridad';
  title: string;
  /** Modos en los que se ejecuta. */
  modes: readonly ValidationMode[];
  severity: CheckSeverity;
  /** Normas y planteamientos que la respaldan (ASVS, API Top 10, artículos, SESNA). */
  references: readonly string[];
  description: string;
}

/** Resultado de ejecutar una verificación. */
export interface CheckResult {
  id: string;
  title: string;
  severity: CheckSeverity;
  status: CheckStatus;
  /** Conclusión en una o dos frases. */
  summary: string;
  /** `true` si el resultado es una inferencia (análisis estático), no una observación directa. */
  isHeuristic: boolean;
  evidence: Evidence[];
  references: readonly string[];
  /**
   * Interno: conclusión general que sustituye a `summary` cuando el reporte se redacta. Nunca se
   * escribe en el reporte (ver `report/redaction.ts`).
   */
  redactedSummary?: string;
}

/** Clasificación de una URL respecto del sitio validado. */
export type Party = 'propio' | 'mismo_sitio' | 'tercero' | 'incrustado';

/** Petición de red registrada por el navegador. */
export interface CapturedRequest {
  url: string;
  method: string;
  resourceType: string;
  /** Página durante cuya carga ocurrió (`inicio` o `formulario`). */
  page: string;
  party: Party;
  /** Estatus HTTP de la respuesta, o `null` si no la hubo (bloqueada o fallida). */
  status: number | null;
  isBlocked: boolean;
  blockReason?: string;
}

/** Recurso de texto (HTML, JavaScript, CSS) recibido por el navegador, para análisis estático. */
export interface CapturedResource {
  url: string;
  contentType: string;
  page: string;
  body: string;
  /** `true` si el cuerpo se recortó por exceder el máximo. */
  isTruncated: boolean;
}

/** Entrada del almacenamiento del navegador. */
export interface StorageEntry {
  area: 'localStorage' | 'sessionStorage' | 'indexedDB';
  key: string;
  /** Valor recortado. */
  value: string;
  /** Solo en la sonda de borradores: la marca sintética aparece en el valor completo. */
  containsMarker?: boolean;
}

/** Cookie vista por el navegador o en `Set-Cookie`. */
export interface CapturedCookie {
  name: string;
  domain: string;
  isSecure: boolean;
  isHttpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | 'sin_valor';
  source: 'navegador' | 'set-cookie';
}

/** Página cargada: documento inicial (vía `fetch`) y estado tras la carga en el navegador. */
export interface CapturedPage {
  /** `inicio` o `formulario`. */
  label: string;
  url: string;
  finalUrl: string;
  status: number | null;
  /** Cabeceras de la respuesta del documento, con nombres en minúsculas. */
  headers: Record<string, string>;
  setCookies: string[];
  /** HTML del documento tal como lo sirvió el servidor (recortado). */
  html: string;
  storage: StorageEntry[];
  /** Saltos de redirección seguidos por `fetch` (vacío si no hubo). */
  redirects?: string[];
  error?: string;
}

/** Todo lo observado en una corrida pasiva. */
export interface PassiveCapture {
  targetUrl: string;
  pages: CapturedPage[];
  requests: CapturedRequest[];
  resources: CapturedResource[];
  cookies: CapturedCookie[];
  /** Peticiones hechas en total (navegador y `fetch`). */
  requestCount: number;
  isRequestLimitReached: boolean;
  errors: string[];
}

/** Intercambio HTTP del modo conformidad (para API-01 y API-02). */
export interface HttpExchange {
  /** Propósito del intercambio, en español. */
  purpose: string;
  method: string;
  url: string;
  /** Ruta de la API sin origen, p. ej. `/api/v1/keys`. */
  path: string;
  requestContentType?: string;
  status: number;
  headers: Record<string, string>;
  contentType: string;
  /** Cuerpo como texto, recortado. */
  bodyText: string;
  /** Cuerpo interpretado como JSON antes de recortarlo; `undefined` si no es JSON. */
  bodyJson?: unknown;
  durationMs: number;
}

/** Límites de la corrida, para el reporte. */
export interface RunLimits {
  maxRequests: number;
  navigationTimeoutMs: number;
  maxResourceBytes: number;
}

/** Reporte completo de una corrida. */
export interface ValidationReport {
  /** Versión del formato del reporte (ver `report.schema.json`). */
  schemaVersion: 1;
  tool: { name: string; version: string; userAgent: string };
  mode: ValidationMode;
  target: { url: string; pages: { label: string; url: string }[] };
  startedAt: string;
  finishedAt: string;
  limits: RunLimits;
  summary: Record<CheckStatus, number>;
  checks: CheckResult[];
  /** Hallazgos informativos que no son una verificación del estándar. */
  observations: Evidence[];
  network: {
    requestCount: number;
    isRequestLimitReached: boolean;
    requests: CapturedRequest[];
  };
  errors: string[];
}
