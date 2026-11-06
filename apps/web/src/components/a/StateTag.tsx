// Estado en píldora de la dirección A: siempre ícono y texto, nunca solo color.
import { Icon } from './icons.tsx';
import type { IconName } from './icons.tsx';

/** Tono del estado. */
export type StateTone = 'ok' | 'warn' | 'bad' | 'info' | 'nocov' | 'protect' | 'idle';

const ICONS: Readonly<Record<StateTone, IconName>> = {
  ok: 'check',
  warn: 'warn',
  bad: 'contra',
  info: 'info',
  nocov: 'nocov',
  protect: 'shield',
  idle: 'flat',
};

interface StateTagProps {
  tone: StateTone;
  children: string;
  testId?: string;
}

/** Píldora de estado. */
export function StateTag({ tone, children, testId }: StateTagProps) {
  return (
    <span className={`state-tag state-tag--${tone}`} data-testid={testId}>
      <Icon name={ICONS[tone]} />
      {children}
    </span>
  );
}
