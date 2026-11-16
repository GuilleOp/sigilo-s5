// Quién sigue después de la investigación, según la tabla de funciones que firmó el nodo de la
// entidad de los hechos (o el nodo federal, para un ente federal): substanciación, resolución,
// tribunal, supervisión y vía penal. La vigilancia del sistema (CPC) va aparte: no ve el caso. Sale
// del directorio verificado; nada se pide al servidor.
import type { AuthorityDirectory, ComplaintDetail, NodeFunction } from '@sigilo/contracts';
import {
  assignmentsFor,
  COURT_INSTANCE_LABELS,
  functionTableFor,
  holderName,
  stateDisplayName,
} from '@sigilo/red';
import { functionRulesOf } from '@sigilo/contracts';
import { useEntityLookup } from '../../catalogs/entity-catalog.ts';
import { formatDayDate } from '../../lib/format.ts';

/** Funciones siguientes que se muestran en el detalle. */
export const NEXT_FUNCTIONS: readonly NodeFunction[] = [
  'substantiation',
  'resolution',
  'court',
  'supervision',
  'prosecution',
];

const SEVERITY_TEXT = {
  serious: 'Si es falta grave',
  non_serious: 'Si es falta no grave',
} as const;

interface NextFunctionsPanelProps {
  detail: ComplaintDetail;
  directory: AuthorityDirectory;
}

/** Panel «Quién sigue»: la institución de cada función siguiente según la tabla. */
export function NextFunctionsPanel({ detail, directory }: NextFunctionsPanelProps) {
  const { facts } = detail;
  // El ente real llega con su fragmento: con `findEntity` (no reactivo) la primera carga no tenía
  // orden de gobierno y todas las filas decían «La tabla no la asigna».
  const { entity, isLoading } = useEntityLookup(facts.entityId);
  const level = entity?.level ?? null;
  const table = functionTableFor(directory, level === 'federal' ? null : facts.stateCode);
  const where = level === 'federal' ? 'federal' : `de ${stateDisplayName(facts.stateCode)}`;
  const severity = detail.procedure?.qualification?.severity;
  return (
    <section
      className="card"
      aria-labelledby="next-functions-title"
      data-testid="next-functions-panel"
    >
      <h3 id="next-functions-title">Quién sigue en el trámite</h3>
      {isLoading ? (
        <p data-testid="next-functions-loading">Consultando el catálogo de entes…</p>
      ) : table === undefined ? (
        <p data-testid="next-functions-missing">
          El directorio firmado no tiene la tabla de funciones del nodo {where}: esa entidad todavía
          no declara quién cumple cada función.
        </p>
      ) : (
        <>
          <p>
            Según la tabla de funciones que firmó el nodo {where} (versión {table.version}, del{' '}
            {formatDayDate(table.issuedOn)}).
            {severity === undefined && ' La resolución depende de la calificación de la falta.'}
          </p>
          <dl className="definition-list">
            {assignmentsFor(directory, table, NEXT_FUNCTIONS, {
              entityId: facts.entityId,
              level,
              ...(severity === undefined ? {} : { severity }),
            }).map((row) => (
              <div key={row.function} data-testid={`next-function-${row.function}`}>
                <dt>{row.label}</dt>
                {row.holders.length === 0 ? (
                  <dd>La tabla no la asigna para este ente.</dd>
                ) : (
                  row.holders.map((holder) => (
                    <dd
                      key={`${holder.severity ?? 'any'}-${holder.instance ?? 'any'}-${holder.name}`}
                    >
                      {holder.severity === null ? '' : `${SEVERITY_TEXT[holder.severity]}: `}
                      {holder.instance === undefined
                        ? ''
                        : `En ${COURT_INSTANCE_LABELS[holder.instance]}: `}
                      {holder.name}
                      {holder.legalBasis === null ? '' : ` (${holder.legalBasis})`}
                    </dd>
                  ))
                )}
              </div>
            ))}
          </dl>
          <p data-testid="next-functions-observer">
            <strong>Quién vigila el sistema (no ve tu caso):</strong>{' '}
            {functionRulesOf(table, 'observer').length === 0
              ? 'la tabla no nombra a nadie.'
              : `${functionRulesOf(table, 'observer')
                  .map((rule) => holderName(directory, rule.holder))
                  .join(', ')}, con la bitácora pública y la estadística agregada.`}
          </p>
        </>
      )}
    </section>
  );
}
