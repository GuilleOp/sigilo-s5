// «Ver lo que sale de tu equipo»: antes de enviar, la lista de lo que viaja y de lo que nunca sale
// del navegador y, en el envío por la red, una muestra real del relato cerrado con la llave del
// nodo destino. La muestra no se envía; al enviar todo se cierra de nuevo, rellenado a un tamaño estándar.
import { useEffect, useState } from 'react';
import { fromBase64Url, sealToPublicKey, utf8Encode } from '@sigilo/core';
import { destinationFor } from '../../../network/network-keys.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import type { ResolvedDestination } from '../destination.ts';

interface OutgoingPanelProps {
  draft: ReportDraft;
  destination: ResolvedDestination;
}

/** Contexto de la muestra: distinto de cualquier sobre real, así no sirve para otra cosa. */
const SAMPLE_AAD = utf8Encode('sigilo/v1/muestra-visible');
/** Caracteres de la muestra que se muestran: suficientes para verla, sin llenar la pantalla. */
export const SAMPLE_PREVIEW_LENGTH = 240;

/** Lo que viaja, en lenguaje claro. Debe coincidir con `buildSubmitRequest` (submission.ts). */
export function travellingItems(draft: ReportDraft, isNetwork: boolean): string[] {
  const proofs = draft.evidence.reduce((total, item) => total + item.clean.length, 0);
  return [
    'Los hechos que escribiste: lugar, oficina, conducta, mes y año, persona o cargo, y tu relato.',
    proofs === 0
      ? 'Pruebas: ninguna.'
      : `${proofs === 1 ? 'Una prueba limpia' : `${proofs} pruebas limpias`}, sin ubicación ni datos del equipo.`,
    ...(draft.mode === 'sealed'
      ? [
          'Tu nombre y el contacto que diste, en un sobre aparte que el servidor no puede abrir. La autoridad lo abre con un fundamento y dos aprobaciones, y queda registrado.',
          ...(draft.protectionRequested ? ['Que pediste medidas de protección.'] : []),
        ]
      : []),
    'Si la autoridad tiene supervisora, una segunda copia de los hechos y las pruebas cerrada para ella: solo la recibe si la autoridad no actúa a tiempo, y nunca lleva tu nombre.',
    ...(isNetwork && draft.corroboration.kind !== ''
      ? [
          'Para comparar con otras denuncias: una etiqueta ciega del dato que diste y un resumen borroso del relato. Con ellos no se puede leer el dato ni el relato.',
        ]
      : []),
    'Dos llaves públicas de tu buzón y una comprobación de tu recibo: sirven para que solo tú leas las respuestas, y con ellas nadie puede saber tus 8 palabras.',
  ];
}

/** Lo que nunca sale del navegador. */
export function stayingItems(draft: ReportDraft): string[] {
  return [
    'Tus 8 palabras.',
    ...(draft.mode === 'sealed'
      ? ['Una cuenta: no existe en SIGILO.']
      : ['Tu nombre, tu correo o tu teléfono: no los pedimos, y no hay cuenta.']),
    'La ubicación, la fecha y el modelo del equipo de tus fotos originales: los quitamos aquí.',
    ...(draft.workplace.worksThere === 'yes'
      ? [
          'Tu área de trabajo. Como dijiste que trabajas en esa oficina, descargamos los tamaños de grupo de todo el estado: eso deja ver la entidad, igual que el destino de tu denuncia.',
        ]
      : ['Tu respuesta sobre si trabajas en esa oficina.']),
    'La hora exacta: el servidor solo guarda el día.',
  ];
}

type Sample = { kind: 'idle' } | { kind: 'ready'; text: string } | { kind: 'failed' };

/** Llave de buzón del nodo destino, tal como la publica el directorio verificado. */
export interface SampleRecipient {
  boxKeyId: string;
  boxPublicKey: string;
}

/** Cierra el relato con la llave del nodo destino y devuelve el sobre como texto. */
export async function sealSample(description: string, node: SampleRecipient): Promise<string> {
  const envelope = await sealToPublicKey(
    utf8Encode(description.trim()),
    { keyId: node.boxKeyId, publicKey: fromBase64Url(node.boxPublicKey) },
    SAMPLE_AAD,
  );
  return `${envelope.enc}${envelope.ct}`;
}

