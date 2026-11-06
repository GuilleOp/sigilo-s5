// «¿Quién sabe qué de ti?»: en lugar de pedir confianza, muestra qué ve cada parte del camino de una
// denuncia por la red y responde las preguntas de desconfianza más comunes, con un enlace para
// comprobarlo. Las afirmaciones deben coincidir con docs/modelo-de-amenazas.md.
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
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
      'Las llaves de confianza vienen fijadas en la página, que comprueba la firma del directorio de autoridades antes de enviar; si algo no coincide, no envía nada. Pero si alguien altera el código de la página, también podría alterar esa comprobación. Por eso el código es abierto, para que cualquier organización lo revise, y comprobar que la página que recibes es la auditada sigue en desarrollo.',
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
    <section className="trust" aria-labelledby="who-knows-title" data-testid="who-knows-what">
      <h2 id="who-knows-title">¿Quién sabe qué de ti?</h2>
      <p>
        No te pedimos que confíes en nosotros. Esto es lo que puede ver cada parte del camino de tu
        denuncia, y cómo comprobarlo.
      </p>
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
      <p className="trust__note">
        Esto describe el envío por la red de SIGILO. Si tu estado usa un solo servidor, ese servidor
        ve tu conexión: SIGILO no la registra, pero quien opera el servidor o su proveedor sí podría
        verla.
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
      <p>
        Compruébalo: <Link to={PATHS.verify}>verifica el registro público</Link> o revisa el código
        en el repositorio del proyecto.
      </p>
    </section>
  );
}
