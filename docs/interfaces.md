# Interfaces entre paquetes

Contrato interno que respetan todos los módulos. Los cambios a este documento requieren un ADR o
una nota en el pull request que los justifique.

## `@sigilo/contracts`

Esquemas zod y tipos de la API v1, rutas (`ROUTES`), constantes y catálogos públicos. Solo contiene
búsquedas por clave en los catálogos; no tiene más lógica.

| Módulo          | Exporta                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives.ts` | `FolioSchema`, `Base64UrlSchema`, `Sha256HexSchema`, `DayDateSchema`, `HourDateSchema`, `MonthPeriodSchema`, `KeyIdSchema`, `CROCKFORD_ALPHABET`                                                                                                                                                                                                                           |
| `catalogs/`     | `STATES` (32 entidades INEGI), `MUNICIPALITIES` (18 de Querétaro), `PUBLIC_ENTITIES` (sintéticos), `OFFENSES`, `OFFENSE_SITUATIONS`, `OFFENSE_LAW_NAMES`, `GOVERNMENT_LEVEL_LABELS` y búsquedas `findState`, `isStateCode`, `municipalitiesOf`, `findMunicipality`, `isMunicipalityOf`, `findEntity`, `isEntityId`, `findOffense`, `isOffenseCode`, `offenseReference`     |
| `complaint.ts`  | `ComplaintFactsSchema` (claves validadas contra los catálogos y municipio de la entidad), `StateCodeSchema`, `MunicipalityCodeSchema`, `EntityIdSchema`, `OffenseCodeSchema`, `IdentityBlockSchema`, `ReporterKeysSchema`, `SubmitComplaintRequestSchema` (reglas por modo), `SignedReceiptSchema`, `EvidenceDescriptorSchema`, `MAX_EVIDENCE_ITEMS`, `MAX_EVIDENCE_BYTES` |
| `mailbox.ts`    | `MailboxSenderSchema`, `MailboxSequenceSchema`, `MailboxMessageSchema` (con `sequence`)                                                                                                                                                                                                                                                                                    |
| `tracking.ts`   | `TrackingCredentialsSchema`, `TrackingViewSchema` (con `receivedEvent`), `ReporterMessageRequestSchema` (con `sequence`), `TimelineEntrySchema`, `IdentityAccessEntrySchema`                                                                                                                                                                                               |
| `authority.ts`  | `ComplaintSummarySchema`, `ComplaintDetailSchema` (con `version`, `reporterKeys` y `authVerifier`), `OpenIdentityRequestSchema`, `OpenIdentityResponseSchema` (`sealedIdentity`, `ledgerSeq`), `UpdateStatusRequestSchema`, `AuthorityMessageRequestSchema` (con `sequence`)                                                                                               |
| `ledger.ts`     | `LedgerEventSchema`, `SignedLedgerHeadSchema`, `LedgerPageSchema`, `LedgerAnchorSchema`, `LEDGER_GENESIS_HASH`                                                                                                                                                                                                                                                             |
| `keys.ts`       | `PublicKeySetSchema`, `KeysFileSchema` (`keys.json`), `AuthorityDemoKeySchema` (`authority-demo-key.json`)                                                                                                                                                                                                                                                                 |
| `routes.ts`     | `API_PREFIX`, `ROUTES`, `OPEN_DATA_MIN_CELL` (5), `OPEN_DATA_ROUNDING` (5)                                                                                                                                                                                                                                                                                                 |

Cada esquema exporta su tipo inferido con el mismo nombre sin el sufijo `Schema`.

En las conductas, `label` dice primero lo que pasó y después el término legal entre paréntesis, y
`situation` agrupa por situación cotidiana. Las conductas con el mismo nombre en la LGRA y en el
Código Penal Federal se muestran una sola vez: la clave principal es la de la LGRA y la del CPF
queda en `equivalentCodes`, que también se acepta. Ninguna clave anterior se perdió.

## `@sigilo/core`

Criptografía y formatos. Funciona igual en Node 22.18+ y en navegadores modernos.

| Módulo              | Exporta                                                                                                                                                                                                                                                                                                                                  | Notas                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encoding.ts`       | `toBase64Url`, `fromBase64Url`, `toHex`, `fromHex`, `utf8Encode`, `utf8Decode`, `equalBytes(a, b)`                                                                                                                                                                                                                                       | Base64URL sin relleno y canónico. `equalBytes` recorre todo el arreglo                                                                                                                              |
| `random.ts`         | `randomBytes(length)`                                                                                                                                                                                                                                                                                                                    | Solo `crypto.getRandomValues`                                                                                                                                                                       |
| `canonical-json.ts` | `canonicalize(value)`, `sha256Hex(data)`                                                                                                                                                                                                                                                                                                 | Llaves ordenadas por unidades UTF-16, sin espacios, solo enteros seguros                                                                                                                            |
| `dates.ts`          | `toDayDate(date)`, `toHourDate(date)`                                                                                                                                                                                                                                                                                                    | Siempre UTC y redondeadas                                                                                                                                                                           |
| `folio.ts`          | `generateFolio()`, `isFolio(value)`                                                                                                                                                                                                                                                                                                      | 60 bits, Base32 Crockford, `XXXX-XXXX-XXXX`                                                                                                                                                         |
| `receipt-phrase.ts` | `generateReceiptPhrase()`, `phraseToEntropy(words)`, `normalizeWord(word)`, `completeWord(prefix)`, `RECEIPT_WORD_COUNT`, `ReceiptPhraseError`                                                                                                                                                                                           | 8 palabras BIP39 español, 11 bits cada una, sin checksum. Normalización NFD sin marcas diacríticas y en minúsculas. `ReceiptPhraseError.position`: palabra (desde 1) o `null` si faltan palabras    |
| `receipt-keys.ts`   | `deriveReceiptKeys(entropy)`, `computeAuthVerifier(authKey)`                                                                                                                                                                                                                                                                             | Devuelve `authKey`, `authVerifier`, par X25519 del buzón y par Ed25519 de firma. HKDF-SHA256 con contextos `sigilo/v1/auth`, `sigilo/v1/box`, `sigilo/v1/sign`                                      |
| `keys.ts`           | `generateBoxKeyPair()`, `generateSigningKeyPair()`, `keyIdFor(publicKey)`, `assertBoxKeyPair(pair)`, `assertSigningKeyPair(pair)`, `buildPublicKeySet(keys)`                                                                                                                                                                             | `keyIdFor` = primeros 16 hex de SHA-256. Los `assert*` lanzan si la privada no corresponde                                                                                                          |
| `signing.ts`        | `sign(message, privateKey)`, `verify(signature, message, publicKey)`                                                                                                                                                                                                                                                                     | Ed25519 estricto (sin ZIP-215)                                                                                                                                                                      |
| `envelope.ts`       | `sealToPublicKey(plaintext, recipient, aad)`, `openEnvelope(envelope, privateKey, aad)`, `envelopePlaintextLength(envelope)`                                                                                                                                                                                                             | HPKE modo base, suite de `HPKE_SUITE_V1`. La longitud se calcula sin abrir el sobre                                                                                                                 |
| `padding.ts`        | `padToBlock(bytes, blockSize)`, `unpad(bytes)`                                                                                                                                                                                                                                                                                           | Prefijo de longitud de 4 bytes                                                                                                                                                                      |
| `identity.ts`       | `sealIdentity(block, authority, context)`, `openIdentity(envelope, authorityPrivateKey, context)`, `computeContentDigest(content)`, `identityContextFor(source)`, `identityContextFromDetail(detail)`, `IDENTITY_PADDED_SIZE`                                                                                                            | Relleno fijo de 4096 bytes. AAD = `sigilo/v1/identity:` + `canonicalize({ authVerifier, reporterKeys, contentDigest })`                                                                             |
| `mailbox.ts`        | `sealMailboxMessage(text, recipient, senderSigningPrivateKey, binding)`, `openMailboxMessage(message, recipientPrivateKey, senderSigningPublicKey, folio)`, `verifyMailboxSignature(message, publicKey)`, `isMailboxSequenceComplete(messages)`, `nextMailboxSequence(messages, from)`, `MAILBOX_PADDED_SIZE`, `MAX_MAILBOX_TEXT_LENGTH` | `binding = { folio, from, sequence }`. AAD = `sigilo/v1/mailbox:` + folio + `:` + remitente + `:` + secuencia. Firma sobre `canonicalize({ envelope, from, sequence })`. Relleno fijo de 4096 bytes |
| `signed-receipt.ts` | `computeSubmissionDigest(request)`, `signReceipt(unsigned, serverPrivateKey)`, `verifyReceipt(receipt, serverPublicKey)`                                                                                                                                                                                                                 |                                                                                                                                                                                                     |
| `ledger.ts`         | `folioDigest(folio)`, `computeEventHash(event)`, `buildEvent(previous, input)`, `verifyChain(events, previous?)`, `signLedgerHead(head, privateKey)`, `verifyLedgerHead(head, publicKey)`, `receivedPayloadDigest(folio, submissionDigest)`, `verifyReceiptEvent(event, receipt)`                                                        | Primer `prevHash` = `LEDGER_GENESIS_HASH`. Con `previous`, `verifyChain` verifica un tramo que continúa a ese evento                                                                                |
| `index.ts`          | Reexporta todo lo anterior                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                     |

