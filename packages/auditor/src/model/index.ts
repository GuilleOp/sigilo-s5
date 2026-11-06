// Punto de entrada del modelo local opcional (ADR 0009): adaptadores de Ollama y llama.cpp en
// 127.0.0.1 y tareas orientativas validadas. Desactivado por omisión; falla cerrado.
export {
  ADAPTER_VERSION,
  assertLoopbackUrl,
  connectLocalModel,
  createLlamaCppClient,
  createOllamaClient,
  DEFAULT_LOCAL_MODEL_CONFIG,
} from './client.ts';
export type {
  FetchLike,
  LocalModelClient,
  LocalModelConfig,
  ModelConnection,
  ModelInfo,
  ModelRequest,
} from './client.ts';
export {
  delimitAsData,
  explainGenericClosure,
  GENERIC_CLOSURE_REASONS,
  redactContactData,
  suggestOffenses,
} from './tasks.ts';
export type {
  GenericClosureReason,
  GenericClosureSummary,
  ModelTaskResult,
  OffenseSuggestion,
} from './tasks.ts';
