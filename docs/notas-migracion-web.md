# Notas de migración de la web

Cambios de API de `@sigilo/contracts`, `@sigilo/core` y del servidor que `apps/web` debe aplicar.
Hasta aplicarlos, `npm run typecheck -w @sigilo/web`, `npm run build -w @sigilo/web` y las pruebas
E2E fallan. Las especificaciones completas están en `docs/interfaces.md` y `docs/criptografia.md`.

## 1. Identidad sellada: nuevo contexto (AAD)

`sealIdentity(block, authority, authVerifier)` y `openIdentity(envelope, key, authVerifier)` ahora
reciben un `IdentityContext` (`{ authVerifier, reporterKeys, contentDigest }`) en lugar del
`authVerifier`.

### `crypto/submission.ts`

- `sealReporterIdentity(block, keys, pinned)` debe recibir también los datos de la denuncia y
  sellar con `identityContextFor(...)` de `@sigilo/core`:

  ```ts
  sealIdentity(
    block,
    recipient,
    identityContextFor({
      version: 1,
      mode: 'sealed',
      facts, // exactamente los hechos que viajarán (ya validados por el esquema)
      evidence, // mismos descriptores y en el mismo orden
      protectionRequested, // el valor que viajará
      authVerifier: keys.authVerifier,
      reporterKeys: {
        boxPublicKey: toBase64Url(keys.box.publicKey),
        signingPublicKey: toBase64Url(keys.signing.publicKey),
      },
    }),
  );
  ```

  Firma sugerida: `sealReporterIdentity(block, input: SubmissionInput, keys, pinned)`.

- Importante: `contentDigest` se calcula sobre la forma canónica, así que `facts` y `evidence`
  deben ser idénticos a los de la solicitud final. Un campo extra que zod quite al validar la
  solicitud cambiaría el digesto (las propiedades `undefined` sí se omiten igual en ambos lados).
  Lo más seguro es validar antes con `ComplaintFactsSchema.parse` y
  `EvidenceDescriptorSchema.array().parse` y usar esos valores en ambos lados.
- `pages/report/submit-report.ts`: pasar `{ mode, facts, evidence, protectionRequested }` a
  `sealReporterIdentity`.

### `crypto/authority.ts`

- `openSealedIdentity(response, keys)` debe recibir el detalle:
  `openSealedIdentity(response, detail, keys)` →
  `openIdentity(response.sealedIdentity, keys.boxPrivateKey, identityContextFromDetail(detail))`.
- `OpenIdentityResponse` ya no trae `authVerifier` (solo `sealedIdentity` y `ledgerSeq`).
- `pages/authority/OpenIdentityPanel.tsx`: pasar el `ComplaintDetail` vigente.
- Si la identidad abre en modo `sealed`, las `detail.reporterKeys` quedan autenticadas (van en el
  AAD). El panel puede indicarlo; en modo `anonymous` siguen viniendo del servidor sin prueba.

## 2. `ComplaintDetail`

| Antes                             | Ahora                                  |
| --------------------------------- | -------------------------------------- |
| `detail.reporterBoxPublicKey`     | `detail.reporterKeys.boxPublicKey`     |
| `detail.reporterSigningPublicKey` | `detail.reporterKeys.signingPublicKey` |
| (no existía)                      | `detail.version` (literal `1`)         |
| (no existía)                      | `detail.authVerifier`                  |

El esquema además exige que `summary.stateCode`/`summary.offenseCode` coincidan con `facts` y que
una denuncia anónima no tenga protección ni aperturas. Afecta a `crypto/authority.ts`
(`decodeAuthorityThread`, `sealAuthorityQuestion`) y a `crypto/crypto-flow.test.ts`.

## 3. Buzón: secuencia, relleno fijo y nueva firma

- `MailboxBinding` ahora es `{ folio, from, sequence }`. `sequence` es el número de mensajes previos
  del mismo remitente en el folio (0 el primero). Usar `nextMailboxSequence(messages, from)`.
- `sealMailboxMessage(...)` devuelve `SealedMailboxMessage` = `{ from, sequence, envelope, signature }`.
- `openMailboxMessage(message, recipientPrivateKey, senderSigningPublicKey, folio)`: el cuarto
  parámetro ahora es el folio (cadena); `from` y `sequence` salen del mensaje.
- La firma cubre `canonicalize({ envelope, from, sequence })` (`verifyMailboxSignature`).
- `MailboxMessage` trae `sequence`. Contratos de petición:
  - `AuthorityMessageRequest` = `{ sequence, envelope, signature }`.
  - `ReporterMessageRequest` = `{ folio, authKey, sequence, envelope, signature }`.
