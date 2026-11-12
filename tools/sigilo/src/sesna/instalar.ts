// `sigilo-sesna instalar` (una vez): llaves de la operación y de enlace, raíz de confianza con los
// testigos, `red.json` firmado y la configuración del enrutador, de compose y de Caddy. El
// enrutador arranca cuando se publica el primer directorio (con un nodo como mínimo).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DirectoryObserver, NetworkTrustAnchor, WebRuntimeConfig } from '@sigilo/contracts';
import {
  buildPublicKeySet,
  fromBase64Url,
  generateBoxKeyPair,
  generateSigningKeyPair,
  groupsOfFour,
  keyIdFor,
  randomBytes,
  sha256Hex,
  toBase64Url,
} from '@sigilo/core';
import {
  WitnessPublicFileSchema,
  encodePublicKey,
  keyIdMatches,
  networkFingerprint,
  signNetworkPackage,
} from '@sigilo/red';
import type { WitnessPublicFile } from '@sigilo/red';
import {
  CliError,
  ensureDir,
  flag,
  hasFlag,
  readJson,
  todayOf,
  writeJson,
  writeText,
} from '../base.ts';
import type { Context } from '../base.ts';
import {
  DEFAULT_REGISTRY,
  composeEnv,
  envFile,
  parseTlsMode,
  sesnaCaddyfile,
} from '../plantillas.ts';
import type { TlsMode } from '../plantillas.ts';
import { sesnaPaths } from './comun.ts';
import type { SesnaRecord } from './comun.ts';

const HOSTNAME_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const VERSION_PATTERN = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u;

/** Huella de un testigo: SHA-256 de su llave pública de firma, 32 hexadecimales. */
export function witnessFingerprint(signingPublicKey: string): string {
  return groupsOfFour(sha256Hex(fromBase64Url(signingPublicKey)).slice(0, 32));
}

function readWitnesses(directory: string): WitnessPublicFile[] {
  if (!existsSync(directory)) {
    throw new CliError(
      `No existe la carpeta de testigos ${directory}. Pide a cada testigo su archivo público.`,
    );
  }
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.publico.json'))
    .sort();
  if (files.length === 0)
    throw new CliError(`No hay archivos testigo-*.publico.json en ${directory}.`);
  return files.map((name) => {
    const parsed = WitnessPublicFileSchema.safeParse(readJson(join(directory, name), name));
    if (!parsed.success || !keyIdMatches(parsed.data.signingKeyId, parsed.data.signingPublicKey)) {
      throw new CliError(`${name} no es un archivo público de testigo válido.`);
    }
    return parsed.data;
  });
}

