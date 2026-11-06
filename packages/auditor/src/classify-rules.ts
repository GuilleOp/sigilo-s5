// Clasificación orientativa de la conducta por palabras clave (sin modelo). Línea base pública y
// determinista: sugiere claves del catálogo con el fragmento que las apoya; nunca decide.
import { findOffense } from '@sigilo/contracts';
import { sentenceMentioning, foldText } from './text.ts';

/** Raíces (texto plegado, sin acentos) que apoyan cada conducta. Públicas y versionadas. */
export const OFFENSE_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  'LGRA-52': [
    'soborno',
    'mordida',
    'comision',
    'pidio dinero',
    'cobra comisiones',
    'a cambio de',
    'dadiva',
  ],
  'LGRA-66': ['le ofrecio dinero', 'ofrecieron dinero', 'ofrecio un pago'],
  'CPF-218': [
    'cuota',
    'cobro que no corresponde',
    'cobran por un tramite gratuito',
    'cobro indebido',
  ],
  'LGRA-53': ['se quedo con', 'se apropio', 'se llevo los', 'uso para si', 'peculado'],
  'LGRA-54': ['desvio', 'para otro fin', 'distinto de lo autorizado', 'para su campana'],
  'LGRA-59': [
    'empresa inhabilitada',
    'lista de contribuyentes',
    'operaciones presuntamente inexistentes',
    '69-b',
    'impedida',
  ],
  'LGRA-70': [
    'se pusieron de acuerdo',
    'colusion',
    'propuestas iguales',
    'empresas del mismo dueno',
  ],
  'LGRA-69': ['documentos falsos', 'documento apocrifo', 'firma falsificada', 'factura apocrifa'],
  'CPF-220': ['su cunado', 'su hermano', 'su esposa', 'su primo', 'familiar', 'su socio'],
  'LGRA-58': ['conflicto de interes', 'tiene interes personal', 'es socio de'],
  'LGRA-61': ['presiono a', 'influencia', 'recomendacion del'],
  'LGRA-57': ['abuso de funciones', 'para perjudicar', 'represalia'],
  'CPF-219': ['amenazo', 'amenazaron', 'intimid', 'para que no denunciara'],
  'LGRA-62': ['oculto la falta', 'encubri', 'lo tapo'],
  'LGRA-64': ['revelo quien denuncio', 'impidio la investigacion', 'destruyo expediente'],
  'LGRA-49': ['no atiende', 'trato grosero', 'no cuida los documentos', 'llega tarde'],
  'LGRA-55': ['informacion reservada', 'informacion privilegiada'],
  'LGRA-60': ['no declaro', 'oculto bienes', 'declaracion patrimonial'],
};

/** Sugerencia orientativa por reglas. */
export interface RuleOffenseSuggestion {
  offenseCode: string;
  label: string;
  supportingFragment: string;
  /** Raíces que coincidieron. */
  matched: readonly string[];
}

/**
 * Sugiere hasta `limit` conductas por coincidencia de raíces, ordenadas por número de raíces y
 * luego por clave. Un relato ambiguo puede dar varias o ninguna: la persona decide.
 */
export function suggestOffensesByRules(narrative: string, limit = 3): RuleOffenseSuggestion[] {
  const folded = foldText(narrative);
  const scored = Object.entries(OFFENSE_KEYWORDS)
    .map(([code, terms]) => ({ code, matched: terms.filter((term) => folded.includes(term)) }))
    .filter((item) => item.matched.length > 0)
    .sort(
      (left, right) =>
        right.matched.length - left.matched.length || left.code.localeCompare(right.code),
    );
  return scored.slice(0, limit).flatMap(({ code, matched }) => {
    const offense = findOffense(code);
    const fragment = sentenceMentioning(narrative, matched);
    if (offense === undefined || fragment === null) return [];
    return [
      { offenseCode: offense.code, label: offense.label, supportingFragment: fragment, matched },
    ];
  });
}
