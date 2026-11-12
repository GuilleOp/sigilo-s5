// Estadística agregada de denuncias que cada nodo ofrece a la SESNA para el portal de la PDN (Bases
// de la PDN, art. 61), con la forma de las APIs del S2 y del S3: `POST /v1/<recurso>` con `sort`,
// `page`, `pageSize` y `query`, y respuesta `{ pagination, results }`. Solo números de meses
// cerrados, redondeados a múltiplos de 5 y con las celdas menores que 5 suprimidas (`null`): nunca
// folios, hechos, personas ni contenido de denuncias.
import { z } from 'zod';
import { ComplaintStatusSchema, OffenseCodeSchema, StateCodeSchema } from './complaint.ts';
import { AuthorityIdSchema, NodeIdSchema } from './network.ts';
import { HourDateSchema, MonthPeriodSchema } from './primitives.ts';
import { ClosureReasonSchema } from './procedure.ts';

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

export const PdnStatisticsRowSchema = z
  .object({
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
    entidad: StateCodeSchema,
    conducta: OffenseCodeSchema,
    recibidas: PublishedCountSchema.meta({
      description:
        'Denuncias recibidas en el mes que quedaron en la bandeja de esta autoridad el día de recepción.',
    }),
    turnadas: TimelinessSchema.meta({
      description:
        'Turnos hechos en el mes desde el buzón general (TURN_SEMAPHORE, espera `routing`), de las denuncias que esperaban en esta autoridad.',
    }),
    aceptadas: TimelinessSchema.meta({
      description:
        'Aceptaciones hechas en el mes por esta autoridad (TURN_SEMAPHORE, espera `acceptance`).',
    }),
    archivadas: z
      .record(ClosureReasonSchema, PublishedCountSchema)
      .meta({ description: 'Cierres del mes por motivo (catálogo CLOSURE_REASONS).' }),
    calificadas: z
      .object({
        graves: PublishedCountSchema.meta({ description: 'Faltas calificadas como graves.' }),
        noGraves: PublishedCountSchema.meta({ description: 'Faltas calificadas como no graves.' }),
      })
      .strict()
      .meta({ description: 'Calificaciones del mes (LGRA, art. 100).' }),
    escalamientos: PublishedCountSchema.meta({
      description: 'Reglas de escalamiento cumplidas en el mes con efecto `escalate`.',
    }),
    estatusAlCierre: z.record(ComplaintStatusSchema, PublishedCountSchema).meta({
      description:
        'Estatus que tenían al cerrarse el mes las denuncias recibidas en él (catálogo COMPLAINT_STATUSES).',
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
      'Fila de la estadística: mes cerrado, autoridad, entidad y conducta, con indicadores ya redondeados y suprimidos. La tabla de cada mes se congela al cerrarse; los filtros solo eligen filas, nunca vuelven a sumar.',
  });
export type PdnStatisticsRow = z.infer<typeof PdnStatisticsRowSchema>;

const SortDirectionSchema = z
  .enum(['asc', 'desc'])
  .meta({ description: 'Orden ascendente (asc) o descendente (desc), lexicográfico en español.' });

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
          'Orden por campo, ascendente o descendente; se aplica en el orden en que se escriben las llaves. Por omisión: mes, autoridad, entidad y conducta ascendentes.',
      }),
    page: z
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .optional()
      .meta({ description: 'Página a mostrar; 1 por omisión.', examples: [1] }),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(PDN_MAX_PAGE_SIZE)
      .optional()
      .meta({
        description: `Filas por página: ${PDN_DEFAULT_PAGE_SIZE} por omisión, ${PDN_MAX_PAGE_SIZE} como máximo (como en el S2 y el S3).`,
        examples: [PDN_DEFAULT_PAGE_SIZE],
      }),
    query: z
      .object({
        mes: MonthPeriodSchema.optional().meta({ description: 'Solo ese mes.' }),
        mesDesde: MonthPeriodSchema.optional().meta({ description: 'Desde ese mes (incluido).' }),
        mesHasta: MonthPeriodSchema.optional().meta({ description: 'Hasta ese mes (incluido).' }),
        entidad: StateCodeSchema.optional(),
        autoridad: AuthorityIdSchema.optional(),
        conducta: OffenseCodeSchema.optional(),
        estatus: ComplaintStatusSchema.optional().meta({
          description: 'Solo filas con un conteo publicado (no suprimido) en `estatusAlCierre`.',
        }),
      })
      .strict()
      .optional()
      .meta({ description: 'Filtros; solo seleccionan filas ya publicadas.' }),
  })
  .strict()
  .meta({ description: 'Consulta de la estadística, con la forma de las APIs del S2 y del S3.' });
export type PdnStatisticsRequest = z.infer<typeof PdnStatisticsRequestSchema>;

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

export const PdnAuthoritiesSchema = z
  .array(PdnAuthoritySchema)
  .meta({ description: 'Autoridades que el nodo aloja en el directorio, por clave.' });
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
