// «Cómo te cuidamos»: todo lo que antes saturaba el inicio, ordenado de lo corto a lo largo. Cada
// sección dice lo esencial en una o tres líneas y deja el detalle a un toque: quién puede saber qué,
// cómo comprobarlo, qué hacer si temes represalias, lo que no podemos evitar, todas las
// protecciones y el asesor.
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { ShieldPanel } from '../../components/a/ShieldPanel.tsx';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { Advisor } from '../home/Advisor.tsx';
import { HonestLimits } from '../home/HonestLimits.tsx';
import { WhoKnowsWhat } from '../home/WhoKnowsWhat.tsx';

/** Formas de comprobarlo, en una línea cada una. */
const CHECKS: readonly { title: string; text: string }[] = [
  { title: 'Escribe en modo avión.', text: 'Nada sale de tu equipo hasta que envías.' },
  { title: 'Mira lo que se envía.', text: 'Antes de enviar te lo mostramos.' },
];

/** Página «Cómo te cuidamos». */
export function ProtectionPage() {
  useDocumentTitle('Cómo te cuidamos');
  return (
    <>
      <p>
        <Link to={PATHS.home}>← Volver al inicio</Link>
      </p>
      <h1>Cómo te cuidamos</h1>
      <p className="lead">No te pedimos que confíes. Aquí está todo, y puedes comprobarlo.</p>
      <WhoKnowsWhat />
      <section className="card" aria-labelledby="checks-title" data-testid="checks">
        <h2 id="checks-title">Compruébalo tú</h2>
        <ul className="plain-list checks">
          {CHECKS.map((check) => (
            <li key={check.title}>
              <strong>{check.title}</strong> {check.text}
            </li>
          ))}
          <li>
            <strong>Cuenta los nombres abiertos.</strong> Están en el{' '}
            <Link to={PATHS.verify}>registro público</Link>.
          </li>
        </ul>
      </section>
      <section className="card" aria-labelledby="measures-title" data-testid="protection-measures">
        <h2 id="measures-title">Si temes represalias</h2>
        <p>
          Desde tu <Link to={PATHS.tracking}>seguimiento</Link> puedes pedir medidas de protección
          por el buzón bajo llave, sin darnos datos nuevos. No las damos nosotros: decide la
          autoridad. Si trabajas en el servicio público, el lugar donde trabajas (Ley General de
          Responsabilidades Administrativas, art. 64). Si tu caso va por la vía penal y la ley te
          reconoce como víctima, el Ministerio Público o el juez (Código Nacional de Procedimientos
          Penales, art. 109).
        </p>
        <p>
          En la vía penal, la ley guarda el nombre de la víctima solo en algunos casos o cuando un
          juez lo decide. Aquí tu nombre queda bajo llave siempre. Si un juez o el Ministerio
          Público lo piden, abrirlo exige dos personas, el número de la resolución y deja huella en
          el registro público y en tu seguimiento.
        </p>
      </section>
      <HonestLimits />
      <details className="card more-card" data-testid="all-protections">
        <summary>Ver todas tus protecciones</summary>
        <ShieldPanel />
      </details>
      <Advisor />
    </>
  );
}
