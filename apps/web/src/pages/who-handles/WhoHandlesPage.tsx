// «¿Quién atiende tu denuncia en tu estado?»: la tabla de funciones de cada nodo, de solo lectura,
// tal como viene en el directorio firmado y cofirmado (cada tabla, además, firmada por su nodo); la
// búsqueda por dependencia, que dice quién es su órgano interno de control; la cobertura de OIC de
// cada estado y de la federación, y qué entidades todavía no tienen nodo. La vigilancia del sistema
// (CPC) va aparte: no ve casos. Solo se descargan del mismo origen los catálogos de entes.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  entityAssignmentsOf,
  findEntity,
  functionRulesOf,
  GOVERNMENT_LEVEL_LABELS,
  NODE_FUNCTIONS,
  PUBLIC_ENTITIES,
  STATES,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  FunctionRule,
  FunctionTable,
  PublicEntityOption,
} from '@sigilo/contracts';
import {
  COMPETENCE_BADGE_LABELS,
  COURT_INSTANCE_LABELS,
  competenceCoverage,
  entityCompetence,
  holderName,
  NODE_FUNCTION_LABELS,
  percentOf,
  stateDisplayName,
} from '@sigilo/red';
import { toDayDate } from '@sigilo/core';
import { PATHS } from '../../app/paths.ts';
import { Alert } from '../../components/Alert.tsx';
import { SelectField, TextField } from '../../components/Field.tsx';
import { TableScroll } from '../../components/TableScroll.tsx';
import { loadEntityFragment } from '../../catalogs/entity-catalog.ts';
import { formatDayDate } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useNetworkState } from '../../network/use-network-state.ts';

const SEVERITY_TEXT = { serious: 'faltas graves', non_serious: 'faltas no graves' } as const;

/** Funciones del trámite que se muestran en cada tabla; la vigilancia del sistema va aparte. */
const CASE_FUNCTIONS = NODE_FUNCTIONS.filter((fn) => fn !== 'observer');

/** A quién aplica la regla, en lenguaje claro. */
export function ruleScope(rule: FunctionRule): string {
  const levels = rule.governmentLevels
    .map((level) => GOVERNMENT_LEVEL_LABELS[level].toLocaleLowerCase('es-MX'))
    .join(' y ');
  const whom =
    rule.entityIds.length === 0
      ? `Entes del orden ${levels}`
      : rule.entityIds.map((id) => findEntity(id)?.name ?? id).join(', ');
  const details = [
    rule.severity === undefined ? '' : SEVERITY_TEXT[rule.severity],
    rule.instance === undefined ? '' : COURT_INSTANCE_LABELS[rule.instance],
    rule.requiresIdentifiedReporter === true ? 'solo denuncias con nombre y firma' : '',
  ].filter((item) => item !== '');
  return details.length === 0 ? whom : `${whom} (${details.join('; ')})`;
}

/** Nombre de la jurisdicción de una tabla. */
export function tableTitle(table: FunctionTable): string {
  return table.stateCode === null
    ? 'Entes federales (nodo federal)'
    : stateDisplayName(table.stateCode);
}

/** Entidades del catálogo que no tienen tabla de funciones (no tienen nodo). */
export function statesWithoutNode(directory: AuthorityDirectory): string[] {
  const covered = new Set(directory.functionTables?.map((item) => item.table.stateCode) ?? []);
  return STATES.filter((state) => !covered.has(state.code)).map((state) => state.name);
}

/**
 * Dependencias de una tabla: los entes reales del catálogo de su entidad (`00` en la federal) y los
 * ficticios de la demostración que la tabla nombra en su competencia por dependencia.
 */
export function tableEntities(
  table: FunctionTable,
  catalog: readonly PublicEntityOption[],
): PublicEntityOption[] {
  const named = new Set(entityAssignmentsOf(table).map((item) => item.entityId));
  const fictitious = PUBLIC_ENTITIES.filter(
    (entity) => entity.isFictitious === true && named.has(entity.id),
  );
  return [...catalog, ...fictitious];
}

