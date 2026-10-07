// Encabezado de paso que recibe el foco al cambiar de paso (gestión de foco).
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface StepHeadingProps {
  children: ReactNode;
  shouldFocus: boolean;
}

/** `h2` enfocable programáticamente. */
export function StepHeading({ children, shouldFocus }: StepHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (shouldFocus) ref.current?.focus();
  }, [shouldFocus]);
  return (
    <h2 ref={ref} tabIndex={-1} data-testid="step-heading">
      {children}
    </h2>
  );
}
