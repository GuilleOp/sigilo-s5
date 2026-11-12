// `sigilo diagnostico`: en una pantalla, lo que hoy son `curl`, `jq` y `validate`. Revisa permisos,
// variables de demostración, directorio, la configuración que sirve la web, HTTPS, la vista de la
// SESNA y la edad del último respaldo. Sale con 0 (todo bien), 1 (avisos) o 2 (problemas), para
// usarlo desde un monitor. Deja un archivo de detalle sin secretos ni datos de denuncias.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  NETWORK_ROUTES,
  NetworkHealthSchema,
  WEB_CONFIG_PATH,
  WebRuntimeConfigSchema,
} from '@sigilo/contracts';
import { KeysFileSchema } from '@sigilo/contracts';
import { findNode, networkFingerprint, verifySignedDirectory } from '@sigilo/red';
import { MIN_HSTS_MAX_AGE_SECONDS } from '../../../../apps/server/src/config.ts';
import { readJson, todayOf, writeText } from '../base.ts';
import type { Context } from '../base.ts';
import { nodePaths, readInstallRecord, readNetworkPackage } from './comun.ts';

/** Variables que un nodo real nunca lleva. */
const DEMO_VARIABLES = [
  'SIGILO_DEMO',
  'SIGILO_E2E',
  'SIGILO_TEST_CLOCK_FILE',
  'SIGILO_DEMO_DAY_ZERO',
];

/** Días tras los cuales el último respaldo cuenta como viejo. */
const BACKUP_MAX_AGE_DAYS = 7;

function parseEnvFile(path: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/u.exec(line);
    if (match?.[1] !== undefined) values.set(match[1], (match[2] ?? '').trim());
  }
  return values;
}

function modeOf(path: string): number {
  return statSync(path).mode & 0o777;
}

async function getJson(
  ctx: Context,
  url: string,
): Promise<{ status: number; body: unknown; headers: Headers } | null> {
  try {
    const response = await ctx.fetch(url, { method: 'GET' });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body, headers: response.headers };
  } catch {
    return null;
  }
}

function checkHost(ctx: Context): void {
  const { screen } = ctx;
  const paths = nodePaths(ctx);
  screen.title('Equipo');
  const uid = process.getuid?.();
  const dataMode = existsSync(paths.data) ? modeOf(paths.data) : null;
  if (dataMode === null) {
    screen.fail('No existe datos/.', 'corre ./sigilo instalar.');
  } else if ((dataMode & 0o077) !== 0) {
    screen.fail(`datos/ tiene permisos ${dataMode.toString(8)}.`, 'chmod 700 datos');
  } else {
    screen.ok('Permisos: datos/ 0700');
  }
  const secrets = [
    paths.keys,
    paths.nodeBoxKey,
    paths.relaySecret,
    paths.oauthClients,
    paths.accounts,
    paths.linkKey,
  ];
  const loose = secrets.filter((path) => existsSync(path) && (modeOf(path) & 0o077) !== 0);
  if (loose.length > 0) {
    screen.fail(
      `Llaves con permisos de más: ${loose.map((path) => path.slice(ctx.base.length + 1)).join(', ')}`,
      'chmod 600 a esos archivos.',
    );
  } else {
    screen.ok('Llaves con permisos 0600');
  }
  if (uid !== undefined && existsSync(paths.data) && statSync(paths.data).uid !== uid) {
    screen.fail(
      `El dueño de datos/ no es el usuario que corre sigilo (UID ${uid}).`,
      `sudo chown -R ${uid} datos llaves salida tls (o corre ./sigilo con el usuario de servicio).`,
    );
  }
  // Seguridad: la llave privada del buzón nunca va en el volumen del nodo.
  if (existsSync(join(paths.data, 'authority-demo-key.json'))) {
    screen.fail(
      'datos/authority-demo-key.json: la llave privada del buzón está en el volumen del nodo.',
      'muévela a quien atiende el buzón y bórrala del servidor.',
    );
  }
  const pendingInboxKeys = existsSync(paths.output)
    ? readdirSync(paths.output).filter((name) => name.startsWith('llave-buzon-'))
    : [];
  if (pendingInboxKeys.length > 0) {
    screen.warn(
      `La llave del buzón sigue en salida/ (${pendingInboxKeys.join(', ')}).`,
      'entrégala a quien atiende el buzón y bórrala de este servidor.',
    );
  }
  if (!existsSync(paths.nodeEnv)) {
    screen.fail('No existe config/nodo.env.', 'corre ./sigilo instalar.');
    return;
  }
  const env = parseEnvFile(paths.nodeEnv);
  const demo = DEMO_VARIABLES.filter((name) => (env.get(name) ?? '') !== '');
  if (env.get('SIGILO_PDN_SOURCES') === 'synthetic') demo.push('SIGILO_PDN_SOURCES=synthetic');
  if (demo.length > 0) {
    screen.fail(
      `Hay variables de demostración en config/nodo.env: ${demo.join(', ')}`,
      'bórralas; un nodo real nunca usa datos sintéticos ni reloj simulado.',
    );
  } else {
    screen.ok('config/nodo.env sin variables de demostración');
  }
  if (env.get('NODE_ENV') !== 'production') {
    screen.fail('config/nodo.env no tiene NODE_ENV=production.', 'agrégala.');
  }
  if ((env.get('SIGILO_MFA') ?? 'requerido') !== 'requerido') {
    screen.fail(
      'El panel no exige el segundo factor (SIGILO_MFA no es «requerido»).',
      'SIGILO_MFA=requerido (o quítala): un nodo real siempre lo exige.',
    );
  } else {
    screen.ok('Segundo factor del panel obligatorio (SIGILO_MFA=requerido)');
  }
  if ((env.get('SIGILO_NODE_PROFILE') ?? 'nodo') !== 'nodo' || env.has('SIGILO_NODE_INTAKE')) {
    screen.fail(
      'El nodo no está en perfil «nodo» o reabre la recepción directa.',
      'SIGILO_NODE_PROFILE=nodo y sin SIGILO_NODE_INTAKE.',
    );
  }
}

