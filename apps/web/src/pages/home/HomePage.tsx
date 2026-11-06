// Pantalla de inicio: una frase, las dos acciones y tres promesas de una línea. Todo el detalle
// (quién puede saber qué, límites, protecciones y asesor) está en «Cómo te cuidamos», a un toque.
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { HeroConstellation } from '../../components/a/HeroConstellation.tsx';
import { Icon } from '../../components/a/icons.tsx';
import type { IconName } from '../../components/a/icons.tsx';
import { SystemBadge } from '../../components/a/SystemBadge.tsx';
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
          <div className="actions">
            <Link className="button" to={PATHS.report} data-testid="cta-report">
              Presentar una denuncia <Icon name="right" />
            </Link>
            <Link
              className="button button--secondary"
              to={PATHS.tracking}
              data-testid="cta-tracking"
            >
              Ver cómo va mi denuncia
            </Link>
          </div>
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
        <Link className="promises__more" to={PATHS.protection} data-testid="protection-link">
          ¿De verdad es seguro? Mira cómo te cuidamos <Icon name="right" />
        </Link>
      </section>
      <p className="quick-exit-tip">
        <strong>¿Alguien se acerca?</strong> Pulsa «Salida rápida» o <kbd>Esc</kbd> dos veces. Todo
        se borra.
      </p>
      <nav className="home-links" aria-label="Más">
        <Link to={PATHS.observatory}>¿Sirvió denunciar?</Link>
        <Link to={PATHS.openData}>Datos abiertos</Link>
        <Link to={PATHS.verify}>Revisar el registro público</Link>
      </nav>
    </>
  );
}
