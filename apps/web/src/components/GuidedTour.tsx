// Recorrido guiado, con la forma del tutorial de la bandeja del S5 (paso «n/N», barra de avance,
// Anterior y Siguiente), pero a pedido: empieza solo cuando la persona lo pide, va en una esquina
// para no tapar lo que explica y se cierra con Esc. Resalta el elemento de cada paso.
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { focusAfterRender } from '../lib/focus.ts';
import type { Tour } from '../lib/tours.ts';
import { createMemoryStore, useMemoryStore } from '../state/memory-store.ts';
import { Icon } from './a/icons.tsx';

/** Recorrido activo y su paso, junto con el elemento que lo abrió (el foco regresa ahí). */
interface ActiveTour {
  tour: Tour;
  step: number;
  returnFocusTo: string | null;
}

const tourStore = createMemoryStore<ActiveTour | null>(() => null);

const TITLE_ID = 'tour-title';
const HIGHLIGHT_CLASS = 'tour-target';

/** Empieza un recorrido. `returnFocusTo` es el id del botón que lo abrió. */
export function startTour(tour: Tour, returnFocusTo: string | null = null): void {
  tourStore.set(() => ({ tour, step: 0, returnFocusTo }));
  focusAfterRender(TITLE_ID);
}

function closeTour(): void {
  const active = tourStore.get();
  tourStore.set(() => null);
  if (active?.returnFocusTo) focusAfterRender(active.returnFocusTo);
}

function goTo(step: number): void {
  tourStore.set((active) => (active === null ? null : { ...active, step }));
  focusAfterRender(TITLE_ID);
}

/** Tarjeta del recorrido; vive en el layout y aparece solo si hay uno activo. */
export function GuidedTour() {
  const active = useMemoryStore(tourStore);
  const location = useLocation();
  const navigate = useNavigate();
  const highlighted = useRef<HTMLElement | null>(null);

  const tour = active?.tour;
  const step = active === null ? 0 : active.step;
  const current = tour?.steps[step];

  // El recorrido ocurre en su pantalla: si se pidió desde otra, primero lleva ahí.
  useEffect(() => {
    if (tour !== undefined && location.pathname !== tour.path) void navigate(tour.path);
  }, [tour, location.pathname, navigate]);

  // Resalta el elemento del paso y lo trae a la vista.
  useEffect(() => {
    highlighted.current?.classList.remove(HIGHLIGHT_CLASS);
    highlighted.current = null;
    if (current?.target === undefined) return;
    // La pantalla puede tardar en pintarse (por ejemplo, al llegar desde otra): se reintenta.
    let frame = 0;
    let attempts = 0;
    const find = (): void => {
      const element = document.querySelector<HTMLElement>(`[data-testid="${current.target}"]`);
      if (element === null) {
        if (attempts++ < 60) frame = requestAnimationFrame(find);
        return;
      }
      element.classList.add(HIGHLIGHT_CLASS);
      element.scrollIntoView({ block: 'center', behavior: 'auto' });
      highlighted.current = element;
    };
    frame = requestAnimationFrame(find);
    return () => cancelAnimationFrame(frame);
  }, [current, location.pathname]);

  useEffect(() => {
    if (active !== null) return;
    highlighted.current?.classList.remove(HIGHLIGHT_CLASS);
    highlighted.current = null;
  }, [active]);

  // Esc cierra el recorrido; las flechas cambian de paso.
  useEffect(() => {
    if (tour === undefined) return;
    const last = tour.steps.length - 1;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeTour();
      else if (event.key === 'ArrowRight' && step < last) goTo(step + 1);
      else if (event.key === 'ArrowLeft' && step > 0) goTo(step - 1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tour, step]);

  if (tour === undefined || current === undefined) return null;
  const total = tour.steps.length;
  const isLast = step === total - 1;

  return (
    <section
      className="tour no-print"
      role="dialog"
      aria-labelledby={TITLE_ID}
      aria-describedby="tour-text"
      data-testid="guided-tour"
    >
      <div className="tour__head">
        <p className="tour__label">
          <Icon name="sparkle" />
          {tour.label}
        </p>
        <button
          type="button"
          className="tour__close"
          aria-label="Cerrar el recorrido"
          onClick={closeTour}
          data-testid="tour-close"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="tour__title-row">
        <h2 id={TITLE_ID} tabIndex={-1}>
          {current.title}
        </h2>
        <span className="tour__count" aria-label={`Paso ${step + 1} de ${total}`}>
          {step + 1}/{total}
        </span>
      </div>
      <p id="tour-text">{current.text}</p>
      <ol className="tour__progress" aria-hidden="true">
        {tour.steps.map((item, index) => (
          <li key={item.title} className={index <= step ? 'is-done' : undefined} />
        ))}
      </ol>
      <div className="tour__actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => goTo(step - 1)}
          disabled={step === 0}
          data-testid="tour-prev"
        >
          <Icon name="left" /> Anterior
        </button>
        <button
          type="button"
          className="button"
          onClick={() => (isLast ? closeTour() : goTo(step + 1))}
          data-testid="tour-next"
        >
          {isLast ? 'Terminar' : 'Siguiente'} {!isLast && <Icon name="right" />}
        </button>
      </div>
    </section>
  );
}
