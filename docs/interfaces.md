# Interfaces entre paquetes

Contrato interno que respetan todos los módulos. Los cambios a este documento requieren un ADR o
una nota en el pull request que los justifique.

## `@sigilo/contracts`

Esquemas zod y tipos de la API v1, rutas (`ROUTES`), constantes y catálogos públicos. Solo contiene
búsquedas por clave en los catálogos; no tiene más lógica.

| Módulo                | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `primitives.ts`       | `FolioSchema`, `Base64UrlSchema`, `Sha256HexSchema`, `DayDateSchema`, `HourDateSchema`, `MonthPeriodSchema`, `KeyIdSchema`, `CROCKFORD_ALPHABET`, `FOLIO_PATTERN`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `catalogs/`           | `STATES` (32 entidades INEGI), `MUNICIPALITIES` (18 de Querétaro), `PUBLIC_ENTITIES` (sintéticos), `OFFENSES`, `OFFENSE_SITUATIONS`, `OFFENSE_LAW_NAMES`, `GOVERNMENT_LEVEL_LABELS` y búsquedas `findState`, `isStateCode`, `municipalitiesOf`, `findMunicipality`, `isMunicipalityOf`, `findEntity`, `isEntityId`, `findOffense`, `isOffenseCode`, `primaryOffenseCode`, `offenseReference`; catálogo del trámite (`catalogs/procedure.ts`): `MANAGEMENT_STATES`, `CLOSURE_REASONS`, `ADMINISTRATIVE_STAGES`, `CRIMINAL_STAGES`, `LEGAL_STAGES`, `PROCEDURE_ACTORS`, `DEADLINE_RULES`, `COMPLAINT_STATUSES`, `PROCEDURE_LAW_NAMES` y búsquedas `findManagementState`, `findClosureReason`, `findLegalStage`, `findProcedureActor`, `findDeadlineRule`, `findComplaintStatus`, `isManagementTransition`, `formatLegalReference`; días inhábiles (`catalogs/rest-days.ts`): `OFFICIAL_REST_DAYS`, `OFFICIAL_REST_DAYS_COVERAGE`; `offenseSeverity(code)`, `describeLegalReference`, reglas públicas `ESCALATION_RULES` (`catalogs/escalation.ts`) con `ESCALATION_RULES_VERSION` y `findEscalationRule` |
| `complaint.ts`        | `ComplaintFactsSchema` (claves validadas contra los catálogos y municipio de la entidad), `StateCodeSchema`, `MunicipalityCodeSchema`, `EntityIdSchema`, `OffenseCodeSchema`, `IdentityBlockSchema`, `ReporterKeysSchema`, `SubmitComplaintRequestSchema` (reglas por modo), `SignedReceiptSchema`, `EvidenceDescriptorSchema`, `MAX_EVIDENCE_ITEMS`, `MAX_EVIDENCE_BYTES`; `escalationEnvelope` opcional en el envío y `EscalationContentSchema`; las peticiones usan `z.strictObject` (un campo desconocido es `400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `mailbox.ts`          | `MailboxSenderSchema`, `MailboxSequenceSchema`, `MailboxMessageSchema` (con `sequence`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tracking.ts`         | `TrackingCredentialsSchema`, `TrackingViewSchema` (`receivedEvent` opcional: falta mientras su día no cierra; `evidenceDiscards` con los descartes de pruebas), `EvidenceDiscardEntrySchema` (`{ on, count }`), `ReporterMessageRequestSchema` (con `sequence`), `TimelineEntrySchema`, `OpeningIdSchema`, `IdentityAccessEntrySchema` (con `openingId`); `procedure` (línea de tiempo, plazos y reglas) en la vista y `approvalCount` en cada apertura                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `authority-access.ts` | `AccountIdSchema` (seudónimo `acct-…`), `AuthorityFunctionSchema` (`intake`, `investigation`, `supervision`, `substantiation`), `AuthorityFunctionsSchema` y `isAllowedFunctionSet` (una función, o `intake` e `investigation` juntas), `hasFunction`, `functionForStage` y `functionInChargeAt`, `UsernameSchema`, `PasswordSchema`, `LoginRequestSchema`, `AuthorityProfileSchema`, `AuthorityAccountViewSchema`, `AuthoritySessionSchema`, `AuthoritySessionInfoSchema`, `SESSION_IDLE_TIMEOUT_SECONDS` (900), `SESSION_ABSOLUTE_TIMEOUT_SECONDS` (28 800), `PasswordHashSchema`, `AuthorityAccountRecordSchema`, `AuthorityAccountsFileSchema` (`authority-accounts.json`); `AuthorityIdSchema` viene de `network.ts`                                                                                                                                                                                                                                                                                                                                                                              |
| `procedure-view.ts`   | `LegalDaySchema` (día civil en la hora del centro), `PublicNoteSchema`, `LegalBasisTextSchema`, `AgreementTextSchema`, `ProcedureActionRequestSchema` (unión por `action`: `route`, `accept`, `reassign`, `return`, `advance_stage`, `close`), `ProcedureStateSchema`, `ProcedureStepSchema`, `DeadlineViewSchema`, `ClosureViewSchema`, `RuleTriggerViewSchema`, `ProcedureViewSchema`, `ClosureRecordSchema`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `authority.ts`        | `ComplaintSummarySchema`, `ComplaintDetailSchema` (con `version`, `reporterKeys`, `authVerifier`, `sealedIdentityDigest` en modo sellado y `receivedEventSeq` cuando se publica su evento, `evidenceDeletionOn` y `storedEvidenceCount`), `DiscardEvidenceResponseSchema` (`{ discarded }`), `OpenIdentityRequestSchema`, `OpenIdentityResponseSchema` (`sealedIdentity`, `openingId`), `UpdateStatusRequestSchema`, `AuthorityMessageRequestSchema` (con `sequence`); nodo de varias autoridades: `managementState` y `assignedAuthorityId` en el resumen, `procedure`, `identityRequests` y `escalationEnvelopeDigest` en el detalle, `ApproveIdentityRequestSchema`, `IdentityOpeningRequestViewSchema`, `IdentityApprovalSchema`, `IDENTITY_APPROVAL_THRESHOLD` (2), `IDENTITY_REQUEST_TTL_DAYS` (7), `EscalationSummarySchema`, `EscalationDeliverySchema`; se retiró `UpdateStatusRequestSchema`                                                                                                                                                                                                 |
| `ledger.ts`           | `LedgerEventTypeSchema` (incluye `evidence.discarded`), `LedgerEventSchema` (`receiptTag` solo en `identity.opened`), `SignedLedgerHeadSchema`, `LedgerPageSchema`, `LedgerAnchorSchema`, `LEDGER_GENESIS_HASH`; eventos `identity.approved` y `rule.triggered`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `keys.ts`             | `PublicKeySetSchema`, `KeysFileSchema` (`keys.json`), `AuthorityDemoKeySchema` (`authority-demo-key.json`); `PublicKeySet.supervisor` opcional (segunda llave) y `SupervisorDemoKeySchema` (`supervisor-demo-key.json`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `routes.ts`           | `API_PREFIX`, `ROUTES` (incluye `powChallenge` y `authorityEvidenceDiscard`; `ledgerEvents` acepta `from` o `since`, y `authorityComplaints`, `offset` y `limit`), `OPEN_DATA_MIN_CELL` (5), `OPEN_DATA_ROUNDING` (5); nodo de varias autoridades: `authLogin`, `authLogout`, `authSession`, `authorityAuthorities`, `authorityProcedure`, `authorityIdentityRequests`, `authorityIdentityApprovals`, `authorityIdentityEnvelope`, `authorityClosures`, `authorityEscalations`, `authorityEscalationEnvelope` (se retiraron `authorityIdentity` y `authorityStatus`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pow.ts`              | `PowPurposeSchema` (`complaint`, `message`), `PowChallengeSchema` (`{ token, bits }`), `MAX_POW_BITS` (32, tope del esquema), `POW_HEADER` (`X-Sigilo-Pow`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `procedure.ts`        | `ManagementStateSchema`, `ClosureReasonSchema`, `LegalTrackSchema`, `AdministrativeStageSchema`, `CriminalStageSchema`, `LegalStageSchema`, `ProcedureActorSchema`, `DeadlineUnitSchema`, `DeadlineKeySchema`, `DeadlineTermSchema`, `DeadlineStatusSchema`; `ProcedureActionSchema`, `OffenseSeveritySchema`, `EscalationRuleKeySchema`, `RuleEffectSchema`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `errors.ts`           | `ApiErrorCodeSchema` (incluye `proof_required`, 428; `storage_full`, 507; y `ledger_day_full`, 503), `ApiErrorSchema`, `API_ERROR_HTTP_STATUS`, `API_ERROR_MESSAGES`, `API_ERROR_DESCRIPTIONS`; `forbidden` (403, la función no permite la acción) y `conflict` (409, el flujo no la admite); `API_ERROR_HTTP_STATUS` tipado como `ApiErrorHttpStatus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Cada esquema exporta su tipo inferido con el mismo nombre sin el sufijo `Schema`. Los esquemas
llevan su descripción en español con `.meta({ description })`; de ahí salen el OpenAPI y el
diccionario de datos. `x-catalog` marca los campos validados contra un catálogo.

El trámite tiene dos capas. `ComplaintStatusSchema` (los 7 estatus de la API v1) no cambia;
`COMPLAINT_STATUSES` da el nombre y la explicación de cada uno y lo ubica en el flujo de gestión
(`managementState`) y, si aplica, en la etapa legal (`legalStage`). La web toma de ahí
`STATUS_LABELS` y `STATUS_HINTS`, con los mismos textos de antes.

El estatus HTTP y el mensaje de cada código de error viven en `API_ERROR_HTTP_STATUS` y
`API_ERROR_MESSAGES`; el servidor los usa sin copiarlos.

### `@sigilo/contracts/standard`

Entrada aparte (no se carga en la web) con lo que define el Estándar S5 en `estandar/`:

| Exporta               | Contenido                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `STANDARD_VERSION`    | Versión SemVer del estándar (0.2.0), independiente de la del software                       |
| `STANDARD_OPERATIONS` | Cada operación: método, ruta de `ROUTES` en notación OpenAPI, esquemas, seguridad y errores |
| `STANDARD_COMPONENTS` | Esquemas con nombre en `components.schemas`, en el orden del diccionario                    |
| `STANDARD_TAGS`       | Secciones del documento                                                                     |
| `STANDARD_EXAMPLES`   | Ejemplo sintético de cada cuerpo, por nombre de archivo de `estandar/ejemplos/`             |
| `STANDARD_POW_HEADER` | Cabecera de la prueba de trabajo para el esquema de seguridad                               |

`npm run standard:build` (`scripts/build-standard.ts` y `scripts/standard/`) genera `estandar/`;
`scripts/standard/standard.test.ts` falla si no está al día, y
`apps/server/src/standard-conformance.test.ts` compara las rutas del servidor con
`STANDARD_OPERATIONS`.

En las conductas, `label` dice primero lo que pasó y después el término legal entre paréntesis, y
`situation` agrupa por situación cotidiana. Las conductas con el mismo nombre en la LGRA y en el
Código Penal Federal se muestran una sola vez: la clave principal es la de la LGRA y la del CPF
queda en `equivalentCodes`, que también se acepta. Ninguna clave anterior se perdió.

## `@sigilo/core`

Criptografía y formatos. Funciona igual en Node 22.18+ y en navegadores modernos.

| Módulo                | Exporta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encoding.ts`         | `toBase64Url`, `fromBase64Url`, `toHex`, `fromHex`, `utf8Encode`, `utf8Decode`, `equalBytes(a, b)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Base64URL sin relleno y canónico. `equalBytes` recorre todo el arreglo                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `random.ts`           | `randomBytes(length)`, `randomInt(maxExclusive)`, `shuffle(items)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Solo `crypto.getRandomValues`; `randomInt` con muestreo por rechazo; `shuffle` es Fisher-Yates                                                                                                                                                                                                                                                                                                                                                                                                             |
| `canonical-json.ts`   | `canonicalize(value)`, `sha256Hex(data)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Llaves ordenadas por unidades UTF-16, sin espacios, solo enteros seguros                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `dates.ts`            | `toDayDate(date)`, `toHourDate(date)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Siempre UTC y redondeadas; `toMexicoCentralDay(date)`: día civil en `America/Mexico_City`, con el que se cuentan los plazos legales                                                                                                                                                                                                                                                                                                                                                                        |
| `folio.ts`            | `generateFolio()`, `isFolio(value)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 60 bits, Base32 Crockford, `XXXX-XXXX-XXXX`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `receipt-phrase.ts`   | `generateReceiptPhrase()`, `phraseToEntropy(words)`, `normalizeWord(word)`, `completeWord(prefix)`, `RECEIPT_WORD_COUNT`, `ReceiptPhraseError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 8 palabras BIP39 español, 11 bits cada una, sin checksum. Normalización NFD sin marcas diacríticas y en minúsculas. `ReceiptPhraseError.position`: palabra (desde 1) o `null` si faltan palabras                                                                                                                                                                                                                                                                                                           |
| `receipt-keys.ts`     | `deriveReceiptKeys(entropy)`, `computeAuthVerifier(authKey)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Devuelve `authKey`, `authVerifier`, par X25519 del buzón y par Ed25519 de firma. HKDF-SHA256 con contextos `sigilo/v1/auth`, `sigilo/v1/box`, `sigilo/v1/sign`                                                                                                                                                                                                                                                                                                                                             |
| `keys.ts`             | `generateBoxKeyPair()`, `generateSigningKeyPair()`, `keyIdFor(publicKey)`, `assertBoxKeyPair(pair)`, `assertSigningKeyPair(pair)`, `buildPublicKeySet(keys)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `keyIdFor` = primeros 16 hex de SHA-256. Los `assert*` lanzan si la privada no corresponde                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `signing.ts`          | `sign(message, privateKey)`, `verify(signature, message, publicKey)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ed25519 estricto (sin ZIP-215)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `envelope.ts`         | `sealToPublicKey(plaintext, recipient, aad)`, `openEnvelope(envelope, privateKey, aad)`, `envelopePlaintextLength(envelope)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | HPKE modo base, suite de `HPKE_SUITE_V1`. La longitud se calcula sin abrir el sobre                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `padding.ts`          | `padToBlock(bytes, blockSize)`, `unpad(bytes)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Prefijo de longitud de 4 bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `identity.ts`         | `sealIdentity(block, authority, context)`, `openIdentity(envelope, authorityPrivateKey, context)`, `computeContentDigest(content)`, `identityContextFor(source)`, `identityContextFromDetail(detail)`, `IDENTITY_PADDED_SIZE`                                                                                                                                                                                                                                                                                                                                                                                                                                       | Relleno fijo de 4096 bytes. AAD = `sigilo/v1/identity:` + `canonicalize({ authVerifier, reporterKeys, contentDigest })`                                                                                                                                                                                                                                                                                                                                                                                    |
| `mailbox.ts`          | `sealMailboxMessage(text, recipient, senderSigningPrivateKey, binding)`, `openMailboxMessage(message, recipientPrivateKey, senderSigningPublicKey, folio)`, `verifyMailboxSignature(message, publicKey)`, `isMailboxSequenceComplete(messages)`, `nextMailboxSequence(messages, from)`, `MAILBOX_PADDED_SIZE`, `MAX_MAILBOX_TEXT_LENGTH`                                                                                                                                                                                                                                                                                                                            | `binding = { folio, from, sequence }`. AAD = `sigilo/v1/mailbox:` + folio + `:` + remitente + `:` + secuencia. Firma sobre `canonicalize({ envelope, from, sequence })`. Relleno fijo de 4096 bytes                                                                                                                                                                                                                                                                                                        |
| `signed-receipt.ts`   | `sealedIdentityDigest(envelope)`, `submissionDigestInput(request)`, `computeSubmissionDigest(request)`, `submissionDigestFromDetail(detail)`, `signReceipt(unsigned, serverPrivateKey)`, `verifyReceipt(receipt, serverPublicKey)`                                                                                                                                                                                                                                                                                                                                                                                                                                  | El digesto del envío usa el sobre resumido; el comprobante firma `payloadDigest`, no `seq`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ledger.ts`           | `folioDigest(folio)`, `receiptTagFor(authVerifier)`, `computeEventHash(event)`, `pendingEventFor(input)`, `chainEvent(previous, pending)`, `buildEvent(previous, input)`, `verifyChain(events, previous?)` (motivo `date` si una fecha decrece), `verifyEventInChain(event, chain, head, serverPublicKey, options?)` (motivo `anchor-not-comparable` si un ancla es anterior al tramo), `signLedgerHead(head, privateKey)`, `verifyLedgerHead(head, publicKey)`, `receivedPayloadDigest(folio, submissionDigest)`, `verifyReceiptEvent(event, receipt)`, `identityOpenedPayload(opening)`, `identityOpenedPayloadDigest(opening)`, `reconcileIdentityOpenings(...)` | Primer `prevHash` = `LEDGER_GENESIS_HASH`. `verifyReceiptEvent` no compara `seq`. `reconcileIdentityOpenings` contrasta las aperturas publicadas con su `receiptTag` contra las del seguimiento                                                                                                                                                                                                                                                                                                            |
| `deadlines.ts`        | `createBusinessCalendar({ nonBusinessDays, coverage })`, `DEFAULT_BUSINESS_CALENDAR`, `isBusinessDay(day, calendar)`, `addNaturalDays(start, n)`, `addBusinessDays(start, n, calendar)`, `addCalendarMonths(start, n)`, `computeDueDate(start, term, calendar?)`, `termForRule(rule, amount?)`, `remainingDays(today, dueOn, unit, calendar?)`, `deadlineStatus(today, dueOn, warning, calendar?)`, `evaluateDeadline(key, start, today, { amount?, calendar? })`                                                                                                                                                                                                   | Días `AAAA-MM-DD`. El plazo cuenta desde el día siguiente al acto; los naturales no se recorren; los hábiles saltan sábados, domingos y los días del calendario; meses y años ajustan al último día de un mes corto. El calendario lanza fuera de su `coverage`. Estados `running`, `due_soon` (faltan `warning` días o menos, incluido el último) y `overdue`; `start` y `today` son días legales en la hora del centro; `DeadlineEvaluation.remainingUnit` y `remaining` en esa unidad también si venció |
| `escalation.ts`       | `ESCALATION_PADDED_SIZE` (49 152), `sealEscalation(content, supervisor, context)`, `openEscalation(envelope, supervisorPrivateKey, context)`, `escalationEnvelopeDigest(envelope)`, `submissionDigestFromEscalation(content, delivery)`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `escalation-rules.ts` | `evaluateEscalationRules(snapshot, today, { calendar?, rules? })` devuelve las reglas cumplidas (`{ key, effect, anchorOn, dueOn }`); `activeDeadlines(snapshot, { isAccepted })`; tipo `ProcedureSnapshot`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pow.ts`              | `leadingZeroBits(digest)`, `powDigest(token, counter)`, `isPowSolution(token, counter, bits)`, `solvePow(token, bits, options)`, `formatPowHeader(token, counter)`, `parsePowHeader(value)`, `powSolveSeconds(bits, quantile?, hashesPerSecond?)`, `SLOW_DEVICE_HASHES_PER_SECOND` (50 000)                                                                                                                                                                                                                                                                                                                                                                         | Hashcash sobre SHA-256 de `token + ":" + contador`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `index.ts`            | Reexporta todo lo anterior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Tipos públicos de `@sigilo/core`: `BusinessCalendar`, `DeadlineEvaluation`, `PendingLedgerEvent`, `IdentityOpening`,
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

Rutas adicionales (para usar el semáforo sin cargar pdf.js): `@sigilo/huella/risk` y
`@sigilo/huella/months`.

## `@sigilo/anonimato`

Grupo de anonimato en el navegador de quien denuncia (ADR 0008). Detalle en
[`packages/anonimato/README.md`](../packages/anonimato/README.md).

| Módulo             | Exporta                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `normalize.ts`     | `textKey`, `institutionNameKey(raw, stateCode)`, `institutionKey`, `areaKey`, `FEDERAL_STATE_CODE`: réplica de `datos/proceso/pdn/normalize.py`, probada contra el propio Python. También en `@sigilo/anonimato/normalize`                                         |
| `fragment.ts`      | `parseAnonymityIndex`, `parseAnonymityFragment` y los tipos `AnonymityIndex`, `AnonymityFragment`, `EnteRecord`, `AreaRecord`, `PoolRecord`, `BucketLabel` (`1-4`, `5-9`, `10-49`, `50+`)                                                                          |
| `loader.ts`        | `createAnonymityLoader({ fetch, basePath?, shouldVerifyDigest? })` con `loadIndex()` y `loadState(stateCode)` (un solo fragmento por cargador, solo rutas del mismo origen, SHA-256 contra el índice); `fragmentKeyFor(stateCode, isFederalEnte)`; `AnonymityData` |
| `assess.ts`        | `assessAnonymityGroup(data, { ente, area? })` devuelve `{ bucket, level, groupName, isContracting, isAreaUnlisted, risk, title, reasons, actions, cutoffDate }`; `listEntes`, `listAreas`, `findEnte`, `describeAssessment`, etiquetas en español                  |
| `risk-factor.ts`   | `anonymityRiskReason(group)`, `withAnonymityFactor(assessRisk(...), group)` (mismo tipo `RiskAssessment`) y los pesos `WEIGHT_ANONYMITY_*`                                                                                                                         |
| `demo-fragment.ts` | `@sigilo/anonimato/demo`: índice y fragmentos sintéticos (`DEMO_FILES`)                                                                                                                                                                                            |

Niveles: `area`, `ente`, `government-order` (otros entes del mismo orden), `none`. Riesgos: `low`,
`medium`, `high`, `unknown`. Acciones: `generalize-narrative`, `defer-submission`,
`consider-custody`.

## `@sigilo/corroboracion`

Corroboración ciega con VOPRF de RFC 9497 y una persona = una corroboración (ADR 0006 y 0010).
Detalle en [`packages/corroboracion/README.md`](../packages/corroboracion/README.md); formato en
[criptografia.md](criptografia.md#corroboración-ciega-voprf). Los servicios están en
`apps/corroboracion` (evaluador OPRF e índice de coincidencias).

| Módulo            | Exporta                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identifier.ts`   | `normalizeIdentifier(identifier)`, `corroborationLabel`, `corroborationInput` y las normalizaciones por tipo; `CorroborationIdentifier` (`servidor` con `name` y `entityId`, `rfc`, `ocid`)                       |
| `oprf.ts`         | `blindCorroboration(identifier, key)`, `finalizeCorroboration(state, response, key)` → `{ epoch, tag, similarityKey }` (lanza si la prueba DLEQ falla), `evaluatorKeyFromDirectory`; evaluador: `evaluateBlinded` |
| `similarity.ts`   | `similarityDigest(text, similarityKey)` → 64 bytes o `null`; `estimateSimilarity(a, b)`                                                                                                                           |
| `independence.ts` | `assessIndependence(complaints, policy?)` → `{ complaints, independentSources, origins, byComplaint }`                                                                                                            |
| `signatures.ts`   | `folioDigestFor`, firma y verificación de registro, avisos y conteo diario; `buildEvaluatorKey`                                                                                                                   |
| `custody.ts`      | `createCustody`, `advanceCustody(record, event)`, `custodyDeadline`, `sealForCustody`, `openReleasedCustody`, `deriveCustodyReleaseKeys`, `signCustodyRelease`                                                    |

## `@sigilo/contexto-pdn`

Contexto de la PDN para el nodo y el panel de la autoridad, nunca para quien denuncia (ADR 0007,
0008 y 0010). Detalle en [`packages/contexto-pdn/README.md`](../packages/contexto-pdn/README.md).

| Módulo                 | Exporta                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`             | Fuentes `DeclaredInterestsSource` (S1), `ProcurementStaffSource` (S2), `SanctionsSource` (S3), `ContractsSource` (S6), `TaxListSource` (69-B), con `info` (`SourceInfo`) y `scope` (`SourceScope`); `Verification` (`confirmed`, `contradicted`, `no_coverage` con `reason`) |
| `coverage.ts`          | `parseCoverageMatrix`, `assessCoverage({ matrix, source, stateCode, institution?, date? })`, `NO_COVERAGE_TEXT`, `pickSource`                                                                                                                                                |
| `citation.ts`          | `citeSource(info)` («S6 federal, datos a enero de 2023»), `formatDataDate`, `formatAmount`, `daysBetween`, `addDays`                                                                                                                                                         |
| `conflict.ts`          | `checkConflictOfInterest({ matrix, s1, s2, authorityHead, accused })` devuelve `possible-conflict`, `none-found` o `no_coverage`, alertas `conflict.shared-interest` y `conflict.chain-of-command`, y `blocksRouting: false`                                                 |
| `contract.ts`          | `verifyCitedContract`, `extractContractClaims`, `contractEvidence`, `PROCUREMENT_METHOD_LABELS`                                                                                                                                                                              |
| `tax-list.ts`          | `checkTaxList`, `checkContractSuppliers`, `TAX_LIST_STATUS_LABELS`                                                                                                                                                                                                           |
| `sanction.ts`          | `verifySanction`, `checkUnverifiableSanction` (señal `accountability.sanction-unverifiable`, plazo configurable)                                                                                                                                                             |
| `priority.ts`          | `buildContextSheet(input, config?)`, `PRIORITY_CONFIG` (publicado en `config/prioridad.json`), `classifyOffense`                                                                                                                                                             |
| `synthetic-sources.ts` | `@sigilo/contexto-pdn/synthetic`: `createSyntheticSources({ today })`, `SYNTHETIC_COVERAGE_MATRIX`, `SCENARIO_DAY_ZERO`                                                                                                                                                      |
| `sqlite-sources.ts`    | `@sigilo/contexto-pdn/sqlite` (solo Node): `openSqliteSources({ s3Path, s6Path })` en solo lectura; las rutas inexistentes desactivan la fuente                                                                                                                              |

## `@sigilo/server`

Implementa exactamente las rutas de `ROUTES` con los esquemas de `@sigilo/contracts`. Persistencia
en `node:sqlite` con migraciones numeradas:

| Migración | Contenido                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Esquema inicial y triggers de solo agregar de la bitácora                                                                                                                                                                                                                                                                                                        |
| 2         | Índice único de `auth_verifier`, secuencia del buzón y triggers de solo agregar del buzón y de las aperturas                                                                                                                                                                                                                                                     |
| 3         | Eventos pendientes (`ledger_pending`) y cierre diario barajado, aperturas con `openingId`, cambios de estatus con `changeId` y meses congelados de datos abiertos (`open_data_months`)                                                                                                                                                                           |
| 4         | Tablas privadas `WITHOUT ROWID`, columna `received_month` indexada, semilla de ruido por mes en `open_data_months` y retiro de `has_been_tracked`                                                                                                                                                                                                                |
| 5         | Índice `ledger_events (at, seq)` para las páginas `since`                                                                                                                                                                                                                                                                                                        |
| 6         | Registro de solo agregar `evidence_discards` (descartes de pruebas por la autoridad)                                                                                                                                                                                                                                                                             |
| 7         | Nodo de varias autoridades: columnas `received_legal_on`, `assigned_authority`, `management_state`, `legal_stage`, `closure_reason` y `escalation_envelope_json`; tablas de solo agregar `procedure_steps`, `closure_agreements`, `identity_requests`, `identity_approvals` (índice único por solicitud y cuenta), `rule_triggers` y `authority_security_events` |
| 8         | Red y contexto: `conflict_reviews`, `sanction_checks`, `audit_signals` (única por regla, sujeto y clave), `corroboration_registrations`, `corroboration_status`, `corroboration_cursor`, `transfers` e `imported_acts`, todas de solo agregar salvo el cursor y la marca de registro                                                                             |
| 9         | Calificación e inconformidad: `qualifications` (calificación con su acuerdo) y `appeals` (inconformidad, una por denuncia), de solo agregar; columna `qualification` en `imported_acts`                                                                                                                                                                          |
| 10        | Revisión de seguridad: `act_instants` (secuencia del buzón de la autoridad en cada archivo y calificación, para la notificación), índice único del folio destino de `transfers` e `identity_releases` (entregas del sobre de identidad)                                                                                                                          |
| 11        | Nota pública del turnado (`transfers.note`), que la persona lee al llegar el comprobante                                                                                                                                                                                                                                                                         |
| 12        | Confirmación y baja en el índice de corroboración (`confirmed`, `withdrawal_reason`, `withdrawn`)                                                                                                                                                                                                                                                                |

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

### Cuentas, sesiones y separación de funciones

- `authority-accounts.json` (`SIGILO_ACCOUNTS_FILE`, por omisión en el directorio de datos; no se
  versiona) declara las autoridades del nodo, el buzón general (`inboxAuthorityId`) y una cuenta
  por persona con su seudónimo, su autoridad, sus funciones (`functions`; un archivo anterior con
  una sola `function` se sigue leyendo) y su digesto scrypt
  (`scrypt$logN$r$p$sal$digesto`, costo mínimo 2^14). `createAuthorityRegistry` lo valida al
  arrancar; el nodo admite una sola supervisora (una segunda llave). Sin archivo, el panel queda
  cerrado. `SIGILO_AUTHORITY_TOKEN` se retiró: el servidor no arranca si se define.
- `POST authLogin` compara contra un digesto de igual costo aunque el usuario no exista y responde
  el mismo `401`; 10 fallos por usuario en 15 minutos dan `429` y un freno global retrasa los
  intentos. La sesión (`SessionStore`, en memoria y solo como digesto del token) vence a los 15
  minutos sin actividad o a las 8 horas; `POST authLogout` la invalida.
- Cada ruta de autoridad comprueba primero la función (`forbidden`, antes de buscar el folio) y
  después la competencia por folio (`not_found`). Recepción y turnado (`intake`) turna, acepta,
  reasigna, devuelve, cierra lo improcedente del buzón y descarta spam; investigación avanza las
  etapas hasta presentar el informe de presunta responsabilidad (`report_filed`), cierra lo que
  investiga, escribe por el buzón y aprueba aperturas; substanciación y resolución
  (`substantiation`) avanza las etapas posteriores al informe y cierra desde que se presentó
  (LGRA, art. 3, fr. III y IV, y art. 115), sin turnar ni abrir identidades; supervisión aprueba
  aperturas, lista los acuerdos (`GET authorityClosures`) y, en la supervisora, recibe los
  escalamientos. Una cuenta puede tener recepción e investigación juntas (el área de quejas de un
  OIC) y hace lo de ambas; ninguna otra función se combina. Quien solo turna nunca abre
  identidades.
- `authority_security_events` guarda, al minuto y sin IP, agente de usuario ni el usuario
  tecleado: `login_succeeded`, `login_failed`, `login_rate_limited`, `logout`, `session_expired`,
  `function_denied`, `identity_envelope_released` y `escalation_envelope_released`.

### Trámite, apertura 2 de 3 y escalamiento

- **Calificación (migración 9).** `advance_stage` a `qualification` puede llevar `qualification`
  (`serious` o `non_serious`, fundamento y acuerdo en versión pública). Se guarda en
  `qualifications`, entra a la bitácora con su digesto y llega al auditor como acuerdo de
  calificación (AUD-01 y AUD-03). La de no grave deja en el seguimiento cómo inconformarse
  (art. 102); el primer mensaje de la autoridad por el buzón desde ese día cuenta como su
  notificación y abre los 5 días hábiles del art. 103. `POST trackingAppeal` registra la
  inconformidad (`appeals`) con la apertura de identidad para el recurso y corre el plazo de la
  Sala (art. 107). `409` sin calificación de no grave, si ya se presentó, si venció o si la denuncia
  es anónima. Las etapas posteriores a la admisión del informe llegan al auditor como
  `report_admitted`; solo en ellas corre la caducidad de la instancia (art. 74).

- `POST authorityProcedure` aplica una acción del catálogo con `isManagementTransition` y guarda
  el paso (con `legalOn` en la hora del centro y la nota pública), el acuerdo en versión pública
  al cerrar y `complaint.status_changed` con el seudónimo de la cuenta. Las etapas avanzan en
  orden dentro de su vía. Estatus de la API: turnar y reasignar dan `routed`, devolver `routing`,
  la investigación `investigating`, la calificación en adelante `classified`, el archivo por
  información insuficiente `archived` y los demás cierres `resolved`.
- Apertura: `POST authorityIdentityRequests` (primera aprobación), `POST
authorityIdentityApprovals` (otra persona; `409` si ya aprobó, si ya se abrió o si venció) y
  `POST authorityIdentityEnvelope` (solo para quien aprobó). Ver `docs/criptografia.md`.
- `runEscalationRules(ctx)` corre en la tarea periódica, después del cierre diario de la bitácora,
  y registra cada regla cumplida una vez por denuncia y día de inicio (`rule.triggered`, exento del
  tope diario). `GET authorityEscalations` y `POST authorityEscalationEnvelope` son solo para la
  supervisión de la supervisora y solo para denuncias escaladas.
- PRV-23: el envío se rechaza (`400`) si el texto libre trae caracteres invisibles o de marca que
  la web siempre quita (`hasInvisibleCharacters`).

### Red, contexto PDN, auditor y corroboración

Con `SIGILO_NODE_ID` el nodo entra a la red federada (ADR 0005). Sin esa variable trabaja solo,
como antes, y el buzón de red responde `404`.

| Variable                         | Por omisión                        | Uso                                                                |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `SIGILO_NODE_ID`                 | sin red                            | Identificador del nodo en el directorio (`node.<nombre>`)          |
| `SIGILO_NODE_BOX_KEY_FILE`       | `<datos>/red-node-key.json`        | Llave X25519 de red del nodo                                       |
| `SIGILO_NETWORK_DIRECTORY_FILE`  | `<datos>/directory.json`           | Directorio firmado; si no verifica con la raíz, el nodo no arranca |
| `SIGILO_NETWORK_TRUST_FILE`      | `<datos>/network-trust.json`       | Raíz de confianza fijada                                           |
| `SIGILO_ROUTER_URL`              | sin enrutador                      | Registro, cabeza de la bitácora, turnados y vuelta del testigo     |
| `SIGILO_WITNESS_STATE_FILE`      | `<datos>/witness-state.json`       | Estado del testigo si el directorio nombra testigo al nodo         |
| `SIGILO_PDN_SOURCES`             | `off`                              | `synthetic` (solo demostración) o `sqlite`                         |
| `SIGILO_PDN_S3_PATH`, `_S6_PATH` | sin fuentes                        | Bases SQLite descargadas (con `sqlite`)                            |
| `SIGILO_PDN_COVERAGE_FILE`       | `datos/cobertura/matriz.json`      | Matriz de cobertura (con `sqlite`)                                 |
| `SIGILO_DEMO_DAY_ZERO`           | día 0 del calendario de referencia | Día 0 real de las fuentes sintéticas                               |
| `SIGILO_CORROBORATION_INDEX_URL` | sin corroboración                  | Índice de coincidencias; el secreto del nodo se crea en `<datos>`  |
| `SIGILO_AUDIT`                   | activo                             | `0` apaga el auditor en la tarea periódica                         |

- **Buzón de red.** `POST /api/v1/red/inbox` (`createNodeInboxHandler`) abre el sobre con la llave
  X25519 del nodo, pasa la operación a la propia ruta v1 (`app.request`) con sus validaciones y
  pruebas de trabajo, y cifra la respuesta. La autoridad destino del sobre se recuerda en un
  `WeakMap` sobre la petición que crea el nodo: una petición directa nunca la tiene, así que nadie
  la fija con una cabecera. Una denuncia que llega así queda turnada a esa autoridad (la eligió el
  navegador con el directorio verificado).
- **Varias autoridades.** Las llaves de cada autoridad que el directorio aloja en el nodo salen
  del directorio verificado (`authorityKeysFor`); el buzón general usa las de `keys.json`. La
  identidad sellada se acepta cifrada hacia cualquiera de ellas.
- **Tarea periódica.** Después del cierre diario: registro ante el enrutador (`acceptsRelay`, se
  reintenta hasta que lo acepta), cabeza firmada en la bitácora nacional cuando cambia, vuelta del
  testigo (`@sigilo/red/witness`) si el directorio lo nombra, corroboración, auditor,
  reverificación de sanciones y reglas de escalamiento.
- **Turnado a otro nodo.** `POST authorityTransfer` recibe el sobre que el navegador de recepción
  y turnado ya re-cifró hacia la autoridad destino (SEC-19), lo lleva al enrutador, registra
  `complaint.transferred` con los digestos del sobre y de la respuesta y el seudónimo de la cuenta,
  y devuelve la respuesta cifrada. `POST authorityTransferReceipt` verifica el comprobante con la
  llave del nodo destino en el directorio y deja en el seguimiento el folio nuevo.
- **Contexto PDN.** Al turnar o reasignar, `reviewConflictOnAssignment` compara a la persona
  titular de la autoridad (`head` en el archivo de cuentas) con la persona denunciada en S1 y S2:
  alerta, nunca bloquea. `respond_conflict` registra la excusa o la justificación una vez. El
  detalle trae la ficha con prioridad explicable (`contextSheet`), la revisión (`conflictReview`),
  la corroboración y las señales del auditor. Un cierre con `sanction` se verifica contra S3 y la
  tarea periódica reintenta lo que quedó sin cobertura.
- **Auditor.** `runNodeAudit` corre `runAudit` sobre los acuerdos del nodo y los importados
  (`POST authorityClosureImports`, un evento `closures.imported` por lote) y guarda cada señal
  una vez; las de una denuncia del nodo registran `audit.signal` con el digesto del registro
  canónico. `GET authorityAuditSummary` da los conteos por autoridad y regla.
- **Corroboración.** Si el envío trae `corroboration`, el nodo (no el navegador) firma el registro
  en el índice con un folio opaco (`folioDigestFor` y un secreto propio), consulta los avisos y
  guarda las fuentes independientes. Si el folio está archivado y crecen, marca «posible nuevo
  indicio» (LGRA, art. 100). La guarda de custodias queda pendiente (nivel B).

### Publicación diaria de la bitácora

Cada evento nuevo queda pendiente, sin `seq`, con un identificador aleatorio. Su fecha es la mayor
entre hoy y el día siguiente al último evento encadenado: si el reloj retrocede, el evento no cae en
un día ya publicado y las fechas de la cadena no decrecen (cada cierre encadena los días completos,
de menor a mayor). El último día con pendientes ya no sube la fecha: tras un salto del reloj hacia
adelante, el pendiente con fecha futura espera a su día y los eventos nuevos siguen en el día real.
Si hay pendientes con fecha de más de un día después de hoy, la tarea de cierre registra un aviso
para el operador (una vez por fecha). `MailboxMessage.sentOn` usa la fecha de su evento: si la
bitácora lo fechó otro día, es el inicio de ese día (`AAAA-MM-DDT00:00Z`).

Las lecturas no publican: solo lo hace una tarea programada cada 10 minutos (cada segundo con el
reloj de pruebas). La tarea es asíncrona: baraja los pendientes de cada día cerrado (UTC) y los
encadena en lotes de 1000, cada lote en su transacción, cediendo el event loop con `setImmediate`
entre lotes; si el cierre se interrumpe, lo que queda se vuelve a barajar. Cada lote tarda unos 250 ms
medidos, que es la mayor espera que impone a una petición concurrente. La cabeza pública es la
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
autoridad se pueden pegar anclas publicadas para comparar con ellas. Si un ancla es anterior al
tramo verificado, el cliente descarga además desde su `seq` hasta el inicio del tramo y verifica la
cadena extendida; si esa parte no se puede descargar completa, el resultado es «no comparable»
(nunca «coincide») y la pantalla lo dice en lectura fácil.

### Prueba de trabajo

`GET /api/v1/pow/challenge?purpose=complaint|message` entrega un reto firmado con HMAC (llave
aleatoria por proceso); cualquier otro propósito, incluido `evidence`, responde `400 bad_request`.

- Un reto `message` sirve para un mensaje.
- Un reto `complaint` sirve para las hasta 10 subidas de pruebas de una denuncia y después para la
  denuncia, que lo cierra: una denuncia con sus pruebas resuelve un solo reto.

Cada uso cuenta como carga para la dificultad adaptativa, incluida cada subida de pruebas.

`POST complaints`, `POST evidence` y `POST tracking/messages` exigen la cabecera
`X-Sigilo-Pow: <token>:<contador>` y responden `428 proof_required` si falta, no es válida, es de
otro propósito, venció, agotó sus usos o su dificultad es menor que `max(base, actual - 1)`: un reto
emitido justo antes de que suba la dificultad todavía sirve, pero no uno de dos o más bits menos.
La cabecera se comprueba antes de leer el cuerpo, pero el uso se gasta solo cuando el cuerpo es
válido (esquema de la denuncia o del mensaje; tipo real, tamaño y cuota de la prueba): una petición
mal formada no agota el reto.

La dificultad parte de `SIGILO_POW_BITS` (18; 0 la desactiva) y sube con la carga hasta
`SIGILO_POW_MAX_BITS` (20 por omisión). El servidor se niega a arrancar si `SIGILO_POW_MAX_BITS`
supera la base más 2 (`MAX_POW_ADAPTIVE_SPAN_BITS`): `verify` tolera un bit y el cliente renueva el
reto una sola vez, así que con más separación la carga de un atacante invalida en cadena los retos
en curso de una persona legítima. Si no se define, el máximo es `min(20, base + 2)` (nunca menor que
la base). La vigencia de cada reto es un margen (5 minutos, que baja
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

| Variable                         | Por omisión | Efecto                                                                                                      |
| -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `SIGILO_EVIDENCE_QUOTA_BYTES`    | 5 GiB       | Cuota total de pruebas guardadas                                                                            |
| `SIGILO_EVIDENCE_RETENTION_DAYS` | 30          | Días, desde la recepción, que se conservan las pruebas de denuncias en `received` o `archived`; 0 desactiva |

`SIGILO_UNTRACKED_RETENTION_DAYS` se retiró: el servidor se niega a arrancar si se define. El
seguimiento ya no exime de la retención. Archivar tampoco: si lo hiciera, archivar el spam dejaría
la cuota ocupada para siempre. Las pruebas se conservan mientras la denuncia está en trámite
(`routing`, `routed`, `investigating`, `classified` o `resolved`); si después se archiva, se borran
en la fecha de retención, o en la siguiente corrida si ya pasó.

`POST authority/complaints/:folio/evidence/discard` (ruta de la autoridad, sin cuerpo) descarta
los archivos de las pruebas guardadas de la denuncia y responde `{ discarded }`. En una transacción
marca las pruebas como no guardadas, registra `evidence.discarded` (`{ folio, count, discardId }`,
actor `authority`, exento del tope diario) y anota el descarte en `evidence_discards`; los archivos
se borran después. Si ya no hay archivos, responde `{ discarded: 0 }` sin registrar nada. Los
descriptores se conservan. La persona denunciante ve el descarte de inmediato en su seguimiento
(`TrackingView.evidenceDiscards`: «La autoridad descartó N pruebas el …»). El panel pide confirmar
con una casilla antes de habilitar el botón.

Reparto de la cuota:

- Las pruebas pendientes (subidas sin denuncia) pueden ocupar a lo más el 25 %.
- Cada denuncia puede ocupar a lo más `max(10 MiB, cuota / 100)`; si sus pruebas lo exceden, el
  envío recibe `413 payload_too_large`.
- Si una prueba no cabe en la cuota total o en la parte de pendientes: `507 storage_full`. Nunca se
  borran pruebas ya asociadas a una denuncia para hacer sitio: no aceptar más es preferible a perder
  pruebas de corrupción.

`ComplaintDetail.evidenceDeletionOn` indica el día en que la retención borrará las pruebas de una
denuncia sin atender o archivada, y `storedEvidenceCount` cuántas siguen guardadas; el panel de la
autoridad los muestra y explica las consecuencias de cada estatus.

El servidor recuerda en memoria qué pruebas subió cada reto `complaint`. Cuando el reto vence sin
denuncia, más un margen de 30 minutos (`CHALLENGE_UPLOADS_GRACE_MS`, que cubre la renovación del
reto y el reintento del envío), sus pendientes se purgan: el barrido corre a lo más una vez por
minuto, antes de medir la cuota de cada subida y al emitir retos. Las ya asociadas no se tocan.
Reiniciar el proceso olvida ese registro; queda como respaldo la purga diaria: las pruebas
pendientes se purgan al arrancar y cada hora cuando tienen más de 24 h; la fecha de subida se guarda
solo por día, así que se borran entre 24 y 48 h después. La retención no toca la
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
- `login`, `logout`, `listAuthorities`, `applyProcedure`, `requestIdentityOpening`,
  `approveIdentityOpening` y `releaseIdentityEnvelope`; se retiraron `openIdentity` y
  `updateStatus`. `sealReporterEscalation` (en `crypto/submission.ts`) cifra la segunda llave hacia
  la supervisora fijada y `diffPublicKeys` compara también su llave.
- `getLedgerSince(day, limit)`: tramo de la bitácora desde el último evento anterior a `day`.
- `loadTrackingLedger(view, pinned, ledgerApi, anchors?)` (en `crypto/tracking.ts`): descarga y
  verifica una sola vez el tramo desde el día de recepción hasta la cabeza firmada, para el evento de
  recepción y la conciliación de aperturas; con anclas, el resultado `valid` lleva
  `anchors: 'compared' | 'not-comparable'`.
- `verifyEventWithAnchors(event, chain, head, key, anchors, fetchPage)` (en
  `crypto/ledger-verification.ts`): compara las anclas, descargando desde la más antigua si es
  anterior al tramo. `verifyReporterKeys` devuelve `anchors-not-comparable` si las llaves coinciden
  pero alguna ancla no se pudo comparar.
- `discardEvidence(token, folio)`: descarte de pruebas por la autoridad.
- `transferComplaint` y `confirmTransfer`: turnado entre nodos (`authorityTransfer` y
  `authorityTransferReceipt`); el sobre lo arma `pages/authority/transfer.ts` en el navegador.
- `createApiClient(fetch, { retries, delayMs, onRetry })`: las consultas `GET` se reintentan dos
  veces con aviso (modo de poca conexión); los `POST` nunca se repiten solos.

### Red, anonimato y corroboración en la web

| Módulo                                 | Qué hace                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/network-trust.ts`              | Raíz de confianza fijada (`network-trust.json`; `null` = un solo nodo)                                                                                         |
| `network/directory.ts`                 | `loadNetworkState`/`networkState`: directorio del mismo origen verificado con `verifySignedDirectory` (`single-node`, `verified`, `invalid`, `unavailable`)    |
| `network/routing.ts`                   | `routingChoiceFor`: `proposeCompetentAuthority` más alternativas y las demás autoridades (nunca supervisoras)                                                  |
| `network/network-keys.ts`              | `destinationFor`, `keysForDestination` (llaves del directorio con la forma de `PinnedKeys`), `receivingAuthorityPerNode`                                       |
| `network/relay-api.ts`                 | `createRelayApi`: operaciones de quien denuncia por el enrutador (`sealRoutedRequest`/`openRoutedReply`); `sameOriginRelaySender`                              |
| `network/network-tracking.ts`          | `trackAcrossNetwork` (el folio se busca en todos los nodos a la vez) y `decodeNetworkThread`                                                                   |
| `anonymity/report-anonymity.ts`        | Un cargador de `@sigilo/anonimato` por denuncia (se reinicia con el borrador) y `checkAnonymity`                                                               |
| `corroboration/blind-corroboration.ts` | `corroborateBlindly` (reto, VOPRF, DLEQ contra la llave del directorio, resumen difuso); corre en `workers/corroboration-worker.ts`                            |
| `pages/report/submit-report.ts`        | `submitReport(..., { network })`: por la red no compara `GET keys`, usa las llaves del directorio y agrega la corroboración                                    |
| `lib/procedure-text.ts`                | Textos de «turnada», archivo con escalamiento, ventana de inconformidad (5 días hábiles desde el acuerdo) y folio nuevo del turnado                            |
| `state/usage-modes.ts`                 | Modos de uso en memoria (`?modo=quiosco,asistida,poca-conexion,lectura-facil`)                                                                                 |
| `static-data.ts` (Vite)                | Publica en el mismo origen `/datos/grupos-anonimato/` (sintético; `VITE_ANONYMITY_DATA=real` copia el catálogo real), `/datos/cobertura/` y `/datos/abiertos/` |

Decisión (mismo origen): el nodo que sirve la web pasa los sobres al enrutador y las evaluaciones
cegadas al evaluador, sin cabeceras de quien envía. Ese nodo ve, como el enrutador, la IP, el
destino y el tramo, pero no el contenido (va cifrado hacia otro nodo) ni el identificador
corroborado (va cegado). Si el destino es el mismo nodo que sirve la web, ese nodo puede
correlacionar IP y contenido: la ventanilla única recomendada es una web servida por el operador
del enrutador (un proxy estático delante de `apps/enrutador` que publique `/api/v1/red/*`).

## Llaves y scripts del despliegue

`npm run keys:generate` crea:

- `apps/server/data/keys.json`: llaves privadas del servidor (no se versiona).
- `apps/server/data/authority-demo-key.json`: llave privada de la autoridad de demostración, que el
  panel importa en el navegador (no se versiona).
- `apps/web/src/config/pinned-keys.json`: llaves públicas fijadas en el bundle del cliente (sí se
  versiona, generada para la demostración). Se regenera siempre junto con las privadas.
- `apps/server/data/supervisor-demo-key.json`: llave privada de la supervisora de demostración,
  que abre los sobres de escalamiento (no se versiona).

`npm run accounts:generate` crea `authority-accounts.json` (solo digestos) y
`authority-demo-credentials.json` con las contraseñas sintéticas de cada persona de la
demostración, ambos con permisos 0600 y fuera del repositorio; `--force` los reemplaza.

Solo comprueba la existencia de `keys.json` y `authority-demo-key.json`; para reemplazarlas hay que
pasar `--force`.

`npm run demo:reset -- --yes` borra la base y las pruebas y conserva las llaves. Sin `--yes` exige el
marcador `.sigilo-demo` en el directorio de datos, y se niega a correr con el servidor en marcha
(bloqueo `server.lock` o puerto ocupado).

`npm run ledger:anchor` escribe `anchors/AAAA-MM-DD.json` con la cabeza pública firmada. La forma
preferida es leer la API pública (`SIGILO_ANCHOR_URL=http://127.0.0.1:8787 npm run ledger:anchor`);
sin esa variable lee la base local en solo lectura, avisa y, si la base no existe, da un mensaje
claro. El directorio `anchors/` existe en el repositorio (`anchors/.gitkeep`).
