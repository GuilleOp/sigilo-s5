# Interfaces entre paquetes

Contrato interno que respetan todos los módulos. Los cambios a este documento requieren un ADR o
una nota en el pull request que los justifique.

## `@sigilo/contracts`

Esquemas zod y tipos de la API v1, rutas (`ROUTES`), constantes y catálogos públicos. Solo contiene
búsquedas por clave en los catálogos; no tiene más lógica.

| Módulo          | Exporta                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives.ts` | `FolioSchema`, `Base64UrlSchema`, `Sha256HexSchema`, `DayDateSchema`, `HourDateSchema`, `MonthPeriodSchema`, `KeyIdSchema`, `CROCKFORD_ALPHABET`                                                                                                                                                                                                                                             |
| `catalogs/`     | `STATES` (32 entidades INEGI), `MUNICIPALITIES` (18 de Querétaro), `PUBLIC_ENTITIES` (sintéticos), `OFFENSES`, `OFFENSE_SITUATIONS`, `OFFENSE_LAW_NAMES`, `GOVERNMENT_LEVEL_LABELS` y búsquedas `findState`, `isStateCode`, `municipalitiesOf`, `findMunicipality`, `isMunicipalityOf`, `findEntity`, `isEntityId`, `findOffense`, `isOffenseCode`, `primaryOffenseCode`, `offenseReference` |
| `complaint.ts`  | `ComplaintFactsSchema` (claves validadas contra los catálogos y municipio de la entidad), `StateCodeSchema`, `MunicipalityCodeSchema`, `EntityIdSchema`, `OffenseCodeSchema`, `IdentityBlockSchema`, `ReporterKeysSchema`, `SubmitComplaintRequestSchema` (reglas por modo), `SignedReceiptSchema`, `EvidenceDescriptorSchema`, `MAX_EVIDENCE_ITEMS`, `MAX_EVIDENCE_BYTES`                   |
| `mailbox.ts`    | `MailboxSenderSchema`, `MailboxSequenceSchema`, `MailboxMessageSchema` (con `sequence`)                                                                                                                                                                                                                                                                                                      |
| `tracking.ts`   | `TrackingCredentialsSchema`, `TrackingViewSchema` (`receivedEvent` opcional: falta mientras su día no cierra), `ReporterMessageRequestSchema` (con `sequence`), `TimelineEntrySchema`, `OpeningIdSchema`, `IdentityAccessEntrySchema` (con `openingId`)                                                                                                                                      |
| `authority.ts`  | `ComplaintSummarySchema`, `ComplaintDetailSchema` (con `version`, `reporterKeys`, `authVerifier`, `sealedIdentityDigest` en modo sellado y `receivedEventSeq` cuando se publica su evento), `OpenIdentityRequestSchema`, `OpenIdentityResponseSchema` (`sealedIdentity`, `openingId`), `UpdateStatusRequestSchema`, `AuthorityMessageRequestSchema` (con `sequence`)                         |
| `ledger.ts`     | `LedgerEventTypeSchema`, `LedgerEventSchema` (`receiptTag` solo en `identity.opened`), `SignedLedgerHeadSchema`, `LedgerPageSchema`, `LedgerAnchorSchema`, `LEDGER_GENESIS_HASH`                                                                                                                                                                                                             |
| `keys.ts`       | `PublicKeySetSchema`, `KeysFileSchema` (`keys.json`), `AuthorityDemoKeySchema` (`authority-demo-key.json`)                                                                                                                                                                                                                                                                                   |
| `routes.ts`     | `API_PREFIX`, `ROUTES` (incluye `powChallenge`), `OPEN_DATA_MIN_CELL` (5), `OPEN_DATA_ROUNDING` (5)                                                                                                                                                                                                                                                                                          |
| `pow.ts`        | `PowPurposeSchema` (`complaint`, `evidence`), `PowChallengeSchema` (`{ token, bits }`), `MAX_POW_BITS` (32), `POW_HEADER` (`X-Sigilo-Pow`)                                                                                                                                                                                                                                                   |
| `errors.ts`     | `ApiErrorCodeSchema` (incluye `proof_required`, 428, y `storage_full`, 507), `ApiErrorSchema`                                                                                                                                                                                                                                                                                                |

Cada esquema exporta su tipo inferido con el mismo nombre sin el sufijo `Schema`.

En las conductas, `label` dice primero lo que pasó y después el término legal entre paréntesis, y
`situation` agrupa por situación cotidiana. Las conductas con el mismo nombre en la LGRA y en el
Código Penal Federal se muestran una sola vez: la clave principal es la de la LGRA y la del CPF
queda en `equivalentCodes`, que también se acepta. Ninguna clave anterior se perdió.

## `@sigilo/core`

Criptografía y formatos. Funciona igual en Node 22.18+ y en navegadores modernos.

| Módulo              | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Notas                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encoding.ts`       | `toBase64Url`, `fromBase64Url`, `toHex`, `fromHex`, `utf8Encode`, `utf8Decode`, `equalBytes(a, b)`                                                                                                                                                                                                                                                                                                                                                                                      | Base64URL sin relleno y canónico. `equalBytes` recorre todo el arreglo                                                                                                                              |
| `random.ts`         | `randomBytes(length)`, `randomInt(maxExclusive)`, `shuffle(items)`                                                                                                                                                                                                                                                                                                                                                                                                                      | Solo `crypto.getRandomValues`; `randomInt` con muestreo por rechazo; `shuffle` es Fisher-Yates                                                                                                      |
| `canonical-json.ts` | `canonicalize(value)`, `sha256Hex(data)`                                                                                                                                                                                                                                                                                                                                                                                                                                                | Llaves ordenadas por unidades UTF-16, sin espacios, solo enteros seguros                                                                                                                            |
| `dates.ts`          | `toDayDate(date)`, `toHourDate(date)`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Siempre UTC y redondeadas                                                                                                                                                                           |
| `folio.ts`          | `generateFolio()`, `isFolio(value)`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 60 bits, Base32 Crockford, `XXXX-XXXX-XXXX`                                                                                                                                                         |
| `receipt-phrase.ts` | `generateReceiptPhrase()`, `phraseToEntropy(words)`, `normalizeWord(word)`, `completeWord(prefix)`, `RECEIPT_WORD_COUNT`, `ReceiptPhraseError`                                                                                                                                                                                                                                                                                                                                          | 8 palabras BIP39 español, 11 bits cada una, sin checksum. Normalización NFD sin marcas diacríticas y en minúsculas. `ReceiptPhraseError.position`: palabra (desde 1) o `null` si faltan palabras    |
| `receipt-keys.ts`   | `deriveReceiptKeys(entropy)`, `computeAuthVerifier(authKey)`                                                                                                                                                                                                                                                                                                                                                                                                                            | Devuelve `authKey`, `authVerifier`, par X25519 del buzón y par Ed25519 de firma. HKDF-SHA256 con contextos `sigilo/v1/auth`, `sigilo/v1/box`, `sigilo/v1/sign`                                      |
| `keys.ts`           | `generateBoxKeyPair()`, `generateSigningKeyPair()`, `keyIdFor(publicKey)`, `assertBoxKeyPair(pair)`, `assertSigningKeyPair(pair)`, `buildPublicKeySet(keys)`                                                                                                                                                                                                                                                                                                                            | `keyIdFor` = primeros 16 hex de SHA-256. Los `assert*` lanzan si la privada no corresponde                                                                                                          |
| `signing.ts`        | `sign(message, privateKey)`, `verify(signature, message, publicKey)`                                                                                                                                                                                                                                                                                                                                                                                                                    | Ed25519 estricto (sin ZIP-215)                                                                                                                                                                      |
| `envelope.ts`       | `sealToPublicKey(plaintext, recipient, aad)`, `openEnvelope(envelope, privateKey, aad)`, `envelopePlaintextLength(envelope)`                                                                                                                                                                                                                                                                                                                                                            | HPKE modo base, suite de `HPKE_SUITE_V1`. La longitud se calcula sin abrir el sobre                                                                                                                 |
| `padding.ts`        | `padToBlock(bytes, blockSize)`, `unpad(bytes)`                                                                                                                                                                                                                                                                                                                                                                                                                                          | Prefijo de longitud de 4 bytes                                                                                                                                                                      |
| `identity.ts`       | `sealIdentity(block, authority, context)`, `openIdentity(envelope, authorityPrivateKey, context)`, `computeContentDigest(content)`, `identityContextFor(source)`, `identityContextFromDetail(detail)`, `IDENTITY_PADDED_SIZE`                                                                                                                                                                                                                                                           | Relleno fijo de 4096 bytes. AAD = `sigilo/v1/identity:` + `canonicalize({ authVerifier, reporterKeys, contentDigest })`                                                                             |
| `mailbox.ts`        | `sealMailboxMessage(text, recipient, senderSigningPrivateKey, binding)`, `openMailboxMessage(message, recipientPrivateKey, senderSigningPublicKey, folio)`, `verifyMailboxSignature(message, publicKey)`, `isMailboxSequenceComplete(messages)`, `nextMailboxSequence(messages, from)`, `MAILBOX_PADDED_SIZE`, `MAX_MAILBOX_TEXT_LENGTH`                                                                                                                                                | `binding = { folio, from, sequence }`. AAD = `sigilo/v1/mailbox:` + folio + `:` + remitente + `:` + secuencia. Firma sobre `canonicalize({ envelope, from, sequence })`. Relleno fijo de 4096 bytes |
| `signed-receipt.ts` | `sealedIdentityDigest(envelope)`, `submissionDigestInput(request)`, `computeSubmissionDigest(request)`, `submissionDigestFromDetail(detail)`, `signReceipt(unsigned, serverPrivateKey)`, `verifyReceipt(receipt, serverPublicKey)`                                                                                                                                                                                                                                                      | El digesto del envío usa el sobre resumido; el comprobante firma `payloadDigest`, no `seq`                                                                                                          |
| `ledger.ts`         | `folioDigest(folio)`, `receiptTagFor(authVerifier)`, `computeEventHash(event)`, `pendingEventFor(input)`, `chainEvent(previous, pending)`, `buildEvent(previous, input)`, `verifyChain(events, previous?)`, `signLedgerHead(head, privateKey)`, `verifyLedgerHead(head, publicKey)`, `receivedPayloadDigest(folio, submissionDigest)`, `verifyReceiptEvent(event, receipt)`, `identityOpenedPayload(opening)`, `identityOpenedPayloadDigest(opening)`, `reconcileIdentityOpenings(...)` | Primer `prevHash` = `LEDGER_GENESIS_HASH`. `verifyReceiptEvent` no compara `seq`. `reconcileIdentityOpenings` contrasta las aperturas publicadas con su `receiptTag` contra las del seguimiento     |
| `pow.ts`            | `leadingZeroBits(digest)`, `powDigest(token, counter)`, `isPowSolution(token, counter, bits)`, `solvePow(token, bits, options)`, `formatPowHeader(token, counter)`, `parsePowHeader(value)`                                                                                                                                                                                                                                                                                             | Hashcash sobre SHA-256 de `token + ":" + contador`                                                                                                                                                  |
| `index.ts`          | Reexporta todo lo anterior                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                                                     |

