// Tipos primitivos y formatos compartidos. Toda fecha expuesta se redondea al día
// (o a la hora en el buzón) para reducir la correlación temporal.
import { z } from 'zod';

/** Alfabeto Base32 de Crockford (sin I, L, O, U) para folios legibles. */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Folio público: 12 caracteres Base32 Crockford (60 bits) en grupos de 4. */
export const FolioSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/, 'Folio inválido');
export type Folio = z.infer<typeof FolioSchema>;

/** Bytes codificados en Base64URL sin relleno. */
export const Base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, 'Base64URL inválido');
export type Base64Url = z.infer<typeof Base64UrlSchema>;

/** Digesto SHA-256 en hexadecimal minúsculo. */
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'SHA-256 inválido');
export type Sha256Hex = z.infer<typeof Sha256HexSchema>;

/** Fecha redondeada al día (UTC). */
export const DayDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
export type DayDate = z.infer<typeof DayDateSchema>;

/** Fecha y hora redondeada a la hora (UTC), usada solo en el buzón. */
export const HourDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00Z$/, 'Hora inválida');
export type HourDate = z.infer<typeof HourDateSchema>;

/** Periodo aproximado de ocurrencia de los hechos (año-mes). */
export const MonthPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo inválido');
export type MonthPeriod = z.infer<typeof MonthPeriodSchema>;

/** Identificador de llave: huella corta (16 hex) del material público. */
export const KeyIdSchema = z.string().regex(/^[0-9a-f]{16}$/, 'Identificador de llave inválido');
export type KeyId = z.infer<typeof KeyIdSchema>;
