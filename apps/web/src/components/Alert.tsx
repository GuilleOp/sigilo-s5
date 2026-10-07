// Aviso con título; el tono se indica con texto además del color.
import type { ReactNode } from 'react';

/** Tono del aviso. */
export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  /** `alert` para errores urgentes; `status` para resultados. Sin rol por omisión. */
  role?: 'alert' | 'status';
  testId?: string;
}

/** Aviso visual con título en texto. */
export function Alert({ tone, title, children, role, testId }: AlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={role} data-testid={testId}>
      <p className="alert__title">{title}</p>
      {children}
    </div>
  );
}
