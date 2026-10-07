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
| `routes.ts`     | `API_PREFIX`, `ROUTES` (incluye `powChallenge`; `ledgerEvents` acepta `from` o `since`, y `authorityComplaints`, `offset` y `limit`), `OPEN_DATA_MIN_CELL` (5), `OPEN_DATA_ROUNDING` (5)                                                                                                                                                                                                     |
| `pow.ts`        | `PowPurposeSchema` (`complaint`, `message`), `PowChallengeSchema` (`{ token, bits }`), `MAX_POW_BITS` (32, tope del esquema), `POW_HEADER` (`X-Sigilo-Pow`)                                                                                                                                                                                                                                  |
| `errors.ts`     | `ApiErrorCodeSchema` (incluye `proof_required`, 428; `storage_full`, 507; y `ledger_day_full`, 503), `ApiErrorSchema`                                                                                                                                                                                                                                                                        |

Cada esquema exporta su tipo inferido con el mismo nombre sin el sufijo `Schema`.

En las conductas, `label` dice primero lo que pasó y después el término legal entre paréntesis, y
`situation` agrupa por situación cotidiana. Las conductas con el mismo nombre en la LGRA y en el
Código Penal Federal se muestran una sola vez: la clave principal es la de la LGRA y la del CPF
queda en `equivalentCodes`, que también se acepta. Ninguna clave anterior se perdió.

## `@sigilo/core`

Criptografía y formatos. Funciona igual en Node 22.18+ y en navegadores modernos.