/** Llave del nodo destino, o `undefined` si la denuncia no va por la red. */
function recipientOf(destination: ResolvedDestination): SampleRecipient | undefined {
  if (destination.kind !== 'network') return undefined;
  const { node } = destinationFor(destination.directory, destination.selected.authorityId);
  return { boxKeyId: node.boxKeyId, boxPublicKey: node.boxPublicKey };
}

/** Panel desplegable del paso de revisión. */
export function OutgoingPanel({ draft, destination }: OutgoingPanelProps) {
  const [isOpen, setOpen] = useState(false);
  // La muestra se guarda con la consulta que la produjo: si cambió, todavía se está preparando.
  const [result, setResult] = useState<{ key: string; sample: Sample } | null>(null);
  const recipient = recipientOf(destination);
  const isNetwork = recipient !== undefined;
  const description = draft.facts.description;
  const keyId = recipient?.boxKeyId;
  const publicKey = recipient?.boxPublicKey;

  const key = JSON.stringify([description, keyId, publicKey]);
  const sample: Sample = isOpen && result?.key === key ? result.sample : { kind: 'idle' };

  // Depende de valores simples: `destination` se rehace en cada render de la página y volvería a
  // cerrar la muestra sin que nada cambiara.
  useEffect(() => {
    if (!isOpen || keyId === undefined || publicKey === undefined) return;
    let isActive = true;
    sealSample(description, { boxKeyId: keyId, boxPublicKey: publicKey }).then(
      (text) => {
        if (isActive) setResult({ key, sample: { kind: 'ready', text } });
      },
      () => {
        if (isActive) setResult({ key, sample: { kind: 'failed' } });
      },
    );
    return () => {
      isActive = false;
    };
  }, [isOpen, key, description, keyId, publicKey]);

  return (
    <section
      className="card more-card outgoing"
      aria-label="Lo que sale de tu equipo"
      data-testid="outgoing"
    >
      <button
        type="button"
        className="more-card__toggle"
        aria-expanded={isOpen}
        aria-controls="outgoing-details"
        onClick={() => setOpen((value) => !value)}
        data-testid="outgoing-toggle"
      >
        Ver lo que sale de tu equipo
      </button>
      <div id="outgoing-details" hidden={!isOpen}>
        <div className="outgoing__columns">
          <div>
            <h4>Sale, cerrado con llave</h4>
            <ul data-testid="outgoing-travels">
              {travellingItems(draft, isNetwork).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Nunca sale de tu equipo</h4>
            <ul data-testid="outgoing-stays">
              {stayingItems(draft).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        {isNetwork ? (
          <figure className="outgoing__sample" data-testid="outgoing-sample">
            <figcaption>
              Así se ve tu relato cerrado con la llave del nodo de la autoridad. El enrutador que lo
              lleva solo ve un sobre así, con todo junto y rellenado a uno de pocos tamaños
              estándar, y no puede abrirlo. Esta muestra no se envía; al pulsar «Enviar» todo se
              cierra otra vez, y cada cierre sale distinto.
            </figcaption>
            {sample.kind === 'ready' && (
              <>
                <pre className="mono outgoing__cipher" aria-hidden="true">
                  {sample.text.slice(0, SAMPLE_PREVIEW_LENGTH)}…
                </pre>
                <p className="visually-hidden">
                  Texto cifrado de {sample.text.length} caracteres, sin palabras legibles.
                </p>
              </>
            )}
            {sample.kind === 'idle' && <p>Preparando la muestra…</p>}
            {sample.kind === 'failed' && <p>No pudimos preparar la muestra. No se envió nada.</p>}
          </figure>
        ) : (
          <p data-testid="outgoing-single-node">
            En este sistema tu denuncia viaja por una conexión cifrada directo al servidor de la
            autoridad. SIGILO no registra tu dirección de internet, pero quien opera el servidor o
            su proveedor sí podría verla.
          </p>
        )}
      </div>
    </section>
  );
}
