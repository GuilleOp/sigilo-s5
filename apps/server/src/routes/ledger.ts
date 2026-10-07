// Bitácora pública: cabeza firmada y páginas de eventos (con `folioDigest`, nunca el folio).
import type { Hono } from 'hono';
import { ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { MAX_LEDGER_PAGE } from '../ledger-service.ts';

const DEFAULT_PAGE = 100;
const INTEGER_PATTERN = /^\d{1,15}$/;

function parseCount(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!INTEGER_PATTERN.test(value)) throw new ApiFailure('bad_request');
  return Number(value);
}

/** Registra `GET ledgerHead` y `GET ledgerEvents?from=&limit=` (límite máximo 500). */
export function registerLedgerRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.ledgerHead, (c) => c.json(ctx.ledger.head()));

  app.get(ROUTES.ledgerEvents, (c) => {
    const from = parseCount(c.req.query('from'), 0);
    const limit = parseCount(c.req.query('limit'), DEFAULT_PAGE);
    if (limit < 1) throw new ApiFailure('bad_request');
    return c.json(ctx.ledger.page(from, Math.min(limit, MAX_LEDGER_PAGE)));
  });
}