Tipos públicos de `@sigilo/core`: `PendingLedgerEvent`, `IdentityOpening`,
`IdentityOpeningsReconciliation`, `SubmissionDigestInput`, `SolvePowOptions`, `KeyPair`, `DeploymentPublicKeys`, `ReceiptKeys`,
`EnvelopeRecipient`, `ComplaintContent`, `IdentityContext`, `IdentityContextSource`,
`MailboxBinding`, `SealedMailboxMessage` (`{ from, sequence, envelope, signature }`),
`SignedMailboxFields`, `UnsignedReceipt`, `LedgerEventInput`, `ChainFailureReason`,
`ChainVerification` y `UnsignedLedgerHead`.

## `@sigilo/huella`

Limpieza y revisión en el navegador. Las funciones puras se prueban en Node; las que usan canvas o
pdf.js se prueban en el navegador (E2E).

| Módulo                    | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invisible-characters.ts` | `findInvisibleCharacters(text, options?)` (categorías `zero_width`, `bidi_control`, `soft_hyphen`, `tag`, `variation_selector`, `other_format`, `filler`, `default_ignorable`, `nonstandard_space`, `combining_mark`, `uncomposed_mark`, `control`, `private_use`, `unassigned`, `line_separator`, `mixed_script`, `confusable`, `typographic_variant`), `stripInvisibleCharacters(text, options?)` (incluye NFKC; `shouldNormalizeTypography` activo por omisión) |
| `text-review.ts`          | `reviewText(text)` devuelve hallazgos `{ kind, start, end, excerpt, severity, suggestion }`                                                                                                                                                                                                                                                                                                                                                                        |
| `file-policy.ts`          | `classifyFile({ name, type, size }, { maxBytes? })` devuelve `image`, `pdf` o `rejected` con motivo y guía; `DEFAULT_MAX_FILE_BYTES`                                                                                                                                                                                                                                                                                                                               |
| `image-metadata.ts`       | `inspectImageMetadata(blob, { includeColorProfile?, allowGenericSrgbProfile? })` devuelve GPS, dispositivo, fecha de captura, software, autor y otros campos; `IMAGE_METADATA_LABELS` con el texto que se muestra de cada campo                                                                                                                                                                                                                                    |
| `image-sanitize.ts`       | `sanitizeImage(blob, options)` recodifica en canvas y devuelve `SanitizedImage` (`{ blob, width, height }`); `DEFAULT_MAX_IMAGE_DIMENSION`, `DEFAULT_JPEG_QUALITY`                                                                                                                                                                                                                                                                                                 |
| `pdf-rasterize.ts`        | `rasterizePdf(blob, options)` devuelve una imagen JPEG (`Blob`) por página; `DEFAULT_MAX_PDF_PAGES`, `DEFAULT_PDF_SCALE`, `DEFAULT_PDF_QUALITY`, `MAX_PAGE_DIMENSION`                                                                                                                                                                                                                                                                                              |
| `digest.ts`               | `digestBlob(blob)` SHA-256 en hexadecimal                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `months.ts`               | `SPANISH_MONTHS`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `risk.ts`                 | `assessRisk(signals)` devuelve `{ level, score, reasons }`; `isWorkHours(date)`; pesos, topes y umbrales (`WEIGHT_*`, `CAP_TEXT_*`, `THRESHOLD_MEDIUM`, `THRESHOLD_HIGH`)                                                                                                                                                                                                                                                                                          |
| `index.ts`                | Reexporta todo lo anterior y sus tipos                                                                                                                                                                                                                                                                                                                                                                                                                             |

La copia limpia se vuelve a inspeccionar con `allowGenericSrgbProfile: true`: se acepta solo un
perfil ICC cuya descripción sea la del perfil genérico que agregan los codificadores del navegador
(`sRGB` en Chromium, `sRGB IEC61966-2.1` en WebKit). Se compara la descripción, no una huella
binaria del perfil.

Limpieza de texto (`stripInvisibleCharacters`):

- Un mapa de confusables (subconjunto de UTS #39, unas 120 entradas, en `confusables.ts`) se aplica
  a todo token, incluso de una sola letra: las letras de otro alfabeto que se ven como una del latín
  básico pasan a esa letra.
- La normalización tipográfica (`shouldNormalizeTypography`, activa por omisión) colapsa espacios
  repetidos, quita espacios y tabuladores al final de la línea y lleva guiones y comillas
  tipográficas a `-`, `"` y `'`. `\r\n` pasa a `\n`.
