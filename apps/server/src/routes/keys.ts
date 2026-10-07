// Ruta pública de llaves: el cliente compara este conjunto con las llaves fijadas en su bundle.
import type { Hono } from 'hono';
import { ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';

/** Registra `GET keys`. */
export function registerKeysRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.keys, (c) => c.json(ctx.deps.keys.publicKeySet));
}
