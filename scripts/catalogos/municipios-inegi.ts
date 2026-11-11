// Genera packages/contracts/src/catalogs/municipalities-data.ts: los municipios (y las alcaldías de la
// Ciudad de México) de las 32 entidades con su clave geoestadística de 3 dígitos, del Catálogo
// Único de Claves de Áreas Geoestadísticas Estatales, Municipales y Localidades del INEGI.
// Uso: node scripts/catalogos/municipios-inegi.ts [URL base | carpeta con <clave>.json]
// La consulta es pública (servicio web del catálogo, sin llave). Licencia: Términos de Libre Uso de
// la Información del INEGI; se debe dar el crédito «Fuente: INEGI».
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STATES } from '../../packages/contracts/src/catalogs/states.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT = join(ROOT, 'packages/contracts/src/catalogs/municipalities-data.ts');
const DEFAULT_SOURCE = 'https://gaia.inegi.org.mx/wscatgeo/v2/mgem/';

/** Registro del servicio `mgem` del INEGI (solo los campos que se usan). */
export interface InegiMunicipality {
  cve_ent: string;
  cve_mun: string;
  nomgeo: string;
}

/** Valida y ordena la respuesta de una entidad: claves de 3 dígitos, sin repetir, con nombre. */
export function parseInegiResponse(
  stateCode: string,
  payload: unknown,
): (readonly [string, string])[] {
  const datos = (payload as { datos?: unknown }).datos;
  if (!Array.isArray(datos) || datos.length === 0) {
    throw new Error(`El INEGI no devolvió municipios para la entidad ${stateCode}.`);
  }
  const seen = new Set<string>();
  const rows = (datos as InegiMunicipality[]).map((item) => {
    const name = String(item.nomgeo ?? '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (item.cve_ent !== stateCode || !/^\d{3}$/u.test(item.cve_mun) || name === '') {
      throw new Error(`Registro inválido del INEGI en la entidad ${stateCode}.`);
    }
    if (seen.has(item.cve_mun)) throw new Error(`Clave repetida ${stateCode}${item.cve_mun}.`);
    seen.add(item.cve_mun);
    return [item.cve_mun, name] as const;
  });
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
}

async function readState(source: string, stateCode: string): Promise<string> {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(`${source}${stateCode}`);
    if (!response.ok) throw new Error(`El INEGI respondió ${response.status} (${stateCode}).`);
    return response.text();
  }
  return readFileSync(join(source, `${stateCode}.json`), 'utf8');
}

/** Cadena TS con comillas simples (el formato del repositorio). */
function quote(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

async function main(): Promise<void> {
  const source = process.argv[2] ?? DEFAULT_SOURCE;
  const hash = createHash('sha256');
  const lines: string[] = [];
  let total = 0;
  for (const state of STATES) {
    const text = await readState(source, state.code);
    hash.update(text);
    const rows = parseInegiResponse(state.code, JSON.parse(text));
    total += rows.length;
    const items = rows.map(([code, name]) => `[${quote(code)}, ${quote(name)}]`).join(', ');
    lines.push(`  ${quote(state.code)}: [${items}],`);
  }
  const content = [
    '// Generado por scripts/catalogos/municipios-inegi.ts; no se edita a mano.',
    '// Fuente: INEGI, Catálogo Único de Claves de Áreas Geoestadísticas Estatales, Municipales y',
    '// Localidades (servicio web wscatgeo, `mgem`). Términos de Libre Uso de la Información del INEGI.',
    '',
    '/** Origen y fecha de la consulta del catálogo de municipios. */',
    'export const MUNICIPALITY_SOURCE = {',
    `  fuente: 'Fuente: INEGI. Catálogo Único de Claves de Áreas Geoestadísticas Estatales, Municipales y Localidades.',`,
    `  url: ${quote(/^https?:\/\//u.test(source) ? source : DEFAULT_SOURCE)},`,
    `  licencia: 'Términos de Libre Uso de la Información del INEGI',`,
    `  consultado: ${quote(new Date().toISOString().slice(0, 10))},`,
    `  sha256: ${quote(hash.digest('hex'))},`,
    `  total: ${total},`,
    '} as const;',
    '',
    '/** Municipios por clave INEGI de entidad: `[clave de 3 dígitos, nombre oficial]`. */',
    'export const MUNICIPALITIES_BY_STATE: Readonly<',
    '  Record<string, readonly (readonly [string, string])[]>',
    '> = {',
    ...lines,
    '};',
    '',
  ].join('\n');
  writeFileSync(OUTPUT, content);
  process.stdout.write(`Municipios: ${total} en ${STATES.length} entidades.\n`);
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) await main();
