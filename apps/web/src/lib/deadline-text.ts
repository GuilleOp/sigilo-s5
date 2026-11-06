// Textos de los plazos legales en lenguaje sencillo: situación (en curso, por vencer, vencido) y
// lo que falta, siempre con la unidad correcta (días naturales o hábiles).
import type { DeadlineStatus } from '@sigilo/contracts';

/** Nombre de cada situación, para mostrarse junto a su ícono (nunca solo con color). */
export const DEADLINE_STATUS_LABELS: Readonly<Record<DeadlineStatus, string>> = {
  running: 'En curso',
  due_soon: 'Por vencer',
  overdue: 'Vencido',
};

/** Unidad de los días que faltan. */
export type RemainingUnit = 'natural_days' | 'business_days';

function days(count: number, unit: RemainingUnit): string {
  const kind = unit === 'business_days' ? 'hábil' : 'natural';
  const plural = unit === 'business_days' ? 'hábiles' : 'naturales';
  return count === 1 ? `1 día ${kind}` : `${count} días ${plural}`;
}

/**
 * «Faltan 3 días hábiles», «Vence hoy» o «Venció hace 2 días naturales». `remaining` es 0 el último
 * día y negativo si ya venció, en la unidad del plazo.
 */
export function describeRemaining(remaining: number, unit: RemainingUnit): string {
  if (remaining === 0) return 'Vence hoy';
  if (remaining > 0) return `${remaining === 1 ? 'Falta' : 'Faltan'} ${days(remaining, unit)}`;
  return `Venció hace ${days(-remaining, unit)}`;
}
