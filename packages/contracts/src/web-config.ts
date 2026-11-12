// Configuración de la web en tiempo de ejecución (ADR 0011): las llaves públicas del nodo, la raíz
// de confianza de la red y el origen de la ventanilla llegan en `/config/sigilo.json`, del mismo
// origen que la web, en lugar de fijarse en el bundle al construir. Así una sola imagen genérica
// sirve a todos los estados.
import { z } from 'zod';
import { PublicKeySetSchema } from './keys.ts';
import { NetworkTrustAnchorSchema } from './network.ts';
import { DayDateSchema } from './primitives.ts';

/** Ruta, en el mismo origen que la web, del archivo de configuración en tiempo de ejecución. */
export const WEB_CONFIG_PATH = '/config/sigilo.json';

/** Nombre del archivo en el directorio de datos del nodo o del enrutador. */
export const WEB_CONFIG_FILE_NAME = 'web-config.json';

/** Ruta pública, en el mismo origen, del calendario de días inhábiles del nodo. */
export const REST_DAYS_PATH = '/datos/dias-inhabiles.json';

export const WebRuntimeConfigSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    pinnedKeys: PublicKeySetSchema.meta({
      description:
        'Llaves públicas del despliegue (las de `keys.json` del nodo). En la ventanilla son de relleno: no guarda denuncias.',
    }),
    networkTrust: NetworkTrustAnchorSchema.nullable().meta({
      description: 'Raíz de confianza de la red, o null si la web trabaja con un solo nodo.',
    }),
    ventanillaUrl: z
      .string()
      .regex(/^https?:\/\/[^\s/?#]+$/u, 'Origen inválido')
      .nullable()
      .meta({ description: 'Origen de la ventanilla única para los enlaces del panel, o null.' }),
  })
  .strict()
  .meta({
    description:
      'Configuración que la web lee al arrancar desde `/config/sigilo.json`, en su mismo origen. La genera `sigilo iniciar`; no lleva secretos.',
  });
export type WebRuntimeConfig = z.infer<typeof WebRuntimeConfigSchema>;

/** Día inhábil local que declara la autoridad del estado por acuerdo publicado. */
export const LocalRestDaySchema = z
  .object({
    fecha: DayDateSchema,
    nombre: z.string().min(1).max(200),
    fundamento: z.string().min(1).max(300),
  })
  .strict();
export type LocalRestDay = z.infer<typeof LocalRestDaySchema>;

/**
 * Archivo `dias-inhabiles.json` del nodo (en su directorio de datos; lo escribe
 * `sigilo calendario revisar` desde `config/dias-inhabiles.csv`): los días inhábiles locales que se
 * suman a los oficiales (LFT, art. 74) en los plazos en días hábiles del nodo.
 */
export const LocalRestDaysFileSchema = z
  .object({
    v: z.literal(1),
    dias: z.array(LocalRestDaySchema).max(400),
  })
  .strict();
export type LocalRestDaysFile = z.infer<typeof LocalRestDaysFileSchema>;

/**
 * Calendario que publica el nodo en `/datos/dias-inhabiles.json`: con él cualquiera recalcula sus
 * plazos (ADR 0007). `digest` es el SHA-256 de la forma canónica de `locales`.
 */
export const PublishedRestDaysSchema = z
  .object({
    v: z.literal(1),
    cobertura: z.object({ desde: DayDateSchema, hasta: DayDateSchema }).strict(),
    oficiales: z.array(LocalRestDaySchema),
    locales: z.array(LocalRestDaySchema),
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();
export type PublishedRestDays = z.infer<typeof PublishedRestDaysSchema>;
