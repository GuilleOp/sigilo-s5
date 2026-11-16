// Vista al Ministerio Público hacia una fiscalía de otro nodo de la red. El navegador de quien
// investiga vuelve a cifrar las pruebas hacia la llave de la fiscalía destino (del directorio
// firmado) y las sube a ese nodo por el enrutador ciego; el nodo de origen firma el paquete de la
// vista (hechos y descriptores de las pruebas, nunca la identidad sellada ni el buzón) con su llave
// del directorio y lo entrega por el enrutador. El nodo destino crea una copia de lectura para su
// fiscalía con un folio propio de la vista: la denuncia sigue con la autoridad de origen.
import { z } from 'zod';
import {
  ComplaintFactsSchema,
  ComplaintModeSchema,
  EvidenceDescriptorSchema,
  MAX_EVIDENCE_ITEMS,
} from './complaint.ts';
import { AuthorityIdSchema, NodeIdSchema } from './network.ts';
import { Base64UrlSchema, DayDateSchema, FolioSchema } from './primitives.ts';
import { CriminalReferralBasisSchema, PublicNoteSchema } from './procedure-view.ts';

/** Versión del paquete de la vista entre nodos. */
export const NETWORK_REFERRAL_VERSION = 1;

/** Prefijo del mensaje que firma el nodo de origen (separación de dominio). */
export const NETWORK_REFERRAL_SIGNATURE_PREFIX = 'sigilo/red/vista/v1:';

const ReferralIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/u, 'Identificador inválido')
  .meta({ description: 'Identificador aleatorio de la vista (16 bytes en hexadecimal).' });

/**
 * Paquete de la vista que firma el nodo de origen. Lleva los hechos y los descriptores de las
 * pruebas ya re-cifradas hacia la fiscalía destino; nunca la identidad sellada, las llaves de
 * seguimiento ni los mensajes con la persona denunciante.
 */
export const NetworkReferralPackageSchema = z
  .strictObject({
    v: z.literal(NETWORK_REFERRAL_VERSION).meta({ description: 'Versión del formato (1).' }),
    referralId: ReferralIdSchema,
    referralFolio: FolioSchema.meta({
      description:
        'Folio de la copia de lectura en el nodo destino; lo elige el navegador de origen al azar (va en el AAD de las pruebas re-cifradas). No es el folio de la persona denunciante ni sirve para darle seguimiento.',
    }),
    fromNodeId: NodeIdSchema,
    fromAuthorityId: AuthorityIdSchema.meta({
      description: 'Autoridad de origen, que conserva la denuncia y la vía administrativa.',
    }),
    toAuthorityId: AuthorityIdSchema.meta({
      description: 'Fiscalía destino (papel prosecution en el directorio firmado).',
    }),
    sentOn: DayDateSchema.meta({ description: 'Día en que se dio la vista.' }),
    basis: CriminalReferralBasisSchema,
    originMode: ComplaintModeSchema.meta({
      description:
        'Modo de la denuncia en el origen. La identidad sellada no viaja: si la vía penal la necesita, se pide a la autoridad de origen.',
    }),
    facts: ComplaintFactsSchema,
    evidence: z.array(EvidenceDescriptorSchema).max(MAX_EVIDENCE_ITEMS).meta({
      description:
        'Pruebas ya re-cifradas hacia la fiscalía destino y subidas a su nodo por el enrutador.',
    }),
  })
  .meta({
    description:
      'Paquete de la vista al Ministerio Público entre nodos: hechos y pruebas re-cifradas; nunca la identidad sellada ni el buzón.',
  });
export type NetworkReferralPackage = z.infer<typeof NetworkReferralPackageSchema>;

/** Lo que viaja en el sobre de red (`receiveReferral`): el paquete y la firma del nodo de origen. */
export const NetworkReferralDeliverySchema = z
  .strictObject({
    package: NetworkReferralPackageSchema,
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del nodo de origen (su llave del directorio) sobre el prefijo `sigilo/red/vista/v1:` y la forma canónica del paquete.',
    }),
  })
  .meta({
    description:
      'Cuerpo de la operación de red receiveReferral: el paquete de la vista firmado por el nodo de origen.',
  });
export type NetworkReferralDelivery = z.infer<typeof NetworkReferralDeliverySchema>;

/** Respuesta del nodo destino al recibir la vista. */
export const NetworkReferralReceiptSchema = z
  .strictObject({
    referralFolio: FolioSchema,
    receivedOn: DayDateSchema,
  })
  .meta({
    description: 'Acuse del nodo destino: folio de la copia de lectura y día de recepción.',
  });
export type NetworkReferralReceipt = z.infer<typeof NetworkReferralReceiptSchema>;

/** Petición de la autoridad a su nodo para dar vista a una fiscalía de otro nodo. */
export const NetworkReferralRequestSchema = z
  .strictObject({
    toAuthorityId: AuthorityIdSchema,
    basis: CriminalReferralBasisSchema,
    referralFolio: FolioSchema,
    evidence: z.array(EvidenceDescriptorSchema).max(MAX_EVIDENCE_ITEMS).meta({
      description:
        'Descriptores que devolvió el nodo destino al subir cada prueba re-cifrada; uno por cada prueba guardada.',
    }),
    note: PublicNoteSchema.optional(),
  })
  .meta({
    description:
      'Vista al Ministerio Público hacia una fiscalía de otro nodo, con las pruebas ya re-cifradas y subidas al nodo destino.',
  });
export type NetworkReferralRequest = z.infer<typeof NetworkReferralRequestSchema>;

/** Origen de una copia de lectura que llegó de otro nodo (en el detalle de la fiscalía). */
export const NetworkReferralOriginSchema = z
  .strictObject({
    referralId: ReferralIdSchema,
    fromNodeId: NodeIdSchema,
    fromNodeName: z.string().min(1).max(300).meta({ description: 'Nombre del nodo de origen.' }),
    fromAuthorityId: AuthorityIdSchema,
    fromAuthorityName: z
      .string()
      .min(1)
      .max(300)
      .meta({ description: 'Nombre de la autoridad de origen en el directorio.' }),
    sentOn: DayDateSchema,
    originMode: ComplaintModeSchema,
  })
  .meta({
    description:
      'Vista recibida de otro nodo: autoridad y nodo de origen, que conservan la denuncia. Sin folio ni palabras de la persona denunciante.',
  });
export type NetworkReferralOrigin = z.infer<typeof NetworkReferralOriginSchema>;
