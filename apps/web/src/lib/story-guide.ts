// Ayudas para escribir el relato, calculadas en este navegador: qué partes ya cuenta (qué pasó,
// cuándo, dónde, qué efecto tuvo) y qué conductas del catálogo se le parecen por sus palabras.
// Seguridad: todo es local; el relato no sale para hacer la sugerencia y la persona decide.
import { findOffense } from '@sigilo/contracts';
import type { OffenseOption } from '@sigilo/contracts';
import { foldForSearch } from './catalog-search.ts';

/** Parte del relato que conviene contar. */
export interface StoryPart {
  key: 'what' | 'when' | 'where' | 'effect';
  title: string;
  tip: string;
  /** Si el relato ya parece contarla. */
  isPresent: boolean;
}

const MONTHS =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

const PART_PATTERNS: Readonly<Record<StoryPart['key'], RegExp>> = {
  what: /\b(pidi|exigi|cobr|ofreci|recibi|acept|entreg|contrat|nombr|firm|aprob|autoriz|amenaz|neg|retras|desvi|se llev|se qued|us[oa]|cambi|ocult|tap|obligo|condicion)/u,
  when: new RegExp(
    `\\b(${MONTHS}|lunes|martes|miercoles|jueves|viernes|sabado|domingo|ayer|antier|semana|mes|ano|anos|dias?|horas?|manana|tarde|noche|20\\d\\d|\\d{1,2}/\\d{1,2})\\b`,
    'u',
  ),
  where:
    /\b(oficina|ventanilla|modulo|presidencia|secretaria|direccion|departamento|area|escuela|hospital|clinica|calle|colonia|municipio|palacio|juzgado|fiscalia|obra|bodega|almacen|caseta|reten|aduana|tramite)/u,
  effect:
    /(\$|\bpesos\b|\bmil\b|\bpag|\bmulta|\bretras|\bperd|\bpresion|\bventaja|\bbenefici|\bno me (dieron|dio|entregaron)|\bnegaron|\bclausur|\bdespid|\bcost)/u,
};

const PARTS: readonly Omit<StoryPart, 'isPresent'>[] = [
  { key: 'what', title: 'Qué pasó', tip: 'Qué hizo, dijo o pidió la persona.' },
  { key: 'when', title: 'Cuándo', tip: 'Aunque sea aproximado: «a principios de marzo».' },
  { key: 'where', title: 'Dónde', tip: 'La oficina, el área o el trámite, sin datos tuyos.' },
  { key: 'effect', title: 'Qué efecto tuvo', tip: 'Si hubo pago, retraso, presión o ventaja.' },
];

/** Partes del relato y si ya aparecen. */
export function storyParts(description: string): StoryPart[] {
  const text = foldForSearch(description);
  return PARTS.map((part) => ({ ...part, isPresent: PART_PATTERNS[part.key].test(text) }));
}

/**
 * Palabras que apuntan a cada conducta. Es una orientación por palabras, no una clasificación:
 * la autoridad decide.
 */
const SUGGESTION_PATTERNS: readonly { code: string; pattern: RegExp }[] = [
  {
    code: 'LGRA-52',
    pattern:
      /\b(me|nos|le|les) (pidi|exigi|cobr|solicit)\w* .{0,40}(dinero|mordida|lana|feria|pago|cuota|regalo|cooperacion|propina)|\bmordida|\bmoche|para (agilizar|liberar|aprobar|soltar)/u,
  },
  {
    code: 'LGRA-66',
    pattern:
      /\b(le|les) (ofreci|ofrecio|ofrecieron|di|dio|dieron|entreg)\w* .{0,30}(dinero|regalo|mordida|pago)/u,
  },
  {
    code: 'CPF-218',
    pattern: /\bcobr\w* (de mas|extra|doble|sin recibo|lo que no)|\bcuota (ilegal|extra)/u,
  },
  {
    code: 'LGRA-53',
    pattern:
      /\b(se (llevo|quedo|robo)|uso personal|para (su|sus) (casa|negocio|familia))|\b(camioneta|vehiculo|carro|patrulla) oficial/u,
  },
  {
    code: 'LGRA-63-BIS',
    pattern:
      /\b(contrat|nombr|meti|acomod|dio (la )?plaza)\w* .{0,40}(herman|hij|prim|sobrin|espos|cunad|tio|tia|famil|parient|pareja|novi)/u,
  },
  {
    code: 'LGRA-59',
    pattern:
      /\b(licitacion|adjudic|contrato|proveedor)\w*.{0,60}(amig|famil|compadre|sin concurso|directa|a modo)/u,
  },
  {
    code: 'LGRA-70',
    pattern:
      /\b(se pusieron de acuerdo|acordaron (los )?precios|empresas? (fantasma|fachada|simulad))/u,
  },
  {
    code: 'LGRA-58',
    pattern:
      /\b(empresa|negocio)\w* (de|del|de la) (su )?(herman|espos|famil|socio)|\bconflicto de interes/u,
  },
  { code: 'CPF-219', pattern: /\b(amenaz|intimid|represali|me corrieron por denunciar)/u },
  {
    code: 'CPF-215',
    pattern:
      /\b(abuso de (autoridad|poder)|me neg\w* (el|mi) (tramite|servicio|permiso)|retras\w* .{0,30}(a proposito|porque no))/u,
  },
  { code: 'LGRA-61', pattern: /\b(influencia|palanca|recomendad|llamo a .{0,30} para que)/u },
  { code: 'LGRA-62', pattern: /\b(tap(o|aron|ar)|encubr|hizo como que no|no denunci)/u },
  { code: 'LGRA-60', pattern: /\b(no declar|casa nueva|carro nuevo|de lujo|vive muy por encima)/u },
];

/** Conductas que se parecen al relato por sus palabras, en orden de aparición (a lo más 3). */
export function suggestOffenses(description: string, limit = 3): OffenseOption[] {
  const text = foldForSearch(description);
  if (text.length < 20) return [];
  const found: OffenseOption[] = [];
  for (const { code, pattern } of SUGGESTION_PATTERNS) {
    if (!pattern.test(text)) continue;
    const offense = findOffense(code);
    if (offense !== undefined && !found.includes(offense)) found.push(offense);
    if (found.length === limit) break;
  }
  return found;
}
