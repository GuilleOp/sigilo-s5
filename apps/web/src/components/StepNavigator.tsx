// Navegador de pasos inferior (dirección A, inspirado en el del demo con el verde del S5): «Atrás»,
// el paso actual con su nombre y su avance en barras, y «Continuar», en una píldora.
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './a/icons.tsx';

interface StepNavigatorProps {
  current: number;
  total: number;
  title: string;
  /** Botón «Atrás», si se puede regresar. */
  onBack?: () => void;
  /** Botón «Continuar», si hay paso siguiente. */
  onNext?: () => void;
  children?: ReactNode;
}

/** Navegador de pasos. */
export function StepNavigator({ current, total, title, onBack, onNext }: StepNavigatorProps) {
  const ref = useRef<HTMLElement>(null);
  // H7: la altura real de la píldora (cambia con la lectura fácil, el zoom o el texto) fija el
  // margen inferior de desplazamiento, para que el campo enfocado no quede detrás de ella.
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = (): void => {
      root.style.setProperty('--stepper-height', `${Math.ceil(element.offsetHeight)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--stepper-height');
    };
  }, []);
  return (
    <nav
      ref={ref}
      className="stepper no-print"
      aria-label="Pasos de la denuncia"
      data-testid="stepper"
    >
      {onBack === undefined ? (
        <span className="stepper__slot" />
      ) : (
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={onBack}
          data-testid="step-back"
        >
          <Icon name="left" />
          Atrás
        </button>
      )}
      <p className="stepper__mid">
        <b>
          {current + 1} / {total}
        </b>
        <span>{title}</span>
        <span className="stepper__dots" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <i key={index} className={index <= current ? 'is-on' : undefined} />
          ))}
        </span>
      </p>
      {onNext === undefined ? (
        <span className="stepper__slot" />
      ) : (
        <button
          type="button"
          className="button button--sm"
          onClick={onNext}
          data-testid="step-next"
        >
          Continuar
          <Icon name="right" />
        </button>
      )}
    </nav>
  );
}
