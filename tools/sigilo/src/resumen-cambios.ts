// Diferencia legible entre dos versiones del directorio: lo que la SESNA ve al aceptar y lo que cada
// testigo revisa antes de cofirmar. Sin este resumen, la cofirma sería un sello automático.
import type { AuthorityDirectory } from '@sigilo/contracts';

/** Líneas «+ agrega», «- quita» y «~ cambia», en español. */
export function directoryChanges(
  previous: AuthorityDirectory | null,
  next: AuthorityDirectory,
): string[] {
  const lines: string[] = [];
  const before = previous ?? null;
  if (before === null) {
    lines.push(`+ directorio nuevo (versión ${next.serial}) de «${next.operator.name}»`);
  } else if (before.operator.signingKeyId !== next.operator.signingKeyId) {
    lines.push(
      `~ CAMBIA la llave de la operación (${before.operator.signingKeyId} → ${next.operator.signingKeyId})`,
    );
  }
  const nodesBefore = new Map((before?.nodes ?? []).map((node) => [node.id, node]));
  for (const node of next.nodes) {
    const old = nodesBefore.get(node.id);
    if (old === undefined) {
      lines.push(`+ nodo ${node.id} «${node.name}» en ${node.baseUrl}`);
    } else if (old.signingKeyId !== node.signingKeyId || old.boxKeyId !== node.boxKeyId) {
      lines.push(`~ CAMBIAN las llaves del nodo ${node.id}`);
    } else if (old.baseUrl !== node.baseUrl || old.name !== node.name) {
      lines.push(`~ nodo ${node.id}: ${old.baseUrl} → ${node.baseUrl}`);
    }
  }
  for (const id of nodesBefore.keys()) {
    if (!next.nodes.some((node) => node.id === id)) lines.push(`- nodo ${id}`);
  }
  const authoritiesBefore = new Map((before?.authorities ?? []).map((item) => [item.id, item]));
  for (const authority of next.authorities) {
    const old = authoritiesBefore.get(authority.id);
    const where = `${authority.id} (${authority.role}, ${authority.stateCode ?? 'federal'})`;
    if (old === undefined) lines.push(`+ autoridad ${where} «${authority.name}»`);
    else if (old.keyId !== authority.keyId || old.signingPublicKey !== authority.signingPublicKey) {
      lines.push(`~ CAMBIAN las llaves de la autoridad ${where}`);
    } else if (JSON.stringify(old) !== JSON.stringify(authority)) {
      lines.push(`~ autoridad ${where}: cambian sus datos`);
    }
  }
  for (const id of authoritiesBefore.keys()) {
    if (!next.authorities.some((item) => item.id === id)) lines.push(`- autoridad ${id}`);
  }
  const tablesBefore = new Map(
    (before?.functionTables ?? []).map((item) => [item.table.nodeId, item.table.version]),
  );
  for (const { table } of next.functionTables ?? []) {
    const old = tablesBefore.get(table.nodeId);
    const state = table.stateCode ?? 'federal';
    if (old === undefined)
      lines.push(`+ tabla de funciones de ${state} v${table.version} (${table.nodeId})`);
    else if (old !== table.version)
      lines.push(`~ tabla de funciones de ${state}: v${old} → v${table.version}`);
  }
  const witnessesBefore = before?.witnessPolicy.witnessIds.join(', ') ?? '';
  const witnessesNext = next.witnessPolicy.witnessIds.join(', ');
  if (
    before !== null &&
    (witnessesBefore !== witnessesNext ||
      before.witnessPolicy.threshold !== next.witnessPolicy.threshold)
  ) {
    lines.push(`~ CAMBIAN los testigos: ${next.witnessPolicy.threshold} de [${witnessesNext}]`);
  }
  if (lines.length === 0) lines.push('= sin cambios de contenido');
  return lines;
}