- Costos conocidos: los textos rusos o griegos legítimos se transliteran en parte; las marcas
  combinantes sin forma compuesta se pierden; la raya de diálogo pasa a `-`.
- El semáforo de riesgo y el aviso de la interfaz cuentan con `shouldNormalizeTypography: false`:
  no cuentan las variantes tipográficas, que son comunes al copiar de un procesador de textos.

## `@sigilo/server`

Implementa exactamente las rutas de `ROUTES` con los esquemas de `@sigilo/contracts`. Persistencia
en `node:sqlite` con migraciones numeradas:

| Migración | Contenido                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Esquema inicial y triggers de solo agregar de la bitácora                                                                                                                              |
| 2         | Índice único de `auth_verifier`, secuencia del buzón y triggers de solo agregar del buzón y de las aperturas                                                                           |
| 3         | Eventos pendientes (`ledger_pending`) y cierre diario barajado, aperturas con `openingId`, cambios de estatus con `changeId` y meses congelados de datos abiertos (`open_data_months`) |

La migración 3 cambia el formato del comprobante y de la bitácora: rechaza una base con datos
anteriores y pide ejecutar `npm run demo:reset -- --yes`. Ver `docs/arquitectura.md`.

Un archivo de bloqueo `server.lock` en el directorio de datos impide dos servidores sobre la misma
base y permite a los scripts saber si el servidor está en marcha.

