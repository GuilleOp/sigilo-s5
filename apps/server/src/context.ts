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
import type { ServerKeys } from './keys-file.ts';
import { createLedgerService } from './ledger-service.ts';
import type { LedgerService } from './ledger-service.ts';
import { createRateLimiter, createThrottle } from './security/rate-limiter.ts';
import type { RateLimiter, RateLimitRule, ThrottleRule } from './security/rate-limiter.ts';
import { createReporterAuthenticator } from './security/reporter-auth.ts';
import type { ReporterAuthenticator } from './security/reporter-auth.ts';
import type { EvidenceStore } from './storage/evidence-store.ts';

/** Entrada del registro de peticiones: sin IP, agente, cuerpo ni folio. */
export interface RequestLogEntry {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

/**
 * Límites del servidor. Sin direcciones IP (no se registran), los límites son por folio o
 * globales; los globales de escritura protegen el almacenamiento y el de seguimiento solo frena.
 */
export interface RateLimitConfig {
  /** Fallos de autenticación por folio; al agotarse, el folio responde 429 hasta que vence. */
  authFailuresPerFolio: RateLimitRule;
  /** Fallos de autenticación en total; al excederse, el seguimiento se retrasa sin rechazarse. */
  authFailuresGlobal: ThrottleRule;
  /** Mensajes de la persona denunciante por folio. */
  reporterMessagesPerFolio: RateLimitRule;
  /** Subidas de pruebas en total. */
  evidenceUploads: RateLimitRule;
  /** Envíos de denuncias en total. */
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
  logger?: (entry: RequestLogEntry) => void;
}

/** Limitadores compartidos por las rutas. */
export interface AppLimiters {
  reporterMessages: RateLimiter;
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
  ledger: LedgerService;
  reporterAuth: ReporterAuthenticator;
  limiters: AppLimiters;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Límites por omisión. Los accesos legítimos al seguimiento no cuentan; 10 fallos por folio por
 * hora; más de 600 fallos por minuto en total frenan hasta 2 s cada intento; 30 mensajes de la
 * persona denunciante por folio por hora; 600 subidas de pruebas y 120 denuncias por hora.
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  authFailuresPerFolio: { limit: 10, windowMs: HOUR_MS },
  authFailuresGlobal: { limit: 600, windowMs: MINUTE_MS, stepMs: 10, maxDelayMs: 2000 },
  reporterMessagesPerFolio: { limit: 30, windowMs: HOUR_MS },
  evidenceUploads: { limit: 600, windowMs: HOUR_MS },
  complaintSubmissions: { limit: 120, windowMs: HOUR_MS },
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
    ledger: createLedgerService({
      repository: ledgerRepository,
      serverKeyId: deps.keys.publicKeySet.server.keyId,
      serverSigningPrivateKey: deps.keys.serverSigningPrivateKey,
      now: deps.now,
    }),
    reporterAuth: createReporterAuthenticator({
      complaints,
      failuresPerFolio: createRateLimiter(limits.authFailuresPerFolio, deps.now),
      failureThrottle: createThrottle(limits.authFailuresGlobal, deps.now),
      sleep: deps.sleep ?? defaultSleep,
    }),
    limiters: {
      reporterMessages: createRateLimiter(limits.reporterMessagesPerFolio, deps.now),
      evidenceUploads: createRateLimiter(limits.evidenceUploads, deps.now),
      complaintSubmissions: createRateLimiter(limits.complaintSubmissions, deps.now),
    },
  };
}
