// Entrada del contenedor de un nodo: arranca el servidor de referencia tal cual y publica su puerto
// local en la red de compose. Uso: node node-launcher.ts <ruta de apps/server/src/main.ts>
import { launch } from './loopback-proxy.ts';

const script = process.argv[2];
if (script === undefined) {
  console.error('Uso: node node-launcher.ts <script del servidor>');
  process.exit(1);
}
launch(script);