| Módulo              | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Notas                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encoding.ts`       | `toBase64Url`, `fromBase64Url`, `toHex`, `fromHex`, `utf8Encode`, `utf8Decode`, `equalBytes(a, b)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Base64URL sin relleno y canónico. `equalBytes` recorre todo el arreglo                                                                                                                              |
| `random.ts`         | `randomBytes(length)`, `randomInt(maxExclusive)`, `shuffle(items)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Solo `crypto.getRandomValues`; `randomInt` con muestreo por rechazo; `shuffle` es Fisher-Yates                                                                                                      |
| `canonical-json.ts` | `canonicalize(value)`, `sha256Hex(data)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Llaves ordenadas por unidades UTF-16, sin espacios, solo enteros seguros                                                                                                                            |
| `dates.ts`          | `toDayDate(date)`, `toHourDate(date)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Siempre UTC y redondeadas                                                                                                                                                                           |
| `folio.ts`          | `generateFolio()`, `isFolio(value)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 60 bits, Base32 Crockford, `XXXX-XXXX-XXXX`                                                                                                                                                         |
| `receipt-phrase.ts` | `generateReceiptPhrase()`, `phraseToEntropy(words)`, `normalizeWord(word)`, `completeWord(prefix)`, `RECEIPT_WORD_COUNT`, `ReceiptPhraseError`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 8 palabras BIP39 español, 11 bits cada una, sin checksum. Normalización NFD sin marcas diacríticas y en minúsculas. `ReceiptPhraseError.position`: palabra (desde 1) o `null` si faltan palabras    |
| `receipt-keys.ts`   | `deriveReceiptKeys(entropy)`, `computeAuthVerifier(authKey)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Devuelve `authKey`, `authVerifier`, par X25519 del buzón y par Ed25519 de firma. HKDF-SHA256 con contextos `sigilo/v1/auth`, `sigilo/v1/box`, `sigilo/v1/sign`                                      |
| `keys.ts`           | `generateBoxKeyPair()`, `generateSigningKeyPair()`, `keyIdFor(publicKey)`, `assertBoxKeyPair(pair)`, `assertSigningKeyPair(pair)`, `buildPublicKeySet(keys)`                                                                                                                                                                                                                                                                                                                                                                                                                                      | `keyIdFor` = primeros 16 hex de SHA-256. Los `assert*` lanzan si la privada no corresponde                                                                                                          |
| `signing.ts`        | `sign(message, privateKey)`, `verify(signature, message, publicKey)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ed25519 estricto (sin ZIP-215)                                                                                                                                                                      |
| `envelope.ts`       | `sealToPublicKey(plaintext, recipient, aad)`, `openEnvelope(envelope, privateKey, aad)`, `envelopePlaintextLength(envelope)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | HPKE modo base, suite de `HPKE_SUITE_V1`. La longitud se calcula sin abrir el sobre                                                                                                                 |
| `padding.ts`        | `padToBlock(bytes, blockSize)`, `unpad(bytes)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Prefijo de longitud de 4 bytes                                                                                                                                                                      |
| `identity.ts`       | `sealIdentity(block, authority, context)`, `openIdentity(envelope, authorityPrivateKey, context)`, `computeContentDigest(content)`, `identityContextFor(source)`, `identityContextFromDetail(detail)`, `IDENTITY_PADDED_SIZE`                                                                                                                                                                                                                                                                                                                                                                     | Relleno fijo de 4096 bytes. AAD = `sigilo/v1/identity:` + `canonicalize({ authVerifier, reporterKeys, contentDigest })`                                                                             |
| `mailbox.ts`        | `sealMailboxMessage(text, recipient, senderSigningPrivateKey, binding)`, `openMailboxMessage(message, recipientPrivateKey, senderSigningPublicKey, folio)`, `verifyMailboxSignature(message, publicKey)`, `isMailboxSequenceComplete(messages)`, `nextMailboxSequence(messages, from)`, `MAILBOX_PADDED_SIZE`, `MAX_MAILBOX_TEXT_LENGTH`                                                                                                                                                                                                                                                          | `binding = { folio, from, sequence }`. AAD = `sigilo/v1/mailbox:` + folio + `:` + remitente + `:` + secuencia. Firma sobre `canonicalize({ envelope, from, sequence })`. Relleno fijo de 4096 bytes |
| `signed-receipt.ts` | `sealedIdentityDigest(envelope)`, `submissionDigestInput(request)`, `computeSubmissionDigest(request)`, `submissionDigestFromDetail(detail)`, `signReceipt(unsigned, serverPrivateKey)`, `verifyReceipt(receipt, serverPublicKey)`                                                                                                                                                                                                                                                                                                                                                                | El digesto del envío usa el sobre resumido; el comprobante firma `payloadDigest`, no `seq`                                                                                                          |
| `ledger.ts`         | `folioDigest(folio)`, `receiptTagFor(authVerifier)`, `computeEventHash(event)`, `pendingEventFor(input)`, `chainEvent(previous, pending)`, `buildEvent(previous, input)`, `verifyChain(events, previous?)` (motivo `date` si una fecha decrece), `verifyEventInChain(event, chain, head, serverPublicKey, options?)`, `signLedgerHead(head, privateKey)`, `verifyLedgerHead(head, publicKey)`, `receivedPayloadDigest(folio, submissionDigest)`, `verifyReceiptEvent(event, receipt)`, `identityOpenedPayload(opening)`, `identityOpenedPayloadDigest(opening)`, `reconcileIdentityOpenings(...)` | Primer `prevHash` = `LEDGER_GENESIS_HASH`. `verifyReceiptEvent` no compara `seq`. `reconcileIdentityOpenings` contrasta las aperturas publicadas con su `receiptTag` contra las del seguimiento     |
| `pow.ts`            | `leadingZeroBits(digest)`, `powDigest(token, counter)`, `isPowSolution(token, counter, bits)`, `solvePow(token, bits, options)`, `formatPowHeader(token, counter)`, `parsePowHeader(value)`, `powSolveSeconds(bits, quantile?, hashesPerSecond?)`, `SLOW_DEVICE_HASHES_PER_SECOND` (50 000)                                                                                                                                                                                                                                                                                                       | Hashcash sobre SHA-256 de `token + ":" + contador`                                                                                                                                                  |
| `index.ts`          | Reexporta todo lo anterior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |                                                                                                                                                                                                     |

