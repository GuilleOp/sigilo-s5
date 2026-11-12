// Prueba clave del instalador, de punta a punta y sin Docker, en carpetas temporales: dos testigos
// crean su llave, la SESNA instala, el estado instala, la SESNA acepta la solicitud con la huella
// leída por teléfono, los testigos cofirman, la SESNA publica y el estado inicia. Después se cargan
// los archivos con el MISMO código con que arrancan el servidor y el enrutador, se comprueba que los
// secretos derivados coinciden (HMAC v2 del buzón y token OAuth por HTTP contra el nodo real) y
// que el diagnóstico sale en verde. Todo con datos sintéticos.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NETWORK_ROUTES,
  PDN_SCOPES,
  SignedAuthorityDirectorySchema,
  WEB_CONFIG_PATH,
} from '@sigilo/contracts';
import type { NetworkHealth } from '@sigilo/contracts';
import {
  createRelayNonceCache,
  networkFingerprint,
  relayAuthHeaderV2,
  verifyNetworkPackage,
  verifyRelayAuthHeader,
} from '@sigilo/red';
import type { FetchLike } from '@sigilo/red';
import { createApp } from '../../../apps/server/src/app.ts';
import { loadConfig, loadServerKeys } from '../../../apps/server/src/config.ts';
import { openDatabase } from '../../../apps/server/src/db/database.ts';
import { loadWebConfig } from '../../../apps/server/src/http/web-assets.ts';
import { loadNodeNetwork } from '../../../apps/server/src/network/network-context.ts';
import {
  createNodeOAuthServer,
  loadOAuthClients,
} from '../../../apps/server/src/network/oauth-server.ts';
import { loadAuthorityRegistry } from '../../../apps/server/src/security/authority-registry.ts';
import { loadNodeCalendar } from '../../../apps/server/src/services/calendar.ts';
import { createMemoryEvidenceStore } from '../../../apps/server/src/storage/evidence-store.ts';
import { loadRelaySecrets, loadRouterFiles } from '../../../apps/enrutador/src/config.ts';
import { openRouterDatabase } from '../../../apps/enrutador/src/database.ts';
import { loadDirectoryStore } from '../../../apps/enrutador/src/directory-store.ts';
import { createNationalLedgerService } from '../../../apps/enrutador/src/national-ledger-service.ts';
import { loadNodeCredentials } from '../../../apps/enrutador/src/oauth/node-credentials.ts';
import { createNodeTokenClient } from '../../../apps/enrutador/src/oauth/token-client.ts';
import { runProgram } from './programa.ts';
import type { ProgramOverrides } from './programa.ts';

const NOW = new Date('2026-11-12T16:00:00Z');
const VENTANILLA = 'https://ventanilla.ejemplo.invalid';
const NODE_DOMAIN = 'denuncias.oaxaca.ejemplo.invalid';
const PHRASE = 'ancla bambu cometa ciruela mapa trueno nube rio';

let root = '';
const dirs = { sesna: '', nodo: '', testigoA: '', testigoB: '' };

