// Regla del plazo (pieza del expediente B en el lenguaje de A): una marca por día, lo transcurrido
// sombreado y «hoy» señalado. Es una ilustración: «Día X de N» siempre va en texto junto a ella.
import { findDeadlineRule } from '@sigilo/contracts';
import type { DeadlineView } from '@sigilo/contracts';

/** Plazos que caben en una regla legible (hasta 60 días). */
const MAX_RULER_DAYS = 60;

/** Día del plazo en que estamos y su total, o `null` si no se dibuja regla para este plazo. */
export function rulerPosition(deadline: DeadlineView): { day: number; total: number } | null {
  const rule = findDeadlineRule(deadline.key);
  if (rule === undefined) return null;
  const isDays = rule.unit === 'natural_days' || rule.unit === 'business_days';
  if (!isDays || rule.unit !== deadline.remainingUnit || rule.amount > MAX_RULER_DAYS) return null;
  const day = Math.min(rule.amount, Math.max(0, rule.amount - deadline.remaining));
  return { day, total: rule.amount };
}

const LEFT = 6;
const WIDTH = 288;

/** Regla con el día actual marcado. */
export function DeadlineRuler({ day, total }: { day: number; total: number }) {
  const step = WIDTH / total;
  const nowX = LEFT + day * step;
  const labelEvery = total <= 10 ? 1 : total <= 30 ? 10 : 15;
  return (
    <svg
      className="ruler"
      viewBox="0 0 300 52"
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
      focusable="false"
      data-overdue={day >= total || undefined}
    >
      <rect className="ruler__used" x={LEFT} y="14" width={day * step} height="16" />
      {Array.from({ length: total + 1 }, (_, index) => {
        const x = LEFT + index * step;
        const isMajor = index % labelEvery === 0;
        return (
          <g key={index}>
            <line className="ruler__tick" x1={x} y1="14" x2={x} y2={isMajor ? 30 : 24} />
            {isMajor && index > 0 && (
              <text className="ruler__label" x={x} y="45" textAnchor="middle">
                {index}
              </text>
            )}
          </g>
        );
      })}
      <line className="ruler__now" x1={nowX} y1="12" x2={nowX} y2="34" />
      <text className="ruler__now-label" x={nowX} y="10" textAnchor="middle">
        hoy
      </text>
    </svg>
  );
}
