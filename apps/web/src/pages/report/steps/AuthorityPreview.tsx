// "Así te verá la autoridad": vista fiel de lo que recibirá quien tramite la denuncia.
import { findEntity, findMunicipality, findOffense, findState } from '@sigilo/contracts';
import { formatMonthPeriod } from '../../../lib/format.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';

interface AuthorityPreviewProps {
  draft: ReportDraft;
}

/** Ficha con hechos, miniaturas limpias, ubicación e identidad tal como llegan. */
export function AuthorityPreview({ draft }: AuthorityPreviewProps) {
  const { facts } = draft;
  const images = draft.evidence.flatMap((item) => item.clean);
  const municipality =
    facts.municipalityCode === ''
      ? undefined
      : findMunicipality(facts.stateCode, facts.municipalityCode)?.name;
  return (
    <section className="card" aria-labelledby="preview-title" data-testid="authority-preview">
      <h3 id="preview-title">Así te verá la autoridad</h3>
      <dl className="definition-list">
        <dt>Identidad</dt>
        <dd data-testid="preview-identity">
          {draft.mode === 'sealed'
            ? 'Identidad sellada. Bajo llave. Solo la autoridad puede abrirla y debe decir por qué. Tú verás cada vez que la abran.'
            : 'No proporcionada (denuncia anónima).'}
        </dd>
        {draft.mode === 'sealed' && (
          <>
            <dt>Protección</dt>
            <dd>{draft.protectionRequested ? 'La pediste' : 'No la pediste'}</dd>
          </>
        )}
        <dt>Lugar</dt>
        <dd>
          {findState(facts.stateCode)?.name ?? facts.stateCode}
          {municipality ? `, municipio de ${municipality}` : ' (sin municipio)'}
        </dd>
        <dt>Oficina o institución de gobierno</dt>
        <dd>{findEntity(facts.entityId)?.name ?? 'Sin indicar'}</dd>
        <dt>Qué hizo la persona</dt>
        <dd>{findOffense(facts.offenseCode)?.label ?? 'Sin indicar'}</dd>
        <dt>Cuándo pasó</dt>
        <dd>{formatMonthPeriod(`${facts.periodYear}-${facts.periodMonth}`)}</dd>
        <dt>Persona o cargo denunciado</dt>
        <dd>{facts.accused.trim()}</dd>
        <dt>Descripción</dt>
        <dd className="review-text">{facts.description.trim()}</dd>
        <dt>Fecha de recepción</dt>
        <dd>Solo guardamos el día, no la hora. No guardamos datos de tu conexión a internet.</dd>
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
