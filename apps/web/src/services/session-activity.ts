// Actividad de la sesión del panel, para avisar antes de que venza por inactividad (H2, WCAG
// 2.2.1). Cada petición autenticada renueva la sesión en el servidor; aquí se recuerda cuándo fue
// la última y se avisa si el servidor responde que la sesión ya no es válida.

let lastActivityAt = 0;
const expiredListeners = new Set<() => void>();

/** Hora (ms) de la última petición autenticada que respondió el servidor. */
export function lastAuthorityActivity(): number {
  return lastActivityAt;
}

/** Registra que el servidor respondió una petición autenticada (renueva la sesión). */
export function markAuthorityActivity(now: number = Date.now()): void {
  lastActivityAt = now;
}

/** Avisa a quien escucha que el servidor dio la sesión por vencida (401 con token). */
export function notifySessionExpired(): void {
  expiredListeners.forEach((listener) => listener());
}

/** Se suscribe al vencimiento de la sesión; devuelve la función para dejar de escuchar. */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}
