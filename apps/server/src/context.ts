// Dependencias inyectables de la aplicación y servicios derivados que comparten las rutas.
import type { DatabaseSync } from 'node:sqlite';
import { createComplaintsRepository } from './db/complaints-repository.ts';
import type { ComplaintsRepository } from './db/complaints-repository.ts';
import { createEvidenceRepository } from './db/evidence-repository.ts';
import type { EvidenceRepository } from './db/evidence-repository.ts';
import { createIdentityOpeningsRepository } from './db/identity-openings-repository.ts';
import type { IdentityOpeningsRepository } from './db/identity-openings-repository.ts';
import { createLedgerRepository } from './db/ledger-repository.ts';
import type { LedgerRepository } from './db/ledger-repository.ts';
import { createMessagesRepository } from './db/messages-repository.ts';
import type { MessagesRepository } from './db/messages-repository.ts';
import { createOpenDataRepository } from './db/open-data-repository.ts';
import type { OpenDataRepository } from './db/open-data-repository.ts';
import { createStatusRepository } from './db/status-repository.ts';
import type { StatusRepository } from './db/status-repository.ts';
import type { PowPurpose } from '@sigilo/contracts';
import type { RequestLog } from './http/request-log.ts';
import type { ServerKeys } from './keys-file.ts';
import { createLedgerService } from './ledger-service.ts';
import type { LedgerService } from './ledger-service.ts';
import { createRateLimiter, createThrottle } from './security/rate-limiter.ts';
import type { RateLimiter, RateLimitRule, ThrottleRule } from './security/rate-limiter.ts';
import { createPowGuard } from './security/proof-of-work.ts';
import type { PowGuard } from './security/proof-of-work.ts';
import { createReporterAuthenticator } from './security/reporter-auth.ts';
import type { ReporterAuthenticator } from './security/reporter-auth.ts';
import type { NoiseUnit } from './services/open-data.ts';
import type { EvidenceStore } from './storage/evidence-store.ts';

export type { RequestLogEntry } from './http/request-log.ts';

/**
 * Límites del servidor. Sin direcciones IP (no se registran), los límites son por folio o
 * globales. Contra el abuso de las escrituras actúa primero la dificultad adaptativa de la prueba
 * de trabajo; los límites globales de escritura son solo un freno extremo (muy por encima de la
 * carga legítima) y se descuentan únicamente cuando la escritura se confirma, así los intentos
 * rechazados no agotan la cuota de nadie. El de seguimiento solo frena.
 */
export interface RateLimitConfig {
  /** Fallos de autenticación por folio; al agotarse, el folio responde 429 hasta que vence. */
  authFailuresPerFolio: RateLimitRule;
  /** Fallos de autenticación en total; al excederse, el seguimiento se retrasa sin rechazarse. */
  authFailuresGlobal: ThrottleRule;
  /** Mensajes confirmados de la persona denunciante por folio. */
  reporterMessagesPerFolio: RateLimitRule;
  /** Freno extremo: mensajes confirmados de personas denunciantes en total. */
  reporterMessagesGlobal: RateLimitRule;
  /** Freno extremo: subidas de pruebas confirmadas en total. */
  evidenceUploads: RateLimitRule;
  /** Freno extremo: denuncias confirmadas en total. */
  complaintSubmissions: RateLimitRule;
}

/** Dependencias externas de la aplicación; se inyectan para poder probarla. */
export interface AppDeps {
  /** Base ya migrada (ver `openDatabase`). */
  db: DatabaseSync;
  keys: ServerKeys;
  evidenceStore: EvidenceStore;
  authorityToken: string;
  now: () => Date;
  /** Espera usada por el freno global; por omisión, `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Origen permitido por CORS; vacío o ausente lo desactiva. */
  allowedOrigin?: string;
  /** Directorio con la web construida (`apps/web/dist`) para servirla en el mismo origen. */
  webDistDir?: string;
  /** `max-age` en segundos de `Strict-Transport-Security`; ausente no envía la cabecera. */
  hstsMaxAgeSeconds?: number;
  /** Límites que sustituyen a los de `DEFAULT_RATE_LIMITS`. */
  rateLimits?: Partial<RateLimitConfig>;
  /** Registro de peticiones (ver `createRequestLog`); ausente no registra nada. */
  requestLog?: RequestLog;
  /** Dificultad base de la prueba de trabajo en bits; 0 (por omisión) la desactiva. */
  powBits?: number;
  /** Dificultad máxima de la prueba de trabajo adaptativa (`DEFAULT_POW_MAX_BITS`). */
  powMaxBits?: number;
  /** Umbrales de carga por propósito de la dificultad adaptativa. */
  powLoadThresholds?: Partial<Record<PowPurpose, number>>;
  /** Llave HMAC de los retos; por omisión, aleatoria por proceso. */
  powSecret?: Uint8Array;
  /** Cuota total de almacenamiento de pruebas en bytes (`DEFAULT_EVIDENCE_QUOTA_BYTES`). */
  evidenceQuotaBytes?: number;
  /** Tope de eventos pendientes por día en la bitácora (`MAX_PENDING_EVENTS_PER_DAY`). */
  maxPendingEventsPerDay?: number;
  /** Solo pruebas: ruido determinista de los datos abiertos (por omisión, `hmacNoiseUnit`). */
  openDataNoise?: NoiseUnit;
}