export function FunctionTableCard({
  directory,
  table,
}: {
  directory: AuthorityDirectory;
  table: FunctionTable;
}) {
  const id = `function-table-${table.nodeId.replace('.', '-')}`;
  const nodeName = directory.nodes.find((node) => node.id === table.nodeId)?.name ?? table.nodeId;
  const observers = functionRulesOf(table, 'observer');
  return (
    <section className="card" aria-labelledby={id} data-testid={id}>
      <h2 id={id}>{tableTitle(table)}</h2>
      <p>
        La declara y la firma el {nodeName} (versión {table.version}, del{' '}
        {formatDayDate(table.issuedOn)}).
        {entityAssignmentsOf(table).length > 0 &&
          ` Además nombra el órgano interno de control de ${entityAssignmentsOf(table).length} dependencias: búscalas arriba.`}
      </p>
      <dl className="definition-list">
        {CASE_FUNCTIONS.map((fn) => (
          <div key={fn}>
            <dt>{NODE_FUNCTION_LABELS[fn]}</dt>
            {functionRulesOf(table, fn).length === 0 ? (
              <dd>Sin asignar en esta tabla.</dd>
            ) : (
              functionRulesOf(table, fn).map((rule, index) => (
                <dd key={`${fn}-${index}`}>
                  {ruleScope(rule)}: <strong>{holderName(directory, rule.holder)}</strong>
                  {rule.legalBasis === undefined ? '' : ` (${rule.legalBasis})`}
                </dd>
              ))
            )}
          </div>
        ))}
      </dl>
      <p data-testid={`${id}-observer`}>
        <strong>Quién vigila el sistema (no ve tu caso):</strong>{' '}
        {observers.length === 0
          ? 'esta tabla no nombra a nadie.'
          : `${observers.map((rule) => holderName(directory, rule.holder)).join(', ')}. Ve solo la bitácora pública y la estadística agregada.`}
      </p>
    </section>
  );
}

/** Entes de cada tabla, descargados del mismo origen (fragmentos de /datos/entes/). */
function useTableEntities(
  tables: readonly FunctionTable[],
): ReadonlyMap<string, PublicEntityOption[]> {
  const [entities, setEntities] = useState<ReadonlyMap<string, PublicEntityOption[]>>(new Map());
  useEffect(() => {
    let isActive = true;
    for (const table of tables) {
      const code = table.stateCode ?? '00';
      loadEntityFragment(code).then(
        (catalog) => {
          if (isActive) {
            setEntities((current) => new Map(current).set(code, tableEntities(table, catalog)));
          }
        },
        () => undefined,
      );
    }
    return () => {
      isActive = false;
    };
  }, [tables]);
  return entities;
}

