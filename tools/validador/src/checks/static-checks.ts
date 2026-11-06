// Verificaciones por análisis estático del HTML y de los paquetes JavaScript descargados durante la
// carga (PRV-08, PRV-09, PRV-10, PRV-11 y PRV-13). Son heurísticas: un hallazgo en el código se
// reporta como `advertencia` (indicio, no certeza) y solo lo observado en la red como `no_cumple`.
import { result } from '../catalog.ts';
import type { CapturedResource, CheckResult, Evidence, PassiveCapture } from '../types.ts';
import { MAP_SERVICES, matchServiceByUrl, TRACKER_SERVICES } from './known-services.ts';
import type { KnownService } from './known-services.ts';
import { MAX_EVIDENCE_ITEMS } from './network-checks.ts';

/** Caracteres de contexto a cada lado de una coincidencia. */
const CONTEXT_CHARS = 140;

/** Máximo de coincidencias por recurso y firma. */
const MAX_MATCHES_PER_RESOURCE = 3;

/** Coincidencia de una firma en un recurso. */
export interface CodeMatch {
  url: string;
  snippet: string;
  /** Contexto amplio alrededor (para clasificar la coincidencia). */
  context: string;
  /** Texto inmediatamente anterior a la coincidencia (60 caracteres). */
  before: string;
}

/** Texto analizable: recursos capturados más el HTML de cada página. */
export function corpusOf(capture: PassiveCapture): CapturedResource[] {
  const fromPages = capture.pages
    .filter((page) => page.html !== '')
    .map((page) => ({
      url: page.finalUrl,
      contentType: page.headers['content-type'] ?? 'text/html',
      page: page.label,
      body: page.html,
      isTruncated: false,
    }));
  const seen = new Set<string>();
  return [...fromPages, ...capture.resources].filter((resource) => {
    if (seen.has(resource.url)) return false;
    seen.add(resource.url);
    return true;
  });
}

function clipAround(body: string, index: number, length: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(body.length, index + length + radius);
  return `${start > 0 ? '…' : ''}${body.slice(start, end).replace(/\s+/g, ' ')}${end < body.length ? '…' : ''}`;
}

/**
 * Busca una firma en el corpus y devuelve las coincidencias con su contexto. `accept` filtra antes
 * de aplicar el máximo por recurso, para no perder la coincidencia relevante tras otras.
 */
export function findInCorpus(
  corpus: readonly CapturedResource[],
  signature: RegExp,
  contextChars = CONTEXT_CHARS,
  accept: (match: CodeMatch) => boolean = () => true,
): CodeMatch[] {
  const flags = signature.flags.includes('g') ? signature.flags : `${signature.flags}g`;
  const pattern = new RegExp(signature.source, flags);
  const matches: CodeMatch[] = [];
  for (const resource of corpus) {
    let count = 0;
    for (const match of resource.body.matchAll(pattern)) {
      const candidate: CodeMatch = {
        url: resource.url,
        snippet: clipAround(resource.body, match.index, match[0].length, 60),
        context: resource.body.slice(
          Math.max(0, match.index - contextChars),
          match.index + match[0].length + contextChars,
        ),
        before: resource.body.slice(Math.max(0, match.index - 60), match.index),
      };
      if (!accept(candidate)) continue;
      matches.push(candidate);
      count += 1;
      if (count >= MAX_MATCHES_PER_RESOURCE) break;
    }
  }
  return matches;
}

function codeEvidence(match: CodeMatch, description: string): Evidence {
  return { kind: 'codigo', description, url: match.url, snippet: match.snippet };
}

function corpusNote(corpus: readonly CapturedResource[]): Evidence {
  const truncated = corpus.filter((resource) => resource.isTruncated).length;
  return {
    kind: 'nota',
    description: `Análisis estático de ${corpus.length} recurso(s) de texto descargados durante la carga${truncated > 0 ? ` (${truncated} recortado(s) por tamaño)` : ''}. No cubre fragmentos que solo se cargan al interactuar.`,
  };
}

