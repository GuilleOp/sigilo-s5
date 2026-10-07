// Pantalla de inicio: qué es SIGILO, sus garantías en lenguaje claro y el asesor.
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { Advisor } from './Advisor.tsx';

const GUARANTEES = [
  {
    title: 'No te pedimos datos de contacto',
    text: 'En la denuncia anónima no das tu nombre, correo ni teléfono. Das seguimiento con un folio y un recibo de 8 palabras.',
  },
  {
    title: 'Tus fotos y documentos se limpian en tu equipo',
    text: 'Antes de enviar, quitamos la ubicación, el modelo de tu celular y otros datos ocultos. Te mostramos qué tenían.',
  },
  {
    title: 'Si das tu nombre, solo la autoridad puede verlo',
    text: 'Tu nombre va guardado bajo llave. Para abrirlo, la autoridad debe decir qué ley se lo permite, y tú verás cuándo y por qué.',
  },
  {
    title: 'Nadie puede borrar lo que pasó',
    text: 'Cada paso queda anotado en un registro público. Nadie puede borrarlo sin que se note.',
  },
  {
    title: 'Sin rastreo',
    text: 'No usamos cookies, analíticas ni servicios de terceros. Nada queda guardado en tu navegador.',
  },
];

/** Inicio. */
export function HomePage() {
  useDocumentTitle('Inicio');
  return (
    <>
      <h1>Denuncia la corrupción sin revelar quién eres</h1>
      <p>
        SIGILO es una forma segura de presentar denuncias por hechos de corrupción ante las
        autoridades competentes. Protege tu identidad desde tu propio celular o computadora.
      </p>
      <div className="actions">
        <Link className="button" to={PATHS.report} data-testid="cta-report">
          Presentar una denuncia
        </Link>
        <Link className="button button--secondary" to={PATHS.tracking} data-testid="cta-tracking">
          Dar seguimiento
        </Link>
      </div>
      <h2>Lo que te garantizamos</h2>
      <ul>
        {GUARANTEES.map((guarantee) => (
          <li key={guarantee.title}>
            <strong>{guarantee.title}.</strong> {guarantee.text}
          </li>
        ))}
      </ul>
      <p>
        Si alguien se acerca mientras escribes, usa el botón rojo <strong>Salida rápida</strong>:
        borra todo y abre una página del clima. También puedes pulsar dos veces la tecla{' '}
        <kbd>Esc</kbd>.
      </p>
      <Advisor />
      <h2>Más información</h2>
      <ul>
        <li>
          <Link to={PATHS.openData}>Datos abiertos</Link>: cuántas denuncias hay, sin datos que
          identifiquen a nadie.
        </li>
        <li>
          <Link to={PATHS.verify}>Verificar la bitácora</Link>: comprueba que nadie cambió el
          registro público.
        </li>
      </ul>
    </>
  );
}
