// «¿Quién atiende tu denuncia en tu estado?»: la tabla de funciones de cada nodo, de solo lectura,
// tal como viene en el directorio firmado y cofirmado (cada tabla, además, firmada por su nodo).
// Muestra también qué entidades todavía no tienen nodo. Nada se pide fuera del directorio.
import { Link } from 'react-router';
import { findEntity, GOVERNMENT_LEVEL_LABELS, NODE_FUNCTIONS, STATES } from '@sigilo/contracts';
import type { AuthorityDirectory, FunctionRule, FunctionTable } from '@sigilo/contracts';
import { holderName, NODE_FUNCTION_LABELS, stateDisplayName } from '@sigilo/red';
import { PATHS } from '../../app/paths.ts';
import { Alert } from '../../components/Alert.tsx';
import { formatDayDate } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useNetworkState } from '../../network/use-network-state.ts';

const SEVERITY_TEXT = { serious: 'faltas graves', non_serious: 'faltas no graves' } as const;

/** A quién aplica la regla, en lenguaje claro. */
export function ruleScope(rule: FunctionRule): string {
  const levels = rule.governmentLevels
    .map((level) => GOVERNMENT_LEVEL_LABELS[level].toLocaleLowerCase('es-MX'))
    .join(' y ');
  const whom =
    rule.entityIds.length === 0
      ? `Entes del orden ${levels}`
      : rule.entityIds.map((id) => findEntity(id)?.name ?? id).join(', ');
  return rule.severity === undefined ? whom : `${whom} (${SEVERITY_TEXT[rule.severity]})`;
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

export function FunctionTableCard({
  directory,
  table,
}: {
  directory: AuthorityDirectory;
  table: FunctionTable;
}) {
  const id = `function-table-${table.nodeId.replace('.', '-')}`;
  const nodeName = directory.nodes.find((node) => node.id === table.nodeId)?.name ?? table.nodeId;
  return (
    <section className="card" aria-labelledby={id} data-testid={id}>
      <h2 id={id}>{tableTitle(table)}</h2>
      <p>
        La declara y la firma el {nodeName} (versión {table.version}, del{' '}
        {formatDayDate(table.issuedOn)}).
      </p>
      <dl className="definition-list">
        {NODE_FUNCTIONS.map((fn) => (
          <div key={fn}>
            <dt>{NODE_FUNCTION_LABELS[fn]}</dt>
            {table.functions[fn].length === 0 ? (
              <dd>Sin asignar en esta tabla.</dd>
            ) : (
              table.functions[fn].map((rule, index) => (
                <dd key={`${fn}-${index}`}>
                  {ruleScope(rule)}: <strong>{holderName(directory, rule.holder)}</strong>
                  {rule.legalBasis === undefined ? '' : ` (${rule.legalBasis})`}
                </dd>
              ))
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Página pública con la tabla de funciones de cada estado. */
export function WhoHandlesPage() {
  useDocumentTitle('Quién atiende tu denuncia');
  const network = useNetworkState();
  return (
    <>
      <h1>¿Quién atiende tu denuncia en tu estado?</h1>
      <p className="lead">
        Cada estado monta su propio nodo y declara qué institución cumple cada función: quién recibe
        y turna, quién investiga, quién substancia, quién resuelve, quién supervisa y a dónde va la
        vía penal. Con esa tabla la ventanilla te propone a quién enviar tu denuncia.
      </p>
      <p>
        Cada tabla la firma el nodo de su estado y viaja en el directorio que firma la operación de
        la ventanilla y cofirman los testigos. La ventanilla no puede cambiar la tabla de un estado
        sin su firma. Si tu caso no aparece en la tabla, tu denuncia llega al buzón general del
        estado, donde una persona la turna.
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
          {(network.directory.functionTables ?? []).map((signed) => (
            <FunctionTableCard
              key={signed.table.nodeId}
              directory={network.directory}
              table={signed.table}
            />
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