- Relleno fijo de 4096 bytes. El texto debe medir de 1 a `MAX_MAILBOX_TEXT_LENGTH` (1000) unidades
  UTF-16 (`text.length`); si no, `sealMailboxMessage` lanza «El mensaje no puede estar vacío.» o
  «El mensaje no puede exceder 1000 caracteres.». Poner `maxLength` y un contador en los cuadros de
  texto de `AuthorityMailbox.tsx` y `ReporterMailbox.tsx`.
- El servidor responde `400 bad_request` si la secuencia no es la siguiente (por ejemplo, otra
  pestaña ya envió). Recargar el detalle o la vista y volver a sellar.
- `crypto/authority.ts`:
  - `decodeAuthorityThread`: `openMailboxMessage(message, keys.boxPrivateKey, reporterSigning, folio)`.
  - `sealAuthorityQuestion(text, detail, keys)`: `sequence: nextMailboxSequence(detail.messages, 'authority')`
    y devolver `{ sequence, envelope, signature }`.
- `crypto/tracking.ts`:
  - `decodeReporterThread`: `openMailboxMessage(message, session.keys.box.privateKey, pinned.authoritySigningPublicKey, session.folio)`.
  - `sealReporterReply(text, session, pinned)` necesita la secuencia: firma sugerida
    `sealReporterReply(text, session, pinned, messages)` con
    `nextMailboxSequence(messages, 'reporter')`, y devolver `{ ...session.credentials, sequence, envelope, signature }`.
  - `pages/tracking/TrackingPage.tsx` debe pasar `view.messages`.
- Opcional: `isMailboxSequenceComplete(messages)` detecta que el servidor omitió, repitió o
  reordenó mensajes; mostrar una alerta si devuelve `false`.
- Escribir en el buzón ya no gasta intentos de acceso; hay un límite aparte de 30 mensajes por
  folio por hora (`429 rate_limited`).

## 4. Seguimiento: evento de recepción y errores del recibo

- `TrackingView` trae `receivedEvent` (el `complaint.received` de la denuncia).
  `verifyTrackingReceipt(view, pinned)` debe agregar `verifyReceiptEvent(view.receivedEvent, view.receipt)`.
- Una vez publicado su día, el evento se puede comparar con el público:
  `api.getLedgerEvents(view.receipt.ledgerSeq, 1)` debe devolver un evento idéntico a
  `view.receivedEvent`. El mismo día devuelve una página vacía (no es un error).
- `phraseToEntropy` lanza `ReceiptPhraseError` con `position` (número de palabra desde 1, o `null`
  si no hay 8 palabras). `TrackingPage`/`TrackingLogin` pueden usarlo para marcar el campo exacto
  (`receipt-word-<position>`) en lugar de interpretar el mensaje.

## 5. Bitácora pública

- `ledgerHead` y `ledgerEvents` solo publican eventos de días anteriores al actual (UTC). Con
  denuncias de hoy y nada anterior, la cabeza es el génesis (`seq 0`, hash de ceros) y la página
  viene vacía. `downloadAndVerifyLedger` funciona igual; conviene explicar en `VerifyPage.tsx` que
  «los eventos de hoy se publican mañana».
- `verifyChain(events, previous?)` no cambió.

## 6. Datos abiertos

- Solo meses completos anteriores al mes actual; conteos redondeados al múltiplo de 5 más cercano
  (`OPEN_DATA_ROUNDING`) y supresión de celdas con menos de 5 (`OPEN_DATA_MIN_CELL`).
- La fila final ahora tiene las mismas columnas que el encabezado: `suprimidas,,,,<n>` (antes
  `suprimidas,<n>`), con `<n>` también redondeado.
- `lib/csv.ts` (`parseOpenDataCsv`): reconocer `row[0] === 'suprimidas' && row.length === headers.length`
  y leer `row.at(-1)`. Actualizar el caso de `lib/lib.test.ts`.
- `pages/open-data/OpenDataPage.tsx`: explicar el redondeo y que el mes en curso no aparece.

## 7. Catálogos en `@sigilo/contracts`

Los catálogos y sus búsquedas ahora viven en `@sigilo/contracts` y el servidor valida contra ellos
`stateCode`, `municipalityCode` (debe pertenecer a la entidad), `entityId` y `offenseCode`. La web
debe importar de ahí y después borrar `apps/web/src/catalogs/states.ts`, `municipalities.ts`,
`public-entities.ts` y `offenses.ts`. `foldForSearch` y `filterByQuery` (búsqueda de la interfaz)
se quedan en `catalog-search.ts`.

