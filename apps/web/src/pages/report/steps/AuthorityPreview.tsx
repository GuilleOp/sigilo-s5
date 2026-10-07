// "Así te verá la autoridad": vista fiel de lo que recibirá quien tramite la denuncia.
import {
  findEntity,
  findOffense,
  municipalityName,
  stateName,
} from '../../../catalogs/catalog-search.ts';
import { formatMonthPeriod } from '../../../lib/format.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';

interface AuthorityPreviewProps {
  draft: ReportDraft;
}

/** Ficha con hechos, miniaturas limpias, ubicación e identidad tal como llegan. */
export function AuthorityPreview({ draft }: AuthorityPreviewProps) {
  const { facts } = draft;
  const images = draft.evidence.flatMap((item) => item.clean);
  const municipality = municipalityName(facts.stateCode, facts.municipalityCode || undefined);
  return (
    <section className="card" aria-labelledby="preview-title" data-testid="authority-preview">
      <h3 id="preview-title">Así te verá la autoridad</h3>
      <dl className="definition-list">
        <dt>Identidad</dt>
        <dd data-testid="preview-identity">
          {draft.mode === 'sealed'
            ? 'Sellada: viaja cifrada. Solo la autoridad competente puede abrirla, con fundamento legal, y tú verás cada apertura.'
            : 'No proporcionada (denuncia anónima).'}
        </dd>
        {draft.mode === 'sealed' && (
          <>
            <dt>Medidas de protección</dt>
            <dd>{draft.protectionRequested ? 'Solicitadas' : 'No solicitadas'}</dd>
          </>
        )}
        <dt>Ubicación</dt>
        <dd>
          {stateName(facts.stateCode)}
          {municipality ? `, municipio de ${municipality}` : ' (sin municipio)'}
        </dd>
        <dt>Ente público</dt>
        <dd>{findEntity(facts.entityId)?.name ?? 'Sin indicar'}</dd>
        <dt>Conducta</dt>
        <dd>{findOffense(facts.offenseCode)?.name ?? 'Sin indicar'}</dd>
        <dt>Periodo</dt>
        <dd>{formatMonthPeriod(`${facts.periodYear}-${facts.periodMonth}`)}</dd>
        <dt>Persona o cargo denunciado</dt>
        <dd>{facts.accused.trim()}</dd>
        <dt>Descripción</dt>
        <dd className="review-text">{facts.description.trim()}</dd>
        <dt>Fecha de recepción</dt>
        <dd>Solo el día, sin hora. El servidor no guarda tu dirección IP.</dd>
        <dt>Pruebas ({images.length})</dt>
        <dd>
          {images.length === 0 ? (
            'Ninguna.'
          ) : (
            <ul className="thumbs">
              {images.map((image, index) => (
                <li key={image.id}>
                  <img src={image.url} alt={`Prueba limpia ${index + 1}`} />
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </section>
  );
}