async function checkNetwork(ctx: Context): Promise<void> {
  const { screen } = ctx;
  const paths = nodePaths(ctx);
  const record = readInstallRecord(ctx);
  const pkg = readNetworkPackage(paths.network);
  screen.title('Red');
  screen.line(`  Huella de la red: ${networkFingerprint(pkg.trust)}`);
  if (!existsSync(paths.directory)) {
    screen.fail(
      'Todavía no hay directorio en datos/.',
      'cuando la SESNA confirme: ./sigilo iniciar',
    );
  } else {
    const result = verifySignedDirectory(
      readJson(paths.directory, 'datos/directory.json'),
      pkg.trust,
      {
        today: todayOf(ctx),
      },
    );
    if (!result.valid) {
      screen.fail(
        `El directorio de datos/ no verifica (${result.reason}).`,
        './sigilo directorio actualizar',
      );
    } else {
      const node = findNode(result.directory, record.nodeId);
      const keys = KeysFileSchema.safeParse(readJson(paths.keys, 'datos/keys.json'));
      const isOwn =
        node !== undefined &&
        keys.success &&
        node.signingPublicKey === keys.data.publicKeys.server.signingPublicKey;
      if (isOwn) {
        const until = result.directory.validUntil;
        screen.ok(
          `Directorio versión ${result.directory.serial}${until === undefined ? '' : ` vigente hasta el ${until}`}; tu nodo aparece con tus llaves`,
        );
      } else {
        screen.fail('Tu nodo no aparece en el directorio con tus llaves.', 'llama a la SESNA.');
      }
    }
  }
  const panelUrl = ctx.env.SIGILO_DIAG_PANEL_URL || 'http://nodo:8081';
  const served = await getJson(ctx, `${panelUrl}${WEB_CONFIG_PATH}`);
  if (served === null) {
    screen.warn(
      `No pude consultar ${panelUrl}${WEB_CONFIG_PATH}.`,
      '¿está arriba el nodo? ./sigilo iniciar',
    );
  } else {
    const config = WebRuntimeConfigSchema.safeParse(served.body);
    const keys = KeysFileSchema.safeParse(readJson(paths.keys, 'datos/keys.json'));
    const sameRoot =
      config.success &&
      config.data.networkTrust !== null &&
      networkFingerprint(config.data.networkTrust) === networkFingerprint(pkg.trust);
    const sameKeys =
      config.success &&
      keys.success &&
      config.data.pinnedKeys.server.signingPublicKey ===
        keys.data.publicKeys.server.signingPublicKey &&
      config.data.pinnedKeys.authority.keyId === keys.data.publicKeys.authority.keyId;
    if (sameRoot && sameKeys) {
      screen.ok(`La raíz y las llaves que sirve tu web (${WEB_CONFIG_PATH}) son las de red.json`);
    } else {
      screen.fail(
        `La web no sirve la raíz o las llaves de este nodo (${WEB_CONFIG_PATH}, estatus ${served.status}).`,
        './sigilo iniciar',
      );
    }
  }
  const redUrl = ctx.env.SIGILO_DIAG_RED_URL || 'http://nodo:8080';
  const health = await getJson(ctx, `${redUrl}${NETWORK_ROUTES.nodeHealth}`);
  if (health === null || health.status !== 200) {
    screen.fail(`El nodo no responde su salud en ${redUrl}.`, './sigilo registros');
  } else {
    screen.ok('El nodo responde su salud');
  }

  screen.title('HTTPS');
  if (hasProxyMode(record.tls)) {
    screen.line(
      '  Proxy propio: revisa que no registre IP y borre X-Forwarded-For (docs/seguridad-produccion.md).',
    );
  }
  const publicKeys = await getJson(ctx, `https://${record.dominio}/api/v1/keys`);
  if (publicKeys === null) {
    screen.warn(
      `https://${record.dominio} no responde desde este equipo.`,
      'puede ser NAT de regreso; confírmalo en la vista de la SESNA (abajo) o desde fuera.',
    );
  } else {
    const hsts = /max-age=(\d+)/u.exec(publicKeys.headers.get('Strict-Transport-Security') ?? '');
    if (hsts?.[1] !== undefined && Number(hsts[1]) >= MIN_HSTS_MAX_AGE_SECONDS) {
      screen.ok(`https://${record.dominio} responde; HSTS de un año`);
    } else {
      screen.warn(
        `https://${record.dominio} responde sin HSTS de un año.`,
        'SIGILO_HTTPS=1 en config/nodo.env.',
      );
    }
  }

  screen.title('Vista desde la SESNA');
  const sesna = await getJson(ctx, `${pkg.ventanillaUrl}${NETWORK_ROUTES.networkHealth}`);
  const view = sesna === null ? null : NetworkHealthSchema.safeParse(sesna.body);
  const own =
    view?.success === true
      ? view.data.nodes.find((item) => item.nodeId === record.nodeId)
      : undefined;
  if (own === undefined) {
    screen.warn(
      'La ventanilla no reporta tu nodo todavía.',
      'espera unos minutos después de iniciar.',
    );
  } else if (own.deliverable) {
    screen.ok(`Arriba, registrado, recibe denuncias (versión ${own.softwareVersion ?? '¿?'})`);
  } else {
    const minimum = view?.success === true ? view.data.minimumSoftwareVersion : null;
    const reason =
      own.warning === 'below-minimum-version'
        ? `La SESNA no te entrega denuncias: versión menor a la mínima ${minimum ?? ''}.`
        : `La SESNA no te entrega denuncias (${own.warning ?? own.status}).`;
    screen.fail(
      reason,
      own.warning === 'below-minimum-version'
        ? './sigilo actualizar'
        : 'revisa la salida a 443 y la hora del equipo.',
    );
  }
}