Tipos públicos de `@sigilo/core`: `KeyPair`, `DeploymentPublicKeys`, `ReceiptKeys`,
`EnvelopeRecipient`, `ComplaintContent`, `IdentityContext`, `IdentityContextSource`,
`MailboxBinding`, `SealedMailboxMessage` (`{ from, sequence, envelope, signature }`),
`SignedMailboxFields`, `UnsignedReceipt`, `LedgerEventInput`, `ChainFailureReason`,
`ChainVerification` y `UnsignedLedgerHead`.

## `@sigilo/huella`

Limpieza y revisión en el navegador. Las funciones puras se prueban en Node; las que usan canvas o
pdf.js se prueban en el navegador (E2E).

| Módulo                    | Exporta                                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invisible-characters.ts` | `findInvisibleCharacters(text)` (categorías `zero_width`, `bidi_control`, `soft_hyphen`, `tag`, `variation_selector`, `other_format`, `filler`, `default_ignorable`, `nonstandard_space`, `combining_mark`, `mixed_script`), `stripInvisibleCharacters(text)` (incluye NFKC) |
| `text-review.ts`          | `reviewText(text)` devuelve hallazgos `{ kind, start, end, excerpt, severity, suggestion }`                                                                                                                                                                                  |
| `file-policy.ts`          | `classifyFile({ name, type, size }, { maxBytes? })` devuelve `image`, `pdf` o `rejected` con motivo y guía; `DEFAULT_MAX_FILE_BYTES`                                                                                                                                         |
| `image-metadata.ts`       | `inspectImageMetadata(blob, { includeColorProfile? })` devuelve GPS, dispositivo, fecha de captura, software, autor y otros campos; `IMAGE_METADATA_LABELS` con el texto que se muestra de cada campo                                                                        |
| `image-sanitize.ts`       | `sanitizeImage(blob, options)` recodifica en canvas y devuelve `SanitizedImage` (`{ blob, width, height }`); `DEFAULT_MAX_IMAGE_DIMENSION`, `DEFAULT_JPEG_QUALITY`                                                                                                           |
| `pdf-rasterize.ts`        | `rasterizePdf(blob, options)` devuelve una imagen JPEG (`Blob`) por página; `DEFAULT_MAX_PDF_PAGES`, `DEFAULT_PDF_SCALE`, `DEFAULT_PDF_QUALITY`, `MAX_PAGE_DIMENSION`                                                                                                        |
| `digest.ts`               | `digestBlob(blob)` SHA-256 en hexadecimal                                                                                                                                                                                                                                    |
| `months.ts`               | `SPANISH_MONTHS`                                                                                                                                                                                                                                                             |
| `risk.ts`                 | `assessRisk(signals)` devuelve `{ level, score, reasons }`; `isWorkHours(date)`; pesos, topes y umbrales (`WEIGHT_*`, `CAP_TEXT_*`, `THRESHOLD_MEDIUM`, `THRESHOLD_HIGH`)                                                                                                    |
| `index.ts`                | Reexporta todo lo anterior y sus tipos                                                                                                                                                                                                                                       |

La copia limpia se vuelve a inspeccionar con `includeColorProfile: false`: el codificador JPEG de
Chromium agrega un perfil sRGB genérico que no identifica a nadie.

## `@sigilo/server`

Implementa exactamente las rutas de `ROUTES` con los esquemas de `@sigilo/contracts`. Persistencia
en `node:sqlite` con migraciones numeradas (la 2 agrega el índice único de `auth_verifier`, la
secuencia del buzón y los triggers de solo agregar del buzón y de las aperturas). Ver
`docs/arquitectura.md`.

### Publicación diaria de la bitácora

`ledgerHead` y `ledgerEvents` solo publican eventos con `at` anterior al día actual (UTC); la cabeza
pública es la del último evento publicado (o el génesis firmado si no hay ninguno). Así la cabeza
cambia a lo más una vez al día y consultarla no revela la hora de cada denuncia o mensaje. El
comprobante de la persona denunciante conserva `ledgerSeq` (es privado) y `TrackingView` le entrega
su evento `complaint.received`; una vez publicado su día lo encuentra con
`ledgerEvents?from=<ledgerSeq>&limit=1`.

### Límites

Los límites viven en memoria y no usan direcciones IP (no se registran):

| Límite                     | Por omisión                     | Efecto al excederse                                      |
| -------------------------- | ------------------------------- | -------------------------------------------------------- |
| `authFailuresPerFolio`     | 10 fallos por folio por hora    | `rate_limited` en ese folio hasta que vence la ventana   |
| `authFailuresGlobal`       | 600 fallos por minuto           | Cada intento espera 10 ms por fallo de exceso, hasta 2 s |
| `reporterMessagesPerFolio` | 30 mensajes por folio por hora  | `rate_limited` al enviar                                 |
| `evidenceUploads`          | 600 subidas por hora en total   | `rate_limited` al subir                                  |
| `complaintSubmissions`     | 120 denuncias por hora en total | `rate_limited` al enviar                                 |

Solo un intento fallido (`not_found`) consume los límites de autenticación; leer el seguimiento y
responder en el buzón no los gastan. Compensación del freno global: nunca deja fuera a las personas
denunciantes, pero durante un ataque todas esperan hasta 2 s y un atacante con muchas conexiones en
paralelo no queda acotado en volumen, solo en latencia. Adivinar credenciales sigue siendo inviable
(folio de 60 bits y `authKey` derivada de 88 bits) y el límite por folio frena los ataques
dirigidos. Las cuotas globales de escritura protegen el almacenamiento a cambio de que un abuso
sostenido pueda agotarlas para todos. Trabajo futuro: prueba de trabajo en el navegador para los
envíos y el seguimiento, y límites por conexión en el proxy de entrada.

Las pruebas pendientes (subidas sin denuncia) se purgan al arrancar y cada hora cuando tienen más de
24 h. La fecha de subida se guarda solo por día, así que se borran entre 24 y 48 h después.

### Datos abiertos

El CSV solo incluye meses de recepción completos anteriores al mes actual. Los conteos se redondean
al múltiplo de 5 más cercano y se suprimen las celdas con menos de 5 denuncias reales; la fila
`suprimidas,,,,<n>` tiene las mismas columnas que el encabezado y también va redondeada.

### Reloj de pruebas

`SIGILO_TEST_CLOCK_FILE` apunta a un archivo con un desplazamiento en milisegundos que se suma al
reloj real y se relee en cada consulta. Sirve para probar la publicación diaria y los meses cerrados
(lo usa `e2e/support/clock.ts`). El servidor registra un aviso cuando está activo y se niega a
arrancar con esa variable si `NODE_ENV=production`.

### Web en el mismo origen

Con `SIGILO_WEB_DIST` el servidor sirve la web construida (`apps/web/dist`), con respaldo de SPA a
`index.html` para rutas sin extensión, y le aplica cabeceras propias: CSP con
`frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`,
`Cache-Control: no-store` y, si se configura `SIGILO_HSTS_MAX_AGE`, `Strict-Transport-Security`.
CORS está desactivado salvo que se configure `SIGILO_ALLOWED_ORIGIN`.

## Llaves del despliegue

`npm run keys:generate` crea:

- `apps/server/data/keys.json`: llaves privadas del servidor (no se versiona).
- `apps/server/data/authority-demo-key.json`: llave privada de la autoridad de demostración, que el
  panel importa en el navegador (no se versiona).
- `apps/web/src/config/pinned-keys.json`: llaves públicas fijadas en el bundle del cliente (sí se
  versiona, generada para la demostración). Se regenera siempre junto con las privadas.
- `apps/server/.env` con un `SIGILO_AUTHORITY_TOKEN` aleatorio, solo si no existe.

Solo comprueba la existencia de `keys.json` y `authority-demo-key.json`; para reemplazarlas hay que
pasar `--force`. `npm run demo:reset` borra la base y las pruebas y conserva las llaves.
`npm run ledger:anchor` escribe `anchors/AAAA-MM-DD.json` con la cabeza pública firmada, leída de la
base local o de la API si se define `SIGILO_ANCHOR_URL`.
