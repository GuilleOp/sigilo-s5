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
import { createIdentityRequestsRepository } from './db/identity-requests-repository.ts';
import type { IdentityRequestsRepository } from './db/identity-requests-repository.ts';
import { createProcedureRepository } from './db/procedure-repository.ts';
import type { ProcedureRepository } from './db/procedure-repository.ts';
import { createSecurityLogRepository } from './db/security-log-repository.ts';
import type { SecurityLogRepository } from './db/security-log-repository.ts';
import { createIntegrationRepository } from './db/integration-repository.ts';
import type { IntegrationRepository } from './db/integration-repository.ts';
import { createQualificationRepository } from './db/qualification-repository.ts';
import type { QualificationRepository } from './db/qualification-repository.ts';
import type { NodeNetwork } from './network/network-context.ts';
import type { CorroborationConfig } from './services/corroboration-service.ts';
import type { PdnSourcesProvider } from './services/pdn-context.ts';
import { emptyAuthorityRegistry } from './security/authority-registry.ts';
import type { AuthorityRegistry } from './security/authority-registry.ts';
import { createSessionStore, DEFAULT_SESSION_TIMEOUTS } from './security/sessions.ts';
import type { SessionStore, SessionTimeouts } from './security/sessions.ts';
import type { PowPurpose } from '@sigilo/contracts';
import type { RequestLog } from './http/request-log.ts';
import type { ServerKeys } from './keys-file.ts';
import { createLedgerService } from './ledger-service.ts';
import type { LedgerService } from './ledger-service.ts';
import { createRateLimiter, createThrottle } from './security/rate-limiter.ts';
import type {
  RateLimiter,
  RateLimitRule,
  Throttle,
  ThrottleRule,
} from './security/rate-limiter.ts';
import { createPowGuard } from './security/proof-of-work.ts';
import type { PowGuard } from './security/proof-of-work.ts';
import { createReporterAuthenticator } from './security/reporter-auth.ts';
import type { ReporterAuthenticator } from './security/reporter-auth.ts';
import { createChallengeUploads } from './services/evidence-service.ts';
import type { ChallengeUploads } from './services/evidence-service.ts';
import type { NoiseUnit } from './services/open-data.ts';
import type { EvidenceStore } from './storage/evidence-store.ts';

export type { RequestLogEntry } from './http/request-log.ts';

/**
 * Límites del servidor. Sin direcciones IP (no se registran), los límites son por folio; el de
 * fallos de autenticación en total solo frena.
 * Seguridad: no hay rechazos globales de escrituras. Un tope global lo alcanza un atacante y deja
 * fuera a todas las personas; contra el abuso, la carga solo sube la dificultad de la prueba de
 * trabajo. Los únicos límites duros son físicos: la cuota de almacenamiento de pruebas
 * (`storage_full`) y el tope diario de la bitácora (`ledger_day_full`, del que la autoridad está
 * exenta).
 */
export interface RateLimitConfig {
  /** Fallos de autenticación por folio; al agotarse, el folio responde 429 hasta que vence. */
  authFailuresPerFolio: RateLimitRule;
  /** Fallos de autenticación en total; al excederse, el seguimiento se retrasa sin rechazarse. */
  authFailuresGlobal: ThrottleRule;
  /** Mensajes confirmados de la persona denunciante por folio. */
  reporterMessagesPerFolio: RateLimitRule;
  /**
   * Inicios de sesión fallidos por usuario; al agotarse, ese usuario responde 429 hasta que vence
   * la ventana. Los usuarios no se publican (la bitácora usa el seudónimo de la cuenta).
   */
  loginFailuresPerUser: RateLimitRule;
  /** Inicios de sesión fallidos en total; al excederse, cada intento se retrasa. */
  loginFailuresGlobal: ThrottleRule;
}