/** Búsqueda por dependencia: su órgano interno de control según la tabla de su entidad. */
export function DependencySearch({
  directory,
  tables,
  entities,
}: {
  directory: AuthorityDirectory;
  tables: readonly FunctionTable[];
  entities: ReadonlyMap<string, PublicEntityOption[]>;
}) {
  const [code, setCode] = useState(tables[0]?.stateCode ?? '00');
  const [query, setQuery] = useState('');
  const table = tables.find((item) => (item.stateCode ?? '00') === code);
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const needle = fold(query.trim());
  const found =
    needle.length < 3
      ? []
      : (entities.get(code) ?? [])
          .filter((entity) => fold(entity.name).includes(needle))
          .slice(0, 20);
  const today = toDayDate(new Date());
  return (
    <section className="card" aria-labelledby="dependency-search-title">
      <h2 id="dependency-search-title">Busca tu dependencia</h2>
      <p>
        Cada dependencia tiene su órgano interno de control (OIC), que investiga sus faltas. Si aún
        no tiene uno en la red, tu denuncia llega a la autoridad receptora de tu estado, que la
        turna a ese OIC.
      </p>
      <SelectField
        id="dependency-search-state"
        label="Estado o federación"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        data-testid="dependency-search-state"
      >
        {tables.map((item) => (
          <option key={item.nodeId} value={item.stateCode ?? '00'}>
            {item.stateCode === null ? 'Federación (entes federales)' : tableTitle(item)}
          </option>
        ))}
      </SelectField>
      <TextField
        id="dependency-search-query"
        label="Nombre de la dependencia"
        hint="Escribe al menos 3 letras."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-testid="dependency-search-query"
      />
      <div role="status" aria-live="polite">
        {needle.length >= 3 && found.length === 0 && <p>No encontramos esa dependencia.</p>}
      </div>
      {table !== undefined && found.length > 0 && (
        <ul className="plain-list" data-testid="dependency-search-results">
          {found.map((entity) => {
            const competence = entityCompetence(directory, table, entity, today);
            return (
              <li key={entity.id} data-testid="dependency-search-result">
                <strong>
                  {entity.name}
                  {entity.isFictitious === true ? ' (ficticia)' : ''}
                </strong>
                :{' '}
                {competence.holderName === null
                  ? 'su órgano interno de control está pendiente; tu denuncia llega a la autoridad receptora, que la turna.'
                  : competence.status === 'without_oic'
                    ? `sin OIC designado, la atiende ${competence.holderName}.`
                    : `la investiga ${competence.holderName}.`}{' '}
                <span className="competence-badge" data-badge={competence.badge}>
                  {COMPETENCE_BADGE_LABELS[competence.badge]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Cobertura de OIC de cada estado con nodo y de la federación (dato abierto). */
export function CoverageTable({
  directory,
  tables,
  entities,
}: {
  directory: AuthorityDirectory;
  tables: readonly FunctionTable[];
  entities: ReadonlyMap<string, PublicEntityOption[]>;
}) {
  const today = toDayDate(new Date());
  const rows = tables.flatMap((table) => {
    const list = entities.get(table.stateCode ?? '00');
    return list === undefined
      ? []
      : [{ table, coverage: competenceCoverage(directory, table, list, today) }];
  });
  return (
    <section className="card" aria-labelledby="oic-coverage-title">
      <h2 id="oic-coverage-title">Cobertura de órganos internos de control</h2>
      <p>
        Dependencias del catálogo de entes de la PDN de cada estado con nodo (y de la federación):
        cuántas tienen su OIC asignado, cuántas reciben ya las denuncias cifradas (con llaves) y
        cuántas están pendientes.
      </p>
      <TableScroll labelledBy="oic-coverage-caption">
        <table className="competence-table" data-testid="oic-coverage">
          <caption id="oic-coverage-caption">Cobertura de OIC por estado</caption>
          <thead>
            <tr>
              <th scope="col">Estado</th>
              <th scope="col">Dependencias</th>
              <th scope="col">Con OIC asignado</th>
              <th scope="col">Con llaves</th>
              <th scope="col">Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ table, coverage }) => (
              <tr key={table.nodeId}>
                <th scope="row">{tableTitle(table)}</th>
                <td className="numeric">{coverage.total}</td>
                <td className="numeric">
                  {coverage.withOic} ({percentOf(coverage.withOic, coverage.total)} %)
                </td>
                <td className="numeric">
                  {coverage.withKeys} ({percentOf(coverage.withKeys, coverage.total)} %)
                </td>
                <td className="numeric">
                  {coverage.pending} ({percentOf(coverage.pending, coverage.total)} %)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {rows.length < tables.length && <p role="status">Cargando los catálogos de entes…</p>}
    </section>
  );
}

/** Página pública con la tabla de funciones de cada estado. */
export function WhoHandlesPage() {
  useDocumentTitle('Quién atiende tu denuncia');
  const network = useNetworkState();
  const tables = useMemo(
    () =>
      network.kind === 'verified'
        ? (network.directory.functionTables ?? []).map((item) => item.table)
        : [],
    [network],
  );
  const entities = useTableEntities(tables);
  return (
    <>
      <h1>¿Quién atiende tu denuncia en tu estado?</h1>
      <p className="lead">
        Cada estado monta su propio nodo y declara qué institución cumple cada función: quién recibe
        y turna, quién investiga a cada dependencia, quién substancia, quién resuelve, el tribunal,
        quién supervisa y a dónde va la vía penal. Con esa tabla la ventanilla te propone a quién
        enviar tu denuncia.
      </p>
      <p>
        Cada tabla la firma el nodo de su estado y viaja en el directorio que firma la operación de
        la ventanilla y cofirman los testigos. La ventanilla no puede cambiar la tabla de un estado
        sin su firma. Si tu caso no aparece en la tabla, tu denuncia llega a la autoridad receptora
        del estado, donde una persona la turna.
      </p>
      {network.kind === 'loading' && <p role="status">Cargando el directorio firmado.</p>}
      {network.kind === 'single-node' && (
        <Alert tone="info" title="Sin red de nodos" testId="who-handles-single-node">
          <p>Esta página no está conectada a la red de nodos: no hay tablas que mostrar.</p>
        </Alert>
      )}
      {(network.kind === 'invalid' || network.kind === 'unavailable') && (
        <Alert tone="danger" title="No pudimos comprobar el directorio" role="alert">
          <p>
            No pudimos descargar o verificar el directorio firmado de la red. Inténtalo más tarde.
          </p>
        </Alert>
      )}
      {network.kind === 'verified' && (
        <>
          <DependencySearch directory={network.directory} tables={tables} entities={entities} />
          <CoverageTable directory={network.directory} tables={tables} entities={entities} />
          {tables.map((table) => (
            <FunctionTableCard key={table.nodeId} directory={network.directory} table={table} />
          ))}
          <section className="card" aria-labelledby="without-node-title">
            <h2 id="without-node-title">Entidades que todavía no tienen nodo</h2>
            <p>
              No hay nodo común: ningún estado vive en el nodo de otro. Mientras una entidad no
              monte su nodo, sus denuncias sobre entes estatales y municipales no pueden enviarse
              por esta ventanilla; las de entes federales sí, porque las atiende el nodo federal.
            </p>
            <p data-testid="states-without-node">
              {statesWithoutNode(network.directory).join(', ') || 'Ninguna.'}
            </p>
          </section>
        </>
      )}
      <p>
        <Link to={PATHS.observatory}>Ver el observatorio</Link>
      </p>
    </>
  );
}
