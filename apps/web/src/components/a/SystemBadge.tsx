// Distintivo de sistema de la dirección A: anillo abierto con el glifo dentro y la clave del
// sistema arriba a la izquierda (S1, S2, S3, S5, S6, 69B). Dice de qué fuente sale cada dato.
import { Icon } from './icons.tsx';
import type { IconName } from './icons.tsx';

/** Sistemas y fuentes con distintivo. */
export type SystemKey = 'S1' | 'S2' | 'S3' | 'S5' | 'S6' | '69B';

const GLYPHS: Readonly<Record<SystemKey, IconName>> = {
  S1: 's1',
  S2: 's2',
  S3: 's3',
  S5: 's5',
  S6: 's6',
  '69B': 'list69b',
};

/** Nombre del sistema para lectores de pantalla. */
export const SYSTEM_NAMES: Readonly<Record<SystemKey, string>> = {
  S1: 'S1, declaraciones patrimoniales y de intereses',
  S2: 'S2, servidores públicos en contrataciones',
  S3: 'S3, sanciones',
  S5: 'S5, denuncias',
  S6: 'S6, contrataciones públicas',
  '69B': 'lista tipo 69-B del SAT',
};

interface SystemBadgeProps {
  /** Sistema con su clave visible; o un glifo suelto, sin clave (por ejemplo, en «Tu escudo»). */
  system?: SystemKey;
  glyph?: IconName;
  size?: 'md' | 'sm';
  tone?: 'primary' | 'protect' | 'warning';
  /** Si se anuncia el nombre del sistema; por omisión es decorativo. */
  isLabelled?: boolean;
}

/** Distintivo con anillo abierto. */
export function SystemBadge({
  system,
  glyph,
  size = 'md',
  tone = 'primary',
  isLabelled = false,
}: SystemBadgeProps) {
  const icon = glyph ?? (system === undefined ? 's5' : GLYPHS[system]);
  return (
    <span
      className={`sys-badge sys-badge--${size} sys-badge--${tone}`}
      {...(isLabelled && system !== undefined
        ? { role: 'img', 'aria-label': `Fuente: ${SYSTEM_NAMES[system]}` }
        : { 'aria-hidden': true })}
    >
      <svg className="sys-badge__ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M24 3.5A20.5 20.5 0 1 1 3.5 24" />
      </svg>
      <Icon name={icon} className="icon sys-badge__glyph" />
      {system !== undefined && (
        <b className="sys-badge__key" aria-hidden="true">
          {system}
        </b>
      )}
    </span>
  );
}

/**
 * Sistema que cita una fuente en texto libre («S6 federal, datos a enero de 2023», «Lista tipo
 * 69-B»); `null` si no se reconoce.
 */
export function systemOfSource(source: string | null | undefined): SystemKey | null {
  if (source === null || source === undefined) return null;
  if (/69-?B/iu.test(source)) return '69B';
  const match = /\bS([12356])\b/u.exec(source);
  return match === null ? null : (`S${match[1]}` as SystemKey);
}
