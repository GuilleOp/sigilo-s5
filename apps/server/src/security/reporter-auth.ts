// Autenticación de la persona denunciante con folio y `authKey` derivada del recibo.
import { createHash } from 'node:crypto';
import type { TrackingCredentials } from '@sigilo/contracts';
import { folioDigest, fromBase64Url, randomBytes, toBase64Url } from '@sigilo/core';
import type { ComplaintRecord, ComplaintsRepository } from '../db/complaints-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import { constantTimeEqual } from './constant-time.ts';
import type { RateLimiter } from './rate-limiter.ts';

/** Verifica credenciales de seguimiento y devuelve la denuncia correspondiente. */
export interface ReporterAuthenticator {
  /** Lanza `rate_limited` si se agotaron los intentos y `not_found` ante cualquier otro fallo. */
  authenticate(credentials: TrackingCredentials): ComplaintRecord;
}

/** Dependencias del autenticador. */
export interface ReporterAuthDeps {
  complaints: ComplaintsRepository;
  perFolioLimiter: RateLimiter;
  globalLimiter: RateLimiter;
}

const GLOBAL_KEY = 'global';

/** `Base64URL(SHA-256(authKey))`, o `null` si `authKey` no es Base64URL canónico. */
function verifierFor(authKey: string): string | null {
  try {
    const digest = createHash('sha256').update(fromBase64Url(authKey)).digest();
    return toBase64Url(new Uint8Array(digest));
  } catch {
    return null;
  }
}

/** Crea el autenticador de la persona denunciante. */
export function createReporterAuthenticator(deps: ReporterAuthDeps): ReporterAuthenticator {
  // Seguridad: verificador ficticio para que un folio inexistente cueste el mismo trabajo.
  const decoyVerifier = toBase64Url(randomBytes(32));
  const decoyComputed = toBase64Url(randomBytes(32));

  return {
    authenticate: (credentials) => {
      // Seguridad: el límite por folio se aplica igual exista o no, y se indexa por su digesto
      // para no conservar folios en memoria.
      if (!deps.globalLimiter.consume(GLOBAL_KEY)) throw new ApiFailure('rate_limited');
      if (!deps.perFolioLimiter.consume(folioDigest(credentials.folio))) {
        throw new ApiFailure('rate_limited');
      }
      const complaint = deps.complaints.find(credentials.folio);
      const computed = verifierFor(credentials.authKey);
      const isMatch = constantTimeEqual(
        computed ?? decoyComputed,
        complaint?.authVerifier ?? decoyVerifier,
      );
      // Seguridad: folio inexistente y verificador incorrecto producen exactamente el mismo error.
      if (!isMatch || complaint === null || computed === null) throw new ApiFailure('not_found');
      return complaint;
    },
  };
}
