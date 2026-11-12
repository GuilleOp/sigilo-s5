// Genera llaves sintéticas para toda la red de demostración (operación, nodos Querétaro, Federal y
// Estado Ejemplo, sus autoridades con el buzón general de cada nodo, tres testigos y el evaluador
// OPRF), firma y cofirma el directorio (con la tabla de funciones de cada nodo, firmada por el nodo)
// y la llave del evaluador, arma las cuentas individuales de cada nodo, la raíz de confianza de la
// ventanilla única que sirve el enrutador y deja listo `docker compose`. No hay nodo común.
// Todo se escribe en `.red-demo/`, que no se versiona. Uso: npm run red:demo [-- --force]
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { AuthorityDemoKey, KeysFile, SupervisorDemoKey } from '@sigilo/contracts';
import {
  buildPublicKeySet,
  generateBoxKeyPair,
  generateSigningKeyPair,
  keyIdFor,
  randomBytes,
  toBase64Url,
  toDayDate,
} from '@sigilo/core';
import type { KeyPair } from '@sigilo/core';
import { buildEvaluatorKey, generateEvaluatorKeyPair } from '@sigilo/corroboracion';
import {
  DEMO_AUTHORITY_IDS,
  DEMO_INBOX_AUTHORITY_IDS,
  DEMO_NODE_IDS,
  DEMO_WITNESS_IDS,
  buildDemoDirectory,
  cosignDirectory,
  demoWitnessPrivateKey,
  generateDemoNetworkKeys,
  signDirectory,
  trustAnchorFromDirectory,
  verifySignedDirectory,
} from '@sigilo/red';
import type { DemoAuthorityId, DemoNetworkKeys, DemoNodeId } from '@sigilo/red';
import { ACCOUNTS_FILE_NAME } from '../apps/server/src/config.ts';
import { createAuthorityRegistry } from '../apps/server/src/security/authority-registry.ts';
import { buildDemoAccounts } from '../apps/server/src/security/demo-accounts.ts';
import type { DemoAccountsNode } from '../apps/server/src/security/demo-accounts.ts';
import {
  OAUTH_CLIENTS_FILE_NAME,
  clientSecretDigest,
} from '../apps/server/src/network/oauth-server.ts';
import { hashPassword } from '../apps/server/src/security/passwords.ts';
import { NODE_CREDENTIALS_FILE_NAME } from '../apps/enrutador/src/oauth/node-credentials.ts';
import {
  parseAuthorityDemoKey,
  parseKeysFile,
  parseSupervisorDemoKey,
} from '../apps/server/src/keys-file.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.env.SIGILO_RED_DEMO_DIR || join(ROOT, '.red-demo'));

/** Origen público de cada nodo: el puerto que publica `compose.yaml` en 127.0.0.1. */
const NODE_PUBLIC_URLS: Record<DemoNodeId, string> = {
  'node.queretaro': 'http://127.0.0.1:8781',
  'node.federal': 'http://127.0.0.1:8782',
  'node.ejemplo': 'http://127.0.0.1:8783',
};

/** Orígenes públicos del evaluador y del índice (los que publica `compose.yaml`). */
const EVALUATOR_PUBLIC_URL = 'http://127.0.0.1:8791';
const INDEX_PUBLIC_URL = 'http://127.0.0.1:8792';

/** Carpeta de cada nodo dentro de `.red-demo/nodos/` (también el nombre de sus cuentas). */
const NODE_DIRS: Record<DemoNodeId, DemoAccountsNode> = {
  'node.queretaro': 'queretaro',
  'node.federal': 'federal',
  'node.ejemplo': 'ejemplo',
};

/** Supervisora (segunda llave) de cada nodo, si tiene. */
const NODE_SUPERVISOR: Record<DemoNodeId, DemoAuthorityId | null> = {
  'node.queretaro': null,
  'node.federal': 'authority.oversight-federal',
  'node.ejemplo': null,
};

function writeFile(path: string, content: string, mode: number): void {
  // Seguridad: los directorios con llaves privadas solo los recorre su dueño.
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
}

function writeJson(path: string, value: unknown, mode = 0o600): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}

function demoKey(box: KeyPair, signing: KeyPair): AuthorityDemoKey {
  return {
    version: 1,
    keyId: keyIdFor(box.publicKey),
    boxPublicKey: toBase64Url(box.publicKey),
    boxPrivateKey: toBase64Url(box.privateKey),
    signingPublicKey: toBase64Url(signing.publicKey),
    signingPrivateKey: toBase64Url(signing.privateKey),
  };
}