/** Corre la instalación de la SESNA. */
export async function installSesna(ctx: Context): Promise<number> {
  const { screen, answers } = ctx;
  const paths = sesnaPaths(ctx);
  if (existsSync(paths.operatorKey) && !hasFlag(ctx, 'desde-cero')) {
    throw new CliError(
      'Este equipo ya tiene la llave de la operación. No se reemplaza: cambiarla rompe la confianza de toda la red.',
    );
  }
  screen.line(
    `SIGILO · Instalación de la ventanilla única y del enrutador (SESNA, versión ${ctx.version})`,
  );
  screen.title('Paso 1 de 4 · Dirección');
  const domain = (
    await answers.ask({
      key: 'dominio',
      text: 'Dominio de la ventanilla (por ejemplo, denuncias.plataformadigitalnacional.org)',
      validate: (value) =>
        HOSTNAME_PATTERN.test(value.toLowerCase())
          ? null
          : 'Escribe solo el dominio, sin https://.',
    })
  ).toLowerCase();
  const tls = parseTlsMode(
    await answers.ask({
      key: 'tls',
      text: 'HTTPS: 1) automático · 2) certificado propio · 3) proxy existente',
      default: '1',
      validate: (value) => (parseTlsMode(value) === null ? 'Elige 1, 2 o 3.' : null),
    }),
  ) as TlsMode;
  const tlsEmail =
    tls === 'letsencrypt'
      ? await answers.ask({ key: 'correo-tls', text: 'Correo para avisos de Let’s Encrypt' })
      : null;
  const operator = await answers.ask({
    key: 'operacion',
    text: 'Nombre de quien opera la ventanilla',
    default: 'Secretaría Ejecutiva del Sistema Nacional Anticorrupción',
  });
  const networkName = await answers.ask({
    key: 'nombre-red',
    text: 'Nombre de la red',
    default: 'Red S5 de la Plataforma Digital Nacional',
  });

  screen.title('Paso 2 de 4 · Testigos');
  screen.line('  Los testigos cofirman cada versión del directorio. Cada uno crea su llave con:');
  screen.line('    ./sigilo testigo crear-llave   y te entrega testigo-<id>.publico.json');
  const witnessDir = flag(ctx, 'testigos') ?? paths.witnesses;
  const witnesses = readWitnesses(witnessDir);
  for (const witness of witnesses) {
    screen.line(
      `    ${witness.id.padEnd(30)} ${witness.nombre} · huella ${witnessFingerprint(witness.signingPublicKey)}`,
    );
  }
  const accepted =
    hasFlag(ctx, 'acepto-testigos') ||
    (await answers.confirm(
      'acepto-testigos',
      '¿Confirmaste cada huella por teléfono con su testigo?',
      false,
    ));
  if (!accepted) throw new CliError('Confirma la huella de cada testigo antes de seguir.');
  const threshold = Number(
    await answers.ask({
      key: 'umbral',
      text: `¿Cuántas cofirmas se exigen (m de ${witnesses.length})?`,
      default: String(Math.min(2, witnesses.length)),
      validate: (value) =>
        /^\d+$/u.test(value) && Number(value) >= 1 && Number(value) <= witnesses.length
          ? null
          : `Un número de 1 a ${witnesses.length}.`,
    }),
  );
  screen.title('Paso 3 de 4 · Versión mínima de los nodos');
  const minimum = await answers.ask({
    key: 'version-minima',
    text: 'Versión mínima del software de los nodos',
    default: ctx.version,
    validate: (value) => (VERSION_PATTERN.test(value) ? null : 'Forma mayor.menor.parche.'),
  });
  const indexUrl = flag(ctx, 'indice-url');

  screen.title('Paso 4 de 4 · Llaves');
  const operatorPair = generateSigningKeyPair();
  const linkPair = generateBoxKeyPair();
  const trust: NetworkTrustAnchor = {
    format: 1,
    operatorKeyId: keyIdFor(operatorPair.publicKey),
    operatorSigningPublicKey: toBase64Url(operatorPair.publicKey),
    threshold,
    witnesses: witnesses.map((witness) => ({
      id: witness.id,
      keyId: witness.signingKeyId,
      signingPublicKey: witness.signingPublicKey,
    })),
  };
  const observers: DirectoryObserver[] = witnesses.map((witness) => ({
    id: witness.id,
    name: witness.nombre,
    kind: witness.clase,
    signingKeyId: witness.signingKeyId,
    signingPublicKey: witness.signingPublicKey,
  }));
  const ventanillaUrl = `https://${domain}`;
  const link = encodePublicKey(linkPair.publicKey);
  const pkg = signNetworkPackage(
    {
      tipo: 'sigilo/paquete-de-red',
      v: 1,
      nombre: networkName,
      ventanillaUrl,
      trust,
      enlace: { keyId: link.keyId, boxPublicKey: link.publicKey },
      ...(indexUrl === undefined ? {} : { indiceUrl: indexUrl }),
      versionMinima: minimum,
      emitido: todayOf(ctx),
    },
    operatorPair.privateKey,
  );
  // La ventanilla no guarda denuncias: sus llaves «fijadas» de un solo nodo son de relleno, sin
  // parte privada en ningún lado; siempre envía por la red.
  const filler = generateSigningKeyPair();
  const webConfig: WebRuntimeConfig = {
    v: 1,
    pinnedKeys: buildPublicKeySet({
      serverSigningPublicKey: filler.publicKey,
      authorityBoxPublicKey: generateBoxKeyPair().publicKey,
      authoritySigningPublicKey: filler.publicKey,
    }),
    networkTrust: trust,
    ventanillaUrl,
  };
  const record: SesnaRecord = {
    v: 1,
    tipo: 'sesna',
    dominio: domain,
    operacion: operator,
    tls,
    instalado: todayOf(ctx),
    version: ctx.version,
  };
  ensureDir(paths.data);
  ensureDir(paths.keysDir);
  ensureDir(paths.config, 0o755);
  ensureDir(paths.tls);
  for (const directory of [paths.proposals, paths.cosignatures, paths.joins, paths.output]) {
    ensureDir(directory, 0o755);
  }
  writeJson(paths.operatorKey, {
    version: 1,
    keyId: trust.operatorKeyId,
    signingPrivateKey: toBase64Url(operatorPair.privateKey),
  });
  writeJson(paths.linkKey, {
    version: 1,
    keyId: link.keyId,
    boxPublicKey: link.publicKey,
    boxPrivateKey: toBase64Url(linkPair.privateKey),
  });
  writeJson(paths.trust, trust, 0o644);
  writeJson(paths.observers, { v: 1, observadores: observers }, 0o644);
  writeJson(paths.webConfig, webConfig, 0o644);
  writeJson(paths.network, pkg, 0o644);
  writeJson(paths.record, record, 0o644);
  writeText(
    paths.routerEnv,
    envFile('Generado por ./sigilo-sesna instalar. Lleva el token de operación: 0600.', {
      NODE_ENV: 'production',
      SIGILO_ROUTER_HOST: '0.0.0.0',
      SIGILO_ROUTER_HSTS_MAX_AGE: '31536000',
      SIGILO_ROUTER_MIN_NODE_VERSION: minimum,
      SIGILO_ROUTER_RELAY_AUTH: 'v2',
      SIGILO_ROUTER_OPERATION_TOKEN: toBase64Url(randomBytes(32)),
    }),
    0o600,
  );
  if (tls !== 'proxy') writeText(paths.caddyfile, sesnaCaddyfile(tls), 0o644);
  const registry = ctx.env.SIGILO_REGISTRO || DEFAULT_REGISTRY;
  writeText(
    paths.env,
    composeEnv({
      version: ctx.version,
      imageVariable: 'SIGILO_IMAGEN_ENRUTADOR',
      image: ctx.env.SIGILO_IMAGEN_ENRUTADOR || `${registry}/sigilo-enrutador:${ctx.version}`,
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
      tls,
      domain,
      tlsEmail,
      extra: {
        SIGILO_IMAGEN_EVALUADOR: `${registry}/sigilo-evaluador:${ctx.version}`,
        SIGILO_IMAGEN_INDICE: `${registry}/sigilo-indice:${ctx.version}`,
        SIGILO_PUERTO_ENRUTADOR: '127.0.0.1:8790',
      },
    }),
    0o644,
  );
  operatorPair.privateKey.fill(0);
  linkPair.privateKey.fill(0);
  screen.ok('Llave de la operación → datos/operator-key.json (respáldala fuera de línea)');
  screen.ok('Llave de enlace → llaves/enlace-key.json (fuera del volumen del enrutador)');
  screen.ok(`red.json firmado · raíz con ${threshold} de ${witnesses.length} testigos`);
  screen.ok(`config/enrutador.env${tls === 'proxy' ? '' : ', config/Caddyfile'} y .env`);
  screen.line('');
  screen.line('Publica la huella de la red en el oficio a los estados y en tu sitio:');
  screen.line(`        ${networkFingerprint(trust)}`);
  screen.line('Entrega red.json con la descarga del nodo: ./sigilo-sesna empaquetar');
  screen.line('El enrutador arranca cuando publiques el primer directorio (un nodo como mínimo).');
  return 0;
}
