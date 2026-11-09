// Siembra el escenario de docs/demo-escenario.md contra la red de demostración en marcha (después
// de npm run red:demo y docker compose up): importa los 31 acuerdos con plantilla y los 5 de
// control, envía las denuncias de Marta (ventanilla única, con la foto ya limpia), del atacante
// (tres, día 2), de la persona denunciante de Querétaro y de Luis (entrada propia del nodo Federal,
// día 3), y lleva el trámite de Marta por la calificación de no grave con plantilla y su
// notificación por el buzón (día 30), las señales y el escalamiento (día 31), la apertura del
// expediente con la segunda llave (día 32) y la inconformidad con apertura de identidad para el
// recurso (día 35), adelantando el reloj simulado. Hace lo que harían el navegador y las personas
// de la autoridad, por HTTP. Todo es sintético. Uso: npm run demo:seed [-- --hasta 35]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AuthorityDemoKeySchema,
  AuthoritySessionSchema,
  EvidenceDescriptorSchema,
  CORROBORATION_ROUTES,
  CorroborationEvaluationResponseSchema,
  NETWORK_ROUTES,
  NetworkTrustAnchorSchema,
  POW_HEADER,
  PowChallengeSchema,
  RegistrationReceiptSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  EvidenceDescriptor,
  RegistrationRequest,
  RoutedReply,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import {
  deriveReceiptKeys,
  formatPowHeader,
  fromBase64Url,
  generateBoxKeyPair,
  generateReceiptPhrase,
  generateSigningKeyPair,
  identityContextFor,
  keyIdFor,
  sealEscalation,
  sealIdentity,
  sealMailboxMessage,
  sha256Hex,
  solvePow,
  toBase64Url,
} from '@sigilo/core';
import { templateQualificationText } from '@sigilo/auditor/eval';
import type { ReceiptKeys } from '@sigilo/core';
import { blindCorroboration, finalizeCorroboration, similarityDigest } from '@sigilo/corroboracion';
import type { CorroborationIdentifier } from '@sigilo/corroboracion';
import { DEMO_HONEST_DIRECTOR, DEMO_OCID, demoCase } from '@sigilo/corroboracion/demo';
import { openRoutedReply, sealRoutedRequest, verifySignedDirectory } from '@sigilo/red';
import {
  buildBareJpeg,
  buildSyntheticExifJpeg,
} from '../packages/huella/test-fixtures/synthetic-exif-jpeg.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.env.SIGILO_RED_DEMO_DIR || join(ROOT, '.red-demo'));
const ROUTER = process.env.SIGILO_DEMO_ROUTER_URL || 'http://127.0.0.1:8790';
const EVALUATOR = process.env.SIGILO_DEMO_EVALUATOR_URL || 'http://127.0.0.1:8791';
const NODES = {
  federal: process.env.SIGILO_DEMO_FEDERAL_URL || 'http://127.0.0.1:8782',
  queretaro: process.env.SIGILO_DEMO_QUERETARO_URL || 'http://127.0.0.1:8781',
} as const;
const CLOCK_FILE = join(OUT, 'reloj', 'desfase');
const DAY_MS = 86_400_000;
/** Espera para que la tarea periódica de los nodos (cada segundo con el reloj simulado) corra. */
const TASK_WAIT_MS = 3500;

type NodeName = keyof typeof NODES;

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

