// Evaluador OPRF: evalúa elementos cegados con la llave privada, exige prueba de trabajo y cuenta
// las evaluaciones del día. No ve ni guarda identificadores, etiquetas ni denuncias.
import type { DatabaseSync } from 'node:sqlite';
import { CORROBORATION_OPRF_SUITE } from '@sigilo/contracts';
import type {
  CorroborationEvaluationRequest,
  CorroborationEvaluationResponse,
  CorroborationEvaluatorKey,
  EvaluationCountsPage,
  PowChallenge,
} from '@sigilo/contracts';
import { fromBase64Url, toBase64Url, toDayDate } from '@sigilo/core';
import { evaluateBlinded, signEvaluationCount } from '@sigilo/corroboracion';
import type { EvaluatorKeyPair } from '@sigilo/corroboracion';
import { readInteger, readText, withTransaction } from './database.ts';
import { ApiFailure } from './http.ts';
import { createChallengeIssuer } from './pow-challenges.ts';

/** Días cerrados que devuelve `counts` por omisión y como máximo. */
export const DEFAULT_COUNT_DAYS = 30;
export const MAX_COUNT_DAYS = 366;
const DAY_MS = 86_400_000;

/** Dependencias del evaluador. */
export interface EvaluatorDeps {
  db: DatabaseSync;
  keyPair: EvaluatorKeyPair;
  signingPrivateKey: Uint8Array;
  /** Llave pública tal como la publica el directorio. */
  key: CorroborationEvaluatorKey;
  powBits: number;
  now: () => Date;
  /** Tope de evaluaciones por día; al alcanzarlo responde `rate_limited`. */
  maxDailyEvaluations?: number;
  powSecret?: Uint8Array;
}

/** Operaciones del evaluador. */
export interface EvaluatorService {
  key(): CorroborationEvaluatorKey;
  challenge(): PowChallenge;
  evaluate(
    request: CorroborationEvaluationRequest,
    powHeader: string | undefined,
  ): CorroborationEvaluationResponse;
  counts(from: string | undefined): EvaluationCountsPage;
}

function addDays(day: string, days: number): string {
  return toDayDate(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

/** Crea el evaluador. */
export function createEvaluatorService(deps: EvaluatorDeps): EvaluatorService {
  const challenges = createChallengeIssuer({
    db: deps.db,
    bits: deps.powBits,
    now: deps.now,
    ...(deps.powSecret === undefined ? {} : { secret: deps.powSecret }),
  });
  const readCount = deps.db.prepare(
    'SELECT evaluations FROM evaluation_counts WHERE day = ? AND epoch = ?',
  );
  const increment = deps.db.prepare(
    `INSERT INTO evaluation_counts (day, epoch, evaluations) VALUES (?, ?, 1)
     ON CONFLICT (day, epoch) DO UPDATE SET evaluations = evaluations + 1`,
  );
  const listCounts = deps.db.prepare(
    'SELECT day, evaluations FROM evaluation_counts WHERE epoch = ? AND day >= ? AND day < ?',
  );

  return {
    key: () => deps.key,
    challenge: () => challenges.issue(),
    evaluate(request, powHeader) {
      if (request.keyId !== deps.key.keyId) throw new ApiFailure('bad_request');
      if (!challenges.spend(powHeader)) throw new ApiFailure('proof_required');
      const today = toDayDate(deps.now());
      let result: { evaluated: Uint8Array; proof: Uint8Array };
      try {
        result = evaluateBlinded(deps.keyPair, fromBase64Url(request.blinded));
      } catch {
        throw new ApiFailure('bad_request');
      }
      // Seguridad: lo único que queda de la evaluación es un +1 en el conteo del día.
      withTransaction(deps.db, () => {
        const row = readCount.get(today, deps.key.epoch);
        const current = row === undefined ? 0 : readInteger(row, 'evaluations');
        if (deps.maxDailyEvaluations !== undefined && current >= deps.maxDailyEvaluations) {
          throw new ApiFailure('rate_limited');
        }
        increment.run(today, deps.key.epoch);
      });
      return {
        v: 1,
        suite: CORROBORATION_OPRF_SUITE,
        epoch: deps.key.epoch,
        keyId: deps.key.keyId,
        evaluated: toBase64Url(result.evaluated),
        proof: toBase64Url(result.proof),
      };
    },
    counts(from) {
      const today = toDayDate(deps.now());
      const requested = from ?? addDays(today, -DEFAULT_COUNT_DAYS);
      let start = requested < deps.key.validFrom ? deps.key.validFrom : requested;
      if (start < addDays(today, -MAX_COUNT_DAYS)) start = addDays(today, -MAX_COUNT_DAYS);
      const stored = new Map<string, number>();
      for (const row of listCounts.all(deps.key.epoch, start, today)) {
        stored.set(readText(row, 'day'), readInteger(row, 'evaluations'));
      }
      // Seguridad: solo días cerrados; el conteo del día en curso delataría cada consulta.
      const counts = [];
      for (let day = start; day < today; day = addDays(day, 1)) {
        counts.push(
          signEvaluationCount(
            { day, epoch: deps.key.epoch, evaluations: stored.get(day) ?? 0 },
            deps.signingPrivateKey,
          ),
        );
      }
      return { counts };
    },
  };
}
