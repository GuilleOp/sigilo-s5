// Alta de autoridades en un nodo: la institución pide su alta con su candado (llaves públicas) y
// las cuentas que necesita; quien opera el nodo confirma la huella por teléfono y aprueba o
// rechaza. Firmar el directorio y crear las cuentas son pasos aparte (docs/guia-conecta-tu-estado.md).
import { z } from 'zod';
import { AccountIdSchema, AuthorityFunctionsSchema } from './authority-access.ts';
import type { AuthorityFunction } from './authority-access.ts';
import {
  AuthorityIdSchema,
  AuthorityRoleSchema,
  DirectoryAuthoritySchema,
  GovernmentLevelSchema,
  NetworkStateKeySchema,
} from './network.ts';
import { Base64UrlSchema, DayDateSchema, KeyIdSchema } from './primitives.ts';

/** Máximo de personas con cuenta por solicitud. */
export const MAX_REGISTRATION_PEOPLE = 12;

/** Identificador de una solicitud de alta: `ALTA-` y 12 caracteres hexadecimales. */
export const RegistrationIdSchema = z
  .string()
  .regex(/^ALTA-[0-9A-F]{12}$/u, 'Solicitud inválida')
  .meta({ description: 'Folio de la solicitud de alta.', examples: ['ALTA-3F2A9C01B7E4'] });

/** Huella del candado en grupos de 4 (ver `padlockFingerprint` en @sigilo/core). */
export const PadlockFingerprintSchema = z
  .string()
  .regex(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/u, 'Huella inválida')
  .meta({
    description:
      'Huella del candado: 16 caracteres hexadecimales del SHA-256 de las dos llaves públicas, en grupos de 4.',
    examples: ['3f2a 9c01 b7e4 55d0'],
  });

/** Candado de la autoridad: solo llaves públicas. */
export const RegistrationPadlockSchema = z
  .object({
    keyId: KeyIdSchema,
    boxPublicKey: Base64UrlSchema.max(64).meta({
      description: 'Llave pública X25519 de la autoridad.',
    }),
    signingPublicKey: Base64UrlSchema.max(64).meta({
      description: 'Llave pública Ed25519 de la autoridad.',
    }),
  })
  .strict()
  .meta({ description: 'Candado de la autoridad: solo sus llaves públicas, nunca la privada.' });

const text = (max: number, description: string) =>
  z.string().trim().min(2).max(max).meta({ description });

/** Funciones que se pueden pedir en una solicitud: todas menos la de operación del nodo. */
function isRequestableFunctionSet(functions: readonly AuthorityFunction[]): boolean {
  return !functions.includes('operation');
}

export const RegistrationPersonSchema = z
  .object({
    fullName: text(120, 'Nombre de la persona que tendrá cuenta.'),
    functions: AuthorityFunctionsSchema.refine(
      isRequestableFunctionSet,
      'La operación del nodo no se pide en una solicitud de alta',
    ),
  })
  .strict()
  .meta({ description: 'Persona de la institución que tendrá cuenta en el panel.' });

/** Cuerpo de `POST registrationRequests`. */
export const RegistrationRequestSchema = z
  .object({
    institutionName: text(300, 'Nombre oficial de la institución.'),
    stateCode: NetworkStateKeySchema.nullable().meta({
      description: 'Entidad de la institución; null si es federal.',
    }),
    governmentLevel: GovernmentLevelSchema,
    role: AuthorityRoleSchema.exclude(['inbox']).meta({
      description:
        'Papel: investigating (investiga faltas), supervisory (supervisa) o prosecution (fiscalía).',
    }),
    laws: z
      .array(z.enum(['LGRA', 'CPF']))
      .min(1)
      .max(2)
      .meta({ description: 'Leyes de las conductas que conoce.' }),
    supervisorId: AuthorityIdSchema.nullable().meta({
      description: 'Autoridad supervisora en el directorio, si tiene.',
    }),
    applicant: z
      .object({
        fullName: text(120, 'Nombre de quien solicita.'),
        position: text(200, 'Cargo de quien solicita.'),
        appointment: text(200, 'Número y fecha del oficio de nombramiento.'),
      })
      .strict()
      .meta({ description: 'Quien solicita el alta, con su cargo y nombramiento.' }),
    people: z
      .array(RegistrationPersonSchema)
      .min(1)
      .max(MAX_REGISTRATION_PEOPLE)
      .meta({ description: 'Personas de la institución que tendrán cuenta.' }),
    padlock: RegistrationPadlockSchema,
  })
  .strict()
  .meta({ description: 'Solicitud de alta de una institución en el nodo.' });
export type RegistrationRequest = z.infer<typeof RegistrationRequestSchema>;

/** Respuesta de `POST registrationRequests`. */
export const RegistrationReceiptSchema = z
  .object({
    requestId: RegistrationIdSchema,
    fingerprint: PadlockFingerprintSchema,
  })
  .strict()
  .meta({ description: 'Folio de la solicitud y huella del candado recibido.' });
export type RegistrationReceipt = z.infer<typeof RegistrationReceiptSchema>;

export const RegistrationStatusSchema = z.enum(['pending', 'approved', 'rejected']).meta({
  description: 'Estado: pending (pendiente), approved (aprobada) o rejected (rechazada).',
});
export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>;

/** Solicitud tal como la ve la cuenta de operación. */
export const RegistrationViewSchema = z
  .object({
    requestId: RegistrationIdSchema,
    receivedOn: DayDateSchema,
    status: RegistrationStatusSchema,
    request: RegistrationRequestSchema,
    decision: z
      .object({
        on: DayDateSchema,
        accountId: AccountIdSchema,
        reason: z.string().max(500).nullable(),
      })
      .strict()
      .nullable()
      .meta({
        description: 'Quién resolvió (seudónimo de la cuenta), qué día y, si rechazó, el motivo.',
      }),
    directoryEntry: DirectoryAuthoritySchema.nullable().meta({
      description:
        'Si se aprobó: entrada propuesta para el directorio, lista para agregarla, firmarla y que los testigos la cofirmen.',
    }),
  })
  .strict()
  .meta({ description: 'Solicitud de alta con su estado y, si ya se resolvió, quién y cuándo.' });
export type RegistrationView = z.infer<typeof RegistrationViewSchema>;

/** Respuesta de `GET operationRegistrations`. */
export const RegistrationListSchema = z
  .object({
    nodeId: z.string().nullable().meta({ description: 'Nodo de este servidor, o null sin red.' }),
    registrations: z
      .array(RegistrationViewSchema)
      .meta({ description: 'Solicitudes de la más reciente a la más antigua.' }),
  })
  .strict();
export type RegistrationList = z.infer<typeof RegistrationListSchema>;

/**
 * Cuerpo de `POST operationRegistrationDecision`. Aprobar exige la huella que la institución leyó
 * por teléfono: el servidor la compara con la que calcula del candado.
 */
export const RegistrationDecisionSchema = z
  .discriminatedUnion('decision', [
    z.object({ decision: z.literal('approve'), fingerprint: PadlockFingerprintSchema }).strict(),
    z.object({ decision: z.literal('reject'), reason: z.string().trim().min(5).max(500) }).strict(),
  ])
  .meta({ description: 'Aprobar con la huella confirmada o rechazar con un motivo.' });
export type RegistrationDecision = z.infer<typeof RegistrationDecisionSchema>;
