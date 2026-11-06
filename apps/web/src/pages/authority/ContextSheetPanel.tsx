// Ficha de contexto con prioridad explicable (dirección A): nivel en texto con el puntaje grande y
// cada factor con sus puntos, por qué se aplicó y el distintivo de la fuente (S1, S2, S3, S6, 69B).
// Orienta a la autoridad; nunca decide.
import { Fragment } from 'react';
import { TableScroll } from '../../components/TableScroll.tsx';
import type { ContextSheetView } from '@sigilo/contracts';
import { SystemBadge, systemOfSource } from '../../components/a/SystemBadge.tsx';

/** Fuente de los factores que no vienen de un registro externo, por clave del factor. */
const INTERNAL_SOURCES: Readonly<Record<string, string>> = {
  'offense-grave': 'Catálogo de conductas (LGRA y Código Penal Federal)',
  'independent-corroboration': 'Corroboración ciega (índice de coincidencias)',
};

/** Fuente con su distintivo si es un sistema de la PDN o la lista 69-B. */
function SourceCell({ source, factorId }: { source: string | null; factorId?: string }) {
  const system = systemOfSource(source);
  const fallback =
    (factorId === undefined ? undefined : INTERNAL_SOURCES[factorId]) ??
    'La denuncia u otra fuente externa';
  return (
    <span className="source-cell">
      {system !== null && <SystemBadge system={system} size="sm" />}
      <span>{source ?? fallback}</span>
    </span>
  );
}

interface ContextSheetPanelProps {
  sheet: ContextSheetView;
}

/** Ficha de contexto de la denuncia. */
export function ContextSheetPanel({ sheet }: ContextSheetPanelProps) {
  return (
    <section
      className="card context-sheet"
      aria-labelledby="context-sheet-title"
      data-testid="context-sheet"
      data-level={sheet.level}
    >
      <h3 id="context-sheet-title">Ficha de contexto</h3>
      <p className="priority" data-level={sheet.level} data-testid="priority-level">
        <span className="priority__score">{sheet.score}</span>
        <span className="priority__text">
          <span className="priority__icon" data-level={sheet.level} aria-hidden="true" />
          <strong>Prioridad {sheet.label.toLowerCase()}</strong> ({sheet.score} puntos)
        </span>
      </p>
      <p>
        La prioridad suma puntos por factores públicos y explicables. Orienta el orden de atención;
        no decide nada sobre los hechos. Configuración publicada: versión {sheet.configVersion}.
      </p>
      {/* En celular (<36rem) cada factor es una tarjeta; en pantallas anchas, la tabla. Solo una
          de las dos se muestra (y se expone a lectores de pantalla) a la vez: dicen lo mismo. */}
      <section
        className="factor-cards"
        aria-labelledby="priority-cards-title"
        data-testid="priority-factor-cards"
      >
        <h4 id="priority-cards-title">Factores de la prioridad y sus pesos</h4>
        <ul className="factor-cards__list">
          {sheet.factors.map((factor) => (
            <li key={factor.id} className="factor-card">
              <p className="factor-card__head">
                <strong>{factor.label}</strong>
                <span className="factor-card__points">
                  {factor.points === 0 ? 'Solo informa' : `+${factor.points} puntos`}
                </span>
              </p>
              <p>{factor.reason}</p>
              <p className="source">
                <SourceCell source={factor.source} factorId={factor.id} />
              </p>
            </li>
          ))}
        </ul>
        <p className="factor-cards__total">
          <strong>Total: {sheet.score} puntos.</strong> {sheet.label}
        </p>
      </section>
      <div className="factor-table">
        <TableScroll labelledBy={'priority-factors-caption'}>
          <table className="data-table--wide data-table" data-testid="priority-factors">
            <caption id={'priority-factors-caption'}>Factores de la prioridad y sus pesos</caption>
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Puntos</th>
                <th scope="col">Por qué</th>
                <th scope="col">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {sheet.factors.map((factor) => (
                <tr key={factor.id}>
                  <th scope="row">{factor.label}</th>
                  <td className="numeric">
                    {factor.points === 0 ? 'Solo informa' : `+${factor.points}`}
                  </td>
                  <td>{factor.reason}</td>
                  <td>
                    <SourceCell source={factor.source} factorId={factor.id} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="numeric">{sheet.score}</td>
                <td colSpan={2}>{sheet.label}</td>
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      </div>
      {sheet.facts.length > 0 && (
        <>
          <h4>Datos públicos relevantes</h4>
          <dl className="definition-list" data-testid="context-facts">
            {sheet.facts.map((fact) => (
              <Fragment key={`${fact.label}-${fact.value}`}>
                <dt>{fact.label}</dt>
                <dd>
                  {fact.value}{' '}
                  <span className="source">
                    <SourceCell source={fact.source} />
                  </span>
                </dd>
              </Fragment>
            ))}
          </dl>
        </>
      )}
      {sheet.notices.length > 0 && (
        <>
          <h4>Avisos que no cambian la prioridad</h4>
          <ul data-testid="context-notices">
            {sheet.notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