/** Dependencias externas de la aplicación; se inyectan para poder probarla. */
export interface AppDeps {
  /** Base ya migrada (ver `openDatabase`). */
  db: DatabaseSync;
  keys: ServerKeys;
  evidenceStore: EvidenceStore;
  /**
   * Autoridades del nodo y cuentas individuales (`authority-accounts.json`). Ausente, el panel
   * queda cerrado: ninguna cuenta puede iniciar sesión.
   */
  authorities?: AuthorityRegistry;
  /** Almacén de sesiones; las pruebas lo inyectan para abrir sesiones sin contraseña. */
  sessions?: SessionStore;
  /** Vencimientos de las sesiones (`DEFAULT_SESSION_TIMEOUTS`). */
  sessionTimeouts?: SessionTimeouts;
  /** Nodo dentro de la red federada (directorio verificado y llave de red); ausente, nodo único. */
  network?: NodeNetwork;
  /** Fuentes de la PDN para la ficha de contexto, el conflicto y las sanciones; ausente, sin ficha. */
  pdnSources?: PdnSourcesProvider;
  /** Índice de corroboración ciega; ausente, la corroboración no se registra. */
  corroboration?: CorroborationConfig;
  /** Corre el auditor en la tarea periódica (por omisión, sí). */
  isAuditEnabled?: boolean;
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
  /**
   * Días de retención de las pruebas de denuncias sin atender (`DEFAULT_EVIDENCE_RETENTION_DAYS`);
   * 0 la desactiva. Solo informa al panel la fecha de borrado: la purga la programa `main.ts`.
   */
  evidenceRetentionDays?: number;
  /** Tope de eventos pendientes por día en la bitácora (`MAX_PENDING_EVENTS_PER_DAY`). */
  maxPendingEventsPerDay?: number;
  /** Solo pruebas: ruido determinista de los datos abiertos (por omisión, `hmacNoiseUnit`). */
  openDataNoise?: NoiseUnit;
}

/** Limitadores compartidos por las rutas. */
export interface AppLimiters {
  reporterMessages: RateLimiter;
  loginFailures: RateLimiter;
  loginThrottle: Throttle;
}

/** Servicios compartidos por las rutas. */
export interface AppContext {
  deps: AppDeps;
  complaints: ComplaintsRepository;
  evidence: EvidenceRepository;
  messages: MessagesRepository;
  ledgerRepository: LedgerRepository;
  identityOpenings: IdentityOpeningsRepository;
  identityRequests: IdentityRequestsRepository;
  procedure: ProcedureRepository;
  integration: IntegrationRepository;
  /** Calificaciones de la falta e inconformidades (migración 9). */
  qualifications: QualificationRepository;
  securityLog: SecurityLogRepository;
  authorities: AuthorityRegistry;
  sessions: SessionStore;
  statusHistory: StatusRepository;
  openData: OpenDataRepository;
  ledger: LedgerService;
  reporterAuth: ReporterAuthenticator;
  limiters: AppLimiters;
  pow: PowGuard;
  /** Pruebas subidas por cada reto, en memoria, para purgarlas si el reto vence sin denuncia. */
  challengeUploads: ChallengeUploads;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Límites por omisión. Los accesos legítimos al seguimiento no cuentan; 10 fallos por folio por
 * hora; más de 600 fallos por minuto en total frenan hasta 2 s cada intento; 30 mensajes de la
 * persona denunciante por folio por hora; 10 inicios de sesión fallidos por usuario cada 15
 * minutos, y más de 100 por minuto en total frenan hasta 2 s cada intento.
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  authFailuresPerFolio: { limit: 10, windowMs: HOUR_MS },
  authFailuresGlobal: { limit: 600, windowMs: MINUTE_MS, stepMs: 10, maxDelayMs: 2000 },
  reporterMessagesPerFolio: { limit: 30, windowMs: HOUR_MS },
  loginFailuresPerUser: { limit: 10, windowMs: 15 * MINUTE_MS },
  loginFailuresGlobal: { limit: 100, windowMs: MINUTE_MS, stepMs: 20, maxDelayMs: 2000 },
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
    identityRequests: createIdentityRequestsRepository(deps.db),
    procedure: createProcedureRepository(deps.db),
    integration: createIntegrationRepository(deps.db),
    qualifications: createQualificationRepository(deps.db),
    securityLog: createSecurityLogRepository(deps.db),
    authorities: deps.authorities ?? emptyAuthorityRegistry(),
    sessions:
      deps.sessions ??
      createSessionStore(deps.now, deps.sessionTimeouts ?? DEFAULT_SESSION_TIMEOUTS),
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
      loginFailures: createRateLimiter(limits.loginFailuresPerUser, deps.now),
      loginThrottle: createThrottle(limits.loginFailuresGlobal, deps.now),
    },
    pow: createPowGuard({
      bits: deps.powBits ?? 0,
      now: deps.now,
      ...(deps.powMaxBits === undefined ? {} : { maxBits: deps.powMaxBits }),
      ...(deps.powLoadThresholds === undefined ? {} : { loadThresholds: deps.powLoadThresholds }),
      ...(deps.powSecret === undefined ? {} : { secret: deps.powSecret }),
    }),
    challengeUploads: createChallengeUploads(),
  };
}
