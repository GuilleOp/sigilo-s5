// Detalle de una denuncia en el panel: hechos, pruebas y su descarte, identidad, estatus y buzón.
import { useCallback, useEffect, useRef, useState } from 'react';
import { findEntity, findMunicipality, findOffense, findState } from '@sigilo/contracts';
import type { ComplaintDetail } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate, formatMonthPeriod, STATUS_LABELS } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';
import { AuthorityMailbox } from './AuthorityMailbox.tsx';
import { DiscardEvidencePanel } from './DiscardEvidencePanel.tsx';
import { EvidenceGallery } from './EvidenceGallery.tsx';
import { OpenIdentityPanel } from './OpenIdentityPanel.tsx';
import { StatusPanel } from './StatusPanel.tsx';

interface ComplaintDetailViewProps {
  session: AuthoritySession;
  folio: string;
  onBack: () => void;
}

/** Vista de detalle. */
export function ComplaintDetailView({ session, folio, onBack }: ComplaintDetailViewProps) {
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [error, setError] = useState('');
  /** Solo la última carga puede actualizar la vista; las respuestas tardías se ignoran. */
  const loadId = useRef(0);

  const reload = useCallback((): Promise<ComplaintDetail | null> => {
    const id = ++loadId.current;
    return api.getComplaint(session.token, folio).then(
      (loaded) => {
        if (id !== loadId.current) return null;
        setDetail(loaded);
        setError('');
        return loaded;
      },
      (failure: unknown) => {
        if (id === loadId.current) {
          setError(describeError(failure, 'No pudimos cargar la denuncia. Inténtalo de nuevo.'));
        }
        return null;
      },
    );
  }, [session.token, folio]);

  useEffect(() => {
    void reload();
    return () => {
      // Al desmontar (volver o cerrar sesión), ninguna respuesta pendiente toca la vista.
      loadId.current += 1;
    };
  }, [reload]);

  // Al terminar la primera carga, el foco va al encabezado (el botón pulsado ya no existe).
  const isLoaded = detail !== null;
  useEffect(() => {
    if (isLoaded) return focusAfterRender('detail-title');
  }, [isLoaded]);

  if (error)
    return (
      <Alert tone="danger" title="Error" role="alert">
        <p>{error}</p>
      </Alert>
    );
  if (detail === null) return <p>Cargando denuncia.</p>;
  const { summary, facts } = detail;
  const municipality =
    facts.municipalityCode === undefined
      ? undefined
      : findMunicipality(facts.stateCode, facts.municipalityCode)?.name;

  return (
    <article aria-labelledby="detail-title" data-testid="complaint-detail">
      <button type="button" className="button button--secondary" onClick={onBack}>
        Volver al listado
      </button>
      <h2 id="detail-title" tabIndex={-1}>
        Denuncia <span className="mono folio">{summary.folio}</span>
      </h2>
      <dl className="definition-list card">
        <dt>Recibida</dt>
        <dd>{formatDayDate(summary.receivedOn)}</dd>
        <dt>Estatus</dt>
        <dd data-testid="detail-status">{STATUS_LABELS[summary.status]}</dd>
        <dt>Identidad</dt>
        <dd>
          {summary.mode === 'sealed'
            ? `Sellada; aperturas registradas: ${detail.identityOpenedCount}`
            : 'No proporcionada (anónima)'}
        </dd>
        <dt>Medidas de protección</dt>
        <dd>{summary.protectionRequested ? 'Solicitadas' : 'No solicitadas'}</dd>
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
      <h3>Pruebas</h3>
      {detail.evidenceDeletionOn !== undefined && (
        <Alert
          tone="warning"
          title={summary.status === 'archived' ? 'Denuncia archivada' : 'Denuncia sin atender'}
          testId="evidence-deletion-warning"
        >
          <p>
            Los archivos de las pruebas se borrarán el {detail.evidenceDeletionOn}. Se borran así
            los de toda denuncia sin atender o archivada, para que el espacio no se llene.
          </p>
          <p>
            Si la denuncia merece atención, cámbiala a un estatus de trámite (por ejemplo, «Buscando
            a la autoridad que debe atenderla»): sus pruebas se guardan mientras siga en trámite. Si
            después la archivas, se borrarán en la fecha de retención o de inmediato si ya pasó. Si
            es spam, descarta sus pruebas para liberar el espacio ahora.
          </p>
        </Alert>
      )}
      <EvidenceGallery token={session.token} evidence={detail.evidence} />
      {detail.evidence.length > 0 && detail.storedEvidenceCount !== undefined && (
        <DiscardEvidencePanel
          token={session.token}
          folio={folio}
          storedCount={detail.storedEvidenceCount}
          onDiscarded={() => void reload()}
        />
      )}
      <StatusPanel
        key={summary.status}
        token={session.token}
        folio={folio}
        current={summary.status}
        onChanged={() => void reload()}
      />
      {summary.mode === 'sealed' && (
        <OpenIdentityPanel session={session} detail={detail} onOpened={() => void reload()} />
      )}
      <AuthorityMailbox session={session} detail={detail} reload={reload} />
    </article>
  );
}