/**
 * `keys.json` del servidor de referencia: su llave de firma es la del nodo en el directorio, la de
 * autoridad es la del buzón general del nodo (la misma que publica el directorio, papel `inbox`) y
 * la supervisora es la del directorio. Las demás autoridades del nodo usan sus llaves del
 * directorio verificado.
 */
function nodeKeysFile(
  keys: DemoNetworkKeys,
  nodeId: DemoNodeId,
  inbox: { box: KeyPair; signing: KeyPair },
): KeysFile {
  const supervisor = NODE_SUPERVISOR[nodeId];
  const signing = keys.nodes[nodeId].signing;
  return {
    version: 1,
    publicKeys: buildPublicKeySet({
      serverSigningPublicKey: signing.publicKey,
      authorityBoxPublicKey: inbox.box.publicKey,
      authoritySigningPublicKey: inbox.signing.publicKey,
      ...(supervisor === null
        ? {}
        : { supervisorBoxPublicKey: keys.authorities[supervisor].box.publicKey }),
    }),
    server: { signingPrivateKey: toBase64Url(signing.privateKey) },
  };
}

function display(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

/** Variables del nodo en compose: red, fuentes sintéticas, índice y reloj de demostración. */
function nodeEnv(nodeId: DemoNodeId, dayZero: string): string {
  return [
    '# Generado por npm run red:demo. No se versiona. Datos sintéticos de demostración.',
    `SIGILO_NODE_ID=${nodeId}`,
    'SIGILO_ROUTER_URL=http://enrutador:8790',
    'SIGILO_CORROBORATION_INDEX_URL=http://indice:8792',
    'SIGILO_PDN_SOURCES=synthetic',
    'SIGILO_DEMO=1',
    `SIGILO_DEMO_DAY_ZERO=${dayZero}`,
    '# Reloj simulado de la demostración (npm run demo:seed lo adelanta). Solo para la demo.',
    'NODE_ENV=development',
    'SIGILO_E2E=1',
    'SIGILO_TEST_CLOCK_FILE=/reloj/desfase',
    '',
  ].join('\n');
}

/**
 * Credenciales OAuth 2.0 que cada nodo (proveedor, como en las APIs de la PDN) entrega a la SESNA
 * (cliente): el nodo guarda solo digestos en `oauth-clients.json` y la SESNA los secretos en claro
 * en `enrutador/node-credentials.json`. Todo con permisos 0600.
 */
function writeOAuthCredentials(routerDir: string, nodeDataDirs: Record<DemoNodeId, string>): void {
  const credentials: Record<string, unknown> = {};
  for (const nodeId of DEMO_NODE_IDS) {
    const clientSecret = toBase64Url(randomBytes(32));
    const password = toBase64Url(randomBytes(24));
    const username = 'sesna.pdn';
    writeJson(join(nodeDataDirs[nodeId], OAUTH_CLIENTS_FILE_NAME), {
      version: 1,
      clients: [
        {
          clientId: 'sesna',
          clientSecretDigest: clientSecretDigest(clientSecret),
          scopes: ['sesna:entregas', 'sesna:estadisticas', 'sesna:salud'],
          grantTypes: ['client_credentials', 'password', 'refresh_token'],
          user: { username, passwordHash: hashPassword(password) },
        },
      ],
    });
    credentials[nodeId] = {
      clientId: 'sesna',
      clientSecret,
      grantType: 'client_credentials',
      username,
      password,
    };
  }
  writeJson(join(routerDir, NODE_CREDENTIALS_FILE_NAME), { version: 1, nodes: credentials });
}

function main(): void {
  if (existsSync(OUT)) {
    if (!process.argv.includes('--force')) {
      console.error(
        `Ya existe ${display(OUT)}. Usa --force para borrarlo (incluidas las bases de la demo) y generar todo de nuevo.`,
      );
      process.exit(1);
    }
    rmSync(OUT, { recursive: true, force: true });
  }
  const dayZero = toDayDate(new Date());
  const keys = generateDemoNetworkKeys();
  // Evaluador OPRF: su llave pública va en el directorio; la privada solo en su carpeta.
  const evaluatorKeyPair = generateEvaluatorKeyPair();
  const evaluatorSigning = randomBytes(32);
  const evaluator = buildEvaluatorKey({
    keyPair: evaluatorKeyPair,
    epoch: 1,
    signingPrivateKey: evaluatorSigning,
    validFrom: dayZero,
  });
  const directory = buildDemoDirectory(keys, {
    issuedOn: dayZero,
    baseUrls: NODE_PUBLIC_URLS,
    corroboration: { evaluator, evaluatorUrl: EVALUATOR_PUBLIC_URL, indexUrl: INDEX_PUBLIC_URL },
  });
  // Ceremonia sintética: en la operación real cada testigo cofirma con su llave, por separado.
  let signed = signDirectory(directory, keys.operator.privateKey);
  for (const id of DEMO_WITNESS_IDS) {
    signed = cosignDirectory(signed, id, demoWitnessPrivateKey(keys, id));
  }
  const trust = trustAnchorFromDirectory(directory);
  const check = verifySignedDirectory(signed, trust);
  if (!check.valid) throw new Error(`El directorio generado no verifica (${check.reason}).`);

  const routerDir = join(OUT, 'enrutador');
  writeJson(join(routerDir, 'directory.json'), signed, 0o644);
  writeJson(join(routerDir, 'trust.json'), trust, 0o644);
  writeJson(join(routerDir, 'operator-key.json'), {
    version: 1,
    keyId: keyIdFor(keys.operator.publicKey),
    signingPrivateKey: toBase64Url(keys.operator.privateKey),
  });

  writeJson(join(OUT, 'evaluador', 'evaluator-key.json'), {
    version: 1,
    epoch: 1,
    validFrom: dayZero,
    oprfSecretKey: toBase64Url(evaluatorKeyPair.secretKey),
    signingPrivateKey: toBase64Url(evaluatorSigning),
  });
  writeJson(join(OUT, 'indice', 'directory.json'), signed, 0o644);
  writeJson(join(OUT, 'indice', 'trust.json'), trust, 0o644);
  // Reloj simulado común de los nodos: desfase en milisegundos sobre el reloj real.
  writeFile(join(OUT, 'reloj', 'desfase'), '0\n', 0o600);

  // Secreto del buzón de cada nodo, compartido con el enrutador (HMAC de cada reenvío).
  const relaySecrets = Object.fromEntries(
    DEMO_NODE_IDS.map((nodeId) => [nodeId, toBase64Url(randomBytes(32))]),
  ) as Record<DemoNodeId, string>;
  writeJson(join(routerDir, 'relay-secrets.json'), { version: 1, secrets: relaySecrets });

  for (const nodeId of DEMO_NODE_IDS) {
    const nodeDir = join(OUT, 'nodos', NODE_DIRS[nodeId]);
    const dataDir = join(nodeDir, 'data');
    // El buzón general está en el directorio: su llave en `keys.json` es la publicada.
    const inbox = keys.authorities[DEMO_INBOX_AUTHORITY_IDS[nodeId]];
    const keysFile = nodeKeysFile(keys, nodeId, inbox);
    const inboxKey = demoKey(inbox.box, inbox.signing);
    // Se valida con el mismo código con el que arranca el servidor.
    parseKeysFile(keysFile);
    parseAuthorityDemoKey(inboxKey, keysFile.publicKeys);
    writeJson(join(dataDir, 'keys.json'), keysFile);
    writeJson(join(dataDir, 'authority-demo-key.json'), inboxKey);
    const supervisor = NODE_SUPERVISOR[nodeId];
    if (supervisor !== null) {
      const box = keys.authorities[supervisor].box;
      const supervisorKey: SupervisorDemoKey = {
        version: 1,
        keyId: keyIdFor(box.publicKey),
        boxPublicKey: toBase64Url(box.publicKey),
        boxPrivateKey: toBase64Url(box.privateKey),
      };
      parseSupervisorDemoKey(supervisorKey, keysFile.publicKeys);
      writeJson(join(dataDir, 'supervisor-demo-key.json'), supervisorKey);
    }
    // Llave X25519 del nodo para abrir los sobres del enrutador, directorio y raíz de confianza.
    writeJson(join(dataDir, 'red-node-key.json'), {
      version: 1,
      nodeId,
      boxKeyId: keyIdFor(keys.nodes[nodeId].box.publicKey),
      boxPrivateKey: toBase64Url(keys.nodes[nodeId].box.privateKey),
    });
    writeJson(join(dataDir, 'relay-secret.json'), {
      version: 1,
      nodeId,
      secret: relaySecrets[nodeId],
    });
    writeJson(join(dataDir, 'directory.json'), signed, 0o644);
    writeJson(join(dataDir, 'network-trust.json'), trust, 0o644);
    // Cuentas individuales del nodo (solo digestos) y sus credenciales sintéticas en claro.
    const accounts = buildDemoAccounts({ node: NODE_DIRS[nodeId] });
    createAuthorityRegistry(accounts.file);
    writeJson(join(dataDir, ACCOUNTS_FILE_NAME), accounts.file);
    writeJson(join(nodeDir, 'credenciales.json'), {
      aviso: 'Credenciales sintéticas de la demostración. No se versionan.',
      credenciales: accounts.credentials,
    });
    // Llaves públicas que se fijan en la web de este nodo al construir su imagen.
    writeJson(join(nodeDir, 'web', 'pinned-keys.json'), keysFile.publicKeys, 0o644);
    // H10: la web fija el serial mínimo del directorio que conoce; una copia anterior no verifica.
    writeJson(
      join(nodeDir, 'web', 'network-trust.json'),
      { ...trust, minDirectorySerial: directory.serial },
      0o644,
    );
    writeFile(join(nodeDir, 'node.env'), nodeEnv(nodeId, dayZero), 0o600);
  }

  writeOAuthCredentials(
    routerDir,
    Object.fromEntries(
      DEMO_NODE_IDS.map((nodeId) => [nodeId, join(OUT, 'nodos', NODE_DIRS[nodeId], 'data')]),
    ) as Record<DemoNodeId, string>,
  );
  // Ventanilla única (la sirve el enrutador): fija la raíz de confianza de la red. Sus llaves
  // «fijadas» de un solo nodo son de relleno, sin parte privada en ningún lado: la ventanilla no
  // guarda denuncias y siempre envía por la red; si algo intentara enviarle directo, no coincidiría.
  const filler = generateBoxKeyPair();
  const fillerSigning = generateSigningKeyPair();
  writeJson(
    join(OUT, 'ventanilla', 'web', 'pinned-keys.json'),
    buildPublicKeySet({
      serverSigningPublicKey: fillerSigning.publicKey,
      authorityBoxPublicKey: filler.publicKey,
      authoritySigningPublicKey: fillerSigning.publicKey,
    }),
    0o644,
  );
  writeJson(
    join(OUT, 'ventanilla', 'web', 'network-trust.json'),
    { ...trust, minDirectorySerial: directory.serial },
    0o644,
  );

  for (const id of DEMO_AUTHORITY_IDS) {
    const { box, signing } = keys.authorities[id];
    writeJson(join(OUT, 'autoridades', `${id}.json`), demoKey(box, signing));
  }

  // Los testigos observadores corren como proceso aparte; el nodo Querétaro cofirma por sí mismo.
  for (const id of DEMO_WITNESS_IDS.filter((item) => !item.startsWith('node.'))) {
    const privateKey = demoWitnessPrivateKey(keys, id);
    const witness = trust.witnesses.find((item) => item.id === id);
    writeJson(join(OUT, 'testigos', id, 'witness-key.json'), {
      version: 1,
      witnessId: id,
      keyId: witness?.keyId,
      signingPrivateKey: toBase64Url(privateKey),
    });
    writeJson(join(OUT, 'testigos', id, 'trust.json'), trust, 0o644);
  }

  console.log(`Red de demostración generada en ${display(OUT)} (datos sintéticos).`);
  console.log(
    `- Directorio versión ${directory.serial}, cofirmado por ${check.witnesses.join(', ')}, con la llave del evaluador.`,
  );
  console.log(
    '- Llaves privadas con permisos 0600; nada de esto se versiona ni entra a las imágenes.',
  );
  console.log('Siguiente paso: docker compose build && docker compose up -d');
  // Los contenedores corren con SIGILO_UID (1000 por omisión). En Linux el dueño de .red-demo/ debe
  // coincidir: el nodo solo acepta un reloj propio y escribe sus bases en carpetas 0700.
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === 0) {
    console.warn(
      '  Atención: generaste la red como root. Los contenedores no corren como root; genera la red con un usuario normal.',
    );
  } else if (process.platform === 'linux' && uid !== undefined && uid !== 1000) {
    console.log(
      `  Tu UID es ${uid}: levanta la red con SIGILO_UID=${uid} SIGILO_GID=${gid ?? uid} docker compose up -d (npm run demo:todo ya lo hace).`,
    );
  }
  console.log('  Ventanilla única (SESNA, con el enrutador): http://127.0.0.1:8790/');
  console.log(
    '  Paneles: Querétaro http://127.0.0.1:8781/autoridad  ·  Federal http://127.0.0.1:8782/autoridad  ·  Estado Ejemplo http://127.0.0.1:8783/autoridad',
  );
  console.log(
    `  Cuentas del panel de cada nodo: ${display(join(OUT, 'nodos', '<nodo>', 'credenciales.json'))}.`,
  );
  console.log('  Escenario completo: npm run demo:seed');
}

main();
