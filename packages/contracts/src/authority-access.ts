// Cuentas individuales del personal de la autoridad: autoridades del nodo, funciones, inicio de
// sesión con vencimiento y el archivo local de cuentas (que nunca se versiona).
import { z } from 'zod';
import { AuthorityIdSchema } from './network.ts';
import { AdministrativeStageSchema } from './procedure.ts';
import type { LegalStage } from './procedure.ts';
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
 * Función de una cuenta. Separación de funciones:
 * - `intake` (recepción y turnado) recibe, turna, acepta, reasigna y devuelve.
 * - `investigation` (autoridad investigadora, LGRA art. 3 fr. II) investiga, califica, presenta el
 *   Informe de Presunta Responsabilidad Administrativa (IPRA), cierra lo que investiga, escribe por
 *   el buzón y aprueba aperturas.
 * - `substantiation` (autoridad substanciadora y resolutora, LGRA art. 3 fr. III y IV) dirige el
 *   procedimiento desde la admisión del IPRA hasta la resolución: solo ella avanza las etapas
 *   posteriores a `report_filed` y cierra desde que el informe se presentó (ver
 *   `functionForStage` y `functionInChargeAt`). LGRA art. 115: nunca es la misma
 *   persona que investiga, así que no se combina con ninguna otra función; tampoco turna ni abre
 *   identidades.
 * - `supervision` aprueba aperturas, ve los cierres y recibe los escalamientos.
 * - `operation` (operación del nodo) solo revisa y resuelve las solicitudes de alta de
 *   autoridades: no ve denuncias, no turna ni abre identidades, y no se combina con otra función.
 * Quien solo turna nunca puede abrir identidades.
 */
export const AuthorityFunctionSchema = z
  .enum(['intake', 'investigation', 'supervision', 'substantiation', 'operation'])
  .meta({
    description:
      'Función de la cuenta: intake (recepción y turnado), investigation (investigación), supervision (supervisión), substantiation (substanciación y resolución) u operation (operación del nodo: solo solicitudes de alta).',
  });
export type AuthorityFunction = z.infer<typeof AuthorityFunctionSchema>;

/**
 * Combinaciones de funciones que admite una cuenta. La LGRA no obliga a separar la recepción de la
 * investigación (en los OIC es una sola área de quejas, denuncias e investigación), así que una
 * cuenta puede tener las dos. Ninguna otra se combina: la supervisión es la segunda llave de quien
 * supervisa, y la substanciación se separa de la investigación (LGRA art. 115).
 */
export const AUTHORITY_FUNCTION_SETS: readonly (readonly AuthorityFunction[])[] = [
  ['intake'],
  ['investigation'],
  ['supervision'],
  ['substantiation'],
  ['operation'],
  ['intake', 'investigation'],
];

/** Indica si `functions` es una de las combinaciones de `AUTHORITY_FUNCTION_SETS` (sin orden). */
export function isAllowedFunctionSet(functions: readonly AuthorityFunction[]): boolean {
  if (new Set(functions).size !== functions.length) return false;
  return AUTHORITY_FUNCTION_SETS.some(
    (set) => set.length === functions.length && set.every((item) => functions.includes(item)),
  );
}

/** Funciones de una cuenta: una, o recepción e investigación juntas. */
export const AuthorityFunctionsSchema = z
  .array(AuthorityFunctionSchema)
  .min(1)
  .max(2)
  .refine(isAllowedFunctionSet, 'Combinación de funciones inválida')
  .meta({
    description:
      'Funciones de la cuenta: una sola, o intake e investigation juntas (recepción e investigación en la misma área). substantiation, supervision y operation nunca se combinan.',
    examples: [['investigation'], ['intake', 'investigation']],
  });

/** Indica si la cuenta tiene la función `fn`. */
export function hasFunction(
  account: { readonly functions: readonly AuthorityFunction[] },
  fn: AuthorityFunction,
): boolean {
  return account.functions.includes(fn);
}

/** Indica si la cuenta tiene alguna de las funciones de `allowed`. */
export function hasAnyFunction(
  account: { readonly functions: readonly AuthorityFunction[] },
  allowed: readonly AuthorityFunction[],
): boolean {
  return account.functions.some((fn) => allowed.includes(fn));
}

/**
 * Función que avanza una etapa legal. Corte (LGRA art. 3 fr. III y art. 100): la autoridad
 * investigadora califica la falta y presenta el IPRA (`report_filed`); la substanciadora dirige el
 * procedimiento desde la admisión del informe, así que toda etapa administrativa posterior
 * (`case_file_sent` en adelante, hasta la resolución) es suya. La vía penal es de la fiscalía, que
 * investiga.
 */
export function functionForStage(stage: LegalStage): 'investigation' | 'substantiation' {
  return SUBSTANTIATION_STAGES.has(stage) ? 'substantiation' : 'investigation';
}

/**
 * Función que lleva la denuncia mientras está en `stage` (la que la cierra): investigación hasta
 * la calificación; substanciación desde que el IPRA se presentó (`report_filed`), porque desde ahí
 * el expediente es de la autoridad substanciadora.
 */
export function functionInChargeAt(stage: LegalStage): 'investigation' | 'substantiation' {
  return stage === 'report_filed' ? 'substantiation' : functionForStage(stage);
}

/** Etapas administrativas posteriores a la presentación del IPRA (`report_filed`). */
export const SUBSTANTIATION_STAGES: ReadonlySet<LegalStage> = new Set(
  AdministrativeStageSchema.options.slice(
    AdministrativeStageSchema.options.indexOf('report_filed') + 1,
  ),
);

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
    functions: AuthorityFunctionsSchema,
  })
  .meta({ description: 'Cuenta de la sesión: seudónimo, autoridad y funciones.' });
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

/**
 * Cuenta tal como se guarda en el archivo local de cuentas. Compatibilidad: los archivos anteriores
 * guardaban una sola `function`; se lee como `functions: [function]`.
 */
export const AuthorityAccountRecordSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null || !('function' in raw)) return raw;
    if ('functions' in raw) return raw;
    const { function: single, ...rest } = raw as Record<string, unknown>;
    return { ...rest, functions: [single] };
  },
  z.strictObject({
    accountId: AccountIdSchema,
    username: UsernameSchema,
    authorityId: AuthorityIdSchema,
    functions: AuthorityFunctionsSchema,
    passwordHash: PasswordHashSchema,
  }),
);
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
