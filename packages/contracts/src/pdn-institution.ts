// Contexto público de una institución en la PDN: datos institucionales y agregados del directorio
// de entes y del S6, para la ficha «Contexto PDN de la dependencia» del panel. Nunca trae datos de
// personas ni nada de la denuncia: el nodo consulta solo con el identificador público del ente.
import { z } from 'zod';

/** Sistemas de la PDN a los que reporta la institución según el directorio de entes. */
export const PdnReportingSchema = z
  .object({
    s1: z.boolean().meta({ description: 'Reporta declaraciones patrimoniales (S1).' }),
    s2: z.boolean().meta({ description: 'Reporta servidores públicos en contrataciones (S2).' }),
    s3: z.boolean().meta({ description: 'Reporta servidores públicos sancionados (S3).' }),
    s6: z.boolean().meta({ description: 'Reporta contrataciones públicas (S6).' }),
  })
  .meta({ description: 'Sistemas de la PDN a los que reporta la institución.' });

/** Ficha pública de la institución; `null` en cada bloque si la fuente no respondió. */
export const PdnInstitutionContextSchema = z
  .object({
    entityId: z.string().meta({ description: 'Identificador del ente en el catálogo (PDN-EE-N).' }),
    status: z.enum(['live', 'cached', 'unavailable', 'disabled']).meta({
      description:
        'live: consultado ahora; cached: copia guardada; unavailable: sin conexión con la PDN y sin copia; disabled: el nodo no consulta la PDN.',
    }),
    consultedAt: z
      .string()
      .nullable()
      .meta({ description: 'Fecha y hora (ISO 8601) de la consulta a la PDN.' }),
    directory: z
      .object({
        name: z.string().meta({ description: 'Nombre oficial en el directorio de la PDN.' }),
        governmentLevel: z.string().meta({ description: 'Ámbito: Federal, Estatal o Municipal.' }),
        branch: z
          .string()
          .nullable()
          .meta({ description: 'Poder u órgano (Ejecutivo, Autónomo…).' }),
        stateCode: z.string().nullable().meta({ description: 'Clave INEGI de la entidad.' }),
        municipality: z
          .string()
          .nullable()
          .meta({ description: 'Clave del municipio, si aplica.' }),
        oicControl: z
          .boolean()
          .meta({ description: 'El directorio marca control de órgano interno de control.' }),
        tribunalControl: z
          .boolean()
          .meta({ description: 'El directorio marca control de tribunal.' }),
        reports: PdnReportingSchema,
        updatedAt: z
          .string()
          .nullable()
          .meta({ description: 'Última actualización del registro en el directorio.' }),
      })
      .nullable()
      .meta({ description: 'Registro del directorio de entes de la PDN.' }),
    contracting: z
      .object({
        nationalProcedures: z
          .number()
          .int()
          .meta({ description: 'Procedimientos de contratación en todo el S6.' }),
        nationalAmount: z.number().meta({ description: 'Monto total en todo el S6 (pesos).' }),
        topBuyerRank: z.number().int().nullable().meta({
          description:
            'Lugar de la institución entre los 10 compradores con más monto del S6, o null si no está.',
        }),
        topBuyerAmount: z
          .number()
          .nullable()
          .meta({ description: 'Monto contratado por la institución si está entre los 10.' }),
      })
      .nullable()
      .meta({ description: 'Contexto de contrataciones públicas (S6).' }),
    sources: z
      .array(
        z.object({
          system: z.string().meta({ description: 'Fuente: directorio de entes o S6.' }),
          url: z.string().meta({ description: 'Dirección pública consultada.' }),
        }),
      )
      .meta({ description: 'Fuentes públicas consultadas.' }),
  })
  .meta({
    description:
      'Contexto público y agregado de la institución en la PDN. No identifica a ninguna persona.',
  });
export type PdnInstitutionContext = z.infer<typeof PdnInstitutionContextSchema>;
