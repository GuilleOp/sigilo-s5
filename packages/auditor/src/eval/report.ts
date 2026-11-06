// Genera packages/auditor/EVALUACION.md a partir de la evaluación. Determinista: sin fechas ni
// azar, para que una prueba compruebe que el archivo versionado está al día.
import { format, resolveConfig } from 'prettier';
import { AUDITOR_CONFIG } from '../config.ts';
import { ADAPTER_VERSION } from '../model/client.ts';
import { jaccard, shingles, tokenize } from '../text.ts';
import type { ClosureAct } from '../types.ts';
import { labeledSets } from './dataset.ts';
import type { LabeledSet } from './dataset.ts';
import { martaQualification, templateArchives } from './scenario.ts';
import {
  evaluateModelDefenses,
  evaluateRuleClassification,
  evaluateRules,
  ratios,
  sweepTemplateThresholds,
} from './run.ts';

const RULE_NAMES: Readonly<Record<string, string>> = {
  'AUD-01': 'Acuerdo con plantilla (cierre o calificación)',
  'AUD-02': 'Archivo contra evidencia',
  'AUD-03': 'Calificación degradada',
  'AUD-04': 'Plazos vencidos o por vencer',
  'AUD-05': 'Actuación vacía tras inactividad',
  'AUD-06': 'Tasa de archivo en casos corroborados',
  'AUD-07': 'Concentración de archivos',
  'AUD-08': 'Movimiento justo antes de prescribir',
};

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)} %`;
}

function pairwise(acts: readonly ClosureAct[], size: number): { min: number; max: number } {
  const prepared = acts.map((act) => shingles(tokenize(act.text), size));
  let min = 1;
  let max = 0;
  for (let left = 0; left < prepared.length; left += 1) {
    for (let right = left + 1; right < prepared.length; right += 1) {
      const value = jaccard(prepared[left] ?? new Set(), prepared[right] ?? new Set());
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return { min, max };
}

function setById(sets: readonly LabeledSet[], id: string): LabeledSet | undefined {
  return sets.find((set) => set.id === id);
}

/** Markdown completo de la evaluación. */
export async function renderEvaluation(): Promise<string> {
  const sets = labeledSets();
  const metrics = evaluateRules(sets);
  const sweep = sweepTemplateThresholds();
  const classification = evaluateRuleClassification();
  const defenses = await evaluateModelDefenses();
  const config = AUDITOR_CONFIG.templateClosure;
  const martaShingles = shingles(tokenize(martaQualification().text), config.shingleSize);
  const martaTop = Math.max(
    ...templateArchives().map((act) =>
      jaccard(martaShingles, shingles(tokenize(act.text), config.shingleSize)),
    ),
  );
  const lines: string[] = [];
  const push = (...items: string[]) => lines.push(...items);

  push(
    '# Evaluación del auditor',
    '',
    '<!-- Archivo generado por `npm run auditor:eval`; no se edita a mano. Una prueba exige que esté al día. -->',
    '',
    `Reglas versión **${AUDITOR_CONFIG.version}** (\`config/umbrales.json\`), adaptador del modelo versión **${ADAPTER_VERSION}**.`,
    'Conjunto 100 % sintético, etiquetado por el equipo según lo que una persona revisora esperaría, no según lo que hace',
    'la regla. Incluye el escenario de la demostración y casos difíciles hechos para que las reglas fallen.',
    '',
    '## Advertencias',
    '',
    '- El conjunto es pequeño y lo escribió el mismo equipo que escribió las reglas: las cifras son **optimistas** y no',
    '  sustituyen una evaluación con acuerdos reales, que el repositorio no tiene. Los umbrales son del prototipo.',
    '- No hay un conjunto apartado para validar: los umbrales se eligieron viendo estos mismos datos (ver el barrido).',
    '- Ninguna cifra de esta página mide un modelo de lenguaje real: en la máquina de desarrollo no hay Ollama ni',
    '  llama.cpp instalados. Las defensas se miden con un doble que simula respuestas, incluidas maliciosas.',
    '- Una señal no decide nada: la decisión es de las reglas públicas o de una persona.',
    '',
    '## Subconjuntos',
    '',
    '| Subconjunto | Acuerdos | Casos | Descripción |',
    '| --- | --- | --- | --- |',
    ...sets.map(
      (set) => `| \`${set.id}\` | ${set.acts.length} | ${set.cases.length} | ${set.description} |`,
    ),
    '',
    '## Resultados por regla',
    '',
    'Unidades: AUD-01 cuenta acuerdos; AUD-02 y AUD-03, acuerdos ligados a un caso; AUD-04, AUD-05 y AUD-08, casos;',
    'AUD-06 y AUD-07, autoridades. «n/a» significa que no hubo unidades para calcularlo.',
    '',
    '| Regla | Nombre | VP | FP | FN | VN | Precisión | Exhaustividad | Tasa de FP |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...metrics.map((item) => {
      const value = ratios(item);
      return `| ${item.ruleId} | ${RULE_NAMES[item.ruleId] ?? ''} | ${item.truePositives} | ${item.falsePositives} | ${item.falseNegatives} | ${item.trueNegatives} | ${percent(value.precision)} | ${percent(value.recall)} | ${percent(value.falsePositiveRate)} |`;
    }),
    '',
    '### Errores',
    '',
  );
  for (const item of metrics) {
    if (item.falsePositiveIds.length === 0 && item.falseNegativeIds.length === 0) continue;
    push(`- **${item.ruleId}**`);
    if (item.falsePositiveIds.length > 0)
      push(`  - Falsos positivos: ${item.falsePositiveIds.map((id) => `\`${id}\``).join(', ')}`);
    if (item.falseNegativeIds.length > 0)
      push(`  - Falsos negativos: ${item.falseNegativeIds.map((id) => `\`${id}\``).join(', ')}`);
  }
  push(
    '',
    'Lectura honesta de los errores:',
    '',
    '- **AUD-01 no detecta plantillas con sinónimos.** Cambiar cinco partes del texto por sinónimos baja la similitud',
    '  de shingles de 3 palabras por debajo de cualquier umbral razonable. Quien quiera evadir la regla puede hacerlo;',
    '  por eso es una señal más y no una prueba. Una lista pública de sinónimos jurídicos o una medida por bolsa de',
    '  palabras ayudaría, a costa de acercarse a los acuerdos bien motivados (ver el margen abajo).',
    `- **AUD-01 y las autoridades pequeñas.** Con el mínimo de ${config.minMatches} coincidencias, una autoridad con menos de`,
    `  ${config.minMatches + 1} acuerdos iguales en la ventana nunca se señala. El mínimo se bajó de 10 a 5 por el subconjunto`,
    '  `autoridad-pequena`; un mínimo menor aumenta el riesgo de señalar fórmulas legítimas repetidas pocas veces.',
    '- **AUD-02 se evade con una mención genérica.** Un acuerdo que solo dice «las pruebas aportadas no son suficientes»',
    '  cuenta como que se ocupó de las pruebas. La regla compara menciones, no la calidad del análisis.',
    '- **AUD-03 depende de la conducta que eligió quien denunció.** Si la persona eligió mal la clave, la señal puede',
    '  ser injusta con la autoridad; por eso explica que puede haber razones y pide revisar la motivación.',
    '- **La calificación de Marta pasa AUD-01 por poco.** El día 30 el OIC califica la falta grave como no grave con',
    '  la misma plantilla de sus archivos, cambiando solo «conclusión y archivo» por «calificación como no grave».',
    `  Su similitud con la variante 1 es de ${martaTop.toFixed(2)} (umbral ${(config.similarityPermille / 1000).toFixed(2)}): con un par de palabras más`,
    '  cambiadas, AUD-01 ya no la detectaría. AUD-03 sí la detecta siempre, porque compara la calificación con el catálogo.',
    '- **AUD-04 distingue la etapa.** Antes de admitido el Informe de Presunta Responsabilidad Administrativa, la',
    '  señal es «inactividad prolongada» y no cita la caducidad: el art. 74 solo la prevé en el procedimiento de',
    '  responsabilidad ya admitido el informe, y se decreta a solicitud del presunto infractor. Si el nodo no',
    '  registra la admisión del informe (`report_admitted`), el auditor nunca habla de caducidad.',
    '',
    '## Barrido de umbrales de AUD-01',
    '',
    `Configuración publicada: shingles de **${config.shingleSize}** palabras, similitud **${(config.similarityPermille / 1000).toFixed(2)}**, al menos **${config.minMatches}** coincidencias,`,
    `ventana de ${config.windowDays} días. El escenario de \`docs/demo-escenario.md\` proponía 0.9 y 20: con shingles de 3`,
    'palabras, las tres variantes de la plantilla tienen similitud de 0.82 a 0.84 entre sí y esa combinación no detecta',
    'ninguno de los 31 acuerdos importados; por eso se fijó 0.75.',
    '',
    '| Shingle | Similitud | Mínimo | VP | FP | FN |',
    '| --- | --- | --- | --- | --- | --- |',
    ...sweep.map(
      (row) =>
        `| ${row.shingleSize} | ${(row.similarityPermille / 1000).toFixed(2)} | ${row.minMatches} | ${row.metrics.truePositives} | ${row.metrics.falsePositives} | ${row.metrics.falseNegatives} |`,
    ),
    '',
  );
  const motivated = setById(sets, 'motivados-parecidos')?.acts ?? [];
  const templates = (setById(sets, 'escenario-dia-31')?.acts ?? []).filter(
    (act) => act.authorityId === 'authority.oic-iffe',
  );
  const synonyms = setById(sets, 'plantilla-con-sinonimos')?.acts ?? [];
  push(
    'Margen entre acuerdos bien motivados y plantillas (similitud de Jaccard entre pares de la misma autoridad):',
    '',
  );
  push(
    '| Shingle | Bien motivados: máxima | Plantilla del escenario: mínima | Plantilla con sinónimos: mínima |',
    '| --- | --- | --- | --- |',
  );
  for (const size of [1, 2, 3]) {
    push(
      `| ${size} | ${pairwise(motivated, size).max.toFixed(2)} | ${pairwise(templates, size).min.toFixed(2)} | ${pairwise(synonyms, size).min.toFixed(2)} |`,
    );
  }
  push(
    '',
    'Con bolsa de palabras (shingle 1) y similitud 0.50 el barrido detecta también las plantillas con sinónimos sin',
    'falsos positivos en este conjunto, pero solo por suerte: dos acuerdos bien motivados ya se parecen más (0.57) que',
    'ese umbral, y no se señalan únicamente porque no llegan a 5 coincidencias. Con encabezados jurídicos reales eso',
    'fallaría. Se prefirió el margen amplio de los shingles de 3 palabras (0.37 frente a 0.82).',
    '',
    '## Clasificación orientativa por reglas (sin modelo)',
    '',
    `Palabras clave públicas (\`OFFENSE_KEYWORDS\`) sobre ${classification.narratives} relatos sintéticos, de los que ${LABELED_AMBIGUOUS_TEXT}.`,
    '',
    '| Medida | Resultado |',
    '| --- | --- |',
    `| Primera sugerencia aceptable | ${classification.topOneCorrect} de ${classification.withAcceptable} (${percent(classification.topOneCorrect / classification.withAcceptable)}) |`,
    `| Alguna sugerencia aceptable (exhaustividad) | ${classification.anyCorrect} de ${classification.withAcceptable} (${percent(classification.anyCorrect / classification.withAcceptable)}) |`,
    `| Sugerencias aceptables (precisión) | ${classification.acceptableSuggestions} de ${classification.suggestions} (${percent(classification.suggestions === 0 ? null : classification.acceptableSuggestions / classification.suggestions)}) |`,
    `| Se abstuvo cuando no debía sugerir | ${classification.abstainedCorrectly} de ${classification.shouldAbstain} |`,
    '',
    `Sin sugerencia aceptable: ${classification.misses.map((id) => `\`${id}\``).join(', ') || 'ninguno'}. Primera sugerencia equivocada: ${classification.wrongTopOne.map((id) => `\`${id}\``).join(', ') || 'ninguna'}.`,
    'Las palabras clave no entienden plurales ni sinónimos (por ejemplo, «facturas apócrifas» frente a «factura',
    'apocrifa») y una palabra suelta como «cuotas» puede desviar la sugerencia. Es una ayuda para la persona, que',
    'siempre elige la conducta.',
    '',
    '## Modelo local opcional',
    '',
    '- **Modelo real: no evaluado.** En la máquina de desarrollo no hay Ollama ni llama.cpp server; no se descargó',
    '  ningún modelo. No hay cifras de precisión del modelo y no se publican cifras inventadas.',
    `- **Defensas del adaptador** (doble de pruebas, relato con instrucciones incrustadas): ${defenses.maliciousDiscarded} de ${defenses.malicious} salidas`,
    `  maliciosas o inválidas descartadas y ${defenses.validAccepted} de ${defenses.valid} salidas válidas aceptadas.${defenses.failures.length === 0 ? '' : ` Fallas: ${defenses.failures.join('; ')}.`}`,
    '- **Riesgo residual:** una salida que cumple el esquema y cita un fragmento literal del relato se acepta aunque la',
    '  sugerencia sea mala, incluso si el fragmento es la propia instrucción incrustada. El daño queda limitado a una',
    '  sugerencia orientativa equivocada que la persona ve junto a su fragmento; nunca a una acción.',
    '',
    'Para evaluar un modelo real, instala Ollama, descarga un modelo pequeño (por ejemplo `qwen2.5:1.5b`), fija su',
    'digesto en la configuración y ejecuta las tareas sobre `LABELED_NARRATIVES`; publica el resultado aquí con el',
    'digesto del modelo.',
    '',
  );
  // Con el formato de Prettier del repositorio, para que `npm run format:check` lo acepte.
  const filepath = new URL('../../EVALUACION.md', import.meta.url).pathname;
  const prettierConfig = (await resolveConfig(filepath)) ?? {};
  return format(lines.join('\n'), { ...prettierConfig, filepath });
}

const LABELED_AMBIGUOUS_TEXT =
  'varios son ambiguos (aceptan más de una conducta) y uno no debe recibir sugerencia';