| Web (antes)                                                                           | `@sigilo/contracts` (ahora)                                          |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `STATES`, `StateOption`                                                               | iguales                                                              |
| `MUNICIPALITIES`, `MunicipalityOption`                                                | iguales                                                              |
| `PUBLIC_ENTITIES`, `PublicEntityOption`, `GovernmentLevel`, `GOVERNMENT_LEVEL_LABELS` | iguales                                                              |
| `municipalitiesOf(stateCode)`                                                         | igual                                                                |
| `stateName(code)`                                                                     | `findState(code)?.name ?? code`                                      |
| `municipalityName(stateCode, code)`                                                   | `findMunicipality(stateCode, code)?.name`                            |
| `findOffense(code)`                                                                   | igual; también resuelve claves equivalentes (`CPF-222` → cohecho)    |
| `findEntity(id)`                                                                      | igual                                                                |
| `OFFENSE_GROUPS` (`{ group, label }`)                                                 | `OFFENSE_SITUATIONS` (`{ situation, label }`)                        |
| `OffenseGroup`                                                                        | `OffenseSituation`                                                   |
| `OffenseOption.name`                                                                  | `OffenseOption.label` (lo que pasó + término legal entre paréntesis) |
| `OffenseOption.group`                                                                 | `OffenseOption.situation`                                            |
| (no existía)                                                                          | `OffenseOption.legalTerm`, `OffenseOption.equivalentCodes`           |
| (no existía)                                                                          | `offenseReference(code)` → `{ law, article }`, `OFFENSE_LAW_NAMES`   |
| (no existía)                                                                          | `isStateCode`, `isMunicipalityOf`, `isEntityId`, `isOffenseCode`     |

- `OFFENSES` tiene 28 conductas visibles (antes 31): cohecho, peculado y tráfico de influencias
  aparecen una sola vez con la clave LGRA y la del CPF en `equivalentCodes`. Todas las claves
  anteriores siguen siendo válidas.
- Situaciones, en orden: `dinero-y-regalos`, `recursos-publicos`, `contratos-y-tramites`,
  `abuso-del-cargo`, `ocultar-y-obstruir`. La primera conducta de la lista es `LGRA-52`.
- Archivos afectados: `pages/report/steps/CatalogFields.tsx` (`OFFENSE_GROUPS`, `offense.group`,
  `offense.name`), `LocationFields.tsx`, `AuthorityPreview.tsx`, `pages/authority/ComplaintList.tsx`,
  `ComplaintDetailView.tsx`, `pages/open-data/OpenDataPage.tsx`, `catalogs/catalog-search.test.ts`.

## 8. Otros cambios que afectan a la web

- `canonicalize` solo acepta enteros seguros: no incluir decimales en nada que se resuma o firme.
- Nuevas utilidades en `@sigilo/core` que pueden sustituir código propio de `crypto/authority.ts`:
  `equalBytes`, `assertBoxKeyPair`, `assertSigningKeyPair` y, para leer
  `authority-demo-key.json`, `AuthorityDemoKeySchema` de `@sigilo/contracts`.
- `computeAuthVerifier(authKey)` disponible si se necesita.
- CORS está desactivado por omisión; la web en desarrollo ya usa el proxy de Vite (mismo origen).
- `npm run keys:generate` regenera siempre `apps/web/src/config/pinned-keys.json` junto con las
  privadas; después de `--force` hay que reconstruir la web.
- El servidor puede servir `apps/web/dist` con `SIGILO_WEB_DIST` y le pone la CSP como cabecera
  (con `frame-ancestors 'none'`); la CSP de `index.html` puede quedarse como respaldo.

## 9. Pruebas E2E (fuera del alcance de este cambio)

- `ledger.spec.ts`: el mismo día de la corrida la bitácora pública está vacía; la verificación
  sigue siendo «íntegra» pero sin eventos, y la manipulación de `events[0]` no aplica. Necesita
  datos de días anteriores (por ejemplo, sembrar la base con fechas pasadas) o ajustar la
  expectativa.
- `open-data.spec.ts`: el mes en curso no se publica y los conteos van redondeados.
- `e2e/support/api.ts` (`syntheticFacts`) ya usa claves válidas de los catálogos (`22`,
  `VE-OBRAS`, `LGRA-52`).
- Los flujos de buzón y apertura de identidad dependen de los cambios 1 a 3.
