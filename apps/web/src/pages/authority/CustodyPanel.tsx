// «Cadena de custodia» del detalle de la autoridad: lo anclado en la bitácora al recibir las
// pruebas cifradas (digesto de cada contenedor y compromiso de su contenido), si eso está en la
// cadena pública firmada y las entregas de custodia a otro nodo. Nunca muestra contenido.
import { useEffect, useState } from 'react';
import type { ComplaintDetail, EvidenceCustody } from '@sigilo/contracts';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { verifyEvidenceAnchor } from '../../crypto/evidence.ts';
import type { EvidenceAnchorVerification } from '../../crypto/evidence.ts';
import { formatDayDate } from '../../lib/format.ts';
import { api } from '../../services/api.ts';

interface CustodyPanelProps {
  detail: ComplaintDetail;
  custody: EvidenceCustody;
}

type Status = EvidenceAnchorVerification | 'checking' | 'unavailable';

const STATUS_TEXT: Record<Status, string> = {
  checking: 'Comprobando el anclaje contra la bitácora pública.',
  verified:
    'Comprobado: los digestos de las pruebas están en la bitácora pública, en la cadena firmada.',
  pending:
    'Anclaje registrado; la bitácora lo publica al cerrar el día. Los digestos ya coinciden con el detalle.',
  mismatch:
    'Cuidado: lo anclado no coincide con las pruebas de esta denuncia. No confíes en ellas y repórtalo.',
  unavailable: 'No pudimos consultar la bitácora pública. Inténtalo más tarde.',
};

/** Primeros caracteres de un digesto, en grupos legibles. */
function short(digest: string): string {
  return `${digest.slice(0, 8)} ${digest.slice(8, 16)}…`;
}

/** Sección «Cadena de custodia». */
export function CustodyPanel({ detail, custody }: CustodyPanelProps) {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let isActive = true;
    verifyEvidenceAnchor(detail, (from, limit) => api.getLedgerEvents(from, limit), PINNED_KEYS)
      .then(
        (result) => result,
        () => 'unavailable' as const,
      )
      .then((result) => {
        if (isActive) setStatus(result);
      });
    return () => {
      isActive = false;
    };
  }, [detail]);

  return (
    <section className="card" aria-labelledby="custody-title" data-testid="custody-panel">
      <h3 id="custody-title">Cadena de custodia</h3>
      <p>
        Las pruebas viajan y se guardan cifradas hacia la autoridad: el nodo, la SESEA y la SESNA no
        pueden verlas. Al recibirlas, el nodo anotó en la bitácora el digesto de cada archivo
        cifrado y un compromiso de su contenido; al abrirlas aquí se comprueba que sean las mismas.
      </p>
      <p
        className={status === 'mismatch' ? 'field__error' : 'field__hint'}
        role="status"
        data-testid="custody-status"
      >
        {STATUS_TEXT[status]}
      </p>
      <ol className="definition-list">
        {custody.items.map((item, index) => (
          <li key={item.evidenceId}>
            Prueba {index + 1}: archivo cifrado <span className="mono">{short(item.sha256)}</span>,
            compromiso <span className="mono">{short(item.commitment)}</span>.{' '}
            {item.isStored ? 'Guardada en este nodo.' : 'Ya no está en este nodo.'}
          </li>
        ))}
      </ol>
      <ul data-testid="custody-events">
        {custody.events.map((event) => (
          <li key={event.payloadDigest}>
            {event.type === 'evidence.received'
              ? `${formatDayDate(event.on)}: pruebas recibidas y ancladas`
              : `${formatDayDate(event.on)}: custodia entregada a ${event.toAuthorityId ?? 'otra autoridad'} (${event.toNodeId ?? 'otro nodo'}); aquí se borraron las copias`}
            {event.seq === undefined
              ? ' (se publica al cerrar el día).'
              : ` (evento ${event.seq} de la bitácora).`}
          </li>
        ))}
      </ul>
      <p className="field__hint">
        El sellado de tiempo con una autoridad externa (RFC 3161) es trabajo futuro: hoy la fecha la
        da la bitácora, anclada fuera del sistema.
      </p>
    </section>
  );
}