Tipos públicos de `@sigilo/core`: `PendingLedgerEvent`, `IdentityOpening`,
`IdentityOpeningsReconciliation`, `SubmissionDigestInput`, `SolvePowOptions`, `KeyPair`, `DeploymentPublicKeys`, `ReceiptKeys`,
`EnvelopeRecipient`, `ComplaintContent`, `IdentityContext`, `IdentityContextSource`,
`MailboxBinding`, `SealedMailboxMessage` (`{ from, sequence, envelope, signature }`),
`SignedMailboxFields`, `UnsignedReceipt`, `LedgerEventInput`, `ChainFailureReason`,
`ChainVerification` y `UnsignedLedgerHead`.

## `@sigilo/huella`

Limpieza y revisión en el navegador. Las funciones puras se prueban en Node; las que usan canvas o
pdf.js se prueban en el navegador (E2E).

| Módulo                    | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invisible-characters.ts` | `findInvisibleCharacters(text, options?)` (categorías `zero_width`, `bidi_control`, `soft_hyphen`, `tag`, `variation_selector`, `other_format`, `filler`, `default_ignorable`, `nonstandard_space`, `combining_mark`, `uncomposed_mark`, `compatibility_form`, `control`, `private_use`, `unassigned`, `line_separator`, `mixed_script`, `confusable`, `typographic_variant`), `stripInvisibleCharacters(text, options?)` (NFC, y NFKC solo en formas de compatibilidad que marcan; opciones `shouldNormalizeTypography`, activa por omisión, y `shouldRemoveUncomposedMarks`) |
| `text-review.ts`          | `reviewText(text)` devuelve hallazgos `{ kind, start, end, excerpt, severity, suggestion }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `file-policy.ts`          | `classifyFile({ name, type, size }, { maxBytes? })` devuelve `image`, `pdf` o `rejected` con motivo y guía; `DEFAULT_MAX_FILE_BYTES`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `image-metadata.ts`       | `inspectImageMetadata(blob, { includeColorProfile?, allowGenericSrgbProfile? })` devuelve GPS, dispositivo, fecha de captura, software, autor y otros campos; `IMAGE_METADATA_LABELS` con el texto que se muestra de cada campo                                                                                                                                                                                                                                                                                                                                                |
| `image-sanitize.ts`       | `sanitizeImage(blob, options)` recodifica en canvas y devuelve `SanitizedImage` (`{ blob, width, height }`); `DEFAULT_MAX_IMAGE_DIMENSION`, `DEFAULT_JPEG_QUALITY`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pdf-rasterize.ts`        | `rasterizePdf(blob, options)` devuelve una imagen JPEG (`Blob`) por página; `DEFAULT_MAX_PDF_PAGES`, `DEFAULT_PDF_SCALE`, `DEFAULT_PDF_QUALITY`, `MAX_PAGE_DIMENSION`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `digest.ts`               | `digestBlob(blob)` SHA-256 en hexadecimal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `months.ts`               | `SPANISH_MONTHS`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `risk.ts`                 | `assessRisk(signals)` devuelve `{ level, score, reasons }`; `isWorkHours(date)`; pesos, topes y umbrales (`WEIGHT_*`, `CAP_TEXT_*`, `THRESHOLD_MEDIUM`, `THRESHOLD_HIGH`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| `index.ts`                | Reexporta todo lo anterior y sus tipos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

La copia limpia se vuelve a inspeccionar con `allowGenericSrgbProfile: true`: se acepta solo un
perfil ICC cuya descripción sea la del perfil genérico que agregan los codificadores del navegador
(`sRGB` en Chromium, `sRGB IEC61966-2.1` en WebKit). Se compara la descripción, no una huella
binaria del perfil.

Limpieza de texto (`stripInvisibleCharacters`):

- **Normalización.** El texto se normaliza con NFC. NFKC solo se aplica a las formas de
  compatibilidad de `MARKING_COMPATIBILITY_RANGES` (categoría `compatibility_form`): ligaduras y
  dígrafos latinos (`ĳ`, `ǆ`, `ﬁ`), «ſ», símbolos de letra que equivalen a una sola letra (`ℓ`,
  `ℂ`), números romanos, alfanuméricos encerrados (`①`, `ⓐ`), radicales Kangxi, formas CJK
  encerradas, verticales, pequeñas y de compatibilidad, formas de ancho completo y medio ancho, y
  letras y dígitos matemáticos. Fuera de esos bloques no se aplica NFKC, porque cambiaría usos
  legítimos: se conservan «º», «ª», los superíndices («m²», tonos del triqui y el chinanteco), las
  fracciones («½»), el saltillo (U+02BC y U+A78C) y «№», «™», «℃».
- **Confusables.** Un mapa de homoglifos (subconjunto de UTS #39 con prototipo de una letra latina)
  se aplica a todo token, incluso de una sola letra. Cubre cirílico, griego, armenio, cheroqui,
  Lisu, silabario canadiense, copto, tifinagh, latín extendido e IPA, y versalitas. No incluye
  letras del español ni de las lenguas indígenas de México (`ɨ` del wixárika, `ʉ`, el saltillo).
- **Puntuación.** `PUNCTUATION_CONFUSABLES` (puntuación de otros sistemas que se ve igual que la
  común) se aplica siempre y se reporta como `typographic_variant`. `TYPOGRAPHIC_VARIANTS` (guiones
  y comillas tipográficas que produce un teclado o un procesador de textos) solo se aplica con
  `shouldNormalizeTypography`, activa por omisión, que además colapsa espacios repetidos y quita
  espacios y tabuladores al final de la línea. `\r\n` pasa a `\n`.
- **`mixed_script`.** Una letra de un sistema de escritura distinto del latino (ni `Common` ni
  `Inherited`) y sin equivalente en los mapas, dentro de una palabra mayoritariamente latina o en
  una palabra suelta entre palabras latinas. Se señala, pero la limpieza no la cambia: puede ser
  parte de un nombre.
- **Marcas combinantes.** `LEGITIMATE_MARKS` (grave, agudo, circunflejo, tilde, macrón, diéresis,
  punto inferior, tilde inferior, macrón inferior y subrayado) se conservan sobre una vocal latina
  aunque no tengan forma compuesta en NFC: así se escriben las vocales subrayadas del otomí y el
  mazahua («a̱») y otras ortografías del mixteco, triqui, chinanteco y wixárika. Las demás marcas
  que no se componen se reportan como `uncomposed_mark`; la limpieza automática las conserva y solo
  la limpieza manual de la interfaz (`shouldRemoveUncomposedMarks: true`) las quita.
- **Costos conocidos.** Los textos rusos o griegos legítimos se transliteran en parte; la raya de
  diálogo pasa a `-`; «一» y «ー» pasan a `-` también en textos en chino o japonés.
- **Residual.** El apóstrofo U+02BC se conserva por ser saltillo, y se ve igual que «’».
- **Hallazgos según el contexto** (se reportan como `confusable`): los dígitos de cualquier sistema
  (`\p{Nd}`, como «०» o «๐») y «〇» pasan al dígito ASCII; «º» y «ª» entre dos letras («cºntrato»)
  pasan a «o» y «a», pero el ordinal «3º» no cambia; un superíndice antes de un dígito («¹05») pasa
  al dígito, pero los tonos («ni³») no cambian; «ː» se avisa siempre y pasa a «:» solo si no sigue a
  una letra («10ː30»), porque tras una vocal marca vocal larga; las letras modificadoras (como «ᵃ» o
  «ˢ») dentro de una palabra latina se avisan y no cambian, salvo los tonos «ˉ», «ˊ», «ˋ», que se
  conservan sin aviso. «ꞓ» y «Ꞓ» pasan a «c»; el clic «ǃ» y el operador «∙» son puntuación.
- **Contexto de los homoglifos.** La limpieza convierte un homoglifo solo dentro de una palabra
  mayoritariamente latina, o en una palabra suelta entre palabras latinas, salvo que su alfabeto
  aparezca en el texto con letras que no son homoglifos («coeficiente α y β») o que sea griego en una
  fórmula («sea α = 0.05»). Una palabra entera en otro alfabeto («Москва») no se translitera; sus
  homoglifos se siguen reportando para que la persona decida.
- **Saltillo.** «ʼ», «ꞌ» y «Ꞌ» se conservan siempre. Si el resto del texto no tiene rasgos de
  ortografía indígena (`hasIndigenousFeatures`: una letra indígena, un tono o una vocal con una marca
  de `LEGITIMATE_MARKS` que el español no usa), se avisa. Límite: un texto corto en una lengua
  indígena sin otros rasgos recibe el aviso, y un canario hecho con saltillos en un texto que sí los
  tiene no se distingue.
- **Marcas apiladas.** Una marca de `LEGITIMATE_MARKS` sobre una vocal se conserva; una segunda
  marca sin componer sobre la misma base («a̰̲») se reporta como `uncomposed_mark`.
- **Espacios.** Con `shouldNormalizeTypography`, también se colapsan los tabuladores repetidos y los
  saltos de línea de más de dos.
- La web cuenta como quitable solo lo que desaparece al limpiar (`summarizeSuspiciousCharacters` en
  `apps/web/src/lib/suspicious-characters.ts`) y muestra aparte lo que la persona debe revisar
  (letras de otro alfabeto, saltillo, letras modificadoras). El semáforo de riesgo y el aviso cuentan
  con `shouldNormalizeTypography: false`: no cuentan las variantes tipográficas del teclado.

Los mapas (`CONFUSABLES`, `PUNCTUATION_CONFUSABLES`, `TYPOGRAPHIC_VARIANTS`,
`MARKING_COMPATIBILITY_RANGES`) y `LEGITIMATE_MARKS` son internos del paquete: no se reexportan
desde `index.ts`.

## `@sigilo/server`

Implementa exactamente las rutas de `ROUTES` con los esquemas de `@sigilo/contracts`. Persistencia
en `node:sqlite` con migraciones numeradas:

| Migración | Contenido                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Esquema inicial y triggers de solo agregar de la bitácora                                                                                                                              |
| 2         | Índice único de `auth_verifier`, secuencia del buzón y triggers de solo agregar del buzón y de las aperturas                                                                           |
| 3         | Eventos pendientes (`ledger_pending`) y cierre diario barajado, aperturas con `openingId`, cambios de estatus con `changeId` y meses congelados de datos abiertos (`open_data_months`) |
| 4         | Tablas privadas `WITHOUT ROWID`, columna `received_month` indexada, semilla de ruido por mes en `open_data_months` y retiro de `has_been_tracked`                                      |
| 5         | Índice `ledger_events (at, seq)` para las páginas `since`                                                                                                                              |

Las migraciones 3 y 4 cambian el formato y rechazan una base con datos anteriores: piden ejecutar
`npm run demo:reset -- --yes`. La 4 existe porque, en una tabla con `rowid`, el `rowid` crece con
cada inserción y conserva el orden de llegada aunque la llave sea aleatoria: quien copiara la base
reconstruiría el orden que la bitácora baraja. La base abre con `PRAGMA secure_delete = ON`, para
que lo borrado se sobrescriba. Ver `docs/arquitectura.md`.

`server.lock` en el directorio de datos impide dos servidores sobre la misma base y permite a los
scripts saber si el servidor está en marcha. Se escribe en un archivo temporal y se publica con
`linkSync`, que falla si ya existe: nadie ve un bloqueo vacío o a medio escribir. El servidor lo
renueva cada 10 minutos. Se considera abandonado, y se sustituye con un aviso, si su proceso
terminó, su contenido no es válido desde hace más de 10 s (gracia para un bloqueo recién creado), es
anterior al arranque del sistema o lleva una hora sin renovarse.

### Publicación diaria de la bitácora

Cada evento nuevo queda pendiente, sin `seq`, con un identificador aleatorio. Su fecha es la mayor
entre hoy, el día siguiente al último evento encadenado y el último día con pendientes: si el reloj
retrocede, el evento no cae en un día ya publicado y las fechas de la cadena no decrecen.

Las lecturas no publican: solo lo hace una tarea programada cada 10 minutos (cada segundo con el
reloj de pruebas). La tarea es asíncrona: baraja los pendientes de cada día cerrado (UTC) y los
encadena en lotes de 1000, cada lote en su transacción, cediendo el event loop con `setImmediate`
entre lotes; si el cierre se interrumpe, lo que queda se vuelve a barajar. La cabeza pública es la
del último evento de un día publicado completo (o el génesis firmado si no hay ninguno): no avanza
mientras un día tenga pendientes. Un día está publicado si y solo si `at <= head.at`. Cada día
admite a lo más 200 000 pendientes; al llegar al tope, las escrituras de la persona denunciante
reciben `503 ledger_day_full`, pero los eventos de la autoridad (estatus, aperturas, mensajes) están
exentos. Después de cada cierre se hace un checkpoint del WAL.

`GET ledgerEvents` acepta `from=<seq>` o `since=AAAA-MM-DD` (no combinados) y `limit` de 1 a 500.
Con `since`, la página empieza en el último evento anterior a ese día (índice `(at, seq)`).

El comprobante identifica su evento por `payloadDigest`. `TrackingView.receivedEvent` falta mientras
su día no cierra; después la persona lo verifica con `verifyReceiptEvent` y verifica el tramo desde
su día. `ComplaintDetail` trae `receivedEventSeq` cuando el evento ya se publicó, para que la
autoridad verifique las llaves del denunciante contra él. En el seguimiento y en el buzón de la
autoridad se pueden pegar anclas publicadas para comparar ese tramo con ellas.

### Prueba de trabajo

`GET /api/v1/pow/challenge?purpose=complaint|message` entrega un reto firmado con HMAC (llave
aleatoria por proceso); cualquier otro propósito, incluido `evidence`, responde `400 bad_request`.

- Un reto `message` sirve para un mensaje.
- Un reto `complaint` sirve para las hasta 10 subidas de pruebas de una denuncia y después para la
  denuncia, que lo cierra: una denuncia con sus pruebas resuelve un solo reto.

`POST complaints`, `POST evidence` y `POST tracking/messages` exigen la cabecera
`X-Sigilo-Pow: <token>:<contador>` y responden `428 proof_required` si falta, no es válida, es de
otro propósito, venció, agotó sus usos o su dificultad es menor que `max(base, actual - 1)`: un reto
emitido justo antes de que suba la dificultad todavía sirve, pero no uno de dos o más bits menos.

La dificultad parte de `SIGILO_POW_BITS` (18; 0 la desactiva) y sube con la carga hasta
`SIGILO_POW_MAX_BITS` (20 por omisión). La vigencia de cada reto es un margen (5 minutos, que baja
hasta 1 minuto cuando se llena la lista de retos gastados) más 4 veces el percentil 95 del tiempo de
resolución en un celular básico (`powSolveSeconds`): `p95 = ln(20) · 2^bits / 50 000` segundos,
con `SLOW_DEVICE_HASHES_PER_SECOND` = 50 000. A 18 bits, `4 · p95` son unos 63 s (vigencia de unos 6
minutos); a 20 bits, unos 4.2 minutos (vigencia de unos 9). Ver
`docs/criptografia.md` y la guía de despliegue en `docs/integracion-s5.md`.

### Límites

Los límites viven en memoria y no usan direcciones IP (no se registran). Cada limitador guarda a lo
más 100 000 llaves y descarta las usadas hace más tiempo (LRU); las ventanas vencidas se barren de
forma amortizada, a lo más una vez por ventana.

| Límite                     | Por omisión                    | Efecto al excederse                                      |
| -------------------------- | ------------------------------ | -------------------------------------------------------- |
| `authFailuresPerFolio`     | 10 fallos por folio por hora   | `rate_limited` en ese folio hasta que vence la ventana   |
| `authFailuresGlobal`       | 600 fallos por minuto          | Cada intento espera 10 ms por fallo de exceso, hasta 2 s |
| `reporterMessagesPerFolio` | 30 mensajes por folio por hora | `rate_limited` al enviar                                 |

Ya no hay frenos globales de escrituras: un tope global sin identidad lo puede agotar un atacante
para todas las personas. Contra la saturación quedan la prueba de trabajo adaptativa, la cuota de
almacenamiento y el tope diario de la bitácora. Solo un intento fallido (`not_found`) consume los límites de autenticación, y las credenciales
correctas siempre se aceptan, aunque el folio haya agotado sus fallos. El freno global de fallos
nunca deja fuera a las personas denunciantes, pero durante un ataque todas esperan hasta 2 s.

### Almacenamiento y retención

| Variable                         | Por omisión | Efecto                                                                                  |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `SIGILO_EVIDENCE_QUOTA_BYTES`    | 5 GiB       | Cuota total de pruebas guardadas                                                        |
| `SIGILO_EVIDENCE_RETENTION_DAYS` | 30          | Días que se conservan las pruebas de denuncias sin atender (en `received`); 0 desactiva |

`SIGILO_UNTRACKED_RETENTION_DAYS` se retiró: el servidor se niega a arrancar si se define. El
seguimiento ya no exime de la retención; la autoridad conserva las pruebas de una denuncia
atendiéndola, es decir, moviéndola de `received` a otro estatus (por ejemplo, `routing`).

Reparto de la cuota:

- Las pruebas pendientes (subidas sin denuncia) pueden ocupar a lo más el 25 %.
- Cada denuncia puede ocupar a lo más `max(10 MiB, cuota / 100)`; si sus pruebas lo exceden, el
  envío recibe `413 payload_too_large`.
- Si una prueba no cabe en la cuota total o en la parte de pendientes: `507 storage_full`. Nunca se
  borran pruebas ya asociadas a una denuncia para hacer sitio: no aceptar más es preferible a perder
  pruebas de corrupción.

`ComplaintDetail.evidenceDeletionOn` indica el día en que la retención borrará las pruebas de una
denuncia sin atender; el panel de la autoridad lo muestra.

Las pruebas pendientes se purgan al arrancar y cada hora cuando tienen más de 24 h; la fecha de
subida se guarda solo por día, así que se borran entre 24 y 48 h después. La retención no toca la
denuncia, sus descriptores ni la bitácora; la autoridad recibe `not_found` al pedir un archivo
borrado.

### Registro de peticiones

`SIGILO_REQUEST_LOG`:

- `aggregate` (por omisión): contadores por hora, sin las rutas de la persona denunciante (envíos,
  pruebas, seguimiento, mensajes y reto) ni `GET keys` y la bitácora, que la web consulta justo
  antes y después de enviar y al dar seguimiento.
- `requests`: una línea por petición (método, ruta normalizada, estatus, duración); solo en
  desarrollo, se rechaza con `NODE_ENV=production`.
- `off`: nada.

Nunca se registran IP, agente de usuario, cuerpos ni folios.

### Datos abiertos

Cada mes cerrado se congela una sola vez en `open_data_months` (de solo agregar) con sus conteos
reales y una semilla secreta de ruido, y no vuelve a cambiar aunque cambien los estatus. La
conducta se guarda con su clave principal (`primaryOffenseCode`) y las consultas usan la columna
indexada `received_month`. El CSV solo incluye meses congelados: cada conteo se redondea al azar,
sin sesgo, a un múltiplo de 5 con el ruido de la semilla del mes (valores estables) y lo que
redondea a menos de 5 se suprime. Lo suprimido se suma por mes, se redondea igual y va en la fila
`suprimidas,,,,<n>`. El CSV se guarda en caché hasta que se congela el siguiente mes. La garantía y
sus límites están en `docs/criptografia.md`.

### Listado de la autoridad

`GET authority/complaints` acepta `offset` (0 por omisión) y `limit` (100 por omisión; un valor
mayor que 500 se recorta a 500).

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

## Cliente de la API en `apps/web`

`apps/web/src/services/api.ts` envuelve las rutas de `ROUTES`. Cambios de esta versión:

- `sendReporterMessage(request, proof)`: el mensaje de la persona denunciante lleva la prueba de
  trabajo de propósito `message`. Las subidas de pruebas reutilizan el reto `complaint` de su
  denuncia.
- `listComplaints(token, offset, limit)`: listado paginado de la autoridad (100 por página).
- `getLedgerSince(day, limit)`: tramo de la bitácora desde el último evento anterior a `day`.
- `loadTrackingLedger(view, pinned, ledgerApi)` (en `crypto/tracking.ts`): descarga y verifica una
  sola vez el tramo desde el día de recepción hasta la cabeza firmada, para el evento de recepción y
  la conciliación de aperturas.

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
