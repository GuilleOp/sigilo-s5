// Genera packages/contracts/src/s5/equivalencias-faltas.json: para cada conducta del catálogo de SIGILO y cada
// entidad, los artículos equivalentes del catálogo de faltas del S5 (la ley de responsabilidades
// y el código penal de cada estado, y la LGRA y el CPF como entidad federal). Así quien denuncia
// elige en lenguaje llano y la autoridad ve el artículo de la ley que le toca aplicar.
// Uso: node scripts/s5-equivalencias.ts <catalogo-faltas.json | URL>
// El catálogo es público: `GET /next-api/public/catalogos?catalog=faltas` del demo del S5.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { OFFENSES } from '@sigilo/contracts';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'packages/contracts/src/s5/equivalencias-faltas.json');
const DEFAULT_SOURCE =
  'https://dev-denuncias-dataton.plataformadigitalnacional.org/next-api/public/catalogos?catalog=faltas';

/** Entrada del catálogo de faltas del S5. */
interface S5Falta {
  id: number;
  entidad: number;
  clasificacion: 'faltaGrave' | 'noGrave' | 'hechoCorrupcion';
  ley: string;
  articulo: string;
  fraccion: string | null;
  nombre: string;
  servidorPublico: boolean | null;
  particular: boolean | null;
}

/** Minúsculas y sin acentos, para comparar nombres. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/**
 * Regla: clasificación del S5, patrón sobre el nombre y, si importa, si lo comete un particular.
 * Gana la primera que coincide; el orden va de lo específico a lo general.
 */
interface Rule {
  code: string;
  kinds: readonly S5Falta['clasificacion'][];
  name: RegExp;
  /** `true`: solo si es de particulares; `false`: solo si es de servidores públicos. */
  byPrivateParty?: boolean;
}

const G = ['faltaGrave'] as const;
const N = ['noGrave'] as const;
const H = ['hechoCorrupcion'] as const;
const ANY = ['faltaGrave', 'noGrave', 'hechoCorrupcion'] as const;

export const RULES: readonly Rule[] = [
  // Faltas graves y de particulares (LGRA arts. 51 a 72 y sus homólogos estatales).
  { code: 'LGRA-63-BIS', kinds: ANY, name: /^nepotismo/u },
  { code: 'LGRA-60-BIS', kinds: G, name: /^simulacion del acto juridico/u },
  { code: 'CPF-222-BIS', kinds: ANY, name: /cohecho a servidores publicos extranjeros/u },
  { code: 'LGRA-66', kinds: ANY, name: /^(soborno|cohecho activo)/u },
  { code: 'LGRA-52', kinds: ANY, name: /^cohecho/u },
  { code: 'LGRA-53', kinds: ANY, name: /^(peculado|distraccion de recursos|desvio de cuotas)/u },
  { code: 'LGRA-53', kinds: H, name: /^adquisicion u ocultacion indebida de recursos/u },
  { code: 'LGRA-54', kinds: ANY, name: /^desvio de recursos publicos/u },
  { code: 'LGRA-55', kinds: G, name: /^utilizacion indebida de informacion/u },
  // El S5 rotula «información falsa» también el art. 55 de servidores; por la persona se distingue.
  {
    code: 'LGRA-69',
    kinds: G,
    name: /^(utilizacion de informacion falsa|obstruccion de facultades)/u,
    byPrivateParty: true,
  },
  { code: 'LGRA-55', kinds: G, name: /^utilizacion de informacion falsa/u, byPrivateParty: false },
  { code: 'LGRA-57', kinds: G, name: /^abuso de funciones/u },
  { code: 'LGRA-58', kinds: G, name: /conflicto de interes/u },
  { code: 'LGRA-72', kinds: G, name: /^contratacion indebida/u, byPrivateParty: true },
  { code: 'LGRA-59', kinds: G, name: /^contratacion indebida/u },
  { code: 'LGRA-60', kinds: G, name: /^enriquecimiento oculto/u },
  { code: 'LGRA-68', kinds: G, name: /^trafico de influencias?/u, byPrivateParty: true },
  { code: 'LGRA-61', kinds: ANY, name: /^trafico de influencias?/u },
  { code: 'LGRA-62', kinds: ANY, name: /^encubrimiento/u },
  { code: 'LGRA-63', kinds: G, name: /^desacato/u },
  { code: 'LGRA-64', kinds: G, name: /^obstruccion de la justicia/u },
  { code: 'LGRA-67', kinds: G, name: /^participacion ilicita/u },
  { code: 'LGRA-70', kinds: G, name: /^colusion/u },
  { code: 'LGRA-73', kinds: G, name: /situacion especial/u },
  { code: 'LGRA-64-TER', kinds: ANY, name: /^omision de enterar/u },
  {
    code: 'LGRA-71',
    kinds: G,
    name: /^(uso indebido de recursos publicos|recursos publicos sin tener derecho)/u,
  },
  // No graves (LGRA arts. 49 y 50): los daños a la Hacienda aparte; lo demás es incumplimiento.
  { code: 'LGRA-50', kinds: N, name: /^(danos y perjuicios|no reintegrar recursos)/u },
  { code: 'LGRA-49', kinds: N, name: /./u },
  // Delitos por hechos de corrupción (CPF Título Décimo y homólogos estatales). Los delitos de
  // servidores contra la procuración y administración de justicia (CPF art. 225, Título
  // Undécimo) los clasifica el S5 como hechos de corrupción en las leyes estatales.
  {
    code: 'CPF-225',
    kinds: H,
    name: /justicia|prevaricacion|evasion de (presos?|personas)|ejecucion (de la )?pena|ejecucion penal|forenses/u,
  },
  { code: 'CPF-217', kinds: H, name: /^autorizaciones irregulares/u },
  { code: 'CPF-216', kinds: H, name: /^coalicion/u },
  { code: 'CPF-217-TER', kinds: ANY, name: /^remuneracion ilicita/u },
  {
    code: 'CPF-220',
    kinds: H,
    name: /^(ejercicio abusivo de funciones|negociaciones (ilicitas|indebidas))/u,
  },
  {
    code: 'CPF-217',
    kinds: H,
    name: /^(uso|ejercicio) (ilicito|ilegal|indebido) de (las )?atribuciones/u,
  },
  { code: 'CPF-215', kinds: H, name: /^abuso de autoridad/u },
  { code: 'CPF-218', kinds: H, name: /^(concusion|exaccion ilegal)/u },
  { code: 'CPF-219', kinds: H, name: /^intimidacion/u },
  { code: 'CPF-224', kinds: H, name: /enriquecimiento ilicito/u },
  {
    code: 'CPF-214',
    kinds: H,
    name: /^(ejercicio|desempeno|incumplimiento|negacion|abandono|deslealtad|simulacion del ejercicio).*(servicio|funcion|deber legal|empleo)/u,
  },
  // CPF art. 214, fr. IV: sustraer, destruir u ocultar documentación bajo su custodia.
  { code: 'CPF-214', kinds: H, name: /custodia|violacion de secretos/u },
];

