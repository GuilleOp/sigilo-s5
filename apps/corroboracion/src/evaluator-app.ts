// Aplicación Hono del evaluador OPRF: llave, reto, evaluación y conteos diarios. Sin registro de
// peticiones ni lectura de la dirección de quien pide.
import { Hono } from 'hono';
import {
  CORROBORATION_ROUTES,
  CorroborationEvaluationRequestSchema,
  DayDateSchema,
  POW_HEADER,
} from '@sigilo/contracts';
import type { EvaluatorService } from './evaluator-service.ts';
import {
  ApiFailure,
  errorResponse,
  evaluatorCors,
  limitBody,
  readJson,
  securityHeaders,
} from './http.ts';

const MAX_EVALUATION_BODY_BYTES = 1024;

/** Crea la aplicación del evaluador. */
export function createEvaluatorApp(deps: {
  evaluator: EvaluatorService;
  hstsMaxAgeSeconds?: number | null;
}): Hono {
  const app = new Hono();
  app.use('*', securityHeaders(deps.hstsMaxAgeSeconds ?? null));
  app.use('*', evaluatorCors());

  app.get(CORROBORATION_ROUTES.evaluatorKey, (c) => c.json(deps.evaluator.key()));
  app.get(CORROBORATION_ROUTES.evaluatorChallenge, (c) => c.json(deps.evaluator.challenge()));

  // Seguridad: el manejador lee solo el cuerpo y la cabecera de prueba de trabajo.
  app.post(CORROBORATION_ROUTES.evaluations, limitBody(MAX_EVALUATION_BODY_BYTES), async (c) => {
    const request = await readJson(c, CorroborationEvaluationRequestSchema);
    return c.json(deps.evaluator.evaluate(request, c.req.header(POW_HEADER)));
  });

  app.get(CORROBORATION_ROUTES.evaluationCounts, (c) => {
    const from = c.req.query('from');
    if (from !== undefined && !DayDateSchema.safeParse(from).success) {
      throw new ApiFailure('bad_request');
    }
    return c.json(deps.evaluator.counts(from));
  });

  app.notFound((c) => errorResponse(c, 'not_found'));
  app.onError((error, c) =>
    errorResponse(c, error instanceof ApiFailure ? error.code : 'internal'),
  );
  return app;
}
