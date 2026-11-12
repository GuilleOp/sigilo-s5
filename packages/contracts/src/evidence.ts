// Cifrado de extremo a extremo y cadena de custodia de las pruebas. El nodo guarda solo el
// contenedor cifrado y sus metadatos (tamaño, tipo y digestos); nunca la imagen.
import { z } from 'zod';
import { MAX_EVIDENCE_ITEMS } from './complaint.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { AuthorityIdSchema, NodeIdSchema } from './network.ts';
import { DayDateSchema, Sha256HexSchema } from './primitives.ts';

/**
 * Identificador que va en el AAD de la llave de un archivo de prueba cuando se cifra hacia la llave
 * FIJADA del nodo (perfil de nodo único o página propia del nodo, que la usan para su buzón
 * general): el navegador no conoce entonces el identificador de la autoridad. Toda autoridad que
 * use esa llave lo prueba después del suyo.
 */
export const NODE_KEY_AUTHORITY_ID = 'authority.llave-del-nodo';

const EvidenceIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .meta({ description: 'Identificador aleatorio de la prueba (16 bytes en hexadecimal).' });

/**
 * Compromiso del contenido de una prueba: `SHA-256("sigilo/v1/evidence-commitment:" ‖ sal ‖
 * imagen)`, con una sal aleatoria de 32 bytes que viaja cifrada junto con la imagen. Lo calcula el
 * navegador de quien denuncia; sin la sal no sirve para confirmar si una imagen conocida es la
 * prueba (a diferencia del SHA-256 simple de la imagen).
 */
export const EvidenceCommitmentSchema = Sha256HexSchema.meta({
  description:
    'Compromiso del contenido: SHA-256 de un prefijo de dominio, una sal secreta de 32 bytes que viaja cifrada y la imagen limpia. Sin la sal no confirma si una imagen conocida es la prueba.',
});

/**
 * Llave de un archivo de prueba re-cifrada en el navegador de la autoridad que la tiene hacia otra
 * autoridad del mismo nodo (al turnar o reasignar). El AAD liga el folio, la autoridad destino y el
 * compromiso del archivo.
 */
export const EvidenceKeyGrantSchema = z
  .strictObject({
    evidenceId: EvidenceIdSchema,
    authorityId: AuthorityIdSchema,
    envelope: HpkeEnvelopeSchema,
  })
  .meta({
    description:
      'Llave de un archivo de prueba re-cifrada hacia otra autoridad del mismo nodo. El nodo la guarda sin poder abrirla.',
  });
export type EvidenceKeyGrant = z.infer<typeof EvidenceKeyGrantSchema>;

export const EvidenceKeyGrantsRequestSchema = z
  .strictObject({
    grants: z
      .array(EvidenceKeyGrantSchema)
      .min(1)
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Llaves re-cifradas, una por prueba guardada.' }),
  })
  .meta({
    description:
      'Llaves de los archivos de prueba re-cifradas en el navegador hacia otra autoridad del nodo.',
  });
export type EvidenceKeyGrantsRequest = z.infer<typeof EvidenceKeyGrantsRequestSchema>;

export const EvidenceKeyGrantsResponseSchema = z
  .object({
    granted: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Llaves guardadas.' }),
  })
  .meta({ description: 'Resultado de guardar las llaves re-cifradas.' });
export type EvidenceKeyGrantsResponse = z.infer<typeof EvidenceKeyGrantsResponseSchema>;

/** Prueba anclada en la bitácora al recibirse: digesto del contenedor y compromiso del contenido. */
export const EvidenceCustodyItemSchema = z
  .object({
    evidenceId: EvidenceIdSchema,
    sha256: Sha256HexSchema.meta({ description: 'Digesto del contenedor cifrado.' }),
    commitment: EvidenceCommitmentSchema,
    isStored: z
      .boolean()
      .meta({ description: 'El archivo sigue guardado en este nodo (no se borró ni se cedió).' }),
  })
  .meta({ description: 'Prueba en la cadena de custodia.' });
export type EvidenceCustodyItem = z.infer<typeof EvidenceCustodyItemSchema>;

/** Evento de la cadena de custodia, con su lugar en la bitácora si ya se publicó. */
export const EvidenceCustodyEventSchema = z
  .object({
    type: z.enum(['evidence.received', 'evidence.custody_transferred']).meta({
      description:
        'evidence.received (pruebas ancladas al recibirse) o evidence.custody_transferred (las copias pasaron a otro nodo y aquí se borraron).',
    }),
    on: DayDateSchema.meta({ description: 'Día del evento.' }),
    payloadDigest: Sha256HexSchema.meta({ description: 'Identifica el evento en la bitácora.' }),
    seq: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: 'Secuencia del evento una vez publicado.' }),
    toNodeId: NodeIdSchema.optional().meta({
      description: 'Solo en la entrega de custodia: nodo que recibió las pruebas.',
    }),
    toAuthorityId: AuthorityIdSchema.optional().meta({
      description: 'Solo en la entrega de custodia: autoridad que recibió las pruebas.',
    }),
  })
  .meta({ description: 'Evento de la cadena de custodia de las pruebas.' });
export type EvidenceCustodyEvent = z.infer<typeof EvidenceCustodyEventSchema>;

/**
 * Cadena de custodia de las pruebas de una denuncia, para la autoridad: los digestos anclados al
 * recibirlas, los eventos de custodia y las llaves re-cifradas hacia la autoridad de la sesión.
 */
export const EvidenceCustodySchema = z
  .object({
    items: z
      .array(EvidenceCustodyItemSchema)
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Pruebas ancladas, en el orden de la denuncia.' }),
    events: z
      .array(EvidenceCustodyEventSchema)
      .max(20)
      .meta({ description: 'Eventos de custodia en orden.' }),
    keyGrants: z
      .array(EvidenceKeyGrantSchema)
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Llaves re-cifradas hacia la autoridad de la sesión, si las hay.' }),
  })
  .meta({
    description:
      'Cadena de custodia de las pruebas: digestos anclados, eventos de custodia y llaves re-cifradas hacia la autoridad de la sesión.',
  });
export type EvidenceCustody = z.infer<typeof EvidenceCustodySchema>;
