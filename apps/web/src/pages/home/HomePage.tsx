// Pantalla de inicio (dirección A): titular, acciones, constelación decorativa que termina en tu
// denuncia sellada, «Tu escudo» con las protecciones activas, «¿Quién sabe qué de ti?», los límites
// dichos de frente y el asesor.
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { HeroConstellation } from '../../components/a/HeroConstellation.tsx';
import { Icon } from '../../components/a/icons.tsx';
import { ShieldPanel } from '../../components/a/ShieldPanel.tsx';
import { SystemBadge } from '../../components/a/SystemBadge.tsx';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { Advisor } from './Advisor.tsx';
import { HonestLimits } from './HonestLimits.tsx';
import { WhoKnowsWhat } from './WhoKnowsWhat.tsx';

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
          <p className="lead">
            SIGILO es una forma segura de presentar denuncias por hechos de corrupción ante las
            autoridades competentes. Te ayudamos a quitar de tu relato y de tus fotos lo que podría
            decir quién eres.
          </p>
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
      <ShieldPanel />
      <p>
        Si alguien se acerca mientras escribes, usa el botón rojo <strong>Salida rápida</strong>:
        borra todo y abre una página del clima. También puedes pulsar dos veces la tecla{' '}
        <kbd>Esc</kbd>.
      </p>
      <WhoKnowsWhat />
      <HonestLimits />
      <Advisor />
      <h2>Más información</h2>
      <ul>
        <li>
          <Link to={PATHS.observatory}>Observatorio</Link>: ¿sirvió denunciar? Resultados por
          autoridad y qué se puede comprobar en cada entidad.
        </li>
        <li>
          <Link to={PATHS.openData}>Datos abiertos</Link>: cuántas denuncias hay, sin datos que
          identifiquen a nadie.
        </li>
        <li>
          <Link to={PATHS.verify}>Verificar la bitácora</Link>: comprueba que nadie cambió el
          registro público y comprueba cuántos nombres se han abierto.
        </li>
      </ul>
    </>
  );
}