/** Corre el CLI sin teclado en `base` y devuelve el código y lo que escribió. */
async function run(
  base: string,
  argv: string[],
  overrides: Partial<ProgramOverrides> = {},
): Promise<{ code: number; text: string }> {
  let text = '';
  const code = await runProgram(argv, {
    base,
    env: { SIGILO_RESPALDO_SCRYPT_LOGN: '14', SIGILO_FRASE_RESPALDO: PHRASE },
    output: { write: (chunk) => void (text += chunk) },
    interactive: false,
    now: () => NOW,
    fetch: () => Promise.reject(new Error('sin red en las pruebas')),
    ...overrides,
  });
  return { code, text };
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'sigilo-flujo-'));
  for (const name of Object.keys(dirs) as (keyof typeof dirs)[]) {
    dirs[name] = join(root, name);
    mkdirSync(dirs[name], { mode: 0o700 });
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('instalación de punta a punta (sin Docker)', () => {
  let nodeFingerprintText = '';

  it('los testigos crean su llave y la SESNA instala la ventanilla', async () => {
    for (const [dir, id] of [
      [dirs.testigoA, 'observer.cpc-ficticio'],
      [dirs.testigoB, 'observer.universidad-ficticia'],
    ] as const) {
      const result = await run(dir, [
        'testigo',
        'crear-llave',
        '--id',
        id,
        '--nombre',
        `Institución ficticia ${id}`,
        '--clase',
        'cpc',
      ]);
      expect(result.code, result.text).toBe(0);
      const privateKey = join(dir, 'salida', `testigo-${id}.llave.json`);
      expect(statSync(privateKey).mode & 0o777).toBe(0o600);
      mkdirSync(join(dirs.sesna, 'testigos'), { recursive: true });
      copyFileSync(
        join(dir, 'salida', `testigo-${id}.publico.json`),
        join(dirs.sesna, 'testigos', `testigo-${id}.publico.json`),
      );
    }
    // Sin confirmar las huellas de los testigos no instala.
    const refused = await run(dirs.sesna, [
      'sesna',
      'instalar',
      '--dominio',
      'ventanilla.ejemplo.invalid',
      '--tls',
      '3',
    ]);
    expect(refused.code).toBe(1);
    const result = await run(dirs.sesna, [
      'sesna',
      'instalar',
      '--dominio',
      'ventanilla.ejemplo.invalid',
      '--tls',
      '3',
      '--acepto-testigos',
      '--umbral',
      '2',
    ]);
    expect(result.code, result.text).toBe(0);
    expect(result.text).toContain('Publica la huella de la red');
    const pkg = verifyNetworkPackage(readJsonFile(join(dirs.sesna, 'red.json')));
    expect(pkg?.ventanillaUrl).toBe(VENTANILLA);
    expect(statSync(join(dirs.sesna, 'datos', 'operator-key.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dirs.sesna, 'config', 'enrutador.env')).mode & 0o777).toBe(0o600);
    // La llave de enlace de la SESNA no entra al volumen del enrutador.
    expect(existsSync(join(dirs.sesna, 'llaves', 'enlace-key.json'))).toBe(true);
    expect(existsSync(join(dirs.sesna, 'datos', 'enlace-key.json'))).toBe(false);
  });

  it('el estado instala su nodo y obtiene una solicitud sin secretos y una huella', async () => {
    copyFileSync(join(dirs.sesna, 'red.json'), join(dirs.nodo, 'red.json'));
    const pkg = verifyNetworkPackage(readJsonFile(join(dirs.nodo, 'red.json')));
    if (pkg === null) throw new Error('red.json inválido');
    const answers = [
      '--estado',
      'oaxaca',
      '--institucion',
      'Secretaría Ficticia de la Contraloría de Oaxaca',
      '--dominio',
      NODE_DOMAIN,
      '--tls',
      '1',
      '--responsable',
      'Persona Ficticia Responsable',
      '--cargo',
      'Titular de TI',
      '--correo',
      'ti@oaxaca.ejemplo.invalid',
      '--telefono',
      '9510000000',
      '--sin-red',
    ];
    // Una huella de la red equivocada detiene la instalación sin escribir nada.
    const wrong = await run(dirs.nodo, ['instalar', ...answers, '--huella-red', '0000 0000']);
    expect(wrong.code).toBe(1);
    expect(existsSync(join(dirs.nodo, 'datos'))).toBe(false);
    const result = await run(dirs.nodo, [
      'instalar',
      ...answers,
      '--huella-red',
      networkFingerprint(pkg.trust),
    ]);
    expect(result.code, result.text).toBe(0);
    const match = /Huella del nodo:\s+([0-9a-f ]{39})/u.exec(result.text);
    nodeFingerprintText = match?.[1] ?? '';
    expect(nodeFingerprintText).toHaveLength(39);
    const request = readFileSync(join(dirs.nodo, 'salida', 'solicitud-alta-oaxaca.json'), 'utf8');
    // La solicitud no lleva ninguna llave privada ni secreto.
    expect(request).not.toMatch(/PrivateKey|"secret"|clientSecret|passwordHash/u);
    // La llave privada del buzón queda fuera del volumen del nodo.
    expect(existsSync(join(dirs.nodo, 'salida', 'llave-buzon-oaxaca.json'))).toBe(true);
    expect(readdirSync(join(dirs.nodo, 'datos'))).not.toContain('authority-demo-key.json');
    expect(statSync(join(dirs.nodo, 'datos')).mode & 0o777).toBe(0o700);
    const nodeEnv = readFileSync(join(dirs.nodo, 'config', 'nodo.env'), 'utf8');
    expect(nodeEnv).toContain('NODE_ENV=production');
    expect(nodeEnv).toContain('SIGILO_NODE_PROFILE=nodo');
    expect(nodeEnv).not.toMatch(/SIGILO_DEMO|SIGILO_E2E/u);
    expect(readFileSync(join(dirs.nodo, 'config', 'Caddyfile'), 'utf8')).not.toMatch(/\blog\b/u);
    expect(readFileSync(join(dirs.nodo, '.env'), 'utf8')).toContain('COMPOSE_PROFILES=tls');
    // Ya instalado, no se reinstala por accidente.
    expect((await run(dirs.nodo, ['instalar', ...answers])).code).toBe(1);
  });

  it('la SESNA acepta con la huella correcta, los testigos cofirman y la SESNA publica', async () => {
    const request = join(dirs.nodo, 'salida', 'solicitud-alta-oaxaca.json');
    const wrong = await run(dirs.sesna, ['sesna', 'aceptar', request, '--huella', '1111 2222']);
    expect(wrong.code).toBe(2);
    const accepted = await run(dirs.sesna, [
      'sesna',
      'aceptar',
      request,
      '--huella',
      nodeFingerprintText.toUpperCase(),
    ]);
    expect(accepted.code, accepted.text).toBe(0);
    expect(accepted.text).toContain('+ nodo node.oaxaca');
    const proposal = join(dirs.sesna, 'propuestas', 'directorio-propuesto-1.json');
    // Con una sola cofirma no alcanza el umbral (2 de 2).
    for (const [dir, id] of [
      [dirs.testigoA, 'observer.cpc-ficticio'],
      [dirs.testigoB, 'observer.universidad-ficticia'],
    ] as const) {
      const cosigned = await run(dir, [
        'testigo',
        'cofirmar',
        proposal,
        '--llave',
        join(dir, 'salida', `testigo-${id}.llave.json`),
        '--vigente',
        'ninguno',
        '--si',
      ]);
      expect(cosigned.code, cosigned.text).toBe(0);
      expect(cosigned.text).toContain('+ nodo node.oaxaca');
      mkdirSync(join(dirs.sesna, 'cofirmas'), { recursive: true });
      copyFileSync(
        join(dir, 'salida', `cofirma-${id}-1.json`),
        join(dirs.sesna, 'cofirmas', `cofirma-${id}-1.json`),
      );
      if (id === 'observer.cpc-ficticio') {
        const early = await run(dirs.sesna, ['sesna', 'publicar', proposal]);
        expect(early.code).toBe(2);
        expect(early.text).toContain('faltan cofirmas');
      }
    }
    const published = await run(dirs.sesna, ['sesna', 'publicar', proposal]);
    expect(published.code, published.text).toBe(0);
    expect(published.text).toContain('Avísale a node.oaxaca');
    expect(statSync(join(dirs.sesna, 'datos', 'relay-secrets.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dirs.sesna, 'datos', 'node-credentials.json')).mode & 0o777).toBe(0o600);
  });

  it('el estado inicia, los archivos cargan con el código real y los secretos coinciden', async () => {
    const directoryText = readFileSync(join(dirs.sesna, 'datos', 'directory.json'), 'utf8');
    const ventanilla: FetchLike = (input) =>
      String(input) === `${VENTANILLA}${NETWORK_ROUTES.directory}`
        ? Promise.resolve(new Response(directoryText, { status: 200 }))
        : Promise.resolve(new Response('{}', { status: 404 }));
    const started = await run(dirs.nodo, ['iniciar'], { fetch: ventanilla });
    expect(started.code, started.text).toBe(0);
    expect(started.text).toContain('node.oaxaca aparece con tus llaves');

    // El nodo, con el mismo código con que arranca el servidor.
    const env = {
      NODE_ENV: 'production',
      SIGILO_DATA_DIR: join(dirs.nodo, 'datos'),
      SIGILO_NODE_ID: 'node.oaxaca',
      SIGILO_ROUTER_URL: VENTANILLA,
    };
    const config = loadConfig(env);
    expect(config.profile).toBe('nodo');
    const keys = loadServerKeys(config.dataDir);
    const authorities = loadAuthorityRegistry(config.accountsFile);
    expect(authorities.inboxAuthorityId).toBe('authority.buzon-oaxaca');
    if (config.network === null) throw new Error('sin red');
    const network = loadNodeNetwork(config.network, ventanilla);
    const webConfig = loadWebConfig(config.webConfigFile);
    expect(webConfig?.networkTrust?.minDirectorySerial).toBe(1);
    const oauth = createNodeOAuthServer({
      issuer: network.nodeId,
      clients: loadOAuthClients(config.oauthClientsFile),
    });

    // El enrutador, con el mismo código con que arranca.
    const routerDir = join(dirs.sesna, 'datos');
    const files = loadRouterFiles(routerDir);
    const db = openRouterDatabase(join(root, 'enrutador.db'));
    const national = createNationalLedgerService({
      db,
      operatorPrivateKey: files.operatorPrivateKey,
    });
    const store = loadDirectoryStore(db, files.directory, files.trust, national, '2026-11-12');
    expect(store.directory().nodes.map((node) => node.id)).toEqual(['node.oaxaca']);
    const relaySecret = loadRelaySecrets(routerDir).get('node.oaxaca');
    expect(relaySecret).toEqual(network.relaySecret);
    if (relaySecret === undefined) throw new Error('sin secreto');

    // HMAC v2 del buzón: lo que firma el enrutador lo acepta el nodo.
    const body = '{"sintetico":true}';
    const header = relayAuthHeaderV2(relaySecret, body, NOW.getTime());
    expect(
      verifyRelayAuthHeader(network.relaySecret, body, header, {
        now: NOW.getTime(),
        nonces: createRelayNonceCache(),
        allowLegacy: false,
      }),
    ).toBe(true);

    // OAuth: el enrutador pide un token por HTTP al nodo real con el secreto derivado.
    const app = createApp({
      db: openDatabase(':memory:'),
      keys,
      evidenceStore: createMemoryEvidenceStore(),
      authorities,
      now: () => NOW,
      network,
      oauth,
      calendar: loadNodeCalendar(config.restDaysFile),
      exposedFronts: config.fronts,
      ...(webConfig === null ? {} : { webConfig }),
    });
    const toNode: FetchLike = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      return Promise.resolve(app.request(`${url.pathname}${url.search}`, init));
    };
    const tokens = createNodeTokenClient({
      credentials: loadNodeCredentials(routerDir),
      nodeUrl: (node) => node.baseUrl,
      fetch: toNode,
    });
    const node = store.directory().nodes[0];
    if (node === undefined) throw new Error('sin nodo');
    expect(await tokens.token(node, PDN_SCOPES.deliveries)).toMatch(/\S{20,}/u);
  });

  it('respalda y el diagnóstico sale en verde', async () => {
    const backup = await run(dirs.nodo, ['respaldar']);
    expect(backup.code, backup.text).toBe(0);
    const file = readdirSync(join(dirs.nodo, 'salida', 'respaldos')).find((name) =>
      name.endsWith('.respaldo'),
    );
    expect(file).toBeDefined();
    const verified = await run(dirs.nodo, [
      'respaldar',
      '--verificar',
      join(dirs.nodo, 'salida', 'respaldos', file ?? ''),
    ]);
    expect(verified.code, verified.text).toBe(0);
    expect(verified.text).toContain('datos/keys.json');
    const wrongPhrase = await run(
      dirs.nodo,
      ['respaldar', '--verificar', join(dirs.nodo, 'salida', 'respaldos', file ?? '')],
      { env: { SIGILO_FRASE_RESPALDO: 'otra frase que no es la del respaldo ficticio' } },
    );
    expect(wrongPhrase.code).toBe(1);

    // La llave del buzón ya se entregó a quien lo atiende: sale del servidor.
    rmSync(join(dirs.nodo, 'salida', 'llave-buzon-oaxaca.json'));
    const webConfig = readFileSync(join(dirs.nodo, 'datos', 'web-config.json'), 'utf8');
    const health: NetworkHealth = {
      v: 1,
      checkedAt: '2026-11-12T16:00Z',
      minimumSoftwareVersion: null,
      nodes: [
        {
          nodeId: 'node.oaxaca',
          name: 'Nodo estatal Oaxaca',
          status: 'up',
          softwareVersion: '1.0.1',
          standardVersion: '1.0.0',
          lastCheckAt: '2026-11-12T16:00Z',
          lastContactAt: '2026-11-12T16:00Z',
          registered: true,
          deliverable: true,
          warning: null,
          queued: null,
        },
      ],
    };
    const responses: Record<string, Response> = {
      [`http://nodo:8081${WEB_CONFIG_PATH}`]: new Response(webConfig, { status: 200 }),
      [`http://nodo:8080${NETWORK_ROUTES.nodeHealth}`]: new Response('{}', { status: 200 }),
      [`https://${NODE_DOMAIN}/api/v1/keys`]: new Response('{}', {
        status: 200,
        headers: { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' },
      }),
      [`${VENTANILLA}${NETWORK_ROUTES.networkHealth}`]: new Response(JSON.stringify(health), {
        status: 200,
      }),
    };
    const diagnosis = await run(dirs.nodo, ['diagnostico'], {
      fetch: (input) => {
        const response = responses[String(input)];
        return response === undefined
          ? Promise.reject(new Error('sin ruta'))
          : Promise.resolve(response);
      },
    });
    expect(diagnosis.text).not.toContain('✗');
    expect(diagnosis.text).not.toMatch(/^ {2}! /mu);
    expect(diagnosis.code, diagnosis.text).toBe(0);
    expect(existsSync(join(dirs.nodo, 'salida', 'diagnostico-2026-11-12.txt'))).toBe(true);
  });

  it('el diagnóstico marca una variable de demostración y una llave del buzón en datos/', async () => {
    const envPath = join(dirs.nodo, 'config', 'nodo.env');
    const original = readFileSync(envPath, 'utf8');
    writeFileSync(envPath, `${original}SIGILO_DEMO=1\n`);
    writeFileSync(join(dirs.nodo, 'datos', 'authority-demo-key.json'), '{}', { mode: 0o600 });
    const diagnosis = await run(dirs.nodo, ['diagnostico']);
    expect(diagnosis.code).toBe(2);
    expect(diagnosis.text).toContain('variables de demostración');
    expect(diagnosis.text).toContain('authority-demo-key.json');
    writeFileSync(envPath, original);
    rmSync(join(dirs.nodo, 'datos', 'authority-demo-key.json'));
  });

  it('cuenta nueva, tabla revisar y firmar, calendario y rotación del enlace', async () => {
    const account = await run(dirs.nodo, [
      'cuenta',
      'nueva',
      '--usuario',
      'persona.ficticia',
      '--funciones',
      'intake,investigation',
    ]);
    expect(account.code, account.text).toBe(0);
    expect(
      loadAuthorityRegistry(join(dirs.nodo, 'datos', 'authority-accounts.json')).findByUsername(
        'persona.ficticia',
      ),
    ).not.toBeNull();

    const csvPath = join(dirs.nodo, 'config', 'tabla-de-funciones.csv');
    writeFileSync(
      csvPath,
      `${readFileSync(csvPath, 'utf8')}resolucion,estatal;municipal,,grave,"institucion:Tribunal de Justicia Administrativa Ficticio de Oaxaca","LGRA, art. 12"\n`,
    );
    const review = await run(dirs.nodo, ['tabla', 'revisar']);
    expect(review.code, review.text).toBe(0);
    expect(review.text).toContain('Tribunal de Justicia Administrativa Ficticio de Oaxaca');
    const signed = await run(dirs.nodo, ['tabla', 'firmar']);
    expect(signed.code, signed.text).toBe(0);
    const tableFile = join(dirs.nodo, 'salida', 'tabla-de-funciones-oaxaca-v2.json');
    const accepted = await run(dirs.sesna, ['sesna', 'aceptar', tableFile]);
    expect(accepted.code, accepted.text).toBe(0);
    expect(accepted.text).toContain('v1 → v2');
    const proposal = SignedAuthorityDirectorySchema.parse(
      readJsonFile(join(dirs.sesna, 'propuestas', 'directorio-propuesto-2.json')),
    );
    expect(proposal.directory.previousDigest).not.toBe('0'.repeat(64));

    writeFileSync(
      join(dirs.nodo, 'config', 'dias-inhabiles.csv'),
      'fecha,nombre,fundamento\n2026-11-02,Día de Muertos,"Acuerdo ficticio 3/2026"\n',
    );
    const calendar = await run(dirs.nodo, ['calendario', 'revisar']);
    expect(calendar.code, calendar.text).toBe(0);
    expect(
      loadNodeCalendar(join(dirs.nodo, 'datos', 'dias-inhabiles.json')).published.locales,
    ).toHaveLength(1);

    const relayBefore = readJsonFile(join(dirs.nodo, 'datos', 'relay-secret.json'));
    const rotation = await run(dirs.nodo, ['rotar-llaves', '--enlace']);
    expect(rotation.code, rotation.text).toBe(0);
    const rotationFile = join(dirs.nodo, 'salida', 'rotacion-enlace-oaxaca-e2.json');
    const sesnaRotation = await run(dirs.sesna, ['sesna', 'aceptar', rotationFile]);
    expect(sesnaRotation.code, sesnaRotation.text).toBe(0);
    const applied = await run(dirs.nodo, ['rotar-llaves', '--enlace', '--aplicar']);
    expect(applied.code, applied.text).toBe(0);
    const relayAfter = readJsonFile(join(dirs.nodo, 'datos', 'relay-secret.json')) as {
      secret: string;
    };
    expect(relayAfter).not.toEqual(relayBefore);
    expect(loadRelaySecrets(join(dirs.sesna, 'datos')).get('node.oaxaca')).toEqual(
      Buffer.from(relayAfter.secret, 'base64url').length === 32
        ? new Uint8Array(Buffer.from(relayAfter.secret, 'base64url'))
        : null,
    );
  });

  it('repetir la rotación antes de aplicarla conserva la llave que ya aceptó la SESNA', async () => {
    const pendingPath = join(dirs.nodo, 'llaves', 'enlace-key.pendiente.json');
    const rotationFile = join(dirs.nodo, 'salida', 'rotacion-enlace-oaxaca-e3.json');
    const first = await run(dirs.nodo, ['rotar-llaves', '--enlace']);
    expect(first.code, first.text).toBe(0);
    const pending = readJsonFile(pendingPath);
    const sesnaRotation = await run(dirs.sesna, ['sesna', 'aceptar', rotationFile]);
    expect(sesnaRotation.code, sesnaRotation.text).toBe(0);
    // La persona no recuerda si la mandó y la corre otra vez: la llave pendiente es la misma.
    const again = await run(dirs.nodo, ['rotar-llaves', '--enlace']);
    expect(again.code, again.text).toBe(0);
    expect(readJsonFile(pendingPath)).toEqual(pending);
    // Y el archivo de rotación, firmado de nuevo, nombra la misma llave y la misma época.
    expect((readJsonFile(rotationFile) as { enlace: unknown }).enlace).toMatchObject({
      epoca: 3,
      keyId: (pending as { keyId: string }).keyId,
    });
    const applied = await run(dirs.nodo, ['rotar-llaves', '--enlace', '--aplicar']);
    expect(applied.code, applied.text).toBe(0);
    const relay = readJsonFile(join(dirs.nodo, 'datos', 'relay-secret.json')) as {
      secret: string;
    };
    // El nodo y la SESNA derivan el mismo secreto: el enlace sigue funcionando.
    expect(loadRelaySecrets(join(dirs.sesna, 'datos')).get('node.oaxaca')).toEqual(
      new Uint8Array(Buffer.from(relay.secret, 'base64url')),
    );
    const nothing = await run(dirs.nodo, ['rotar-llaves', '--enlace', '--aplicar']);
    expect(nothing.code).toBe(1);
    expect(nothing.text).toContain('No hay una rotación pendiente');
  });

  it('empaqueta la descarga del nodo con sus sumas', async () => {
    const result = await run(dirs.sesna, ['sesna', 'empaquetar']);
    expect(result.code, result.text).toBe(0);
    const folder = readdirSync(join(dirs.sesna, 'salida')).find((name) =>
      name.startsWith('sigilo-nodo-'),
    );
    const sums = readFileSync(join(dirs.sesna, 'salida', folder ?? '', 'SHA256SUMS'), 'utf8');
    for (const name of ['sigilo', 'compose.nodo.yaml', 'LEEME.txt', 'red.json']) {
      expect(sums).toContain(`  ${name}`);
    }
  });
});