/** Clave de SIGILO para una entrada del S5, o `null` si no tiene equivalente directo. */
export function codeFor(falta: S5Falta): string | null {
  const name = fold(falta.nombre);
  const isPrivate = falta.particular === true && falta.servidorPublico !== true;
  for (const rule of RULES) {
    if (!rule.kinds.includes(falta.clasificacion)) continue;
    if (rule.byPrivateParty !== undefined && rule.byPrivateParty !== isPrivate) continue;
    if (rule.name.test(name)) return rule.code;
  }
  return null;
}

async function readSource(source: string): Promise<{ text: string; origin: string }> {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`El catálogo respondió ${response.status}.`);
    return { text: await response.text(), origin: source };
  }
  return { text: readFileSync(source, 'utf8'), origin: DEFAULT_SOURCE };
}

async function main(): Promise<void> {
  const source = process.argv[2] ?? DEFAULT_SOURCE;
  const { text, origin } = await readSource(source);
  const faltas = (JSON.parse(text) as { data: S5Falta[] }).data;
  const known = new Set(OFFENSES.map((offense) => offense.code));
  for (const rule of RULES) {
    if (!known.has(rule.code))
      throw new Error(`La regla apunta a una clave desconocida: ${rule.code}`);
  }
  // Tabla de leyes para no repetir su nombre en cada entrada.
  const laws: string[] = [];
  const lawIndex = (law: string): number => {
    const name = law.trim().replace(/\s+/gu, ' ');
    const at = laws.indexOf(name);
    if (at >= 0) return at;
    laws.push(name);
    return laws.length - 1;
  };
  const byState: Record<string, Record<string, [number, number, string][]>> = {};
  const unmatched = new Map<string, number>();
  let matched = 0;
  for (const falta of faltas) {
    const code = codeFor(falta);
    if (code === null) {
      const key = `${falta.clasificacion}: ${fold(falta.nombre)}`;
      unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
      continue;
    }
    matched += 1;
    // Entidad 33 del S5 = federal; las demás son la clave INEGI sin el cero inicial.
    const state = falta.entidad === 33 ? 'federal' : String(falta.entidad).padStart(2, '0');
    const article = [falta.articulo.trim(), falta.fraccion?.trim()].filter(Boolean).join(', fr. ');
    ((byState[state] ??= {})[code] ??= []).push([falta.id, lawIndex(falta.ley), article]);
  }
  const output = {
    aviso:
      'Equivalencias entre el catálogo de conductas de SIGILO y el catálogo de faltas del S5 (versión de pruebas de la SESNA). Generado con scripts/s5-equivalencias.ts; revisar antes de usarlo como fundamento.',
    fuente: origin,
    sha256: createHash('sha256').update(text).digest('hex'),
    generado: new Date().toISOString().slice(0, 10),
    formato:
      'entidades[clave INEGI | federal][clave SIGILO] = [[id del S5, índice en leyes, artículo]]',
    cobertura: {
      total: faltas.length,
      conEquivalente: matched,
      sinEquivalente: faltas.length - matched,
    },
    leyes: laws,
    entidades: byState,
    sinEquivalente: Object.fromEntries([...unmatched].sort((a, b) => b[1] - a[1])),
  };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(output)}\n`);
  process.stdout.write(
    `Equivalencias: ${matched} de ${faltas.length} entradas del S5 con clave de SIGILO; ${unmatched.size} nombres sin equivalente directo.\n`,
  );
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) await main();
