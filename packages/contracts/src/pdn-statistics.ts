// Estadística agregada de denuncias que cada nodo ofrece a la SESNA para el portal de la PDN (Bases
// de la PDN, art. 61), con la forma de las APIs del S2 y del S3: `POST /v1/<recurso>` con `sort`,
// `page`, `pageSize` y `query`, y respuesta `{ pagination, results }`. Solo números de meses
// cerrados, redondeados a múltiplos de 5 y con las celdas menores que 5 suprimidas (`null`): nunca
// folios, hechos, personas ni contenido de denuncias.
import { z } from 'zod';
import { CLOSURE_REASONS, COMPLAINT_STATUSES, findOffense, findState } from './catalogs/index.ts';
import { OffenseCodeSchema, StateCodeSchema } from './complaint.ts';
import type { ComplaintStatus } from './complaint.ts';
import { AuthorityIdSchema, NodeIdSchema } from './network.ts';
import { HourDateSchema, MonthPeriodSchema } from './primitives.ts';
import type { ClosureReason } from './procedure.ts';

/** Tamaño de página por omisión y máximo, como en las APIs del S2 y del S3. */
export const PDN_DEFAULT_PAGE_SIZE = 10;
export const PDN_MAX_PAGE_SIZE = 200;

/**
 * Observaciones mínimas para publicar una mediana de tiempos. Una mediana de pocas denuncias
 * describe casi a una sola; por eso el umbral es el doble de la celda mínima.
 */
export const PDN_MIN_MEDIAN_OBSERVATIONS = 10;

/** Conteo publicado: múltiplo de 5 y al menos 5, o `null` si se suprimió (menos de 5). */
export const PublishedCountSchema = z.number().int().min(5).multipleOf(5).nullable().meta({
  description:
    'Conteo redondeado al azar a un múltiplo de 5 (con semilla fija por mes); null si el redondeo da menos de 5 (suprimido).',
});
export type PublishedCount = z.infer<typeof PublishedCountSchema>;

const TimelinessSchema = z
  .object({
    aTiempo: PublishedCountSchema.meta({
      description: 'Dentro de los días hábiles del semáforo de turnado (antes de «vencida»).',
    }),
    vencidas: PublishedCountSchema.meta({
      description: 'Con el semáforo de turnado ya en «vencida» al hacerse.',
    }),
  })
  .strict();

const MedianDaysSchema = z.number().int().nonnegative().nullable();

/**
 * Clave en español de cada motivo de cierre para la PDN (los valores de catálogo de las APIs de la
 * PDN van en español y como `{ clave, valor }`).
 */
export const PDN_CLOSURE_KEYS = {
  attended: 'ATENDIDA',
  channeled: 'CANALIZADA',
  inadmissible: 'IMPROCEDENTE',
  insufficient_information: 'INFORMACION_INSUFICIENTE',
  joined: 'ACUMULADA',
  other: 'OTRO_MOTIVO',
} as const satisfies Record<ClosureReason, string>;

/** Clave en español de cada estatus de la API v1 para la PDN. */
export const PDN_STATUS_KEYS = {
  received: 'RECIBIDA',
  routing: 'BUSCANDO_AUTORIDAD',
  routed: 'TURNADA',
  investigating: 'EN_INVESTIGACION',
  classified: 'CALIFICADA',
  archived: 'ARCHIVADA',
  resolved: 'CONCLUIDA',
} as const satisfies Record<ComplaintStatus, string>;

/** Clave de la PDN de un motivo de cierre. */
export type PdnClosureKey = (typeof PDN_CLOSURE_KEYS)[ClosureReason];

/** Clave de la PDN de un estatus. */
export type PdnStatusKey = (typeof PDN_STATUS_KEYS)[ComplaintStatus];

/** Valor de catálogo `{ clave, valor }`, como los de las APIs de la PDN. */
export interface PdnCatalogEntry<K extends string = string> {
  clave: K;
  valor: string;
}

/** Motivos de cierre para la PDN, en el orden de `CLOSURE_REASONS`. */
export const PDN_CLOSURE_CATALOG: readonly (PdnCatalogEntry<PdnClosureKey> & {
  key: ClosureReason;
})[] = CLOSURE_REASONS.map((reason) => ({
  key: reason.key,
  clave: PDN_CLOSURE_KEYS[reason.key],
  valor: reason.name,
}));

/** Estatus para la PDN, en el orden de `COMPLAINT_STATUSES`. */
export const PDN_STATUS_CATALOG: readonly (PdnCatalogEntry<PdnStatusKey> & {
  key: ComplaintStatus;
})[] = COMPLAINT_STATUSES.map((status) => ({
  key: status.key,
  clave: PDN_STATUS_KEYS[status.key],
  valor: status.name,
}));

