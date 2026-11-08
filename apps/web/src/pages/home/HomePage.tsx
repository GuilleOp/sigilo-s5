// Pantalla de inicio: una frase, tres tarjetas de acción (como la ventanilla del S5) y tres
// promesas de una línea. Todo el detalle (quién puede saber qué, límites, protecciones y asesor)
// está en «Cómo te cuidamos», a un toque.
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { HeroConstellation } from '../../components/a/HeroConstellation.tsx';
import { Icon } from '../../components/a/icons.tsx';
import type { IconName } from '../../components/a/icons.tsx';
import { SystemBadge } from '../../components/a/SystemBadge.tsx';
import { startTour } from '../../components/GuidedTour.tsx';
import { REPORTER_TOUR } from '../../lib/tours.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

/** Las tres promesas: una línea de título y una de detalle. */
export const PROMISES: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'key',
    title: 'Nadie sabe que fuiste tú',
    text: 'No pedimos tu nombre, correo ni teléfono.',
  },
  { icon: 'pencil', title: 'Tú decides qué contar', text: 'Te avisamos si algo puede delatarte.' },
  {
    icon: 'eye',
    title: 'Ves qué pasa con tu denuncia',
    text: 'Con 8 palabras que solo tú tienes.',
  },
];

/** Inicio. */
export function HomePage() {
  useDocumentTitle('Inicio');
  return (
    <>
      <div className="hero">
        <div className="hero__text">
          <p className="crumbs">
            <SystemBadge system="S5" size="sm" /> Ventanilla única de denuncias
          </p>
          <h1 className="display-title">
            Denuncia sin miedo. <strong>Tu nombre se queda contigo.</strong>
          </h1>
          <p className="lead">Cuenta lo que pasó. Nadie sabrá que fuiste tú.</p>
          <ul className="home-actions">
            <li>
              <Link
                className="home-action home-action--primary"
                to={PATHS.report}
                data-testid="cta-report"
              >
                <span className="home-action__icon">
                  <Icon name="pencil" />
                </span>
                <span className="home-action__text">
                  <span className="home-action__title">Presentar una denuncia</span>
                  <span className="home-action__sub">Sin dar tu nombre. Son 5 pasos.</span>
                </span>
                <Icon name="right" />
              </Link>
            </li>
            <li>
              <Link className="home-action" to={PATHS.tracking} data-testid="cta-tracking">
                <span className="home-action__icon">
                  <Icon name="clock" />
                </span>
                <span className="home-action__text">
                  <span className="home-action__title">Ver cómo va mi denuncia</span>
                  <span className="home-action__sub">Con tu folio y tus 8 palabras.</span>
                </span>
                <Icon name="right" />
              </Link>
            </li>
            <li>
              <Link className="home-action" to={PATHS.protection} data-testid="protection-link">
                <span className="home-action__icon">
                  <Icon name="shield" />
                </span>
                <span className="home-action__text">
                  <span className="home-action__title">¿De verdad es seguro?</span>
                  <span className="home-action__sub">Mira cómo te cuidamos.</span>
                </span>
                <Icon name="right" />
              </Link>
            </li>
          </ul>
          <button
            type="button"
            id="tour-start-home"
            className="tour-start"
            onClick={() => startTour(REPORTER_TOUR, 'tour-start-home')}
            data-testid="tour-start-home"
          >
            <Icon name="sparkle" /> ¿Primera vez? Recorrido de 1 minuto
          </button>
        </div>
        <HeroConstellation />
      </div>
      <section className="promises" aria-labelledby="promises-title" data-testid="promises">
        <h2 id="promises-title">Lo que te prometemos</h2>
        <ul>
          {PROMISES.map((promise) => (
            <li key={promise.title}>
              <span className="promises__icon">
                <Icon name={promise.icon} />
              </span>
              <strong>{promise.title}</strong>
              <span>{promise.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="quick-exit-tip">
        <strong>¿Alguien se acerca?</strong> Pulsa «Salida rápida» o <kbd>Esc</kbd> dos veces. Todo
        se borra.
      </p>
    </>
  );
}