async function json(response: Response, what: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${what}: el servicio respondió ${response.status}.`);
  return response.json();
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Adelanta el reloj simulado de los nodos al día N y espera a su tarea periódica. */
async function advanceTo(day: number): Promise<void> {
  writeFileSync(CLOCK_FILE, `${day * DAY_MS}\n`, { mode: 0o600 });
  await wait(TASK_WAIT_MS);
  say(`Día ${day} del escenario.`);
}

function dayZero(): string {
  const env = readFileSync(join(OUT, 'nodos', 'federal', 'node.env'), 'utf8');
  const match = /^SIGILO_DEMO_DAY_ZERO=(\d{4}-\d{2}-\d{2})$/mu.exec(env);
  if (match?.[1] === undefined) throw new Error('node.env no tiene SIGILO_DEMO_DAY_ZERO.');
  return match[1];
}

function dayDate(base: string, offset: number): string {
  const date = new Date(`${base}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Directorio del enrutador verificado con la raíz de confianza que generó red:demo. */
async function verifiedDirectory(): Promise<AuthorityDirectory> {
  const trust = NetworkTrustAnchorSchema.parse(readJson(join(OUT, 'enrutador', 'trust.json')));
  const raw = await json(await fetch(`${ROUTER}${NETWORK_ROUTES.directory}`), 'Directorio');
  const result = verifySignedDirectory(raw, trust);
  if (!result.valid) throw new Error(`El directorio no verifica (${result.reason}).`);
  return result.directory;
}

function authorityKey(directory: AuthorityDirectory, id: string) {
  const authority = directory.authorities.find((item) => item.id === id);
  if (authority === undefined) throw new Error(`El directorio no tiene ${id}.`);
  return { keyId: authority.keyId, publicKey: fromBase64Url(authority.boxPublicKey) };
}

/** Inicia sesión con la cuenta sintética `username` del nodo. */
async function login(node: NodeName, username: string): Promise<string> {
  const file = readJson(join(OUT, 'nodos', node, 'credenciales.json')) as {
    credenciales: { username: string; password: string }[];
  };
  const credential = file.credenciales.find((item) => item.username === username);
  if (credential === undefined) throw new Error(`No hay credencial para ${username}.`);
  const raw = await json(
    await postJson(`${NODES[node]}${ROUTES.authLogin}`, {
      username,
      password: credential.password,
    }),
    `Inicio de sesión de ${username}`,
  );
  return AuthoritySessionSchema.parse(raw).token;
}

/**
 * Petición de una persona de la autoridad. Inicia sesión en cada paso: al adelantar el reloj
 * simulado, la sesión anterior vence por inactividad, como vencería en la realidad.
 */
async function asAuthority(node: NodeName, username: string, path: string, body: unknown) {
  const token = await login(node, username);
  return json(
    await postJson(`${NODES[node]}${path}`, body, { Authorization: `Bearer ${token}` }),
    path,
  );
}

/** Llave privada de firma de una autoridad del directorio (la importa su panel). */
function authoritySigningKey(authorityId: string): Uint8Array {
  const file = AuthorityDemoKeySchema.parse(
    readJson(join(OUT, 'autoridades', `${authorityId}.json`)),
  );
  return fromBase64Url(file.signingPrivateKey);
}

function solved(raw: unknown): string {
  const challenge = PowChallengeSchema.parse(raw);
  const counter = solvePow(challenge.token, challenge.bits);
  if (counter === null) throw new Error('No se resolvió la prueba de trabajo.');
  return formatPowHeader(challenge.token, counter);
}

/** Lo que hace el navegador: OPRF con el evaluador, verificado con la llave del directorio. */
async function corroboration(
  directory: AuthorityDirectory,
  identifier: CorroborationIdentifier,
  narrative: string,
): Promise<SubmitComplaintRequest['corroboration']> {
  const key = directory.corroboration?.evaluator;
  if (key === undefined) return undefined;
  const state = blindCorroboration(identifier, key);
  const header = solved(
    await json(await fetch(`${EVALUATOR}${CORROBORATION_ROUTES.evaluatorChallenge}`), 'Reto'),
  );
  const evaluation = CorroborationEvaluationResponseSchema.parse(
    await json(
      await postJson(`${EVALUATOR}${CORROBORATION_ROUTES.evaluations}`, state.request, {
        [POW_HEADER]: header,
      }),
      'Evaluación',
    ),
  );
  const keys = finalizeCorroboration(state, evaluation, key);
  const digest = similarityDigest(narrative, keys.similarityKey);
  return {
    epoch: keys.epoch,
    tag: keys.tag,
    similarity: digest === null ? null : toBase64Url(digest),
  };
}

interface ComplaintSpec {
  key: string;
  mode: 'sealed' | 'anonymous';
  facts: SubmitComplaintRequest['facts'];
  identifier: CorroborationIdentifier | null;
  /** Autoridad que custodia la identidad sellada y supervisora de la segunda llave. */
  identityAuthority?: string;
  supervisor?: string;
  /** Prueba ya limpia por Huella Cero (la copia sin metadatos), si se adjunta. */
  photo?: Uint8Array;
}

async function buildRequest(
  directory: AuthorityDirectory,
  spec: ComplaintSpec,
  keys: ReceiptKeys,
  evidence: EvidenceDescriptor[] = [],
): Promise<SubmitComplaintRequest> {
  const request: SubmitComplaintRequest = {
    version: 1,
    mode: spec.mode,
    facts: spec.facts,
    evidence,
    protectionRequested: spec.mode === 'sealed',
    reporterKeys: {
      boxPublicKey: toBase64Url(keys.box.publicKey),
      signingPublicKey: toBase64Url(keys.signing.publicKey),
    },
    authVerifier: keys.authVerifier,
  };
  if (spec.identifier !== null) {
    const value = await corroboration(directory, spec.identifier, spec.facts.description);
    if (value !== undefined) request.corroboration = value;
  }
  if (spec.supervisor !== undefined) {
    request.escalationEnvelope = await sealEscalation(
      request,
      authorityKey(directory, spec.supervisor),
      { authVerifier: request.authVerifier, reporterKeys: request.reporterKeys },
    );
  }
  if (spec.mode === 'sealed' && spec.identityAuthority !== undefined) {
    request.sealedIdentity = await sealIdentity(
      {
        fullName: 'Marta Ejemplo',
        contact: 'marta@example.org, 55 0000 0001, Calle Ficticia 1, Villa Ejemplo',
        witnesses: [],
        originalEvidenceSha256:
          spec.photo === undefined ? [] : [sha256Hex(buildSyntheticExifJpeg())],
      },
      authorityKey(directory, spec.identityAuthority),
      identityContextFor(request),
    );
  }
  return request;
}

/** Ventanilla única: sobre cifrado hacia el nodo de la autoridad, por el enrutador ciego. */
async function viaRouter(
  directory: AuthorityDirectory,
  to: string,
  operation: {
    operationId: 'getPowChallenge' | 'submitComplaint' | 'uploadEvidence' | 'fileAppeal';
    query?: Record<string, string>;
  },
  body: unknown,
  proofOfWork: string | null,
): Promise<RoutedReply> {
  const authority = directory.authorities.find((item) => item.id === to);
  const node = directory.nodes.find((item) => item.id === authority?.nodeId);
  if (node === undefined) throw new Error(`Sin nodo para ${to}.`);
  const sealed = await sealRoutedRequest(
    {
      to,
      operationId: operation.operationId,
      query: operation.query ?? {},
      proofOfWork,
      body:
        body === null
          ? { kind: 'none' }
          : body instanceof Uint8Array
            ? { kind: 'binary', mediaType: 'image/jpeg', data: toBase64Url(body) }
            : { kind: 'json', value: body },
    },
    node,
  );
  const raw = await json(
    await postJson(`${ROUTER}${NETWORK_ROUTES.relay}`, sealed.relay),
    'Relevo',
  );
  return openRoutedReply(raw, sealed.replyPrivateKey, to);
}

function replyValue(reply: RoutedReply): unknown {
  if (reply.status >= 300 || reply.body.kind !== 'json') {
    throw new Error(`El nodo respondió ${reply.status} por el enrutador.`);
  }
  return reply.body.value;
}

interface Seeded {
  key: string;
  folio: string;
  words: string[];
}

/** Lo sembrado y las llaves del recibo, que solo se guardan en memoria mientras corre la semilla. */
interface SeededWithKeys extends Seeded {
  keys: ReceiptKeys;
}

/** Reto de prueba de trabajo del propósito indicado, pedido por el enrutador. */
async function routedChallenge(
  directory: AuthorityDirectory,
  to: string,
  purpose: 'complaint' | 'message',
): Promise<string> {
  return solved(
    replyValue(
      await viaRouter(
        directory,
        to,
        { operationId: 'getPowChallenge', query: { purpose } },
        null,
        null,
      ),
    ),
  );
}

async function submitViaRouter(
  directory: AuthorityDirectory,
  spec: ComplaintSpec,
  to: string,
): Promise<SeededWithKeys> {
  const phrase = generateReceiptPhrase();
  const keys = deriveReceiptKeys(phrase.entropy);
  // El mismo reto sirve para las pruebas y la denuncia, como en el navegador.
  const proof = await routedChallenge(directory, to, 'complaint');
  const evidence =
    spec.photo === undefined
      ? []
      : [
          EvidenceDescriptorSchema.parse(
            replyValue(
              await viaRouter(directory, to, { operationId: 'uploadEvidence' }, spec.photo, proof),
            ),
          ),
        ];
  const request = await buildRequest(directory, spec, keys, evidence);
  const reply = await viaRouter(directory, to, { operationId: 'submitComplaint' }, request, proof);
  const response: SubmitComplaintResponse = SubmitComplaintResponseSchema.parse(replyValue(reply));
  say(`- ${spec.key}: folio ${response.folio} (por la ventanilla única hacia ${to}).`);
  return { key: spec.key, folio: response.folio, words: phrase.words, keys };
}

async function submitDirect(
  directory: AuthorityDirectory,
  node: NodeName,
  spec: ComplaintSpec,
): Promise<Seeded> {
  const phrase = generateReceiptPhrase();
  const request = await buildRequest(directory, spec, deriveReceiptKeys(phrase.entropy));
  const header = solved(
    await json(await fetch(`${NODES[node]}${ROUTES.powChallenge}?purpose=complaint`), 'Reto'),
  );
  const response = SubmitComplaintResponseSchema.parse(
    await json(
      await postJson(`${NODES[node]}${ROUTES.complaints}`, request, { [POW_HEADER]: header }),
      'Denuncia',
    ),
  );
  say(`- ${spec.key}: folio ${response.folio} (entrada propia del nodo ${node}).`);
  return { key: spec.key, folio: response.folio, words: phrase.words };
}

const TEMPLATE_VARIANTS = [
  'no se cuenta con elementos suficientes',
  'no se advierten elementos suficientes',
  'no existen elementos suficientes',
];

function templateAgreement(fileNumber: string, index: number): string {
  return `Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se determina la conclusión y archivo del expediente ${fileNumber}, toda vez que ${TEMPLATE_VARIANTS[index % 3] ?? ''} para acreditar la existencia de la infracción y la presunta responsabilidad. Notifíquese.`;
}

const CONTROL_ACTS = [
  {
    reason: 'attended',
    text: 'Se archiva porque el contrato señalado fue revisado en la auditoría ficticia AF-01 y se comprobó la entrega completa de los bienes.',
  },
  {
    reason: 'channeled',
    text: 'Se canaliza a la autoridad municipal de Villa Ejemplo, competente para el trámite de licencias descrito.',
  },
  {
    reason: 'joined',
    text: 'Se acumula al expediente CEF-INV-0012, que investiga los mismos hechos del pago de viáticos.',
  },
  {
    reason: 'attended',
    text: 'Se concluye con informe de presunta responsabilidad por falta no grave; se turna a la autoridad substanciadora ficticia.',
  },
  {
    reason: 'insufficient_information',
    text: 'Se archiva tras requerir información en dos ocasiones sin respuesta del buzón; se reabrirá si llegan nuevos indicios (art. 100).',
  },
] as const;

const MARTA_FACTS: SubmitComplaintRequest['facts'] = {
  stateCode: '22',
  entityId: 'VE-INSTITUTO',
  offenseCode: 'LGRA-59',
  occurredPeriod: '2026-03',
  accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
  description: demoCase('case.marta').narrative,
};

function attackFacts(key: string): SubmitComplaintRequest['facts'] {
  return {
    stateCode: '22',
    entityId: 'VE-PROGRAMAS',
    offenseCode: 'LGRA-52',
    occurredPeriod: '2026-04',
    accused: 'Servidor Ficticio Tres, Director de la Delegación',
    description: demoCase(key).narrative,
  };
}

/**
 * Caso ciudadano (sección 4.6): dos personas que no trabajan en la oficina, a quienes les pidieron
 * dinero en la misma ventanilla, denuncian por separado y en días distintos. La corroboración ciega
 * las junta sin que ninguna sea «la que habló». Relatos ya revisados con Huella Cero.
 */
const CITIZEN_ACCUSED: CorroborationIdentifier = {
  kind: 'servidor',
  name: 'Servidor Ficticio Cuatro',
  entityId: 'VE-MOVILIDAD',
};

const CITIZEN_NARRATIVES = {
  'case.ventanilla-1':
    'En el módulo de licencias del Instituto de Movilidad Estatal Ficticio, la persona que atiende la ventanilla de renovación pidió 800 pesos en efectivo para entregar la licencia el mismo día. Sin ese pago, dijo, el trámite tardaría un mes. No dio ningún recibo. Pasó en septiembre de 2026, por la mañana.',
  'case.ventanilla-2':
    'Fui a renovar una licencia de conducir al Instituto de Movilidad Estatal Ficticio y en la ventanilla me dijeron que mis documentos tenían errores, pero que se podían arreglar con una cooperación. Comentaron que así se hace con quien tiene prisa. Ocurrió a finales de septiembre de 2026.',
} as const;

function citizenFacts(key: keyof typeof CITIZEN_NARRATIVES): SubmitComplaintRequest['facts'] {
  return {
    stateCode: '22',
    entityId: 'VE-MOVILIDAD',
    offenseCode: 'LGRA-52',
    occurredPeriod: '2026-09',
    accused: 'Servidor Ficticio Cuatro, ventanilla de renovación de licencias',
    description: CITIZEN_NARRATIVES[key],
  };
}

/** Último día que siembra el script. */
const LAST_DAY = 35;

function untilDay(): number {
  const index = process.argv.indexOf('--hasta');
  const value = index === -1 ? String(LAST_DAY) : (process.argv[index + 1] ?? '');
  const day = Number(value);
  if (!Number.isInteger(day) || day < 0 || day > LAST_DAY) {
    throw new Error(`--hasta debe ser un día del escenario entre 0 y ${LAST_DAY}.`);
  }
  return day;
}

/**
 * Foto sintética de la cotización: el original con EXIF ficticio queda en `.red-demo/fixtures/`
 * para mostrar la limpieza en la web; a la red solo sube la copia sin metadatos, como la deja
 * Huella Cero en el navegador.
 */
function martaPhoto(): Uint8Array {
  const dir = join(OUT, 'fixtures');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cotizacion-con-exif.jpg'), buildSyntheticExifJpeg());
  return buildBareJpeg();
}

/** Solicitud de alta sintética, con su llave privada guardada como la tendría la institución. */
interface SeededRegistration {
  institution: string;
  folio: string;
  fingerprint: string;
  status: 'pending' | 'rejected';
}

/** Arma una solicitud de alta sintética y guarda su llave privada en `.red-demo/solicitudes/`. */
function registrationRequest(
  institutionName: string,
  stateCode: string,
  people: RegistrationRequest['people'],
): RegistrationRequest {
  const box = generateBoxKeyPair();
  const signing = generateSigningKeyPair();
  const keyId = keyIdFor(box.publicKey);
  mkdirSync(join(OUT, 'solicitudes'), { recursive: true, mode: 0o700 });
  writeFileSync(
    join(OUT, 'solicitudes', `${keyId}.json`),
    `${JSON.stringify(
      {
        version: 1,
        keyId,
        boxPublicKey: toBase64Url(box.publicKey),
        boxPrivateKey: toBase64Url(box.privateKey),
        signingPublicKey: toBase64Url(signing.publicKey),
        signingPrivateKey: toBase64Url(signing.privateKey),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return {
    institutionName,
    stateCode,
    governmentLevel: 'estatal',
    role: 'investigating',
    laws: ['LGRA'],
    supervisorId: null,
    applicant: {
      fullName: 'Persona Solicitante Ficticia',
      position: 'Titular del área de quejas, denuncias e investigación',
      appointment: 'Oficio SCF/001/2026 del 2 de enero de 2026 (ficticio)',
    },
    people,
    padlock: {
      keyId,
      boxPublicKey: toBase64Url(box.publicKey),
      signingPublicKey: toBase64Url(signing.publicKey),
    },
  };
}

/**
 * Solicitudes de alta en el nodo Federal: Oaxaca (sin nodo propio, irá al nodo común) queda
 * pendiente para mostrar la confirmación de la huella; otra queda rechazada con su motivo.
 */
async function seedRegistrations(): Promise<SeededRegistration[]> {
  const specs = [
    {
      request: registrationRequest('Secretaría de la Contraloría Ficticia de Oaxaca', '20', [
        { fullName: 'Persona Ficticia Uno', functions: ['intake', 'investigation'] },
        { fullName: 'Persona Ficticia Dos', functions: ['intake', 'investigation'] },
        { fullName: 'Persona Ficticia Tres', functions: ['substantiation'] },
      ]),
      rejectReason: null,
    },
    {
      request: registrationRequest('Contraloría Municipal Ficticia de Villa Ejemplo', '20', [
        { fullName: 'Persona Ficticia Cuatro', functions: ['intake', 'investigation'] },
      ]),
      rejectReason:
        'El oficio de nombramiento no coincide con el padrón de la contraloría estatal. Envíe el oficio vigente.',
    },
  ];
  const seeded: SeededRegistration[] = [];
  for (const spec of specs) {
    const header = solved(
      await json(
        await fetch(`${NODES.federal}${ROUTES.powChallenge}?purpose=registration`),
        'Reto',
      ),
    );
    const receipt = RegistrationReceiptSchema.parse(
      await json(
        await postJson(`${NODES.federal}${ROUTES.registrationRequests}`, spec.request, {
          [POW_HEADER]: header,
        }),
        'Solicitud de alta',
      ),
    );
    if (spec.rejectReason !== null) {
      await asAuthority(
        'federal',
        'operacion.federal',
        ROUTES.operationRegistrationDecision(receipt.requestId),
        { decision: 'reject', reason: spec.rejectReason },
      );
    }
    const status = spec.rejectReason === null ? 'pending' : 'rejected';
    say(
      `- Solicitud de alta ${receipt.requestId} (${spec.request.institutionName}): ${status === 'pending' ? `pendiente, huella ${receipt.fingerprint}` : 'rechazada'}.`,
    );
    seeded.push({
      institution: spec.request.institutionName,
      folio: receipt.requestId,
      fingerprint: receipt.fingerprint,
      status,
    });
  }
  return seeded;
}

async function main(): Promise<void> {
  if (!existsSync(CLOCK_FILE)) {
    throw new Error('No existe .red-demo/; ejecuta npm run red:demo y docker compose up primero.');
  }
  const until = untilDay();
  const base = dayZero();
  const seeded: Seeded[] = [];
  await advanceTo(0);
  const directory = await verifiedDirectory();
  say('Día 0: semilla de acuerdos y denuncias de Marta y la persona denunciante de Querétaro.');
  const imported = await asAuthority(
    'federal',
    'oic-equipamiento.persona1',
    ROUTES.authorityClosureImports,
    {
      acts: Array.from({ length: 31 }, (_, i) => {
        const fileNumber = `OIC-IFFE-INV-${String(i + 1).padStart(4, '0')}`;
        return {
          fileNumber,
          issuedOn: dayDate(base, -330 + 10 * i),
          reason: 'insufficient_information',
          agreement: templateAgreement(fileNumber, i),
        };
      }),
    },
  );
  say(`- 31 acuerdos con plantilla importados: ${JSON.stringify(imported)}.`);
  await asAuthority('queretaro', 'contraloria.queretaro', ROUTES.authorityClosureImports, {
    acts: CONTROL_ACTS.map((act, i) => ({
      fileNumber: `CEF-CTRL-${String(i + 1).padStart(4, '0')}`,
      issuedOn: dayDate(base, -200 + 20 * i),
      reason: act.reason,
      agreement: act.text,
    })),
  });
  say('- 5 acuerdos de control de la Contraloría de Querétaro importados.');
  const marta = await submitViaRouter(
    directory,
    {
      key: 'case.marta',
      mode: 'sealed',
      facts: MARTA_FACTS,
      identifier: { kind: 'ocid', ocid: DEMO_OCID },
      identityAuthority: 'authority.oic-iffe',
      supervisor: 'authority.oversight-federal',
      photo: martaPhoto(),
    },
    'authority.oic-iffe',
  );
  seeded.push({ key: marta.key, folio: marta.folio, words: marta.words });
  if (until >= 1) {
    await advanceTo(1);
    await asAuthority(
      'federal',
      'oic-equipamiento.persona1',
      ROUTES.authorityProcedure(marta.folio),
      {
        action: 'accept',
      },
    );
    say('- El OIC acepta el turnado de Marta sin excusarse.');
    const routing = await submitViaRouter(
      directory,
      {
        key: 'case.queretaro-routing',
        mode: 'anonymous',
        facts: {
          stateCode: '22',
          entityId: 'VE-FINANZAS',
          offenseCode: 'LGRA-54',
          occurredPeriod: '2026-09',
          accused: 'Persona servidora ficticia de la Secretaría de Finanzas',
          description:
            'En la Secretaría de Finanzas Estatal Ficticia se pagaron viáticos de un viaje que no se realizó.',
        },
        identifier: null,
      },
      'authority.comptroller-queretaro',
    );
    seeded.push({ key: routing.key, folio: routing.folio, words: routing.words });
  }
  if (until >= 2) {
    await advanceTo(2);
    for (const key of ['case.attack-1', 'case.attack-2', 'case.attack-3']) {
      const attack = await submitViaRouter(
        directory,
        { key, mode: 'anonymous', facts: attackFacts(key), identifier: DEMO_HONEST_DIRECTOR },
        'authority.oic-dfps',
      );
      seeded.push({ key: attack.key, folio: attack.folio, words: attack.words });
    }
  }
  if (until >= 3) {
    await advanceTo(3);
    const luis = await submitDirect(directory, 'federal', {
      key: 'case.luis',
      mode: 'anonymous',
      facts: { ...MARTA_FACTS, description: demoCase('case.luis').narrative },
      identifier: { kind: 'ocid', ocid: DEMO_OCID },
    });
    seeded.push(luis);
    // El buzón general la turna al OIC, que la acepta: solo entonces el nodo la confirma ante el
    // índice y cuenta como fuente independiente para Marta.
    await asAuthority('federal', 'buzon.federal', ROUTES.authorityProcedure(luis.folio), {
      action: 'route',
      authorityId: 'authority.oic-iffe',
    });
    await asAuthority(
      'federal',
      'oic-equipamiento.persona1',
      ROUTES.authorityProcedure(luis.folio),
      {
        action: 'accept',
      },
    );
    say('- El buzón turna la denuncia de Luis al OIC y el OIC la acepta.');
  }
  for (const [day, key] of [
    [4, 'case.ventanilla-1'],
    [6, 'case.ventanilla-2'],
  ] as const) {
    if (until < day) break;
    await advanceTo(day);
    const citizen = await submitViaRouter(
      directory,
      { key, mode: 'anonymous', facts: citizenFacts(key), identifier: CITIZEN_ACCUSED },
      'authority.comptroller-queretaro',
    );
    seeded.push({ key: citizen.key, folio: citizen.folio, words: citizen.words });
    // Al aceptarla, el nodo la confirma ante el índice y cuenta como fuente independiente.
    await asAuthority(
      'queretaro',
      'contraloria.queretaro',
      ROUTES.authorityProcedure(citizen.folio),
      { action: 'accept' },
    );
    say(`- La Contraloría de Querétaro acepta la denuncia ciudadana ${key}.`);
  }
  if (until >= 30) {
    await advanceTo(30);
    const investigator = 'oic-equipamiento.persona1';
    const procedure = ROUTES.authorityProcedure(marta.folio);
    await asAuthority('federal', investigator, procedure, {
      action: 'advance_stage',
      stage: 'investigation',
    });
    // LGRA, art. 100: califica la falta grave como no grave, con la plantilla de sus archivos.
    await asAuthority('federal', investigator, procedure, {
      action: 'advance_stage',
      stage: 'qualification',
      qualification: {
        severity: 'non_serious',
        legalBasis: 'LGRA, arts. 100 y 102: calificación de la conducta.',
        agreement: templateQualificationText('OIC-IFFE-INV-0032'),
      },
    });
    // LGRA, art. 102: la notificación a la persona identificable llega por el buzón, cifrada.
    const notice = await sealMailboxMessage(
      'Se calificó la conducta como falta no grave (expediente OIC-IFFE-INV-0032). Si no estás de acuerdo, puedes inconformarte dentro de los 5 días hábiles siguientes desde tu seguimiento. Para consultar el expediente, pídelo por este buzón.',
      { keyId: keyIdFor(marta.keys.box.publicKey), publicKey: marta.keys.box.publicKey },
      authoritySigningKey('authority.oic-iffe'),
      { folio: marta.folio, from: 'authority', sequence: 0 },
    );
    await asAuthority('federal', investigator, ROUTES.authorityMessages(marta.folio), {
      sequence: notice.sequence,
      envelope: notice.envelope,
      signature: notice.signature,
    });
    say('- El OIC califica como no grave con su plantilla y lo notifica a Marta por el buzón.');
  }
  if (until >= 31) {
    await advanceTo(31);
    say('- El auditor (AUD-01 y AUD-03) y las reglas corren en la tarea periódica: escalamiento.');
  }
  if (until >= 32) {
    await advanceTo(32);
    await asAuthority(
      'federal',
      'supervision-oic',
      ROUTES.authorityEscalationEnvelope(marta.folio),
      {},
    );
    say('- La supervisora recibe la segunda llave y abre el expediente sin depender del OIC.');
  }
  if (until >= 35) {
    await advanceTo(35);
    const proof = await routedChallenge(directory, 'authority.oic-iffe', 'message');
    replyValue(
      await viaRouter(
        directory,
        'authority.oic-iffe',
        { operationId: 'fileAppeal' },
        {
          folio: marta.folio,
          authKey: toBase64Url(marta.keys.authKey),
          reasons:
            'La contratación indebida es una falta grave (LGRA, art. 59). El acuerdo no explica por qué la califica como no grave ni considera la lista 69-B, la adjudicación directa registrada en el S6 ni la corroboración independiente.',
          revealIdentityForAppeal: true,
        },
        proof,
      ),
    );
    say('- Marta se inconforma por la ventanilla única y abre su identidad solo para el recurso.');
  }
  say('Alta de autoridades: solicitudes sintéticas en el nodo Federal.');
  const solicitudes = await seedRegistrations();
  // Seguridad: las 8 palabras son secretas (sintéticas); el archivo queda solo para quien presenta.
  writeFileSync(
    join(OUT, 'semilla.json'),
    `${JSON.stringify({ aviso: 'Folios y recibos sintéticos de la demostración.', casos: seeded, solicitudes }, null, 2)}\n`,
    { mode: 0o600 },
  );
  say(`Escenario sembrado hasta el día ${until}. Folios y recibos en .red-demo/semilla.json.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo sembrar el escenario.');
  process.exit(1);
});