export const PdnClosureKeySchema = z
  .enum(Object.values(PDN_CLOSURE_KEYS) as [PdnClosureKey, ...PdnClosureKey[]])
  .meta({
    description: `Motivo de cierre: ${PDN_CLOSURE_CATALOG.map((item) => `${item.clave} (${item.valor})`).join(', ')}.`,
  });

export const PdnStatusKeySchema = z
  .enum(Object.values(PDN_STATUS_KEYS) as [PdnStatusKey, ...PdnStatusKey[]])
  .meta({
    description: `Estatus de la denuncia: ${PDN_STATUS_CATALOG.map((item) => `${item.clave} (${item.valor})`).join(', ')}.`,
  });

const CatalogTextSchema = z.string().min(1).max(300);

const ClosureCountSchema = z
  .object({
    clave: PdnClosureKeySchema,
    valor: CatalogTextSchema.meta({ description: 'Nombre del motivo de cierre.' }),
    total: PublishedCountSchema,
  })
  .strict()
  .meta({ description: 'Cierres del mes con un motivo.' });

const StatusCountSchema = z
  .object({
    clave: PdnStatusKeySchema,
    valor: CatalogTextSchema.meta({ description: 'Nombre del estatus.' }),
    total: PublishedCountSchema,
  })
  .strict()
  .meta({ description: 'Denuncias del mes con un estatus al cerrarse el mes.' });

/** Entidad federativa como valor de catálogo. */
export function pdnEntity(code: string): PdnCatalogEntry {
  return { clave: code, valor: findState(code)?.name ?? code };
}

/** Conducta como valor de catálogo: la clave (ley y artículo) y el término legal. */
export function pdnConduct(code: string): PdnCatalogEntry {
  const term = findOffense(code)?.legalTerm;
  return {
    clave: code,
    valor: term === undefined ? code : `${term.charAt(0).toUpperCase()}${term.slice(1)}`,
  };
}

/** Identificador estable de una fila: mes, autoridad, entidad y conducta separados por `|`. */
export function pdnStatisticsRowId(
  month: string,
  authorityId: string,
  stateCode: string,
  offenseCode: string,
): string {
  return `${month}|${authorityId}|${stateCode}|${offenseCode}`;
}

/**
 * Fecha de captura de las filas de un mes: el primer instante del mes siguiente (UTC), que es
 * cuando el mes cierra. El cálculo usa solo actos fechados hasta el último día del mes, así que la
 * fila no depende de cuándo se congeló.
 */
