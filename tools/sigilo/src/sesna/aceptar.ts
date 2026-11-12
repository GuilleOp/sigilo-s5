// `sigilo-sesna aceptar <archivo>…`: convierte lo que llega de los estados en la versión siguiente
// del directorio, firmada por la operación y lista para los testigos. Acepta:
// - la solicitud de alta de un nodo (con la huella leída por teléfono),
// - la tabla de funciones nueva de un nodo (firmada por el nodo),
// - la entrada de una autoridad que exporta la bandeja «Solicitudes de alta» de un nodo,
// - la rotación de la llave de enlace de un nodo (no cambia el directorio: actualiza los secretos).
// Siempre muestra el resumen «Cambios del directorio N → N+1».
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DirectoryAuthoritySchema } from '@sigilo/contracts';
import type { AuthorityDirectory, NetworkTrustAnchor } from '@sigilo/contracts';
import {
  DIRECTORY_GENESIS_DIGEST,
  FunctionTableUpdateSchema,
  LinkRotationSchema,
  NodeJoinRequestSchema,
  directoryProblems,
  joinRequestFingerprint,
  sameFingerprint,
  signDirectory,
  verifyFunctionTableSignature,
  verifyJoinRequest,
  verifyLinkRotation,
} from '@sigilo/red';
import type { NodeLinkKey } from '@sigilo/red';
import { CliError, ensureDir, hasFlag, readJson, todayOf, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { directoryChanges } from '../resumen-cambios.ts';
import {
  ObserversFileSchema,
  readLinks,
  readOperatorKey,
  readPublished,
  readSesnaRecord,
  readTrust,
  sesnaPaths,
} from './comun.ts';
import { applyLinks } from './publicar.ts';

/** Directorio vacío de partida (antes del primer alta). */
function genesisBase(ctx: Context, trust: NetworkTrustAnchor): AuthorityDirectory {
  const record = readSesnaRecord(ctx);
  const observers = ObserversFileSchema.parse(
    readJson(sesnaPaths(ctx).observers, 'config/testigos.json'),
  );
  return {
    format: 1,
    serial: 0,
    issuedOn: todayOf(ctx),
    previousDigest: DIRECTORY_GENESIS_DIGEST,
    operator: {
      name: record.operacion,
      signingKeyId: trust.operatorKeyId,
      signingPublicKey: trust.operatorSigningPublicKey,
    },
    nodes: [],
    authorities: [],
    observers: observers.observadores,
    witnessPolicy: {
      threshold: trust.threshold,
      witnessIds: trust.witnesses.map((item) => item.id),
    },
    functionTables: [],
  };
}

/** Acepta los archivos dados. */
export async function accept(ctx: Context): Promise<number> {
  const { screen, answers } = ctx;
  const files = ctx.args.positional;
  if (files.length === 0) {
    throw new CliError('Uso: ./sigilo-sesna aceptar <solicitud-alta-…json> [más archivos]');
  }
  const paths = sesnaPaths(ctx);
  const trust = readTrust(ctx);
  const published = readPublished(ctx);
  const base = published?.directory ?? genesisBase(ctx, trust);
  let next: AuthorityDirectory = structuredClone(base);
  const pendingLinks: Record<string, NodeLinkKey> = {};
  const links = readLinks(ctx);
  const allowHttp = ctx.env.SIGILO_PERMITIR_HTTP === '1';
  for (const file of files) {
    const raw = readJson(file, file);
    const type = (raw as { tipo?: unknown } | null)?.tipo;
    if (type === 'sigilo/solicitud-alta-nodo') {
      const check = verifyJoinRequest(raw, { allowHttp });
      if (!check.valid) {
        for (const problem of check.problems) screen.fail(problem);
        throw new CliError(`${file}: la solicitud no es válida; no se acepta.`, 2);
      }
      const request = NodeJoinRequestSchema.parse(check.request);
      const { nodo, buzon, tablaDeFunciones, contacto } = request;
      screen.line(`Solicitud de alta: ${nodo.name} (${nodo.id}) · ${buzon.stateCode ?? 'federal'}`);
      screen.line(
        `  Institución: ${contacto.institucion} · Responsable: ${contacto.responsable} (${contacto.cargo})`,
      );
      screen.line(`  Creada ${request.creada} · software ${request.software}`);
      screen.ok('Firma válida del nodo (prueba de que tiene su llave)');
      if (next.nodes.some((node) => node.id === nodo.id)) {
        throw new CliError(`${nodo.id} ya está en el directorio.`, 2);
      }
      const state = tablaDeFunciones.table.stateCode;
      if ((next.functionTables ?? []).some((item) => item.table.stateCode === state)) {
        throw new CliError(`Otro nodo ya cubre la entidad ${state ?? 'federal'}.`, 2);
      }
      screen.ok(`${nodo.baseUrl} · nadie más cubre la entidad ${state ?? 'federal'}`);
      screen.line(
        '  Llama a la institución a un número oficial (no al de la solicitud) y pide que te lea su huella.',
      );
      const expected = joinRequestFingerprint(request);
      const heard = await answers.ask({ key: 'huella', text: 'Escribe la huella que te leyeron' });
      if (!sameFingerprint(heard, expected)) {
        throw new CliError(
          'La huella no coincide. No aceptes: pide al estado que reenvíe y vuelve a llamar.',
          2,
        );
      }
      screen.ok('Coincide.');
      next = {
        ...next,
        nodes: [...next.nodes, nodo],
        authorities: [...next.authorities, buzon],
        functionTables: [...(next.functionTables ?? []), tablaDeFunciones],
      };
      pendingLinks[nodo.id] = request.enlace;
      ensureDir(paths.joins, 0o755);
      writeJson(join(paths.joins, `solicitud-${nodo.id}-${request.creada}.json`), request, 0o644);
    } else if (type === 'sigilo/tabla-de-funciones') {
      const update = FunctionTableUpdateSchema.parse(raw);
      const { table } = update.tabla;
      const node = next.nodes.find((item) => item.id === table.nodeId);
      if (node === undefined || !verifyFunctionTableSignature(update.tabla, node)) {
        throw new CliError(`${file}: la tabla no tiene la firma de un nodo del directorio.`, 2);
      }
      const current = (next.functionTables ?? []).find(
        (item) => item.table.nodeId === table.nodeId,
      );
      if (current !== undefined && table.version <= current.table.version) {
        throw new CliError(`${file}: la versión ${table.version} no es mayor que la vigente.`, 2);
      }
      next = {
        ...next,
        functionTables: [
          ...(next.functionTables ?? []).filter((item) => item.table.nodeId !== table.nodeId),
          update.tabla,
        ],
      };
      screen.ok(`Tabla de funciones de ${table.nodeId} v${table.version}, firmada por el nodo`);
    } else if (type === 'sigilo/rotacion-enlace') {
      const parsed = LinkRotationSchema.parse(raw);
      const node = next.nodes.find((item) => item.id === parsed.nodeId);
      const rotation = node === undefined ? null : verifyLinkRotation(raw, node.signingPublicKey);
      const known = links.nodos[parsed.nodeId];
      if (rotation === null || (known !== undefined && rotation.enlace.epoca <= known.epoca)) {
        throw new CliError(`${file}: la rotación no es válida o no es de una época nueva.`, 2);
      }
      applyLinks(ctx, { [rotation.nodeId]: rotation.enlace });
      screen.ok(
        `Enlace de ${rotation.nodeId} en la época ${rotation.enlace.epoca}: secretos derivados`,
      );
      screen.line(
        `  Reinicia el enrutador y avisa a ${rotation.nodeId} que corra ./sigilo rotar-llaves --enlace --aplicar`,
      );
    } else {
      // Entrada de autoridad que entrega la bandeja «Solicitudes de alta» de un nodo.
      const entry = DirectoryAuthoritySchema.safeParse(
        (raw as { directoryEntry?: unknown } | null)?.directoryEntry ?? raw,
      );
      if (!entry.success) throw new CliError(`${file}: no reconozco este archivo.`, 2);
      if (!next.nodes.some((node) => node.id === entry.data.nodeId)) {
        throw new CliError(`${file}: la autoridad es de un nodo que no está en el directorio.`, 2);
      }
      next = {
        ...next,
        authorities: [...next.authorities.filter((item) => item.id !== entry.data.id), entry.data],
      };
      screen.ok(`Autoridad ${entry.data.id} «${entry.data.name}»`);
    }
  }
  if (JSON.stringify(next) === JSON.stringify(base)) {
    screen.line('El directorio no cambia.');
    return 0;
  }
  const serial = base.serial + 1;
  next = {
    ...next,
    serial,
    issuedOn: todayOf(ctx),
    previousDigest: published?.digest ?? DIRECTORY_GENESIS_DIGEST,
  };
  const problems = directoryProblems(next);
  if (problems.length > 0) {
    for (const problem of problems) screen.fail(problem);
    throw new CliError('La versión propuesta no es coherente; no se firma.', 2);
  }
  screen.line('');
  screen.line(`  Cambios del directorio ${base.serial} → ${serial}:`);
  for (const line of directoryChanges(published?.directory ?? null, next))
    screen.line(`    ${line}`);
  const operatorKey = readOperatorKey(ctx);
  const signed = signDirectory(next, operatorKey);
  operatorKey.fill(0);
  ensureDir(paths.proposals, 0o755);
  const proposal = join(paths.proposals, `directorio-propuesto-${serial}.json`);
  if (existsSync(proposal) && !hasFlag(ctx, 'reemplazar')) {
    throw new CliError(
      `Ya hay una propuesta ${serial} sin publicar. Publícala primero o acepta todo junto (--reemplazar la descarta).`,
      2,
    );
  }
  writeJson(proposal, signed, 0o644);
  writeJson(join(paths.proposals, `enlaces-${serial}.json`), { v: 1, nodos: pendingLinks }, 0o644);
  if (Object.keys(pendingLinks).length > 0) {
    screen.ok(
      `Secretos de enlace de ${Object.keys(pendingLinks).join(', ')} (época 1), en espera de publicarse`,
    );
  }
  screen.ok(`Firmado por la operación → propuestas/directorio-propuesto-${serial}.json`);
  screen.line('');
  screen.line(
    `Faltan ${trust.threshold} cofirmas de ${trust.witnesses.length} testigos. Envía propuestas/directorio-propuesto-${serial}.json a cada testigo.`,
  );
  screen.line(
    `Cuando tengas sus cofirmas: ./sigilo-sesna publicar propuestas/directorio-propuesto-${serial}.json cofirmas/`,
  );
  return 0;
}
