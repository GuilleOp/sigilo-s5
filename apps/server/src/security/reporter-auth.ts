// Autenticación de la persona denunciante con folio y `authKey` derivada del recibo.
import type { TrackingCredentials } from '@sigilo/contracts';
import {
  computeAuthVerifier,
  folioDigest,
  fromBase64Url,
  randomBytes,
  toBase64Url,
} from '@sigilo/core';
import type { ComplaintRecord, ComplaintsRepository } from '../db/complaints-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import { constantTimeEqual } from './constant-time.ts';
import type { RateLimiter, Throttle } from './rate-limiter.ts';

/** Verifica credenciales de seguimiento y devuelve la denuncia correspondiente. */
export interface ReporterAuthenticator {
  /** Lanza `rate_limited` si el folio agotó sus fallos y `not_found` ante cualquier otro fallo. */
  authenticate(credentials: TrackingCredentials): Promise<ComplaintRecord>;
}

/** Dependencias del autenticador. */
export interface ReporterAuthDeps {
  complaints: ComplaintsRepository;
  /** Fallos por folio: solo un intento fallido (`not_found`) lo consume. */
  failuresPerFolio: RateLimiter;
  /** Freno global por fallos: retrasa, nunca rechaza. */
  failureThrottle: Throttle;
  sleep: (ms: number) => Promise<void>;
}

/** `Base64URL(SHA-256(authKey))`, o `null` si `authKey` no es Base64URL canónico de 32 bytes. */
function verifierFor(authKey: string): string | null {
  try {
    return computeAuthVerifier(fromBase64Url(authKey));
  } catch {
    return null;
  }
}

/**
 * Crea el autenticador de la persona denunciante.
 * Seguridad: los accesos legítimos no consumen ningún límite, así que leer el seguimiento y
 * responder en el buzón nunca agota la ventana; solo los fallos cuentan, por folio (con rechazo)
 * y en total (con freno).
 */
export function createReporterAuthenticator(deps: ReporterAuthDeps): ReporterAuthenticator {
  // Seguridad: verificador ficticio para que un folio inexistente cueste el mismo trabajo.
  const decoyVerifier = toBase64Url(randomBytes(32));
  const decoyComputed = toBase64Url(randomBytes(32));

  return {
    authenticate: async (credentials) => {
      const delay = deps.failureThrottle.delayMs();
      if (delay > 0) await deps.sleep(delay);
      // Seguridad: el límite se indexa por el digesto del folio para no conservar folios en
      // memoria, y se aplica igual exista o no el folio.
      const limiterKey = folioDigest(credentials.folio);
      if (deps.failuresPerFolio.isLimited(limiterKey)) throw new ApiFailure('rate_limited');
      // Seguridad: primero solo se lee el verificador; el registro completo se carga después de
      // comparar, para que el tiempo de un fallo no dependa de si el folio existe.
      const stored = deps.complaints.findAuthVerifier(credentials.folio);
      const computed = verifierFor(credentials.authKey);
      const isMatch = constantTimeEqual(computed ?? decoyComputed, stored ?? decoyVerifier);
      const complaint =
        isMatch && stored !== null && computed !== null
          ? deps.complaints.find(credentials.folio)
          : null;
      // Seguridad: folio inexistente y verificador incorrecto producen exactamente el mismo error.
      if (complaint === null) {
        deps.failuresPerFolio.consume(limiterKey);
        deps.failureThrottle.record();
        throw new ApiFailure('not_found');
      }
      return complaint;
    },
  };
}
