// Archivos que genera el CLI a partir de las respuestas: `.env` de compose, el `Caddyfile` del
// lado del nodo o de la ventanilla y las variables de cada servicio. Ninguno lleva secretos, salvo
// el token de operación del enrutador (config/enrutador.env, 0600).
import { z } from 'zod';

/** Formas de publicar con HTTPS. */
export const TLS_MODES = ['letsencrypt', 'propio', 'proxy'] as const;
export type TlsMode = (typeof TLS_MODES)[number];
export const TlsModeSchema = z.enum(TLS_MODES);

/** Lee la respuesta «1, 2 o 3» (o el nombre del modo). */
export function parseTlsMode(value: string): TlsMode | null {
  const map: Record<string, TlsMode> = {
    '1': 'letsencrypt',
    '2': 'propio',
    '3': 'proxy',
    letsencrypt: 'letsencrypt',
    automatico: 'letsencrypt',
    propio: 'propio',
    proxy: 'proxy',
  };
  return map[value.trim().toLowerCase()] ?? null;
}

/** Registro donde se publican las imágenes. */
export const DEFAULT_REGISTRY = 'ghcr.io/guilleop';

/**
 * Imagen de Caddy por omisión, fijada por el digesto del índice multiarquitectura (2026-11-12).
 * Para actualizarla: `docker buildx imagetools inspect caddy:2.10-alpine` y copiar «Digest:».
 */
export const DEFAULT_CADDY_IMAGE =
  'caddy:2.10-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d';

/** Una línea `CLAVE=valor` por variable, con encabezado. */
export function envFile(header: string, values: Record<string, string | undefined>): string {
  const lines = [`# ${header}`];
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) lines.push(`${name}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Opciones del `.env` de compose. */
export interface ComposeEnvOptions {
  version: string;
  /** Variable e imagen del servicio principal (SIGILO_IMAGEN_NODO o SIGILO_IMAGEN_ENRUTADOR). */
  imageVariable: string;
  image: string;
  uid: number;
  gid: number;
  tls: TlsMode;
  domain: string;
  tlsEmail: string | null;
  extra?: Record<string, string>;
}

/** `.env` de compose: imágenes, usuario, perfil de TLS y dominio. */
export function composeEnv(options: ComposeEnvOptions): string {
  return envFile('Generado por sigilo instalar. No contiene secretos. Lo usa docker compose.', {
    SIGILO_VERSION: options.version,
    [options.imageVariable]: options.image,
    SIGILO_IMAGEN_CADDY: DEFAULT_CADDY_IMAGE,
    SIGILO_UID: String(options.uid),
    SIGILO_GID: String(options.gid),
    // Con el perfil «tls» compose levanta Caddy; con un proxy propio, no.
    COMPOSE_PROFILES: options.tls === 'proxy' ? '' : 'tls',
    SIGILO_DOMINIO: options.domain,
    SIGILO_CORREO_TLS: options.tlsEmail ?? '',
    ...options.extra,
  });
}

/** Encabezado global de Caddy: sin API de administración y puertos sin privilegios. */
function caddyGlobal(tls: TlsMode): string[] {
  return [
    '{',
    '\t# Sin API de administración; puertos sin privilegios dentro del contenedor (compose publica',
    '\t# 80 → 8080 y 443 → 8443), así Caddy corre sin root y sin capacidades.',
    '\tadmin off',
    '\thttp_port 8080',
    '\thttps_port 8443',
    ...(tls === 'letsencrypt' ? ['\temail {$SIGILO_CORREO_TLS}'] : []),
    '}',
  ];
}

function tlsDirective(tls: TlsMode): string[] {
  return tls === 'propio' ? ['\ttls /tls/propio/certificado.crt /tls/propio/llave.key'] : [];
}

/** Bloque de proxy inverso sin cabeceras con la IP de quien llega. */
function proxyTo(upstream: string): string[] {
  return [
    `\treverse_proxy ${upstream} {`,
    '\t\t# El código no lee la IP; tampoco viaja hacia atrás.',
    '\t\theader_up -X-Forwarded-For',
    '\t\theader_up -X-Real-IP',
    '\t}',
  ];
}

/**
 * `Caddyfile` del nodo (modos 1 y 2). Sin directiva `log`: Caddy no escribe registro de accesos (ni
 * IP ni cabeceras). Dos sitios, como pide docs/seguridad-produccion.md:
 * - `https://<dominio>` (443): frente «red» y lecturas públicas → nodo:8080. Opcionalmente solo
 *   para las IP de la SESNA y de los testigos (`SIGILO_RED_IPS`).
 * - `https://<dominio>:8443`: frente «panel» → nodo:8081, solo desde `SIGILO_PANEL_IPS` (por
 *   omisión, las redes privadas: la VPN o la red interna de la institución).
 */
export function nodeCaddyfile(tls: TlsMode): string {
  return `${[
    ...caddyGlobal(tls),
    '',
    '# Frente «red» y lecturas públicas: la SESNA entrega aquí; los testigos leen la bitácora.',
    '{$SIGILO_DOMINIO} {',
    ...tlsDirective(tls),
    '\t@fuera not remote_ip {$SIGILO_RED_IPS:0.0.0.0/0 ::/0}',
    '\trespond @fuera 404',
    '\theader -Server',
    '\trequest_body {',
    '\t\tmax_size 23MB',
    '\t}',
    ...proxyTo('nodo:8080'),
    '}',
    '',
    '# Frente «panel» de las autoridades: solo desde la VPN o la red de la institución.',
    '{$SIGILO_DOMINIO}:9443 {',
    ...tlsDirective(tls),
    '\t@fuera not remote_ip {$SIGILO_PANEL_IPS:private_ranges}',
    '\trespond @fuera 404',
    '\theader -Server',
    '\trequest_body {',
    '\t\tmax_size 23MB',
    '\t}',
    ...proxyTo('nodo:8081'),
    '}',
  ].join('\n')}\n`;
}

/**
 * `Caddyfile` de la ventanilla de la SESNA (modos 1 y 2): la ventanilla pública y el enrutador en
 * el mismo origen. La salud con conteos de la cola exige además el token de operación.
 */
export function sesnaCaddyfile(tls: TlsMode): string {
  return `${[
    ...caddyGlobal(tls),
    '',
    '# Ventanilla única y enrutador: el único servicio público de la SESNA.',
    '{$SIGILO_DOMINIO} {',
    ...tlsDirective(tls),
    '\theader -Server',
    '\trequest_body {',
    '\t\tmax_size 23MB',
    '\t}',
    ...proxyTo('enrutador:8790'),
    '}',
  ].join('\n')}\n`;
}
