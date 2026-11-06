// Cuentas individuales del personal de la autoridad: autoridades del nodo, funciones, inicio de
// sesión con vencimiento y el archivo local de cuentas (que nunca se versiona).
import { z } from 'zod';
import { AuthorityIdSchema } from './network.ts';
import { Base64UrlSchema } from './primitives.ts';

/** Identificador estable de una autoridad (definido con el directorio de la red). */
export type AuthorityId = z.infer<typeof AuthorityIdSchema>;

/**
 * Seudónimo estable de una cuenta: aleatorio, sin relación con el nombre de la persona. Es lo que
 * queda en la bitácora como actor de cada acción.
 */
export const AccountIdSchema = z
  .string()
  .regex(/^acct-[0-9a-f]{16}$/u, 'Cuenta inválida')
  .meta({
    description:
      'Seudónimo estable y aleatorio de una cuenta de la autoridad; nunca su nombre. Es el actor que queda en la bitácora.',
    examples: ['acct-5f0c2a9d1e7b3c44'],
  });
export type AccountId = z.infer<typeof AccountIdSchema>;

/**
 * Función de una cuenta. Separación de funciones: `intake` recibe, turna, acepta, reasigna y
 * devuelve; `investigation` investiga, avanza etapas, cierra, escribe por el buzón y aprueba
 * aperturas; `supervision` aprueba aperturas, ve los cierres y recibe los escalamientos. Quien
 * turna nunca puede abrir identidades.
 */
export const AuthorityFunctionSchema = z.enum(['intake', 'investigation', 'supervision']).meta({
  description:
    'Función de la cuenta: intake (recepción y turnado), investigation (investigación) o supervision (supervisión).',
});
export type AuthorityFunction = z.infer<typeof AuthorityFunctionSchema>;

/** Nombre de usuario: minúsculas, dígitos, punto, guion y guion bajo. */
export const UsernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9._-]+$/u, 'Usuario inválido')
  .meta({ description: 'Nombre de usuario de la cuenta (minúsculas, dígitos, punto y guiones).' });

/** Contraseña: al menos 12 caracteres (ASVS V2.1.1); no se recorta ni se transforma. */
export const PasswordSchema = z
  .string()
  .min(12)
  .max(256)
  .meta({ description: 'Contraseña de la cuenta, de 12 a 256 caracteres.' });

export const LoginRequestSchema = z
  .strictObject({ username: UsernameSchema, password: PasswordSchema })
  .meta({ description: 'Inicio de sesión de una persona de la autoridad con su cuenta propia.' });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Autoridad del nodo, tal como la ve el panel. */
export const AuthorityProfileSchema = z
  .object({
    authorityId: AuthorityIdSchema,
    name: z.string().min(1).max(200).meta({ description: 'Nombre de la autoridad.' }),
    supervisorId: AuthorityIdSchema.optional().meta({
      description: 'Autoridad supervisora que recibe los escalamientos, si tiene.',
    }),
    isInbox: z
      .boolean()
      .meta({ description: 'Si es el buzón general del nodo, que recibe y turna.' }),
  })
  .meta({ description: 'Autoridad alojada en el nodo.' });
export type AuthorityProfile = z.infer<typeof AuthorityProfileSchema>;

/** Cuenta con la sesión iniciada; nunca incluye el usuario ni la contraseña. */
export const AuthorityAccountViewSchema = z
  .object({
    accountId: AccountIdSchema,
    authorityId: AuthorityIdSchema,
    function: AuthorityFunctionSchema,
  })
  .meta({ description: 'Cuenta de la sesión: seudónimo, autoridad y función.' });
export type AuthorityAccountView = z.infer<typeof AuthorityAccountViewSchema>;

/** Inactividad máxima de una sesión, en segundos (ASVS V3.3.2: 30 minutos como máximo). */
export const SESSION_IDLE_TIMEOUT_SECONDS = 15 * 60;

/** Duración máxima de una sesión aunque haya actividad, en segundos. */
export const SESSION_ABSOLUTE_TIMEOUT_SECONDS = 8 * 60 * 60;

export const AuthoritySessionSchema = z
  .object({
    token: Base64UrlSchema.meta({
      description:
        'Token de sesión opaco para `Authorization: Bearer`. Vence por inactividad y por duración, y se invalida al cerrar sesión.',
    }),
    idleTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .meta({ description: 'Segundos de inactividad tras los que vence la sesión.' }),
    absoluteTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .meta({ description: 'Segundos tras los que vence la sesión aunque haya actividad.' }),
    account: AuthorityAccountViewSchema,
  })
  .meta({ description: 'Sesión iniciada: token, vencimientos y cuenta.' });
export type AuthoritySession = z.infer<typeof AuthoritySessionSchema>;

/** Sesión vigente sin el token (`GET authSession`). */
export const AuthoritySessionInfoSchema = z
  .object({
    account: AuthorityAccountViewSchema,
    authority: AuthorityProfileSchema,
    idleTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .meta({ description: 'Segundos de inactividad tras los que vence la sesión.' }),
    absoluteTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .meta({ description: 'Segundos tras los que vence la sesión aunque haya actividad.' }),
  })
  .meta({ description: 'Sesión vigente: cuenta, su autoridad y vencimientos.' });
export type AuthoritySessionInfo = z.infer<typeof AuthoritySessionInfoSchema>;

/**
 * Digesto de contraseña con scrypt (RFC 7914): `scrypt$<logN>$<r>$<p>$<sal>$<digesto>`, con sal y
 * digesto en Base64URL. El servidor nunca guarda la contraseña.
 */
export const PasswordHashSchema = z
  .string()
  .regex(/^scrypt\$\d{1,2}\$\d{1,2}\$\d{1,2}\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{32,}$/u);

/** Cuenta tal como se guarda en el archivo local de cuentas. */
export const AuthorityAccountRecordSchema = z.strictObject({
  accountId: AccountIdSchema,
  username: UsernameSchema,
  authorityId: AuthorityIdSchema,
  function: AuthorityFunctionSchema,
  passwordHash: PasswordHashSchema,
});
export type AuthorityAccountRecord = z.infer<typeof AuthorityAccountRecordSchema>;

/**
 * Archivo local de cuentas (`authority-accounts.json`, en el directorio de datos; no se versiona).
 * Declara las autoridades del nodo, cuál es el buzón general y las cuentas de cada persona.
 */
export const AuthorityAccountsFileSchema = z.strictObject({
  version: z.literal(1),
  inboxAuthorityId: AuthorityIdSchema,
  authorities: z
    .array(
      z.strictObject({
        authorityId: AuthorityIdSchema,
        name: z.string().min(1).max(200),
        supervisorId: AuthorityIdSchema.optional(),
        /**
         * Persona titular (sintética en la demo), para revisar el conflicto de interés antes de
         * turnar con S1 y S2. `stateCode` es la clave INEGI o `00` para lo federal.
         */
        head: z
          .strictObject({
            fullName: z.string().min(1).max(200),
            institution: z.string().min(1).max(300),
            stateCode: z.string().min(2).max(16),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(500),
  accounts: z.array(AuthorityAccountRecordSchema).max(10_000),
});
export type AuthorityAccountsFile = z.infer<typeof AuthorityAccountsFileSchema>;