### Publicación diaria de la bitácora

Cada evento nuevo queda pendiente, sin `seq`, con un identificador aleatorio. Al cerrar su día
(UTC), el servidor baraja los pendientes de ese día y los encadena; la cabeza pública es la del
último evento encadenado (o el génesis firmado si no hay ninguno). Un día está publicado si y solo
si `at <= head.at`. Así la cabeza cambia a lo más una vez al día y ni la consulta de la cabeza ni el
orden de los eventos revelan la hora de cada denuncia o mensaje.

El comprobante identifica su evento por `payloadDigest`. `TrackingView.receivedEvent` falta mientras
su día no cierra; después la persona lo verifica con `verifyReceiptEvent`. `ComplaintDetail` trae
`receivedEventSeq` cuando el evento ya se publicó, para que la autoridad verifique las llaves del
denunciante contra él.

### Prueba de trabajo

`GET /api/v1/pow/challenge?purpose=complaint|evidence` entrega un reto firmado con HMAC (llave
aleatoria por proceso), que vence en 10 minutos y es de un solo uso y un solo propósito. `POST
complaints` y `POST evidence` exigen la cabecera `X-Sigilo-Pow: <token>:<contador>` y responden
`428 proof_required` si falta o no es válida. Dificultad: `SIGILO_POW_BITS` (18 por omisión; 0 la
desactiva). Ver `docs/criptografia.md`.

