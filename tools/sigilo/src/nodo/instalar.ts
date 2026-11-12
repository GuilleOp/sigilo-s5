// `sigilo instalar`: prepara el nodo de un estado en unas 10 preguntas. Genera sus llaves, deriva
// los secretos de enlace con la SESNA (nada secreto viaja), firma la tabla de funciones mínima y la
// solicitud de alta, y deja la configuración de compose y de Caddy. Nada se escribe hasta el final.
import { existsSync, rmSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import {
  AuthorityAccountsFileSchema,
  NodeIdSchema,
  PDN_SCOPES,
  STATES,
  UsernameSchema,
} from '@sigilo/contracts';
import type {
  AuthorityAccountsFile,
  AuthorityDemoKey,
  DirectoryAuthority,
  DirectoryNode,
  FunctionTable,
  GovernmentLevel,
  KeysFile,
} from '@sigilo/contracts';
import {
  buildPublicKeySet,
  fromBase64Url,
  generateBoxKeyPair,
  generateReceiptPhrase,
  generateSigningKeyPair,
  keyIdFor,
  padlockFingerprint,
  randomBytes,
  toBase64Url,
  toHex,
} from '@sigilo/core';
import {
  deriveLinkSecrets,
  encodePublicKey,
  joinRequestFingerprint,
  networkFingerprint,
  sameFingerprint,
  signFunctionTable,
  signJoinRequest,
} from '@sigilo/red';
import { z } from 'zod';
import { clientSecretDigest } from '../../../../apps/server/src/network/oauth-server.ts';
import { createAuthorityRegistry } from '../../../../apps/server/src/security/authority-registry.ts';
import { hashPassword } from '../../../../apps/server/src/security/passwords.ts';
import { parseKeysFile } from '../../../../apps/server/src/keys-file.ts';
import {
  CliError,
  ensureDir,
  flag,
  hasFlag,
  readJson,
  slugify,
  todayOf,
  writeJson,
  writeText,
} from '../base.ts';
import type { Context } from '../base.ts';
import {
  DEFAULT_REGISTRY,
  composeEnv,
  envFile,
  nodeCaddyfile,
  parseTlsMode,
} from '../plantillas.ts';
import type { TlsMode } from '../plantillas.ts';
import { nodePaths, readNetworkPackage } from './comun.ts';
import type { InstallRecord, LinkKeyFile } from './comun.ts';
import { tableToCsv } from './tabla-csv.ts';

const HOSTNAME_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
/** El servidor acepta `node.<nombre>` con 2 a 40 caracteres. */
const SERVER_NODE_ID = /^node\.[a-z0-9-]{2,40}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Puertos del nodo dentro del contenedor (los publica el lanzador). */
const PANEL_PORT = 8788;
const PUBLIC_PANEL_PORT = 8081;

interface StateChoice {
  code: string | null;
  name: string;
  slug: string;
}

/** Busca la entidad por clave INEGI, por nombre o «federal». */
export function findStateChoice(value: string): StateChoice | null {
  const text = slugify(value);
  if (text === 'federal') return { code: null, name: 'Federal', slug: 'federal' };
  const state =
    STATES.find((item) => item.code === value.trim().padStart(2, '0')) ??
    STATES.find((item) => slugify(item.name) === text) ??
    STATES.find((item) => slugify(item.name).startsWith(text) && text.length >= 4);
  if (state === undefined) return null;
  return { code: state.code, name: state.name, slug: slugify(state.name) };
}

/** Contraseña legible de 6 palabras (unos 66 bits), para anotarla en papel. */
export function readablePassword(): string {
  return generateReceiptPhrase().words.slice(0, 6).join('-');
}

const PadlockSchema = z
  .object({ keyId: z.string(), boxPublicKey: z.string(), signingPublicKey: z.string() })
  .loose();

/** Llave del buzón general: la genera el instalador o llega como candado de «Crear mis llaves». */
function inboxKeys(ctx: Context): {
  keyId: string;
  boxPublicKey: string;
  signingPublicKey: string;
  privateFile: AuthorityDemoKey | null;
} {
  const padlockPath = flag(ctx, 'candado-buzon');
  if (padlockPath !== undefined) {
    const parsed = PadlockSchema.safeParse(readJson(padlockPath, 'el candado del buzón'));
    if (!parsed.success) throw new CliError('El candado del buzón no tiene el formato esperado.');
    const { keyId, boxPublicKey, signingPublicKey } = parsed.data;
    if ('boxPrivateKey' in parsed.data || 'signingPrivateKey' in parsed.data) {
      throw new CliError(
        'Ese archivo trae la llave privada. Entrega solo el candado (la parte pública).',
      );
    }
    if (keyIdFor(fromBase64Url(boxPublicKey)) !== keyId) {
      throw new CliError('El candado del buzón no corresponde a su identificador.');
    }
    return { keyId, boxPublicKey, signingPublicKey, privateFile: null };
  }
  const box = generateBoxKeyPair();
  const signing = generateSigningKeyPair();
  const keyId = keyIdFor(box.publicKey);
  const privateFile: AuthorityDemoKey = {
    version: 1,
    keyId,
    boxPublicKey: toBase64Url(box.publicKey),
    boxPrivateKey: toBase64Url(box.privateKey),
    signingPublicKey: toBase64Url(signing.publicKey),
    signingPrivateKey: toBase64Url(signing.privateKey),
  };
  box.privateKey.fill(0);
  signing.privateKey.fill(0);
  return {
    keyId,
    boxPublicKey: privateFile.boxPublicKey,
    signingPublicKey: privateFile.signingPublicKey,
    privateFile,
  };
}

/** Tabla de funciones mínima: el buzón general recibe y la institución opera el nodo. */
export function minimalFunctionTable(options: {
  nodeId: string;
  stateCode: string | null;
  inboxId: string;
  institution: string;
  issuedOn: string;
}): FunctionTable {
  const levels: GovernmentLevel[] =
    options.stateCode === null ? ['federal'] : ['estatal', 'municipal'];
  return {
    format: 1,
    nodeId: options.nodeId,
    stateCode: options.stateCode,
    version: 1,
    issuedOn: options.issuedOn,
    functions: {
      intake: [
        {
          governmentLevels: levels,
          entityIds: [],
          holder: { kind: 'authority', authorityId: options.inboxId },
          legalBasis: 'Bases de la PDN, arts. 56 y 58',
        },
      ],
      operation: [
        {
          governmentLevels: levels,
          entityIds: [],
          holder: { kind: 'institution', name: options.institution },
        },
      ],
      investigation: [],
      substantiation: [],
      resolution: [],
      supervision: [],
      prosecution: [],
      observer: [],
    },
  };
}

async function checkDns(ctx: Context, domain: string): Promise<void> {
  if (hasFlag(ctx, 'sin-red')) return;
  try {
    const addresses = await lookup(domain, { all: true });
    ctx.screen.ok(`${domain} apunta a ${addresses.map((item) => item.address).join(', ')}`);
  } catch {
    ctx.screen.warn(
      `${domain} todavía no resuelve en el DNS.`,
      'agrega el registro A (y AAAA si hay IPv6) hacia la IP pública de este equipo; puedes seguir y revisarlo con ./sigilo diagnostico.',
    );
  }
}

/** Corre la instalación. Devuelve el código de salida. */
export async function install(ctx: Context): Promise<number> {
  const { screen, answers } = ctx;
  const paths = nodePaths(ctx);
  if (existsSync(paths.keys) && !hasFlag(ctx, 'desde-cero')) {
    throw new CliError(
      'Este equipo ya tiene un nodo instalado. Usa ./sigilo diagnostico. Para empezar de cero: ./sigilo instalar --desde-cero (borra las llaves).',
    );
  }
  screen.line(`SIGILO · Instalación del nodo de tu estado (versión ${ctx.version})`);
  screen.line('Tarda unos 5 minutos. Nada se guarda hasta el final; puedes cancelar con Ctrl+C.');

  screen.title('Paso 1 de 5 · La red de la SESNA');
  const pkg = readNetworkPackage(paths.network);
  const fingerprint = networkFingerprint(pkg.trust);
  screen.line(`  Paquete de red: red.json · «${pkg.nombre}»`);
  screen.line(`  Ventanilla única: ${pkg.ventanillaUrl}`);
  screen.line(`  Huella de la red:  ${fingerprint}`);
  screen.line(
    '  Compárala con la huella del oficio de la SESNA (también está en su sitio oficial).',
  );
  const expected = flag(ctx, 'huella-red');
  const isSameNetwork =
    expected !== undefined
      ? sameFingerprint(expected, fingerprint)
      : await answers.confirm('acepto-huella-red', '¿Es la misma huella?', false);
  if (!isSameNetwork) {
    throw new CliError(
      'La huella de la red no coincide (o no la confirmaste). No sigas: pide a la SESNA la descarga oficial.',
    );
  }
  screen.ok('Huella de la red confirmada');

  screen.title('Paso 2 de 5 · Tu estado');
  const stateAnswer = await answers.ask({
    key: 'estado',
    text: '¿Qué estado opera este nodo? Escribe el nombre o la clave INEGI (o «federal»)',
    validate: (value) => (findStateChoice(value) === null ? 'No reconozco esa entidad.' : null),
  });
  const state = findStateChoice(stateAnswer) as StateChoice;
  screen.ok(`${state.code ?? '—'} · ${state.name}`);
  const institution = await answers.ask({
    key: 'institucion',
    text: 'Nombre oficial de la institución que opera el nodo',
    validate: (value) => (value.length > 300 ? 'Máximo 300 caracteres.' : null),
  });
  const nodeName = await answers.ask({
    key: 'nombre-nodo',
    text: 'Nombre del nodo',
    default: state.code === null ? 'Nodo Federal' : `Nodo estatal ${state.name}`,
    validate: (value) => (value.length > 200 ? 'Máximo 200 caracteres.' : null),
  });
  const nodeId = await answers.ask({
    key: 'id-nodo',
    text: 'Identificador del nodo',
    default: `node.${state.slug}`.slice(0, 45),
    validate: (value) =>
      NodeIdSchema.safeParse(value).success && SERVER_NODE_ID.test(value)
        ? null
        : 'Debe tener la forma node.<nombre> (minúsculas, dígitos y guiones).',
  });

  screen.title('Paso 3 de 5 · Dirección en internet');
  const domain = (
    await answers.ask({
      key: 'dominio',
      text: 'Dominio del nodo; debe apuntar ya a este equipo (por ejemplo, denuncias.oaxaca.gob.mx)',
      validate: (value) =>
        HOSTNAME_PATTERN.test(value.toLowerCase())
          ? null
          : 'Escribe solo el dominio, sin https:// ni rutas.',
    })
  ).toLowerCase();
  await checkDns(ctx, domain);
  screen.line('  ¿Cómo se publicará con HTTPS?');
  screen.line('    1) Automático (recomendado): Let’s Encrypt emite y renueva el certificado.');
  screen.line('       Necesita los puertos 80 y 443 abiertos a internet.');
  screen.line('    2) Con el certificado de mi institución (archivos .crt y .key).');
  screen.line('    3) Ya tengo un proxy o balanceador con HTTPS: publica el nodo en 127.0.0.1.');
  const tls = parseTlsMode(
    await answers.ask({
      key: 'tls',
      text: 'Elige 1, 2 o 3',
      default: '1',
      validate: (value) => (parseTlsMode(value) === null ? 'Elige 1, 2 o 3.' : null),
    }),
  ) as TlsMode;

  screen.title('Paso 4 de 5 · Contacto y cuentas');
  const contact = {
    institucion: institution,
    responsable: await answers.ask({ key: 'responsable', text: 'Persona responsable técnica' }),
    cargo: await answers.ask({ key: 'cargo', text: 'Cargo' }),
    correo: await answers.ask({
      key: 'correo',
      text: 'Correo institucional',
      validate: (value) => (EMAIL_PATTERN.test(value) ? null : 'Correo inválido.'),
    }),
    telefono: await answers.ask({
      key: 'telefono',
      text: 'Teléfono institucional (10 dígitos; la SESNA te llamará a un número oficial)',
      validate: (value) => (/^\d{10}$/u.test(value) ? null : 'Escribe 10 dígitos.'),
    }),
  };
  const tlsEmail =
    tls === 'letsencrypt'
      ? await answers.ask({
          key: 'correo-tls',
          text: 'Correo para avisos de Let’s Encrypt',
          default: contact.correo,
          validate: (value) => (EMAIL_PATTERN.test(value) ? null : 'Correo inválido.'),
        })
      : null;
  const usernameCheck = (value: string): string | null =>
    UsernameSchema.safeParse(value).success ? null : 'Minúsculas, dígitos, punto y guiones.';
  const operationUser = await answers.ask({
    key: 'usuario-operacion',
    text: 'Usuario de la cuenta de operación del panel',
    default: `operacion.${state.slug}`.slice(0, 64),
    validate: usernameCheck,
  });
  const inboxUser = await answers.ask({
    key: 'usuario-buzon',
    text: 'Usuario de la cuenta del buzón general',
    default: `buzon.${state.slug}`.slice(0, 64),
    validate: (value) =>
      usernameCheck(value) ??
      (value === operationUser ? 'Debe ser distinto del de operación.' : null),
  });

  screen.title('Paso 5 de 5 · Llaves y archivos');
  const today = todayOf(ctx);
  const slug = nodeId.slice('node.'.length);
  const inboxId = `authority.buzon-${slug}`;
  const nodeSigning = generateSigningKeyPair();
  const nodeBox = generateBoxKeyPair();
  const link = generateBoxKeyPair();
  const inbox = inboxKeys(ctx);
  const linkPublic = encodePublicKey(link.publicKey);
  const secrets = deriveLinkSecrets({
    ownPrivateKey: link.privateKey,
    peerPublicKey: fromBase64Url(pkg.enlace.boxPublicKey),
    nodeId,
    epoch: 1,
  });
  const signingPublic = encodePublicKey(nodeSigning.publicKey);
  const boxPublic = encodePublicKey(nodeBox.publicKey);
  const node: DirectoryNode = {
    id: nodeId,
    name: nodeName,
    baseUrl: `https://${domain}`,
    boxKeyId: boxPublic.keyId,
    boxPublicKey: boxPublic.publicKey,
    signingKeyId: signingPublic.keyId,
    signingPublicKey: signingPublic.publicKey,
  };
  const levels: GovernmentLevel[] = state.code === null ? ['federal'] : ['estatal', 'municipal'];
  const inboxEntry: DirectoryAuthority = {
    id: inboxId,
    name: `Buzón general del nodo ${state.name}`,
    nodeId,
    governmentLevel: state.code === null ? 'federal' : 'estatal',
    stateCode: state.code,
    role: 'inbox',
    competence: {
      governmentLevels: levels,
      stateCodes: state.code === null ? [] : [state.code],
      entityIds: [],
      laws: ['LGRA', 'CPF'],
    },
    keyId: inbox.keyId,
    boxPublicKey: inbox.boxPublicKey,
    signingPublicKey: inbox.signingPublicKey,
    supervisorId: null,
    validFrom: today,
    validUntil: null,
  };
  const table = minimalFunctionTable({
    nodeId,
    stateCode: state.code,
    inboxId,
    institution,
    issuedOn: today,
  });
  const signedTable = signFunctionTable(table, nodeSigning.privateKey);
  const request = signJoinRequest(
    {
      tipo: 'sigilo/solicitud-alta-nodo',
      v: 1,
      creada: today,
      software: ctx.version,
      nodo: node,
      buzon: inboxEntry,
      tablaDeFunciones: signedTable,
      enlace: { keyId: linkPublic.keyId, boxPublicKey: linkPublic.publicKey, epoca: 1 },
      contacto: contact,
    },
    nodeSigning.privateKey,
  );
  const keysFile: KeysFile = {
    version: 1,
    publicKeys: buildPublicKeySet({
      serverSigningPublicKey: nodeSigning.publicKey,
      authorityBoxPublicKey: fromBase64Url(inbox.boxPublicKey),
      authoritySigningPublicKey: fromBase64Url(inbox.signingPublicKey),
    }),
    server: { signingPrivateKey: toBase64Url(nodeSigning.privateKey) },
  };
  // Se valida con el mismo código con el que arranca el servidor.
  parseKeysFile(keysFile);
  const passwords = { operation: readablePassword(), inbox: readablePassword() };
  const accounts: AuthorityAccountsFile = AuthorityAccountsFileSchema.parse({
    version: 1,
    inboxAuthorityId: inboxId,
    authorities: [{ authorityId: inboxId, name: inboxEntry.name }],
    accounts: [
      {
        accountId: `acct-${toHex(randomBytes(8))}`,
        username: operationUser,
        authorityId: inboxId,
        functions: ['operation'],
        passwordHash: hashPassword(passwords.operation),
      },
      {
        accountId: `acct-${toHex(randomBytes(8))}`,
        username: inboxUser,
        authorityId: inboxId,
        functions: ['intake'],
        passwordHash: hashPassword(passwords.inbox),
      },
    ],
  });
  createAuthorityRegistry(accounts);
  const linkFile: LinkKeyFile = {
    version: 1,
    nodeId,
    epoca: 1,
    keyId: linkPublic.keyId,
    boxPublicKey: linkPublic.publicKey,
    boxPrivateKey: toBase64Url(link.privateKey),
  };
  const record: InstallRecord = {
    v: 1,
    tipo: 'nodo',
    nodeId,
    slug,
    estado: { code: state.code, name: state.name },
    institucion: institution,
    nombreNodo: nodeName,
    dominio: domain,
    tls,
    buzonId: inboxId,
    instalado: today,
    version: ctx.version,
  };

  // A partir de aquí se escribe. Con --desde-cero se borran antes las llaves y los datos.
  if (hasFlag(ctx, 'desde-cero')) {
    rmSync(paths.data, { recursive: true, force: true });
    rmSync(paths.keysDir, { recursive: true, force: true });
  }
  ensureDir(paths.data);
  ensureDir(paths.keysDir);
  ensureDir(paths.config, 0o755);
  ensureDir(paths.output, 0o700);
  ensureDir(paths.tls);
  writeJson(paths.keys, keysFile);
  writeJson(paths.nodeBoxKey, {
    version: 1,
    nodeId,
    boxKeyId: boxPublic.keyId,
    boxPrivateKey: toBase64Url(nodeBox.privateKey),
  });
  writeJson(paths.relaySecret, { version: 1, nodeId, secret: secrets.relaySecret });
  writeJson(paths.oauthClients, {
    version: 1,
    clients: [
      {
        clientId: 'sesna',
        clientSecretDigest: clientSecretDigest(secrets.oauthClientSecret),
        scopes: [PDN_SCOPES.deliveries, PDN_SCOPES.statistics, PDN_SCOPES.health],
        grantTypes: ['client_credentials'],
      },
    ],
  });
  writeJson(paths.accounts, accounts);
  writeJson(paths.trust, pkg.trust, 0o644);
  writeJson(paths.linkKey, linkFile);
  screen.ok('Llave de firma del nodo (Ed25519) y llave de red (X25519)');
  screen.ok('Llave de enlace con la SESNA (X25519); secretos del buzón y de OAuth derivados');
  const inboxKeyPath = `${paths.output}/llave-buzon-${slug}.json`;
  if (inbox.privateFile === null) {
    screen.ok(
      `Candado del buzón general recibido (huella ${padlockFingerprint(fromBase64Url(inbox.boxPublicKey), fromBase64Url(inbox.signingPublicKey))})`,
    );
  } else {
    // Seguridad: la llave del buzón NUNCA va en datos/ (el volumen del nodo): quien entre al
    // servidor leería los hechos de todo lo que llega al buzón.
    writeJson(inboxKeyPath, inbox.privateFile);
    screen.ok(`Llave del buzón general → salida/llave-buzon-${slug}.json (fuera del nodo)`);
  }
  writeText(paths.tableCsv, tableToCsv(table), 0o644);
  if (!existsSync(paths.restDaysCsv)) {
    writeText(paths.restDaysCsv, 'fecha,nombre,fundamento\n', 0o644);
  }
  screen.ok('Tabla de funciones mínima (buzón general y operación), firmada');
  screen.ok(`Cuentas «${operationUser}» (operación) y «${inboxUser}» (buzón general)`);
  writeText(
    paths.nodeEnv,
    envFile('Generado por ./sigilo instalar. Sin secretos ni variables de demostración.', {
      NODE_ENV: 'production',
      SIGILO_NODE_PROFILE: 'nodo',
      SIGILO_NODE_ID: nodeId,
      SIGILO_ROUTER_URL: pkg.ventanillaUrl,
      SIGILO_PANEL_PORT: String(PANEL_PORT),
      SIGILO_PUBLIC_PANEL_PORT: String(PUBLIC_PANEL_PORT),
      SIGILO_HTTPS: '1',
      SIGILO_RELAY_AUTH_LEGACY: '0',
      SIGILO_PDN_SOURCES: 'off',
      SIGILO_CORROBORATION_INDEX_URL: pkg.indiceUrl,
    }),
    0o644,
  );
  if (tls !== 'proxy') writeText(paths.caddyfile, nodeCaddyfile(tls), 0o644);
  const registry = ctx.env.SIGILO_REGISTRO || DEFAULT_REGISTRY;
  writeText(
    paths.env,
    composeEnv({
      version: ctx.version,
      imageVariable: 'SIGILO_IMAGEN_NODO',
      image: ctx.env.SIGILO_IMAGEN_NODO || `${registry}/sigilo-nodo:${ctx.version}`,
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
      tls,
      domain,
      tlsEmail,
      extra: {
        // Con proxy propio el nodo se publica en 127.0.0.1; con Caddy, solo dentro de compose.
        SIGILO_PUERTO_RED: '127.0.0.1:8080',
        SIGILO_PUERTO_PANEL: '127.0.0.1:8081',
        SIGILO_PANEL_IPS: 'private_ranges',
      },
    }),
    0o644,
  );
  writeJson(paths.record, record, 0o644);
  screen.ok(`config/nodo.env${tls === 'proxy' ? '' : ', config/Caddyfile'} y .env`);
  const requestPath = `${paths.output}/solicitud-alta-${slug}.json`;
  writeJson(requestPath, request, 0o644);
  screen.ok(`Solicitud firmada → salida/solicitud-alta-${slug}.json`);
  nodeSigning.privateKey.fill(0);
  nodeBox.privateKey.fill(0);
  link.privateKey.fill(0);

  screen.line('');
  screen.line('Listo. Ahora le toca a la SESNA.');
  screen.line('');
  screen.line(
    '  1. Envía a la SESNA este archivo (correo institucional u oficio con memoria USB):',
  );
  screen.line(`        salida/solicitud-alta-${slug}.json`);
  screen.line('     No tiene llaves privadas ni contraseñas; puede viajar por correo.');
  screen.line('');
  screen.line('  2. La SESNA te llamará para confirmar esta huella. Léela en voz alta:');
  screen.line(`        Huella del nodo:  ${joinRequestFingerprint(request)}`);
  screen.line('');
  screen.line('  3. Contraseñas del panel (no se vuelven a mostrar; anótalas):');
  screen.line(`        ${operationUser} · ${passwords.operation}`);
  screen.line(`        ${inboxUser} · ${passwords.inbox}`);
  screen.line('');
  if (inbox.privateFile !== null) {
    screen.line(
      '  4. Saca del servidor la llave del buzón general y entrégala a quien atenderá el buzón:',
    );
    screen.line(`        salida/llave-buzon-${slug}.json`);
    screen.line('     El servidor no la necesita. Después bórrala de aquí.');
    screen.line('');
  }
  screen.line('  5. Haz tu primer respaldo:        ./sigilo respaldar');
  screen.line('  6. Cuando la SESNA confirme:      ./sigilo iniciar');
  return 0;
}
