// Reenvío TCP mínimo para contenedores: el servidor de referencia escucha solo en 127.0.0.1, así
// que dentro del contenedor este proceso lo arranca y publica su puerto hacia la red de compose.
// No interpreta ni registra el tráfico.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Server } from 'node:net';
import { join } from 'node:path';

/**
 * Crea un servidor TCP que reenvía cada conexión a `127.0.0.1:targetPort`, byte por byte.
 * Seguridad: no lee ni guarda nada de la conexión (ni direcciones ni contenido).
 */
export function createLoopbackProxy(targetPort: number): Server {
  return createServer((client) => {
    const upstream = createConnection({ host: '127.0.0.1', port: targetPort });
    client.pipe(upstream);
    upstream.pipe(client);
    const close = (): void => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', close);
    upstream.on('error', close);
    client.on('close', close);
    upstream.on('close', close);
  });
}

function parsePort(name: string, value: string | undefined, fallback: number): number {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} inválido.`);
  return port;
}

/**
 * Arranca `node <script>` como proceso hijo con el mismo entorno y publica su puerto local
 * (`SIGILO_PORT`, 8787) en `0.0.0.0:SIGILO_PUBLIC_PORT` (8080). Termina cuando termina el hijo.
 * Con `SIGILO_LAUNCHER_CLEAR_LOCK=1` borra antes el `server.lock` del directorio de datos.
 */
export function launch(script: string, env: NodeJS.ProcessEnv = process.env): void {
  const targetPort = parsePort('SIGILO_PORT', env.SIGILO_PORT, 8787);
  const publicPort = parsePort('SIGILO_PUBLIC_PORT', env.SIGILO_PUBLIC_PORT, 8080);
  // En un contenedor nuevo el PID del servidor se repite y su bloqueo anterior parecería vigente.
  // Seguridad: solo con SIGILO_LAUNCHER_CLEAR_LOCK=1, cuando compose garantiza un solo contenedor
  // por volumen de datos.
  if (env.SIGILO_LAUNCHER_CLEAR_LOCK === '1' && (env.SIGILO_DATA_DIR ?? '') !== '') {
    rmSync(join(env.SIGILO_DATA_DIR ?? '', 'server.lock'), { force: true });
  }
  const child = spawn(process.execPath, [script], { env, stdio: 'inherit' });
  const proxy = createLoopbackProxy(targetPort);
  proxy.listen(publicPort, '0.0.0.0');
  const forward = (signal: NodeJS.Signals): void => {
    child.kill(signal);
  };
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGINT', () => forward('SIGINT'));
  child.on('exit', (code) => {
    proxy.close();
    process.exit(code ?? 1);
  });
}