/** PRV-08: sin reconocimiento de voz del navegador (en Chrome envía el audio a un servicio remoto). */
export function checkSpeechRecognition(capture: PassiveCapture): CheckResult {
  const corpus = corpusOf(capture);
  const matches = findInCorpus(corpus, /\b(?:webkitSpeechRecognition|SpeechRecognition)\b/);
  if (matches.length > 0) {
    return result('PRV-08', {
      status: 'advertencia',
      isHeuristic: true,
      summary:
        'El código usa la API de reconocimiento de voz del navegador; en Chrome y Edge el audio se procesa en servidores del fabricante.',
      evidence: [
        ...matches
          .slice(0, MAX_EVIDENCE_ITEMS)
          .map((match) => codeEvidence(match, 'Referencia a SpeechRecognition.')),
        corpusNote(corpus),
      ],
    });
  }
  return result('PRV-08', {
    status: 'cumple',
    isHeuristic: true,
    summary: 'No se encontraron referencias a SpeechRecognition en el código descargado.',
    evidence: [corpusNote(corpus)],
  });
}

/** Folio de ejemplo con prefijo, año y consecutivo (p. ej. `ABC-2031000123` o `ABC-2031-000123`). */
const SEQUENTIAL_FOLIO_EXAMPLE = /\b[A-Z]{2,5}-(?:19|20)\d{2}-?\d{4,7}\b/;
/** Expresión regular de validación de folio con año y dígitos (p. ej. `/^ABC-\d{4}\d{6}$/`). */
const SEQUENTIAL_FOLIO_REGEX = /[A-Z]{2,5}-\??\\d\{4\}-?\??(?:\\d\{\d(?:,\d)?\}|\[0-9\]\{\d\})/;
/** Construcción en el cliente: prefijo literal concatenado con año y relleno con ceros. */
const FOLIO_BUILDER = /["'`][A-Z]{2,5}-["'`]\s*(?:\.concat\(|\+)|`[A-Z]{2,5}-\$\{/;
/** Consulta desde el cliente de si un folio existe (oráculo de enumeración). */
const FOLIO_LOOKUP = /\b\w*(?:verificar|check|exist)\w*Folio\w*|\bfolio_?\w*exist\w*/i;

/**
 * Conclusión general de PRV-09 para el reporte público: describe la falla sin el código, los
 * nombres de colecciones ni los campos que permitirían explotarla.
 */
function folioConclusion(
  builders: readonly CodeMatch[],
  regexes: readonly CodeMatch[],
  lookups: readonly CodeMatch[],
): string {
  const isClientRandom = builders.some((match) => /Math\.random/.test(match.context));
  const digits = regexes
    .map((match) => /\\d\{4\}-?\??\\d\{(\d)\}/.exec(match.snippet)?.[1])
    .find((value) => value !== undefined);
  const parts = [
    isClientRandom
      ? 'El folio se genera en el navegador con un generador no criptográfico'
      : 'Hay indicios de un folio con prefijo, año y un número corto',
  ];
  if (digits !== undefined) parts.push(`en un espacio aproximado de 10^${digits} valores por año`);
  const sentence =
    lookups.length > 0
      ? `${parts.join(', ')}, y el navegador consulta si un folio existe`
      : parts.join(', ');
  return `${sentence}. El detalle técnico se conserva fuera del repositorio.`;
}

/** PRV-09 (pasivo): indicios de un folio con año y consecutivo en el HTML o en el código. */
export function checkFolioPatternPassive(capture: PassiveCapture): CheckResult {
  const corpus = corpusOf(capture);
  const examples = findInCorpus(corpus, SEQUENTIAL_FOLIO_EXAMPLE);
  const regexes = findInCorpus(corpus, SEQUENTIAL_FOLIO_REGEX);
  const builders = findInCorpus(corpus, FOLIO_BUILDER).filter((match) =>
    /getFullYear|padStart|folio/i.test(match.context),
  );
  const lookups = findInCorpus(corpus, FOLIO_LOOKUP);
  const evidence = [
    ...examples.map((match) =>
      codeEvidence(match, 'Folio de ejemplo con prefijo, año y consecutivo.'),
    ),
    ...regexes.map((match) => codeEvidence(match, 'Validación de folio con año y dígitos.')),
    ...builders.map((match) =>
      codeEvidence(
        match,
        /Math\.random/.test(match.context)
          ? 'Construcción de folio en el cliente con prefijo, año y Math.random (no criptográfico).'
          : 'Construcción de folio con prefijo y año.',
      ),
    ),
    ...lookups
      .slice(0, 3)
      .map((match) =>
        codeEvidence(
          match,
          'El cliente consulta si un folio existe: posible oráculo para enumerar folios.',
        ),
      ),
  ].slice(0, MAX_EVIDENCE_ITEMS);
  if (evidence.length > 0) {
    return result('PRV-09', {
      status: 'advertencia',
      isHeuristic: true,
      summary:
        'Hay indicios de un folio formado por prefijo, año y un número corto (consecutivo o de pocas cifras), que se puede enumerar.',
      redactedSummary: folioConclusion(builders, regexes, lookups),
      evidence: [...evidence, corpusNote(corpus)],
    });
  }
  return result('PRV-09', {
    status: 'no_aplica',
    isHeuristic: true,
    summary:
      'No evaluable en modo pasivo: ningún folio ni patrón de folio aparece en los recursos públicos (el folio lo genera el servidor al enviar). Se evalúa en modo conformidad.',
    evidence: [corpusNote(corpus)],
  });
}

const STORAGE_API =
  /\b(?:localStorage|sessionStorage|indexedDB|localforage|idb-keyval|createJSONStorage)\b/;
/** Palabras que, cerca del uso de almacenamiento, sugieren que se guarda la denuncia. */
const DRAFT_HINT =
  /borrador|draft|denuncia|complaint|formdata|formulario|avance|narraci|hechos|evidencia|persist|autosave|autoguard|datosdenunciante/i;
/** Contexto amplio para clasificar usos de almacenamiento en código minificado. */
const STORAGE_CONTEXT_CHARS = 300;
/** Guardado de un objeto serializado (`setItem(clave, JSON.stringify(...))`). */
const SERIALIZED_WRITE = /setItem\([^)]{0,80}JSON\.stringify/;
/** Clave literal de almacenamiento con nombre de borrador (p. ej. `"app.formulario.draft"`). */
const DRAFT_KEY_LITERAL = /["'`][\w.:-]*(?:draft|borrador)[\w.:-]*["'`]/i;
/** Texto de la interfaz que anuncia un guardado local. */
const LOCAL_SAVE_NOTICE =
  /(?:se guarda|guardamos|se guardar[áa]|guardado)[^"<]{0,80}(?:este dispositivo|tu navegador|este navegador|borrador)/i;
/** Negación justo antes del aviso de guardado. */
const NEGATED_NOTICE = /\b(?:nada|no|nunca|ning[uú]n[ao]?)\s+(?:\S+\s+){0,2}$/i;
/** Longitud mínima del valor guardado para considerarlo un posible borrador. */
const MIN_DRAFT_VALUE_CHARS = 32;
/** Claves de almacenamiento que sugieren un borrador. */
const DRAFT_KEY_HINT = /borrador|draft|denuncia|complaint|form|report/i;

/** Conclusión general de PRV-10 para el reporte público, sin el nombre de la clave. */
function draftConclusion(uses: readonly CodeMatch[], notices: readonly CodeMatch[]): string {
  // El área que recibe un objeto serializado es la del borrador; las demás pueden ser banderas.
  const writes = uses.filter((match) => SERIALIZED_WRITE.test(match.context));
  const source = writes.length > 0 ? writes : uses;
  const areas = ['localStorage', 'sessionStorage', 'IndexedDB'].filter((area) =>
    source.some((match) => match.snippet.toLowerCase().includes(area.toLowerCase())),
  );
  const hours = notices
    .map((match) => /(\d+)\s*horas/.exec(match.context)?.[1])
    .find((value) => value !== undefined);
  const where = areas.length > 0 ? ` en ${areas.join(' y ')}` : ' en el navegador';
  const lasting = hours === undefined ? '' : ` durante ${hours} horas`;
  return `El formulario guarda un borrador${where}${lasting}, sin cifrar: queda legible para quien use el mismo equipo. El detalle técnico se conserva fuera del repositorio.`;
}

/** PRV-10 (estático): indicios de borradores de la denuncia en el almacenamiento del navegador. */
export function checkDraftStoragePassive(capture: PassiveCapture): CheckResult {
  const corpus = corpusOf(capture);
  const storageResources = corpus.filter((resource) => STORAGE_API.test(resource.body));
  const draftKeyLiterals = findInCorpus(storageResources, DRAFT_KEY_LITERAL);
  const resourcesWithDraftKey = new Set(draftKeyLiterals.map((match) => match.url));
  // Un objeto serializado solo cuenta si el mismo recurso nombra una clave de borrador: las
  // bibliotecas (enrutadores, telemetría) también guardan JSON en el almacenamiento.
  const isDraftLike = (match: CodeMatch): boolean =>
    DRAFT_HINT.test(match.context) ||
    (SERIALIZED_WRITE.test(match.context) && resourcesWithDraftKey.has(match.url));
  const draftUses = findInCorpus(corpus, STORAGE_API, STORAGE_CONTEXT_CHARS, isDraftLike);
  const otherUses = findInCorpus(
    corpus,
    STORAGE_API,
    STORAGE_CONTEXT_CHARS,
    (match) => !isDraftLike(match),
  ).length;
  // Se descartan frases negativas como «nada queda guardado en tu navegador».
  const notices = findInCorpus(
    corpus,
    LOCAL_SAVE_NOTICE,
    CONTEXT_CHARS,
    (match) => !NEGATED_NOTICE.test(match.before),
  );
  const stored = capture.pages.flatMap((page) =>
    page.storage.map((entry) => ({ page: page.label, entry })),
  );
  // Una bandera corta (p. ej. «ya vio los consejos») no es un borrador: se exige un valor largo.
  const draftKeys = stored.filter(
    ({ entry }) => DRAFT_KEY_HINT.test(entry.key) && entry.value.length > MIN_DRAFT_VALUE_CHARS,
  );
  const evidence: Evidence[] = [
    ...draftKeyLiterals
      .slice(0, 3)
      .map((match) =>
        codeEvidence(match, 'Clave con nombre de borrador en un recurso que usa almacenamiento.'),
      ),
    ...draftUses
      .slice(0, 10)
      .map((match) =>
        codeEvidence(
          match,
          SERIALIZED_WRITE.test(match.context)
            ? 'Guarda un objeto serializado en el almacenamiento del navegador.'
            : 'Uso de almacenamiento cerca de datos del formulario.',
        ),
      ),
    ...notices
      .slice(0, 5)
      .map((match) => codeEvidence(match, 'La interfaz anuncia un guardado local.')),
    ...stored.slice(0, 10).map(({ page, entry }) => ({
      kind: 'almacenamiento' as const,
      description: `Clave presente tras cargar ${page} (${entry.area}).`,
      name: entry.key,
      value: entry.value.slice(0, 200),
    })),
  ];
  if (otherUses > 0) {
    evidence.push({
      kind: 'nota',
      description: `Al menos ${otherUses} uso(s) más de almacenamiento sin relación aparente con el formulario (bibliotecas, preferencias).`,
    });
  }
  evidence.push(corpusNote(corpus));
  if (
    draftUses.length > 0 ||
    draftKeyLiterals.length > 0 ||
    notices.length > 0 ||
    draftKeys.length > 0
  ) {
    return result('PRV-10', {
      status: 'advertencia',
      isHeuristic: true,
      summary:
        'Indicios de que el formulario guarda un borrador en el navegador; sin cifrar, queda legible para quien use el mismo equipo.',
      redactedSummary: draftConclusion([...draftUses, ...draftKeyLiterals], notices),
      evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS),
    });
  }
  return result('PRV-10', {
    status: 'cumple',
    isHeuristic: true,
    summary: 'No se encontraron indicios de borradores en el almacenamiento del navegador.',
    evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS),
  });
}

/**
 * Combina red y código para un grupo de servicios prohibidos: lo pedido por la red es
 * `no_cumple`; lo que solo aparece en el código es `advertencia`.
 */
function checkServices(
  id: 'PRV-11' | 'PRV-13',
  capture: PassiveCapture,
  services: readonly KnownService[],
  labels: { observed: string; inCode: string; clean: string },
): CheckResult {
  const corpus = corpusOf(capture);
  const evidence: Evidence[] = [];
  const observed = new Set<string>();
  for (const request of capture.requests) {
    const service = matchServiceByUrl(request.url, services);
    if (service === null) continue;
    observed.add(service.name);
    if (evidence.length < 10) {
      evidence.push({
        kind: 'red',
        description: `${service.name}: petición durante la carga de ${request.page}${request.isBlocked ? ' (bloqueada por el validador)' : ''}.`,
        url: request.url,
        value: request.method,
      });
    }
  }
  const inCode = new Set<string>();
  for (const service of services) {
    for (const signature of service.codeSignatures) {
      const matches = findInCorpus(corpus, signature);
      if (matches.length === 0) continue;
      inCode.add(service.name);
      for (const match of matches.slice(0, 2)) {
        evidence.push(codeEvidence(match, `${service.name}: firma en el código.`));
      }
    }
  }
  evidence.push(corpusNote(corpus));
  if (observed.size > 0) {
    return result(id, {
      status: 'no_cumple',
      summary: `${labels.observed}: ${[...observed].join(', ')}.`,
      evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS),
    });
  }
  if (inCode.size > 0) {
    return result(id, {
      status: 'advertencia',
      isHeuristic: true,
      summary: `${labels.inCode}: ${[...inCode].join(', ')}.`,
      evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS),
    });
  }
  return result(id, { status: 'cumple', isHeuristic: true, summary: labels.clean, evidence });
}

