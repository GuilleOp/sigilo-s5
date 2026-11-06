// Adaptadores de un modelo abierto LOCAL (Ollama o llama.cpp server en 127.0.0.1): desactivados por
// omisión, sin terceros y con falla cerrada. El modelo no tiene herramientas, red ni memoria.

/** Versión del adaptador y de los prompts; se registra en la bitácora. */
export const ADAPTER_VERSION = '1.0.0';

/** Petición al modelo: instrucciones fijas, prompt con el dato delimitado y esquema JSON de salida. */
export interface ModelRequest {
  system: string;
  prompt: string;
  /** Esquema JSON que el servidor local usa para restringir la salida (gramática). */
  jsonSchema: Readonly<Record<string, unknown>>;
  maxTokens: number;
}

/** Identidad del modelo para la bitácora. */
export interface ModelInfo {
  name: string;
  /** SHA-256 (hex) del archivo de pesos, fijado en la configuración. */
  digest: string;
  adapterVersion: string;
}

/** Cliente de un modelo local: solo genera texto. No hay otra operación. */
export interface LocalModelClient {
  info: ModelInfo;
  generate(request: ModelRequest): Promise<string>;
}

/** Configuración del modelo local. `enabled` es `false` por omisión. */
export interface LocalModelConfig {
  enabled: boolean;
  runtime: 'ollama' | 'llama-cpp';
  /** URL del servidor local; solo se acepta 127.0.0.1, ::1 o localhost. */
  baseUrl: string;
  /** Nombre del modelo, por ejemplo `qwen2.5:1.5b`. */
  model: string;
  /** SHA-256 esperado del archivo de pesos (64 hex). Con Ollama se comprueba contra `/api/tags`. */
  expectedDigest: string;
  timeoutMs: number;
  /** Tamaño máximo de la respuesta HTTP en bytes; una respuesta mayor se descarta. */
  maxResponseBytes: number;
}

/** Configuración por omisión: desactivado. */
export const DEFAULT_LOCAL_MODEL_CONFIG: LocalModelConfig = {
  enabled: false,
  runtime: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:1.5b',
  expectedDigest: '',
  timeoutMs: 60_000,
  maxResponseBytes: 65_536,
};

/** `fetch` inyectable (para pruebas). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

/**
 * Valida que la URL apunte a la misma máquina por HTTP sin credenciales ni ruta extra.
 * Seguridad: impide que una configuración envíe el relato a un servicio de terceros.
 */
export function assertLoopbackUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('La URL del modelo local no es válida.');
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      'El modelo solo puede correr en esta misma máquina (127.0.0.1, ::1 o localhost).',
    );
  }
  if (url.username !== '' || url.password !== '' || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('La URL del modelo local no debe llevar credenciales ni ruta.');
  }
  return url;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new Error('La respuesta del modelo excede el tamaño permitido.');
  }
  return text;
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  config: LocalModelConfig,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`El modelo local respondió ${response.status}.`);
  return JSON.parse(await readLimited(response, config.maxResponseBytes)) as unknown;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** Cliente de Ollama (`/api/generate` con `format` = esquema JSON y temperatura 0). */
export function createOllamaClient(
  config: LocalModelConfig,
  fetchImpl: FetchLike = fetch,
): LocalModelClient {
  const base = assertLoopbackUrl(config.baseUrl).origin;
  return {
    info: { name: config.model, digest: config.expectedDigest, adapterVersion: ADAPTER_VERSION },
    async generate(request) {
      const body = await postJson(
        fetchImpl,
        `${base}/api/generate`,
        {
          model: config.model,
          system: request.system,
          prompt: request.prompt,
          format: request.jsonSchema,
          stream: false,
          // Sin contexto previo: cada llamada es independiente (sin memoria entre denuncias).
          options: { temperature: 0, num_predict: request.maxTokens, seed: 7 },
        },
        config,
      );
      const output = field(body, 'response');
      if (typeof output !== 'string') throw new Error('Respuesta de Ollama sin texto.');
      return output;
    },
  };
}

/** Cliente de llama.cpp server (`/completion` con `json_schema` y temperatura 0). */
export function createLlamaCppClient(
  config: LocalModelConfig,
  fetchImpl: FetchLike = fetch,
): LocalModelClient {
  const base = assertLoopbackUrl(config.baseUrl).origin;
  return {
    info: { name: config.model, digest: config.expectedDigest, adapterVersion: ADAPTER_VERSION },
    async generate(request) {
      const body = await postJson(
        fetchImpl,
        `${base}/completion`,
        {
          prompt: `${request.system}\n\n${request.prompt}`,
          json_schema: request.jsonSchema,
          n_predict: request.maxTokens,
          temperature: 0,
          cache_prompt: false,
        },
        config,
      );
      const output = field(body, 'content');
      if (typeof output !== 'string') throw new Error('Respuesta de llama.cpp sin texto.');
      return output;
    },
  };
}

/** Resultado de conectar: listo o no disponible (el auditor sigue solo con reglas). */
export type ModelConnection =
  | { status: 'ready'; client: LocalModelClient }
  | { status: 'disabled' }
  | { status: 'unavailable'; reason: string };

/**
 * Conecta con el modelo local y falla cerrado: desactivado, URL que no es local, digesto ausente,
 * servidor apagado o digesto distinto dan un resultado sin cliente. Nunca lanza.
 */
export async function connectLocalModel(
  config: LocalModelConfig = DEFAULT_LOCAL_MODEL_CONFIG,
  fetchImpl: FetchLike = fetch,
): Promise<ModelConnection> {
  if (!config.enabled) return { status: 'disabled' };
  try {
    const base = assertLoopbackUrl(config.baseUrl).origin;
    if (!DIGEST_PATTERN.test(config.expectedDigest)) {
      return {
        status: 'unavailable',
        reason: 'Falta el digesto SHA-256 del modelo en la configuración.',
      };
    }
    if (config.runtime === 'ollama') {
      const response = await fetchImpl(`${base}/api/tags`, {
        signal: AbortSignal.timeout(Math.min(config.timeoutMs, 5_000)),
        redirect: 'error',
      });
      if (!response.ok) return { status: 'unavailable', reason: 'Ollama no respondió.' };
      const tags: unknown = JSON.parse(await readLimited(response, config.maxResponseBytes * 16));
      const models = field(tags, 'models');
      const found = Array.isArray(models)
        ? models.find(
            (item: unknown) =>
              field(item, 'name') === config.model || field(item, 'model') === config.model,
          )
        : undefined;
      if (found === undefined)
        return { status: 'unavailable', reason: 'El modelo no está instalado en Ollama.' };
      if (field(found, 'digest') !== config.expectedDigest) {
        return {
          status: 'unavailable',
          reason: 'El digesto del modelo instalado no coincide con el configurado.',
        };
      }
      return { status: 'ready', client: createOllamaClient(config, fetchImpl) };
    }
    const health = await fetchImpl(`${base}/health`, {
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 5_000)),
      redirect: 'error',
    });
    if (!health.ok) return { status: 'unavailable', reason: 'llama.cpp server no respondió.' };
    // llama.cpp no publica el digesto del archivo: se confía en el calculado al instalarlo (sha256sum).
    return { status: 'ready', client: createLlamaCppClient(config, fetchImpl) };
  } catch {
    return { status: 'unavailable', reason: 'No se pudo conectar con el modelo local.' };
  }
}
