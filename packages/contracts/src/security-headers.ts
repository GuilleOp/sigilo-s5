// Cabeceras de seguridad compartidas por el nodo, el enrutador y la corroboración, para que no se
// desalineen (H11). Ninguna página del sistema usa funciones sensibles del navegador ni recursos de
// otros orígenes.

/**
 * Funciones del navegador que ninguna página necesita, todas apagadas. WebAuthn queda solo para el
 * propio origen, por si el panel agrega un segundo factor con llaves de seguridad.
 */
export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'attribution-reporting=()',
  'autoplay=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'clipboard-read=()',
  'display-capture=()',
  'encrypted-media=()',
  'gamepad=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'identity-credentials-get=()',
  'idle-detection=()',
  'interest-cohort=()',
  'local-fonts=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'otp-credentials=()',
  'payment=()',
  'picture-in-picture=()',
  'private-state-token-issuance=()',
  'private-state-token-redemption=()',
  'publickey-credentials-create=(self)',
  'publickey-credentials-get=(self)',
  'screen-wake-lock=()',
  'serial=()',
  'storage-access=()',
  'usb=()',
  'web-share=()',
  'window-management=()',
  'xr-spatial-tracking=()',
].join(', ');

/**
 * Aislamiento entre orígenes: ningún otro origen puede incrustar las respuestas (CORP), la página
 * solo carga recursos que lo permitan explícitamente (COEP; todo es del mismo origen) y no comparte
 * grupo de navegación con ventanas de otros orígenes (COOP). Con las tres, el navegador aísla el
 * proceso del panel, que guarda en memoria la llave privada de la autoridad (mitiga Spectre).
 */
export const CROSS_ORIGIN_ISOLATION_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
