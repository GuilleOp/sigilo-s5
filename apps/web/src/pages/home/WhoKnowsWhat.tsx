// «¿Quién puede saber qué?»: en lugar de pedir confianza, resume en tres líneas qué ve cada parte
// del camino y, a un toque, la tabla completa y las preguntas de desconfianza más comunes. Las
// afirmaciones deben coincidir con docs/modelo-de-amenazas.md.
import { TableScroll } from '../../components/TableScroll.tsx';

/** Una parte del camino y lo que puede saber. */
interface Party {
  name: string;
  sees: string;
  reads: string;
  knowsWho: string;
}

/** Partes del envío por la red, en el orden en que pasa la denuncia. */
export const PARTIES: readonly Party[] = [
  {
    name: 'Tu compañía de internet o la red de tu trabajo',
    sees: 'Que entraste a esta página',
    reads: 'No: todo viaja cifrado',
    knowsWho: 'Sabe qué conexión usaste. Por eso conviene usar los datos de tu celular',
  },
  {
    name: 'El enrutador ciego (el paso de en medio)',
    sees: 'Que llegó un sobre cerrado y a qué autoridad va',
    reads: 'No: el sobre va cerrado con la llave del nodo de la autoridad',
    knowsWho: 'Ve tu dirección de internet, pero no la pasa al nodo y no puede leer el sobre',
  },
  {
    name: 'El servidor (nodo) de la autoridad',
    sees: 'Que llegó una denuncia; solo guarda el día, no la hora',
    reads: 'Sí: los hechos y las pruebas ya limpias',
    knowsWho:
      'No: no recibe tu dirección de internet. Si diste tu nombre, lo guarda en un sobre que no puede abrir',
  },
  {
    name: 'La persona que investiga',
    sees: 'Tu denuncia',
    reads: 'Sí',
    knowsWho:
      'Solo si diste tu nombre, con un fundamento y dos aprobaciones de cuentas distintas. Queda en el registro público y lo ves en tu seguimiento',
  },
  {
    name: 'La autoridad supervisora',
    sees: 'Tu denuncia solo si la autoridad no actúa a tiempo',
    reads: 'Los hechos, si recibe la segunda llave',
    knowsWho: 'No: la segunda llave nunca lleva tu nombre',
  },
  {
    name: 'Cualquier persona en internet',
    sees: 'En el registro público, que llegó una denuncia ese día',
    reads: 'No',
    knowsWho: 'No: el registro no tiene folios ni datos personales',
  },
];

/** Resumen de una línea por parte, a la vista; la tabla completa queda a un toque. */
const SUMMARY: readonly { who: string; tag: string; tone: 'safe' | 'reads'; detail: string }[] = [
  {
    who: 'Quien lleva tu denuncia',
    tag: 'No la lee',
    tone: 'safe',
    detail: 'Solo sabe a qué autoridad va.',
  },
  {
    who: 'La autoridad que investiga',
    tag: 'La lee',
    tone: 'reads',
    detail: 'Pero no sabe quién eres.',
  },
  {
    who: 'Cualquier persona',
    tag: 'No la lee',
    tone: 'safe',
    detail: 'Solo ve que llegó una denuncia ese día.',
  },
];

/** Una pregunta de desconfianza y su respuesta. */
interface Doubt {
  question: string;
  answer: string;
}

export const DOUBTS: readonly Doubt[] = [
  {
    question: '¿Y si el gobierno quiere saber quién soy?',
    answer:
      'Si denuncias de forma anónima, tu nombre no se guarda en ningún lado: no hay nada que entregar. No hay cuenta, ni correo, ni teléfono. Si decides dar tu nombre, viaja sellado y solo se abre con un fundamento y dos aprobaciones; cada apertura por el sistema queda en el registro público y la ves en tu seguimiento.',
  },
  {
    question: '¿Y si guardan mi dirección de internet?',
    answer:
      'El enrutador ve tu dirección pero no puede leer el sobre; el nodo lee la denuncia pero no ve tu dirección. Para juntar las dos cosas tendrían que ponerse de acuerdo dos operadores distintos. Aun así, usa los datos de tu celular y no la red de tu trabajo.',
  },
  {
    question: '¿Y si alguien cambió esta página para espiarme?',
    answer:
      'Las llaves de confianza vienen fijadas en la página, que comprueba la firma del directorio de autoridades antes de enviar; si algo no coincide, no envía nada. Pero si alguien altera el código de la página, también podría alterar esa comprobación. Por eso el código es abierto, para que cualquier organización lo revise. Una forma de comprobar que la página que recibes es la auditada todavía está en desarrollo.',
  },
  {
    question: '¿Cómo sé que esto no es una promesa más?',
    answer:
      'No tienes que creernos. Puedes escribir tu denuncia con el teléfono en modo avión y ver que todo funciona sin internet hasta que decides enviar. Antes de enviar te mostramos exactamente lo que sale de tu equipo. Y en el registro público puedes contar cuántos nombres se han abierto.',
  },
];

/** Sección de la pantalla de inicio. */
export function WhoKnowsWhat() {
  return (
    <section className="card trust" aria-labelledby="who-knows-title" data-testid="who-knows-what">
      <h2 id="who-knows-title">¿Quién puede saber qué?</h2>
      <ul className="trust-summary">
        {SUMMARY.map((row) => (
          <li key={row.who}>
            <span className="trust-summary__who">{row.who}</span>
            <span className={`trust-summary__tag trust-summary__tag--${row.tone}`}>{row.tag}</span>
            <span className="trust-summary__detail">{row.detail}</span>
          </li>
        ))}
      </ul>
      <details className="more">
        <summary>Ver la explicación completa</summary>
        {/* En celular, tarjetas; en pantallas anchas, la tabla. La otra queda oculta también para
          los lectores de pantalla (display: none), así nadie oye el contenido dos veces. */}
        <ul className="trust-cards" data-testid="who-knows-cards">
          {PARTIES.map((party) => (
            <li key={party.name}>
              <h3>{party.name}</h3>
              <dl>
                <dt>Qué ve</dt>
                <dd>{party.sees}</dd>
                <dt>¿Puede leer tu denuncia?</dt>
                <dd>{party.reads}</dd>
                <dt>¿Puede saber quién eres?</dt>
                <dd>{party.knowsWho}</dd>
              </dl>
            </li>
          ))}
        </ul>
        <div className="trust-table-wrap">
          <TableScroll labelledBy="who-knows-caption">
            <table className="trust-table">
              <caption id="who-knows-caption">Qué puede saber cada parte del camino</caption>
              <thead>
                <tr>
                  <th scope="col">Quién</th>
                  <th scope="col">Qué ve</th>
                  <th scope="col">¿Puede leer tu denuncia?</th>
                  <th scope="col">¿Puede saber quién eres?</th>
                </tr>
              </thead>
              <tbody>
                {PARTIES.map((party) => (
                  <tr key={party.name}>
                    <th scope="row">{party.name}</th>
                    <td>{party.sees}</td>
                    <td>{party.reads}</td>
                    <td>{party.knowsWho}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
        <p className="trust__note">
          Esto describe el envío por la red de SIGILO. Si tu estado usa un solo servidor, ese
          servidor ve tu conexión: SIGILO no la registra, pero quien opera el servidor o su
          proveedor sí podría verla.
        </p>
        <h3>Lo que más nos preguntan</h3>
        <div className="trust-doubts">
          {DOUBTS.map((doubt) => (
            <details key={doubt.question}>
              <summary>{doubt.question}</summary>
              <p>{doubt.answer}</p>
            </details>
          ))}
        </div>
      </details>
    </section>
  );
}
