// Versión del software del servidor de referencia, tomada de su package.json: la reporta el nodo
// en su salud (`GET /api/v1/red/health`) para que el enrutador aplique la versión mínima.
import serverPackage from '../package.json' with { type: 'json' };

/** Versión `mayor.menor.parche` del servidor de referencia. */
export const SERVER_SOFTWARE_VERSION: string = serverPackage.version;
