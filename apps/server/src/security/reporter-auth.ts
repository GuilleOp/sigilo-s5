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
  /**
   * Devuelve la denuncia si las credenciales son correctas, aunque el folio haya agotado sus
   * fallos. Ante un fallo lanza `rate_limited` si el folio ya los agotó y `not_found` si no.
   */
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
 * Seguridad: los accesos legítimos no consumen ningún límite y siempre se aceptan, aunque el folio
 * haya acumulado fallos: así un atacante que conozca un folio no puede bloquear a su dueña. Solo
 * los fallos cuentan, por folio (con rechazo `rate_limited` mientras dure la ventana) y en total
 * (con freno). Un acierto con el folio bloqueado sigue siendo inviable por fuerza bruta: el folio
 * agotó sus 10 intentos y `authKey` tiene 256 bits derivados de 88 bits de recibo.
 */
export function createReporterAuthenticator(deps: ReporterAuthDeps): ReporterAuthenticator {
  // Seguridad: verificador ficticio para que un folio inexistente cueste el mismo trabajo.
  const decoyVerifier = toBase64Url(randomBytes(32));
  const decoyComputed = toBase64Url(randomBytes(32));
  return {
    authenticate: async (credentials) => {
      const delay = deps.failureThrottle.delayMs();
      if (delay > 0) await deps.sleep(delay);
      // Seguridad: primero solo se lee el verificador; el registro completo se carga después de
      // comparar, para que el tiempo de un fallo no dependa de si el folio existe.
      const stored = deps.complaints.findAuthVerifier(credentials.folio);
      const computed = verifierFor(credentials.authKey);
      const isMatch = constantTimeEqual(computed ?? decoyComputed, stored ?? decoyVerifier);
      const complaint =
        isMatch && stored !== null && computed !== null
          ? deps.complaints.find(credentials.folio)
          : null;
      if (complaint !== null) return complaint;
      // Seguridad: el límite se indexa por el digesto del folio para no conservar folios en
      // memoria, y se aplica igual exista o no el folio.
      const limiterKey = folioDigest(credentials.folio);
      deps.failureThrottle.record();
      if (deps.failuresPerFolio.isLimited(limiterKey)) throw new ApiFailure('rate_limited');
      deps.failuresPerFolio.consume(limiterKey);
      // Seguridad: folio inexistente y verificador incorrecto producen exactamente el mismo error.
      throw new ApiFailure('not_found');
    },
  };
}