/** Limitadores compartidos por las rutas. */
export interface AppLimiters {
  reporterMessages: RateLimiter;
  reporterMessagesGlobal: RateLimiter;
  evidenceUploads: RateLimiter;
  complaintSubmissions: RateLimiter;
}

/** Servicios compartidos por las rutas. */
export interface AppContext {
  deps: AppDeps;
  complaints: ComplaintsRepository;
  evidence: EvidenceRepository;
  messages: MessagesRepository;
  ledgerRepository: LedgerRepository;
  identityOpenings: IdentityOpeningsRepository;
  statusHistory: StatusRepository;
  openData: OpenDataRepository;
  ledger: LedgerService;
  reporterAuth: ReporterAuthenticator;
  limiters: AppLimiters;
  pow: PowGuard;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Límites por omisión. Los accesos legítimos al seguimiento no cuentan; 10 fallos por folio por
 * hora; más de 600 fallos por minuto en total frenan hasta 2 s cada intento; 30 mensajes de la
 * persona denunciante por folio por hora. Frenos extremos por hora, solo de escrituras
 * confirmadas: 3000 denuncias, 10 000 subidas de pruebas y 6000 mensajes. Para llegar a ellos un
 * atacante tiene que resolver retos con la dificultad máxima o casi.
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  authFailuresPerFolio: { limit: 10, windowMs: HOUR_MS },
  authFailuresGlobal: { limit: 600, windowMs: MINUTE_MS, stepMs: 10, maxDelayMs: 2000 },
  reporterMessagesPerFolio: { limit: 30, windowMs: HOUR_MS },
  reporterMessagesGlobal: { limit: 6000, windowMs: HOUR_MS },
  evidenceUploads: { limit: 10_000, windowMs: HOUR_MS },
  complaintSubmissions: { limit: 3000, windowMs: HOUR_MS },
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Construye repositorios y servicios a partir de las dependencias. */
export function createContext(deps: AppDeps): AppContext {
  const limits: RateLimitConfig = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };
  const complaints = createComplaintsRepository(deps.db);
  const ledgerRepository = createLedgerRepository(deps.db);
  return {
    deps,
    complaints,
    evidence: createEvidenceRepository(deps.db),
    messages: createMessagesRepository(deps.db),
    ledgerRepository,
    identityOpenings: createIdentityOpeningsRepository(deps.db),
    statusHistory: createStatusRepository(deps.db),
    openData: createOpenDataRepository(deps.db),
    ledger: createLedgerService({
      db: deps.db,
      repository: ledgerRepository,
      serverKeyId: deps.keys.publicKeySet.server.keyId,
      serverSigningPrivateKey: deps.keys.serverSigningPrivateKey,
      now: deps.now,
      ...(deps.maxPendingEventsPerDay === undefined
        ? {}
        : { maxPendingPerDay: deps.maxPendingEventsPerDay }),
    }),
    reporterAuth: createReporterAuthenticator({
      complaints,
      failuresPerFolio: createRateLimiter(limits.authFailuresPerFolio, deps.now),
      failureThrottle: createThrottle(limits.authFailuresGlobal, deps.now),
      sleep: deps.sleep ?? defaultSleep,
    }),
    limiters: {
      reporterMessages: createRateLimiter(limits.reporterMessagesPerFolio, deps.now),
      reporterMessagesGlobal: createRateLimiter(limits.reporterMessagesGlobal, deps.now),
      evidenceUploads: createRateLimiter(limits.evidenceUploads, deps.now),
      complaintSubmissions: createRateLimiter(limits.complaintSubmissions, deps.now),
    },
    pow: createPowGuard({
      bits: deps.powBits ?? 0,
      now: deps.now,
      ...(deps.powMaxBits === undefined ? {} : { maxBits: deps.powMaxBits }),
      ...(deps.powLoadThresholds === undefined ? {} : { loadThresholds: deps.powLoadThresholds }),
      ...(deps.powSecret === undefined ? {} : { secret: deps.powSecret }),
    }),
  };
}