### Límites

Los límites viven en memoria y no usan direcciones IP (no se registran). Cada limitador guarda a lo
más 100 000 llaves y descarta las usadas hace más tiempo (LRU); las ventanas vencidas se barren de
forma amortizada, a lo más una vez por ventana.

| Límite                     | Por omisión                     | Efecto al excederse                                      |
| -------------------------- | ------------------------------- | -------------------------------------------------------- |
| `authFailuresPerFolio`     | 10 fallos por folio por hora    | `rate_limited` en ese folio hasta que vence la ventana   |
| `authFailuresGlobal`       | 600 fallos por minuto           | Cada intento espera 10 ms por fallo de exceso, hasta 2 s |
| `reporterMessagesPerFolio` | 30 mensajes por folio por hora  | `rate_limited` al enviar                                 |
| `evidenceUploads`          | 600 subidas por hora en total   | `rate_limited` al subir                                  |
| `complaintSubmissions`     | 120 denuncias por hora en total | `rate_limited` al enviar                                 |

Solo un intento fallido (`not_found`) consume los límites de autenticación, y las credenciales
correctas siempre se aceptan, aunque el folio haya agotado sus fallos. Compensación del freno
global: nunca deja fuera a las personas denunciantes, pero durante un ataque todas esperan hasta 2 s.
La prueba de trabajo encarece los envíos; las cuotas globales de escritura son el último recurso y
un abuso sostenido puede agotarlas para todos.

### Almacenamiento y retención

| Variable                          | Por omisión     | Efecto                                                                                             |
| --------------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `SIGILO_EVIDENCE_QUOTA_BYTES`     | 5 GiB           | Cuota total de pruebas guardadas; al excederse, `507 storage_full`                                 |
| `SIGILO_UNTRACKED_RETENTION_DAYS` | 0 (desactivada) | Borra los archivos de pruebas de denuncias sin seguimiento que siguen en `received` tras esos días |