/** PRV-11: sin mapas ni geocodificación de terceros. */
export function checkExternalMaps(capture: PassiveCapture): CheckResult {
  return checkServices('PRV-11', capture, MAP_SERVICES, {
    observed: 'La página pidió mapas o geocodificación a terceros',
    inCode:
      'El código integra mapas o geocodificación de terceros (se activan al interactuar, p. ej. al escribir un domicilio)',
    clean: 'No se encontraron mapas ni geocodificación de terceros en la red ni en el código.',
  });
}

/** PRV-13: sin analítica ni rastreadores de terceros. */
export function checkTrackers(capture: PassiveCapture): CheckResult {
  return checkServices('PRV-13', capture, TRACKER_SERVICES, {
    observed: 'La página contactó servicios de analítica o rastreo',
    inCode: 'El código incluye analítica o rastreo de terceros',
    clean: 'No se encontraron analítica ni rastreadores en la red ni en el código.',
  });
}

/**
 * Hallazgos informativos que no son verificaciones: captcha propio (ALTCHA), cabeceras que revelan
 * la tecnología del servidor y almacenamiento observado.
 */
export function collectObservations(capture: PassiveCapture): Evidence[] {
  const corpus = corpusOf(capture);
  const observations: Evidence[] = [];
  const altcha = findInCorpus(corpus, /altcha-widget|\baltcha\b/i);
  if (altcha.length > 0) {
    // Solo valores con forma de URL, para no confundir textos como «audio challenge».
    const challengePattern = /\bchallenge(?:url)?\s*[:=]\s*["']((?:https?:)?\/[^"']*)["']/i;
    const challenge = corpus
      .map((resource) => challengePattern.exec(resource.body)?.[1])
      .find((url) => url !== undefined);
    observations.push({
      kind: 'codigo',
      description:
        challenge === undefined
          ? 'Usa ALTCHA (prueba de trabajo como captcha).'
          : `Usa ALTCHA con el reto servido en ${challenge}${challenge.startsWith('/') ? ' (propio origen, sin terceros)' : ''}.`,
      url: altcha[0]?.url ?? capture.targetUrl,
      snippet: altcha[0]?.snippet ?? '',
    });
  }
  for (const page of capture.pages) {
    for (const name of ['x-powered-by', 'server']) {
      const value = page.headers[name];
      if (value === undefined) continue;
      observations.push({
        kind: 'cabecera',
        description: 'Cabecera que revela tecnología del servidor (ASVS V14.3.3).',
        url: page.finalUrl,
        name,
        value,
      });
    }
  }
  const seen = new Set<string>();
  return observations.filter((observation) => {
    const key = `${observation.name ?? ''}|${observation.value ?? ''}|${observation.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
