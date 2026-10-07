// Detalle de una denuncia en el panel: hechos, pruebas, identidad, estatus y buzón.
import { useCallback, useEffect, useState } from 'react';
import type { ComplaintDetail } from '@sigilo/contracts';
import {
  findEntity,
  findOffense,
  municipalityName,
  stateName,
} from '../../catalogs/catalog-search.ts';
import { Alert } from '../../components/Alert.tsx';
import { formatDayDate, formatMonthPeriod, STATUS_LABELS } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';
import { AuthorityMailbox } from './AuthorityMailbox.tsx';
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

  const reload = useCallback(() => {
    api
      .getComplaint(session.token, folio)
      .then(setDetail, (failure: unknown) =>
        setError(describeError(failure, 'No se pudo cargar la denuncia.')),
      );
  }, [session.token, folio]);

  useEffect(reload, [reload]);

  if (error)
    return (
      <Alert tone="danger" title="Error" role="alert">
        <p>{error}</p>
      </Alert>
    );
  if (detail === null) return <p role="status">Cargando denuncia.</p>;
  const { summary, facts } = detail;
  const municipality = municipalityName(facts.stateCode, facts.municipalityCode);

  return (
    <article aria-labelledby="detail-title" data-testid="complaint-detail">
      <button type="button" className="button button--secondary" onClick={onBack}>
        Volver al listado
      </button>
      <h2 id="detail-title">
        Denuncia <span className="mono">{summary.folio}</span>
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
          {stateName(facts.stateCode)}
          {municipality ? `, ${municipality}` : ' (sin municipio)'}
        </dd>
        <dt>Ente público</dt>
        <dd>{findEntity(facts.entityId)?.name ?? facts.entityId}</dd>
        <dt>Conducta</dt>
        <dd>{findOffense(facts.offenseCode)?.name ?? facts.offenseCode}</dd>
        <dt>Periodo</dt>
        <dd>{formatMonthPeriod(facts.occurredPeriod)}</dd>
        <dt>Persona o cargo denunciado</dt>
        <dd>{facts.accused}</dd>
        <dt>Descripción</dt>
        <dd className="review-text">{facts.description}</dd>
      </dl>
      <h3>Pruebas</h3>
      <EvidenceGallery token={session.token} evidence={detail.evidence} />
      <StatusPanel
        key={summary.status}
        token={session.token}
        folio={folio}
        current={summary.status}
        onChanged={reload}
      />
      {summary.mode === 'sealed' && (
        <OpenIdentityPanel session={session} folio={folio} onOpened={reload} />
      )}
      <AuthorityMailbox session={session} detail={detail} onSent={reload} />
    </article>
  );
}