export function pdnCaptureDate(month: string): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.toISOString().slice(0, 10)}T00:00Z`;
}

export const PdnStatisticsRowSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(400)
      .meta({
        description:
          'Identificador estable de la fila: `mes|autoridad|entidad|conducta`. Sirve para el filtro `query.id`.',
        examples: ['2026-10|authority.comptroller-queretaro|22|LGRA-52'],
      }),
    fechaCaptura: HourDateSchema.meta({
      description:
        'Fecha del corte de la fila (UTC): el primer instante del mes siguiente, cuando el mes cierra y se congela.',
      examples: ['2026-11-01T00:00Z'],
    }),
    mes: MonthPeriodSchema.meta({
      description: 'Mes cerrado (AAAA-MM) al que se refiere la fila.',
    }),
    autoridad: z
      .object({
        clave: AuthorityIdSchema,
        nombre: z.string().min(1).max(300).meta({ description: 'Nombre de la autoridad.' }),
      })
      .strict()
      .meta({ description: 'Autoridad del directorio que tenía la denuncia en su bandeja.' }),
    entidad: z
      .object({
        clave: StateCodeSchema,
        valor: CatalogTextSchema.meta({ description: 'Nombre de la entidad federativa.' }),
      })
      .strict()
      .meta({ description: 'Entidad federativa de los hechos (catálogo INEGI).' }),
    conducta: z
      .object({
        clave: OffenseCodeSchema,
        valor: CatalogTextSchema.meta({ description: 'Término legal de la conducta.' }),
      })
      .strict()
      .meta({ description: 'Conducta denunciada (catálogo OFFENSES: ley y artículo).' }),
    recibidas: PublishedCountSchema.meta({
      description:
        'Denuncias recibidas en el mes que quedaron en la bandeja de esta autoridad el día de recepción.',
    }),
    turnadas: TimelinessSchema.meta({
      description:
        'Turnos hechos en el mes desde el buzón general (TURN_SEMAPHORE, espera de turno), de las denuncias que esperaban en esta autoridad.',
    }),
    aceptadas: TimelinessSchema.meta({
      description:
        'Aceptaciones hechas en el mes por esta autoridad (TURN_SEMAPHORE, espera de aceptación).',
    }),
    archivadas: z
      .array(ClosureCountSchema)
      .min(PDN_CLOSURE_CATALOG.length)
      .max(PDN_CLOSURE_CATALOG.length)
      .meta({
        description:
          'Cierres del mes por motivo: un elemento por motivo del catálogo, siempre todos y en el mismo orden.',
      }),
    calificadas: z
      .object({
        graves: PublishedCountSchema.meta({ description: 'Faltas calificadas como graves.' }),
        noGraves: PublishedCountSchema.meta({ description: 'Faltas calificadas como no graves.' }),
      })
      .strict()
      .meta({ description: 'Calificaciones del mes (LGRA, art. 100).' }),
    escalamientos: PublishedCountSchema.meta({
      description: 'Reglas de escalamiento cumplidas en el mes con efecto de escalar.',
    }),
    estatusAlCierre: z
      .array(StatusCountSchema)
      .min(PDN_STATUS_CATALOG.length)
      .max(PDN_STATUS_CATALOG.length)
      .meta({
        description:
          'Estatus que tenían al cerrarse el mes las denuncias recibidas en él: un elemento por estatus del catálogo, siempre todos y en el mismo orden.',
      }),
    tiemposMedianosDiasHabiles: z
      .object({
        turno: MedianDaysSchema.meta({
          description: 'Mediana de días hábiles entre la entrada al buzón y el turno.',
        }),
        aceptacion: MedianDaysSchema.meta({
          description: 'Mediana de días hábiles entre el turno y la aceptación.',
        }),
        archivo: MedianDaysSchema.meta({
          description: 'Mediana de días hábiles entre la recepción y el cierre.',
        }),
      })
      .strict()
      .meta({
        description: `Medianas en días hábiles; null si hay menos de ${PDN_MIN_MEDIAN_OBSERVATIONS} observaciones.`,
      }),
  })
  .strict()
  .meta({
    description:
      'Fila de la estadística: mes cerrado, autoridad, entidad y conducta, con indicadores ya redondeados y suprimidos. Los valores de catálogo van como `{ clave, valor }`, como en las APIs de la PDN. La tabla de cada mes se congela al cerrarse; los filtros solo eligen filas, nunca vuelven a sumar.',
  });
export type PdnStatisticsRow = z.infer<typeof PdnStatisticsRowSchema>;

const SortDirectionSchema = z
  .enum(['asc', 'desc'])
  .meta({ description: 'Orden ascendente (asc) o descendente (desc), lexicográfico en español.' });

/**
 * Filtro opcional que también admite la cadena vacía. Como en ValidAPI, una cadena vacía hace que
 * el filtro se ignore (no es un error).
 */
function filter<T extends z.ZodType>(schema: T, description: string) {
  return z
    .union([z.literal(''), schema])
    .optional()
    .meta({ description: `${description} Una cadena vacía se ignora.` });
}

export const PdnStatisticsRequestSchema = z
  .object({
    sort: z
      .object({
        mes: SortDirectionSchema.optional(),
        autoridad: SortDirectionSchema.optional(),
        entidad: SortDirectionSchema.optional(),
        conducta: SortDirectionSchema.optional(),
      })
      .strict()
      .optional()
      .meta({
        description:
          'Orden por campo, ascendente o descendente; se aplica en el orden en que se escriben las llaves. `autoridad`, `entidad` y `conducta` se ordenan por su clave. Por omisión: mes, autoridad, entidad y conducta ascendentes.',
      }),
    page: z
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .optional()
      .meta({
        description:
          'Página a mostrar; 1 por omisión. Una página después de la última responde `results: []`.',
        examples: [1],
      }),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(PDN_MAX_PAGE_SIZE)
      .optional()
      .meta({
        description: `Filas por página: ${PDN_DEFAULT_PAGE_SIZE} por omisión, de 1 a ${PDN_MAX_PAGE_SIZE} (como en el S2 y el S3). Fuera de rango, error 400.`,
        examples: [PDN_DEFAULT_PAGE_SIZE],
      }),
    query: z
      .object({
        id: filter(
          z.string().max(400),
          'Solo la fila con ese identificador; si no existe, `results: []` (nunca un error).',
        ),
        mes: filter(MonthPeriodSchema, 'Solo ese mes (AAAA-MM).'),
        mesDesde: filter(MonthPeriodSchema, 'Desde ese mes (incluido).'),
        mesHasta: filter(MonthPeriodSchema, 'Hasta ese mes (incluido).'),
        entidad: filter(StateCodeSchema, 'Clave INEGI de la entidad.'),
        autoridad: filter(AuthorityIdSchema, 'Clave de la autoridad.'),
        conducta: filter(OffenseCodeSchema, 'Clave de la conducta.'),
        estatus: filter(
          PdnStatusKeySchema,
          'Solo filas con un conteo publicado (no suprimido) de ese estatus en `estatusAlCierre`.',
        ),
      })
      .strict()
      .optional()
      .meta({
        description: 'Filtros; se combinan con AND y solo seleccionan filas ya publicadas.',
      }),
  })
  .strict()
  .meta({ description: 'Consulta de la estadística, con la forma de las APIs del S2 y del S3.' });
export type PdnStatisticsRequest = z.infer<typeof PdnStatisticsRequestSchema>;

type PdnQuery = NonNullable<PdnStatisticsRequest['query']>;

/** Filtros de la consulta sin los que llegaron como cadena vacía (se ignoran, como en ValidAPI). */
export type PdnStatisticsFilters = { [K in keyof PdnQuery]?: Exclude<PdnQuery[K], ''> };

/** Quita los filtros vacíos de una consulta ya validada. */
export function pdnStatisticsFilters(request: PdnStatisticsRequest): PdnStatisticsFilters {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (typeof value === 'string' && value !== '') result[key] = value;
  }
  return result as PdnStatisticsFilters;
}

export const PdnPaginationSchema = z
  .object({
    pageSize: z.number().int().min(1).meta({ description: 'Filas por página.' }),
    page: z.number().int().min(1).meta({ description: 'Página actual.' }),
    totalRows: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'Filas que cumplen la consulta.' }),
    hasNextPage: z.boolean().meta({ description: 'Si hay otra página.' }),
  })
  .strict()
  .meta({ description: 'Paginación (la misma de las APIs del S2 y del S3).' });

export const PdnStatisticsResponseSchema = z
  .object({
    pagination: PdnPaginationSchema,
    results: z.array(PdnStatisticsRowSchema).meta({ description: 'Filas de la página.' }),
  })
  .strict()
  .meta({ description: 'Página de la estadística.' });
export type PdnStatisticsResponse = z.infer<typeof PdnStatisticsResponseSchema>;

export const PdnAuthoritySchema = z
  .object({
    clave: AuthorityIdSchema,
    nombre: z.string().min(1).max(300).meta({ description: 'Nombre de la autoridad.' }),
  })
  .strict()
  .meta({ description: 'Autoridad del nodo (como `dependencias` del S2: clave y nombre).' });

export const PdnAuthoritiesSchema = z.array(PdnAuthoritySchema).meta({
  description:
    'Autoridades que el nodo aloja en el directorio, sin repetidas y en orden alfabético por nombre (como `dependencias` del S2).',
});
export type PdnAuthorities = z.infer<typeof PdnAuthoritiesSchema>;

/** Por qué el agregador de la SESNA no sumó la estadística de un nodo. */
export const NATIONAL_STATISTICS_REJECTIONS = [
  'unauthorized',
  'invalid',
  'open-month',
  'foreign-authority',
  'duplicate',
  'too-large',
] as const;

export const NationalStatisticsNodeSchema = z
  .object({
    nodeId: NodeIdSchema,
    name: z.string().min(1).max(200).meta({ description: 'Nombre del nodo en el directorio.' }),
    status: z.enum(['included', 'unreachable', 'rejected', 'no-credentials']).meta({
      description:
        'included: se consultó y se sumó; unreachable: no respondió; rejected: su respuesta no cumplió las reglas; no-credentials: la SESNA no tiene credenciales de ese nodo.',
    }),
    rejection: z.enum(NATIONAL_STATISTICS_REJECTIONS).nullable().meta({
      description:
        'unauthorized (el nodo no dio token o lo rechazó), invalid (no cumple el esquema), open-month, foreign-authority (autoridad de otro nodo), duplicate o too-large; null si no se rechazó.',
    }),
    rows: z.number().int().nonnegative().meta({ description: 'Filas que aportó el nodo.' }),
  })
  .strict()
  .meta({ description: 'Participación de un nodo en el corte nacional de estadística.' });

export const NationalStatisticsSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    cutAt: HourDateSchema.meta({ description: 'Hora del corte (UTC).' }),
    closedBefore: MonthPeriodSchema.meta({
      description: 'Mes en curso al hacer el corte: solo se aceptan meses anteriores.',
    }),
    directorySerial: z.number().int().min(1).meta({ description: 'Versión del directorio.' }),
    nodes: z.array(NationalStatisticsNodeSchema).meta({
      description: 'Todos los nodos del directorio, en su orden.',
    }),
    rows: z
      .array(PdnStatisticsRowSchema.extend({ nodeId: NodeIdSchema }))
      .meta({ description: 'Filas publicadas por cada nodo, con el nodo que las publicó.' }),
  })
  .strict()
  .meta({
    description:
      'Corte nacional de la estadística para el portal de la PDN (Bases, art. 61): las filas que cada nodo ya publicó con sus reglas de protección, sin volver a sumar ni rebajar la supresión.',
  });
export type NationalStatistics = z.infer<typeof NationalStatisticsSchema>;