Las pruebas pendientes (subidas sin denuncia) se purgan al arrancar y cada hora cuando tienen más de
24 h. La fecha de subida se guarda solo por día, así que se borran entre 24 y 48 h después. La
retención de pruebas sin seguimiento no toca la denuncia, sus descriptores ni la bitácora; la
autoridad recibe `not_found` al pedir un archivo borrado.

### Registro de peticiones

`SIGILO_REQUEST_LOG`:

- `aggregate` (por omisión): contadores por hora, sin las rutas de la persona denunciante.
- `requests`: una línea por petición (método, ruta normalizada, estatus, duración); solo en
  desarrollo, se rechaza con `NODE_ENV=production`.
- `off`: nada.

Nunca se registran IP, agente de usuario, cuerpos ni folios.

### Datos abiertos

Cada mes cerrado se congela una sola vez en `open_data_months` (de solo agregar) y no vuelve a
cambiar aunque cambien los estatus. La conducta se guarda con su clave principal
(`primaryOffenseCode`). El CSV solo incluye meses congelados; los conteos se redondean al múltiplo
de 5 más cercano y se suprimen las celdas con menos de 5 denuncias reales. Lo suprimido se redondea
por mes y se suma en la fila `suprimidas,,,,<n>`, que tiene las mismas columnas que el encabezado.

### Reloj de pruebas

`SIGILO_TEST_CLOCK_FILE` apunta a un archivo con un desplazamiento en milisegundos que se suma al
reloj real y se relee en cada consulta. Sirve para probar el cierre diario y los meses congelados
(lo usa `e2e/support/clock.ts`). Restricciones:

- Solo se acepta con `SIGILO_E2E=1` o `NODE_ENV=test`, nunca con `NODE_ENV=production`.
- El archivo debe pertenecer al usuario del proceso y no ser escribible por el grupo ni por otros.
- El desfase debe estar entre 0 y 400 días.

El servidor registra un aviso cuando está activo.

### Web en el mismo origen

Con `SIGILO_WEB_DIST` el servidor sirve la web construida (`apps/web/dist`), con respaldo de SPA a
`index.html` para rutas sin extensión, y le aplica cabeceras propias: CSP con
`frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`,
`Cache-Control: no-store` y, si se configura `SIGILO_HSTS_MAX_AGE`, `Strict-Transport-Security`.
CORS está desactivado salvo que se configure `SIGILO_ALLOWED_ORIGIN`.

## Llaves y scripts del despliegue

`npm run keys:generate` crea:

- `apps/server/data/keys.json`: llaves privadas del servidor (no se versiona).
- `apps/server/data/authority-demo-key.json`: llave privada de la autoridad de demostración, que el
  panel importa en el navegador (no se versiona).
- `apps/web/src/config/pinned-keys.json`: llaves públicas fijadas en el bundle del cliente (sí se
  versiona, generada para la demostración). Se regenera siempre junto con las privadas.
- `apps/server/.env` con un `SIGILO_AUTHORITY_TOKEN` aleatorio, solo si no existe.

Solo comprueba la existencia de `keys.json` y `authority-demo-key.json`; para reemplazarlas hay que
pasar `--force`.

`npm run demo:reset -- --yes` borra la base y las pruebas y conserva las llaves. Sin `--yes` exige el
marcador `.sigilo-demo` en el directorio de datos, y se niega a correr con el servidor en marcha
(bloqueo `server.lock` o puerto ocupado).

`npm run ledger:anchor` escribe `anchors/AAAA-MM-DD.json` con la cabeza pública firmada. La forma
preferida es leer la API pública (`SIGILO_ANCHOR_URL=http://127.0.0.1:8787 npm run ledger:anchor`);
sin esa variable lee la base local en solo lectura, avisa y, si la base no existe, da un mensaje
claro. El directorio `anchors/` existe en el repositorio (`anchors/.gitkeep`).
