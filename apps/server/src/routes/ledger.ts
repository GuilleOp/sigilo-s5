// Bitácora pública: cabeza firmada y páginas de eventos (con `folioDigest`, nunca el folio).
import type { Hono } from 'hono';
import { DayDateSchema, ROUTES } from '@sigilo/contracts';
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

/**
 * Registra `GET ledgerHead` y `GET ledgerEvents?from=&limit=` o `?since=AAAA-MM-DD&limit=`
 * (límite máximo 500; `from` y `since` no se combinan). Con `since`, la página empieza en el
 * último evento anterior a ese día, para que el cliente verifique desde ahí sin bajar todo.
 */
export function registerLedgerRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.ledgerHead, (c) => c.json(ctx.ledger.head()));

  app.get(ROUTES.ledgerEvents, (c) => {
    const since = c.req.query('since');
    const limit = parseCount(c.req.query('limit'), DEFAULT_PAGE);
    if (limit < 1) throw new ApiFailure('bad_request');
    const size = Math.min(limit, MAX_LEDGER_PAGE);
    if (since !== undefined) {
      const day = DayDateSchema.safeParse(since);
      if (!day.success || c.req.query('from') !== undefined) throw new ApiFailure('bad_request');
      return c.json(ctx.ledger.pageSince(day.data, size));
    }
    return c.json(ctx.ledger.page(parseCount(c.req.query('from'), 0), size));
  });
}
