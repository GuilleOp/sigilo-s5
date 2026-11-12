// Expediente escalado para la supervisión: lo que permite abrir la segunda llave. La supervisora no
// tiene competencia sobre la denuncia (su detalle es de la autoridad que la tiene), así que pide el
// sobre de escalamiento, lo abre en este navegador con su llave y lo compara con el registro
// público. Nunca trae la identidad.
import { useCallback, useEffect, useState } from 'react';
import { findEntity, findMunicipality, findOffense, findState } from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { decodeFileKey } from '@sigilo/core';
import type { EscalationGroupEntry } from '../../lib/escalation-groups.ts';
import { Alert } from '../../components/Alert.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { openEscalationDelivery, readSupervisorKeyFile } from '../../crypto/escalation.ts';
import type { OpenedEscalation, SupervisorKey } from '../../crypto/escalation.ts';
import { EvidenceUnreadableError, openEvidenceWithKey } from '../../crypto/evidence.ts';
import type { OpenedEvidence } from '../../crypto/evidence.ts';
import { formatDayDate, formatMonthPeriod } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { ApiRequestError, describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';
import { EvidenceGallery } from './EvidenceGallery.tsx';

interface EscalationOpenerProps {
  session: AuthoritySession;
  entry: EscalationGroupEntry;
  originName: string;
  /** Llave de la supervisora ya importada en esta sesión del panel, o `null`. */
  supervisorKey: SupervisorKey | null;
  onSupervisorKey: (key: SupervisorKey) => void;
  onClose: () => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'opened'; opened: OpenedEscalation }
  | { kind: 'failed'; message: string };

const VERIFICATION_TEXT = {
  verified:
    'Comprobado: el sobre coincide con el registro público. Los hechos y las pruebas son los que envió la persona.',
  'anchors-not-comparable':
    'El sobre coincide con el registro público, pero un anclaje no se pudo comparar.',
  pending:
    'El registro público todavía no publica la recepción de esta denuncia: aún no se puede comprobar el sobre.',
  mismatch:
    'Cuidado: el sobre no coincide con el registro público. No confíes en estos hechos y repórtalo.',
} as const;

/** Expediente escalado abierto con la segunda llave. */
export function EscalationOpener({
  session,
  entry,
  originName,
  supervisorKey,
  onSupervisorKey,
  onClose,
}: EscalationOpenerProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [keyError, setKeyError] = useState('');
  const folio = entry.folio;

  useEffect(() => {
    if (supervisorKey === null) return;
    let isActive = true;
    // Seguridad: cada entrega del sobre queda en el registro de seguridad del nodo.
    api
      .deliverEscalation(session.token, folio)
      .then((delivery) =>
        openEscalationDelivery(
          delivery,
          supervisorKey,
          (from, limit) => api.getLedgerEvents(from, limit),
          PINNED_KEYS,
        ),
      )
      .then(
        (opened) => {
          if (isActive) setState({ kind: 'opened', opened });
        },
        (failure: unknown) => {
          if (isActive) {
            // 404: la persona envió la denuncia sin copia para la segunda llave (el despliegue no
            // tenía supervisora fijada), así que solo queda pedirle el expediente a su autoridad.
            const isMissing = failure instanceof ApiRequestError && failure.code === 'not_found';
            setState({
              kind: 'failed',
              message: isMissing
                ? 'Esta denuncia no trae copia para la segunda llave. Pide el expediente a la autoridad que la tiene.'
                : describeError(
                    failure,
                    'No pudimos abrir el sobre con esta llave. Revisa que sea la de la supervisora.',
                  ),
            });
          }
        },
      );
    return () => {
      isActive = false;
    };
  }, [session.token, folio, supervisorKey]);

  async function importKey(file: File | null): Promise<void> {
    if (file === null) return;
    try {
      onSupervisorKey(readSupervisorKeyFile(await file.text(), PINNED_KEYS));
      setKeyError('');
    } catch (failure) {
      setKeyError(failure instanceof Error ? failure.message : 'No pudimos leer la llave.');
    }
  }

  return (
    <section
      className="card escalation-opener"
      aria-labelledby="escalation-opener-title"
      data-testid="escalation-opener"
    >
      <button type="button" className="button button--secondary" onClick={onClose}>
        Volver a los escalamientos
      </button>
      <h3 id="escalation-opener-title" tabIndex={-1}>
        Denuncia escalada <span className="mono folio">{folio}</span>
      </h3>
      <p>
        Escalada el {formatDayDate(entry.on)} desde {originName}. El expediente sigue con esa
        autoridad: aquí ves la copia que la persona cerró con tu segunda llave, sin su identidad.
      </p>
      {supervisorKey === null && (
        <div className="field">
          <label htmlFor="supervisor-key">Segunda llave de la supervisora (archivo .json)</label>
          <p id="supervisor-key-hint" className="field__hint">
            En la demostración es <span className="mono">supervisor-demo-key.json</span>. Se queda
            solo en la memoria de esta página y se borra al salir del panel.
          </p>
          <input
            aria-describedby="supervisor-key-hint"
            id="supervisor-key"
            type="file"
            accept="application/json,.json"
            data-testid="supervisor-key-file"
            onChange={(event) => void importKey(event.target.files?.[0] ?? null)}
          />
          {keyError && (
            <p className="field__error" role="alert">
              {keyError}
            </p>
          )}
        </div>
      )}
      {supervisorKey !== null && state.kind === 'idle' && (
        <p role="status">Abriendo el sobre en este navegador.</p>
      )}
      {state.kind === 'failed' && (
        <p className="field__error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'opened' && (
        <OpenedContent session={session} folio={folio} opened={state.opened} />
      )}
    </section>
  );
}

function OpenedContent({
  session,
  folio,
  opened,
}: {
  session: AuthoritySession;
  folio: string;
  opened: OpenedEscalation;
}) {
  const { content, verification } = opened;
  // Las pruebas se abren con la llave de cada archivo que trae la segunda llave: la supervisora
  // nunca usa la llave de la autoridad competente.
  const openEvidence = useCallback(
    async (item: EvidenceDescriptor): Promise<OpenedEvidence> => {
      const key = content.evidenceKeys.find((entry) => entry.evidenceId === item.evidenceId);
      if (key === undefined) {
        throw new EvidenceUnreadableError('La segunda llave no trae la llave de esta prueba.');
      }
      const blob = await api.getEvidence(session.token, item.evidenceId);
      return openEvidenceWithKey(
        new Uint8Array(await blob.arrayBuffer()),
        item,
        folio,
        decodeFileKey(key.fileKey),
      );
    },
    [content, folio, session.token],
  );
  const facts = content.facts;
  const municipality =
    facts.municipalityCode === undefined
      ? undefined
      : findMunicipality(facts.stateCode, facts.municipalityCode)?.name;
  return (
    <>
      <Alert
        tone={
          verification === 'mismatch'
            ? 'danger'
            : verification === 'verified'
              ? 'success'
              : 'warning'
        }
        title={verification === 'mismatch' ? 'No coincide' : 'Sobre abierto'}
        role="status"
        testId="escalation-verification"
      >
        <p>{VERIFICATION_TEXT[verification]}</p>
      </Alert>
      <dl className="definition-list" data-testid="escalation-content">
        <dt>Identidad</dt>
        <dd>
          {content.mode === 'sealed'
            ? 'Sellada para la autoridad competente; este sobre no la trae.'
            : 'No proporcionada (anónima)'}
        </dd>
        <dt>Medidas de protección</dt>
        <dd>{content.protectionRequested ? 'Solicitadas' : 'No solicitadas'}</dd>
        <dt>Ubicación</dt>
        <dd>
          {findState(facts.stateCode)?.name ?? facts.stateCode}
          {municipality ? `, ${municipality}` : ' (sin municipio)'}
        </dd>
        <dt>Oficina o institución de gobierno</dt>
        <dd>{findEntity(facts.entityId)?.name ?? facts.entityId}</dd>
        <dt>Conducta</dt>
        <dd>{findOffense(facts.offenseCode)?.label ?? facts.offenseCode}</dd>
        <dt>Periodo</dt>
        <dd>{formatMonthPeriod(facts.occurredPeriod)}</dd>
        <dt>Persona o cargo denunciado</dt>
        <dd>{facts.accused}</dd>
        <dt>Descripción</dt>
        <dd className="review-text">{facts.description}</dd>
      </dl>
      <h4>Pruebas</h4>
      {content.evidence.length === 0 ? (
        <p>La persona no envió pruebas.</p>
      ) : (
        <EvidenceGallery evidence={content.evidence} open={openEvidence} />
      )}
    </>
  );
}
