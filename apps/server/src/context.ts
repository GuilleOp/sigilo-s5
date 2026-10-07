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
import { createRateLimiter } from './security/rate-limiter.ts';
import type { RateLimitRule } from './security/rate-limiter.ts';
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

/** Límites de intentos de seguimiento. */
export interface RateLimitConfig {
  perFolio: RateLimitRule;
  global: RateLimitRule;
}

/** Dependencias externas de la aplicación; se inyectan para poder probarla. */
export interface AppDeps {
  /** Base ya migrada (ver `openDatabase`). */
  db: DatabaseSync;
  keys: ServerKeys;
  evidenceStore: EvidenceStore;
  authorityToken: string;
  now: () => Date;
  /** Origen permitido por CORS; vacío o ausente lo desactiva. */
  allowedOrigin?: string;
  rateLimits?: RateLimitConfig;
  logger?: (entry: RequestLogEntry) => void;
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
}

const HOUR_MS = 60 * 60 * 1000;

/** Límites por omisión: 10 intentos por folio por hora y 600 en total por minuto. */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  perFolio: { limit: 10, windowMs: HOUR_MS },
  global: { limit: 600, windowMs: 60 * 1000 },
};

/** Construye repositorios y servicios a partir de las dependencias. */
export function createContext(deps: AppDeps): AppContext {
  const limits = deps.rateLimits ?? DEFAULT_RATE_LIMITS;
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
      perFolioLimiter: createRateLimiter(limits.perFolio, deps.now),
      globalLimiter: createRateLimiter(limits.global, deps.now),
    }),
  };
}