function hasProxyMode(tls: string): boolean {
  return tls === 'proxy';
}

function checkBackups(ctx: Context): void {
  const { screen } = ctx;
  const paths = nodePaths(ctx);
  screen.title('Respaldos');
  const files = existsSync(paths.backups)
    ? readdirSync(paths.backups).filter((name) => name.endsWith('.respaldo'))
    : [];
  const newest = files
    .map((name) => statSync(join(paths.backups, name)).mtimeMs)
    .reduce((left, right) => Math.max(left, right), 0);
  if (newest === 0) {
    screen.warn('No hay respaldos.', './sigilo respaldar');
    return;
  }
  const days = Math.max(0, Math.floor((ctx.now().getTime() - newest) / 86_400_000));
  if (days > BACKUP_MAX_AGE_DAYS) {
    screen.warn(`Último respaldo hace ${days} días.`, './sigilo respaldar');
  } else {
    screen.ok(`Último respaldo hace ${days} días`);
  }
}

/** Corre el diagnóstico. Devuelve 0, 1 (avisos) o 2 (problemas). */
export async function diagnose(ctx: Context): Promise<number> {
  const { screen } = ctx;
  const record = readInstallRecord(ctx);
  screen.line(`Diagnóstico del nodo ${record.nodeId} (versión ${ctx.version})`);
  checkHost(ctx);
  await checkNetwork(ctx);
  checkBackups(ctx);
  const { warnings, problems } = screen.counts();
  const detail = join(nodePaths(ctx).output, `diagnostico-${todayOf(ctx)}.txt`);
  screen.line('');
  screen.line(
    `Resultado: ${problems} ${problems === 1 ? 'problema' : 'problemas'}, ${warnings} ${warnings === 1 ? 'aviso' : 'avisos'}. Detalle para soporte: salida/diagnostico-${todayOf(ctx)}.txt`,
  );
  writeText(detail, screen.transcript(), 0o644);
  return problems > 0 ? 2 : warnings > 0 ? 1 : 0;
}
