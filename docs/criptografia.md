# Criptografía: especificación del formato v1

Especificación normativa de los formatos de SIGILO versión 1. Las decisiones se justifican en el
[ADR 0002](adr/0002-criptografia.md); las firmas de funciones están en
[interfaces.md](interfaces.md). Las palabras "debe" y "no debe" son obligatorias.

## Primitivas

| Uso                     | Primitiva                                                                                 | Implementación                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Cifrado a llave pública | HPKE modo base, RFC 9180: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305      | `@hpke/core`, `@hpke/dhkem-x25519`, `@hpke/chacha20poly1305` |
| Firmas                  | Ed25519                                                                                   | `@noble/curves`                                              |
| Hash                    | SHA-256                                                                                   | `@noble/hashes`                                              |
| Derivación              | HKDF-SHA256                                                                               | `@noble/hashes`                                              |
| Aleatoriedad            | `crypto.getRandomValues`; `randomInt` por muestreo con rechazo y `shuffle` (Fisher-Yates) | Plataforma y `@sigilo/core`                                  |
| Prueba de trabajo       | Hashcash sobre SHA-256; retos firmados con HMAC-SHA256                                    | `@sigilo/core` y servidor                                    |
| Corroboración ciega     | VOPRF de RFC 9497, ristretto255-SHA512 (modo 0x01), con prueba DLEQ                       | `@noble/curves` (`ristretto255_oprf`)                        |

`Math.random` no debe usarse en ningún caso.

## Codificaciones

- Bytes en JSON: Base64URL sin relleno.
- Digestos: SHA-256 en hexadecimal minúsculo.
- Texto: UTF-8.
- Fechas: `AAAA-MM-DD` en UTC; en el buzón, `AAAA-MM-DDTHH:00Z`.

## Forma canónica

Todo valor que se firma o se resume se serializa en forma canónica, subconjunto de RFC 8785:

1. Objetos con llaves ordenadas por unidades de código UTF-16 (el orden de RFC 8785) y sin
   espacios.
2. Solo cadenas, enteros seguros (`Number.isSafeInteger`: entre -(2^53 - 1) y 2^53 - 1),
   booleanos, `null`, arreglos y objetos planos. Los decimales y los enteros fuera de ese rango se
   rechazan, para que la forma canónica se reproduzca igual en cualquier lenguaje.
3. Las propiedades con valor `undefined` se omiten; un `undefined` dentro de un arreglo se rechaza.
4. Las cadenas se serializan como en `JSON.stringify`.

`sha256Hex(canonicalize(valor))` es el digesto de un valor.

## Identificador de llave

`keyId = primeros 16 caracteres hexadecimales de SHA-256(llave pública)`.

## Sobre HPKE

```json
{
  "v": 1,
  "suite": "DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305",
  "keyId": "<keyId del destinatario>",
  "enc": "<llave encapsulada, Base64URL>",
  "ct": "<texto cifrado con etiqueta, Base64URL>"
}
```

- El campo `info` de HPKE es la cadena UTF-8 `sigilo/v1/hpke` (separación de dominio); la vinculación a cada uso (identidad, buzón) se hace con el AAD.
- El receptor debe rechazar sobres con `v`, `suite` o `keyId` desconocidos.

## Relleno

`padToBlock(bytes, tamaño)` antepone la longitud en 4 bytes big-endian y rellena con ceros hasta el
siguiente múltiplo del tamaño de bloque. `unpad` debe rechazar longitudes mayores que el contenido y
relleno distinto de cero.

La identidad y los mensajes del buzón usan relleno de tamaño fijo: el texto en claro mide siempre
exactamente `IDENTITY_PADDED_SIZE` = 4096 bytes o `MAILBOX_PADDED_SIZE` = 4096 bytes, y el texto
cifrado 4096 + 16 bytes de etiqueta. El servidor rechaza sobres de otro tamaño
(`envelopePlaintextLength`) y el receptor también.

## Recibo y derivación

1. Se generan 11 bytes aleatorios (88 bits).
2. Se dividen en 8 grupos de 11 bits; cada grupo indexa la lista BIP39 en español (2048 palabras).
   No hay checksum.
3. La entrada se normaliza (NFD, sin marcas diacríticas `\p{M}`, minúsculas y sin espacios
   alrededor) antes de compararse con la lista normalizada igual. Basta con las primeras 4 letras
   para identificar una palabra. Una palabra que no está en la lista produce `ReceiptPhraseError`
   con su posición, nunca con la palabra.
4. Con la entropía como material de entrada, HKDF-SHA256 sin sal deriva 32 bytes por contexto:

| Contexto (`info`) | Resultado                      |
| ----------------- | ------------------------------ |
| `sigilo/v1/auth`  | `authKey`                      |
| `sigilo/v1/box`   | Llave privada X25519 del buzón |
| `sigilo/v1/sign`  | Semilla Ed25519 de firma       |

5. `authVerifier = Base64URL(SHA-256(authKey))` (`computeAuthVerifier`). El servidor guarda solo
   este valor, exige que sea único entre denuncias y compara `SHA-256(authKey)` en tiempo
   constante. Para que el tiempo de un fallo no dependa de si el folio existe, primero lee solo el
   `authVerifier` y carga el registro completo después de comparar.

Con 88 bits de entropía no se requiere una función de derivación lenta. El recibo nunca sale del
navegador.

## Identidad sellada

- Texto en claro: forma canónica de `IdentityBlock` en UTF-8, rellenado a exactamente 4096 bytes.
- Destinatario: llave X25519 de la autoridad competente.
- Contenido de la denuncia:
  `contentDigest = sha256Hex(canonicalize({ version, mode, facts, evidence, protectionRequested }))`
  con los valores de `SubmitComplaintRequest` (`computeContentDigest`).
- AAD: la cadena UTF-8
  `sigilo/v1/identity:` + `canonicalize({ authVerifier, reporterKeys, contentDigest })`, con
  `reporterKeys = { boxPublicKey, signingPublicKey }` (`identityContextFor`).
- La autoridad recalcula el contexto desde `ComplaintDetail` (`identityContextFromDetail`): el
  detalle trae `version`, `summary.mode`, `facts`, `evidence`, `summary.protectionRequested`,
  `reporterKeys` y `authVerifier`. No confía en ningún digesto calculado por el servidor.

El AAD liga el sobre al recibo, a las llaves del buzón y al contenido exacto de la denuncia. Un
sobre copiado a otra denuncia no abre aunque se copie también el `authVerifier` (ataque de
trasplante), y el servidor rechaza además un `authVerifier` repetido. Como `reporterKeys` va en el
AAD, en modo `sealed` abrir la identidad prueba también que las llaves del buzón que entrega el
servidor son las de la persona denunciante. En ambos modos el panel verifica además las llaves
contra el registro público (ver «Comprobante firmado»).

## Apertura de identidad 2 de 3

- Una persona de la autoridad competente (investigación o supervisión) crea una solicitud con su
  fundamento: `requestId` de 16 bytes aleatorios, que también es el `openingId` de la apertura.
  Cuenta como la primera aprobación.
- Cada aprobación registra `identity.approved` con
  `{ folio, requestId, approvalId, legalBasis, actor }`, donde `actor` es el seudónimo de la cuenta.
  Una cuenta aprueba una sola vez por solicitud (índice único en la base) y la solicitud vence a
  los 7 días naturales.
- Al llegar a `IDENTITY_APPROVAL_THRESHOLD` = 2 aprobaciones distintas se registra
  `identity.opened` con los mismos datos que antes (`{ folio, openingId, legalBasis, receiptTag }`,
  con el fundamento de la solicitud), así que la conciliación de aperturas de la persona
  denunciante (`reconcileIdentityOpenings`) no cambia. El seguimiento agrega `approvalCount`.
- Solo entonces el nodo entrega el sobre, y solo a una cuenta que aprobó. El sobre y su AAD son
  los de «Identidad sellada»: el navegador de la autoridad lo abre con su llave y el contexto
  recalculado desde el detalle. El servidor nunca descifra.
- Límite: el umbral es un control de política del nodo, no criptográfico; la llave de descifrado
  sigue en un solo navegador. Ver «Trabajo futuro».
- **Apertura para el recurso de inconformidad.** Contra la calificación de no grave la persona
  puede inconformarse (LGRA, arts. 102 a 110), y la ley pide su nombre, domicilio y firma
  (art. 109). Al presentar el recurso desde su seguimiento (`POST tracking/appeal`, autenticada con
  la llave derivada de su recibo), acepta abrir su identidad solo para el recurso: el nodo registra
  `appeal.filed` (con el digesto de sus motivos y del acuerdo de calificación) e `identity.opened`
  con su `receiptTag`, y la apertura aparece en su seguimiento con `actorRole: reporter`. La
  entrega del sobre exige dos aprobaciones de cuentas distintas de la autoridad, al menos una de
  supervisión, dentro de la ventana del recurso (hasta el plazo de la Sala, art. 107) en lugar de
  los 7 días, y cada entrega registra el evento público `identity.released` con el `receiptTag`
  (G07). El servidor sigue sin descifrar. La firma autógrafa queda fuera del sistema.

## Sobre de escalamiento (segunda llave)

- Texto en claro: forma canónica de `EscalationContent` (`{ version, mode, facts, evidence,
protectionRequested }`) en UTF-8, rellenado a exactamente `ESCALATION_PADDED_SIZE` = 49 152 bytes.
  Nunca lleva la identidad sellada.
- Destinatario: llave X25519 de la supervisora fijada en el bundle (`PublicKeySet.supervisor`).
  El servidor rechaza un sobre hacia otra llave o de otro tamaño.
- AAD: `sigilo/v1/escalation:` + `canonicalize({ authVerifier, reporterKeys })`. No incluye el
  `contentDigest`, porque la supervisora recibe los hechos dentro del sobre.
- El digesto del sobre entra al `submissionDigest` (ver «Comprobante firmado»). Después de
  abrirlo, la supervisora recalcula el digesto del envío con `submissionDigestFromEscalation` y lo
  compara con el `payloadDigest` del evento `complaint.received` publicado: si coincide, el nodo
  no sustituyó el sobre ni los hechos.
- El nodo lo entrega (`POST authority/escalations/{folio}/envelope`) solo a la supervisión de la
  supervisora y solo si una regla de escalamiento se cumplió; cada entrega queda en el registro
  de seguridad.

## Pruebas cifradas de extremo a extremo

Las pruebas se limpian en el navegador (Huella Cero; los PDF se convierten a imagen; hasta 10
archivos de 10 MiB) y, desde esta versión, se cifran ahí mismo hacia la autoridad competente. El
nodo guarda solo el contenedor cifrado y sus metadatos (tipo declarado, tamaño, digesto del
contenedor y compromiso del contenido); el enrutador, el nodo, la SESEA y la SESNA no pueden ver
las imágenes. Implementación: `packages/core/src/evidence.ts` y `apps/web/src/crypto/evidence.ts`.

### Contenedor (`SGEV` versión 1)

Cifrado híbrido con la misma suite HPKE que la identidad: cada archivo tiene una llave aleatoria
de 32 bytes (`fileKey`) y esa llave se sella con HPKE (`sealToPublicKey`, info `sigilo/v1/hpke`)
hacia la llave X25519 de la autoridad.

| Bytes | Campo                     | Contenido                                                                  |
| ----- | ------------------------- | -------------------------------------------------------------------------- |
| 5     | formato                   | `SGEV` y `0x01`                                                            |
| 32    | compromiso                | `SHA-256("sigilo/v1/evidence-commitment:" ‖ sal ‖ imagen)`                 |
| 32    | `enc`                     | llave efímera encapsulada de HPKE                                          |
| 48    | llave del archivo sellada | `fileKey` cifrada con HPKE (32 + 16 de etiqueta)                           |
| resto | cuerpo                    | ChaCha20-Poly1305(`fileKey`, nonce de 12 ceros, `sal ‖ imagen`) + etiqueta |

- Sobrecosto fijo: `EVIDENCE_CONTAINER_OVERHEAD` = 165 bytes (cabecera de 117, sal de 32 y etiqueta
  de 16); `MAX_EVIDENCE_BYTES` es 10 MiB más ese sobrecosto. El nonce fijo es seguro porque cada
  `fileKey` se usa una sola vez.
- AAD de la llave: `sigilo/v1/evidence-key:` + `canonicalize({ folio, authorityId, commitment })`.
  Liga la llave al folio, a la autoridad destinataria y al archivo: no se puede trasplantar a otra
  denuncia ni presentarse como de otra autoridad.
- AAD del cuerpo: `sigilo/v1/evidence-body:` + `canonicalize({ folio, mediaType, commitment })`. El
  nodo no puede cambiar el tipo declarado ni la cabecera sin que el cuerpo deje de abrir.
- `authorityId` es el de la autoridad del directorio firmado (ventanilla única). Cuando el
  navegador cifra hacia la llave fijada del nodo (perfil de nodo único o página propia del nodo,
  que la usan para su buzón general) no conoce el identificador de la autoridad y usa
  `NODE_KEY_AUTHORITY_ID` = `authority.llave-del-nodo`; el panel prueba el suyo y después ese.
- El folio va en el AAD, así que el navegador lo elige antes de cifrar (`generateFolio`, 60 bits):
  por la red viaja en `RoutedRequest.folio`, como ya hacía; en el envío directo, en `?folio=` de
  `POST /api/v1/complaints`. El nodo rechaza un folio repetido. Un reintento del navegador
  conserva el folio de las pruebas ya subidas.

El nodo comprueba solo el formato (prefijo, versión y al menos un byte de imagen) y guarda el
compromiso de la cabecera; ya no puede comprobar los bytes mágicos de la imagen. Lo hace el panel
al abrirla, antes de mostrarla: el digesto del contenedor debe ser el del descriptor (que va en el
comprobante firmado), el compromiso recalculado el de la cabecera y los bytes, una imagen del tipo
declarado. La descarga (`downloadEvidence`) es `application/octet-stream`.

### Compromiso del contenido: por qué salado

Para la cadena de custodia hace falta un digesto del contenido que sobreviva al re-cifrado (el
contenedor cambia en cada turnado entre nodos). El SHA-256 simple de la imagen serviría, pero
sería un oráculo: quien tenga una imagen candidata (la persona denunciada con el documento
original, o quien sospeche de una foto) podría confirmar con el anclaje que esa imagen es la
prueba, y con ello quién la filtró. Por eso se ancla un compromiso con una sal aleatoria de 32
bytes que viaja cifrada dentro del cuerpo: sin la sal no se puede recalcular, y con ella (la
autoridad, la supervisora o quien turna) se comprueba exactamente. Al re-cifrar se conserva la
sal, así que la copia del destino tiene el mismo compromiso que la anclada en el origen. El nodo
conoce el compromiso pero no la sal; no le sirve para confirmar nada. Los digestos de los
originales antes de limpiar siguen solo dentro de la identidad sellada (`originalEvidenceSha256`).

### Cadena de custodia en la bitácora

- `evidence.received`: al recibir la denuncia, en la misma transacción, el nodo registra
  `{ folio, evidence: [{ evidenceId, sha256, commitment }] }` (`evidenceReceivedPayload`), con el
  digesto de cada contenedor y su compromiso. Como los demás eventos, solo se publica el digesto
  de esos datos, que incluyen el folio.
- `evidence.custody_transferred`: al confirmar un turnado a otro nodo (ver abajo), con el folio,
  el turnado, los nodos de origen y destino, la autoridad destino, el folio destino, los digestos
  y compromisos de las copias del origen y los digestos de las copias del destino. Nunca el
  contenido.
- El detalle de la autoridad trae `evidenceCustody`: lo anclado, los eventos (con su secuencia si
  ya se publicaron) y las llaves re-cifradas hacia la autoridad de la sesión. El panel
  («Cadena de custodia») recalcula el digesto de `evidence.received`, exige que lo anclado sean
  las mismas pruebas del detalle y, si ya se publicó, prueba el evento en la cadena hasta la
  cabeza firmada por la llave fijada (`verifyEvidenceAnchor`). Cada miniatura dice si lo que se
  descifró coincide con lo anclado.

### Supervisora (segunda llave)

`EscalationContent` lleva ahora `evidenceKeys: [{ evidenceId, fileKey }]`: la llave de cada
archivo en Base64URL. Cabe en los 49 152 bytes del relleno fijo. Cuando una regla escala la
denuncia, el nodo entrega a la supervisora el sobre y los contenedores; ella abre el cuerpo con la
llave del archivo, sin usar la llave de la autoridad competente. Una denuncia sin pruebas no lleva
el campo.

### Turnado y reasignación

- Dentro del nodo (turnar desde el buzón general o reasignar): el navegador de quien la tiene abre
  la llave de cada archivo y la vuelve a cifrar hacia la llave pública de la autoridad destino
  (`grantEvidenceKey`, mismo AAD con la autoridad destino) antes de ceder la denuncia, y la sube a
  `POST authority/complaints/{folio}/evidence/keys`. El contenedor no cambia, así que su digesto
  (que va en el comprobante firmado) y su compromiso tampoco. El nodo solo comprueba que cada
  sobre vaya hacia la llave publicada de esa autoridad (directorio firmado, o `keys.json` con un
  solo nodo).
- A otro nodo: el navegador de recepción y turnado abre cada prueba, elige el folio del destino,
  la vuelve a cifrar hacia la autoridad destino del directorio con ese folio y la misma sal, la
  sube por el enrutador y la cita en la denuncia re-cifrada; la segunda llave de la supervisora
  del destino lleva las llaves nuevas. Esto amplía lo descrito en «Turnado entre nodos
  (SEC-19)»: el navegador usa ahora la llave de su autoridad para abrir las pruebas, no para la
  identidad sellada (esas denuncias siguen sin turnarse a otro nodo).
- Entrega de custodia: el comprobante firmado del destino cubre el digesto del envío, que incluye
  los descriptores de las copias nuevas; cuando el origen lo verifica (`confirmTransfer`), en la
  misma transacción registra `evidence.custody_transferred` y marca sus copias como no guardadas,
  y después borra los archivos. Queda una sola copia viva. Si el destino nunca confirma (no
  respondió o el turnado venció a los 10 días hábiles), el origen conserva sus copias.

### Pendiente

- Sellado de tiempo RFC 3161: opcional y trabajo futuro. Hoy la fecha de cada anclaje la da la
  bitácora (encadenada, con cabeza firmada y anclada fuera del sistema); un sello de una autoridad
  de tiempo externa sobre la cabeza del día daría una fecha que no depende del nodo. No se llama
  a ningún servicio externo.
- Subidas por partes y reanudables de pruebas grandes, y pruebas en la cola de entrega del
  enrutador (hoy solo las denuncias sin pruebas pueden esperar en la cola): siguientes pasos.
- Las pruebas guardadas en claro antes de la migración 16 no tienen compromiso ni anclaje; el
  panel las muestra marcadas como anteriores al cifrado.

## Buzón

- Texto en claro: mensaje en UTF-8 con prefijo de longitud, rellenado a exactamente
  `MAILBOX_PADDED_SIZE` = 4096 bytes. El texto mide de 1 a `MAX_MAILBOX_TEXT_LENGTH` = 1000
  unidades UTF-16 (a lo más 3000 bytes); fuera de ese rango `sealMailboxMessage` lanza un error
  claro.
- Destinatario: llave X25519 del buzón de la persona denunciante (si escribe la autoridad) o de la
  autoridad (si escribe la persona denunciante).
- Secuencia: entero por remitente dentro del folio, 0 para el primer mensaje y consecutivo después.
- AAD: `sigilo/v1/mailbox:` + folio + `:` + remitente (`authority` o `reporter`) + `:` + secuencia
  en decimal.
- Firma: Ed25519 del remitente sobre `canonicalize({ envelope, from, sequence })`
  (`verifyMailboxSignature`).
- El servidor verifica destinatario, tamaño y firma, y exige que la secuencia sea la siguiente
  esperada para (folio, remitente); así un mensaje capturado no se puede repetir ni reordenar.
- El receptor debe verificar la firma antes de descifrar y puede comprobar con
  `isMailboxSequenceComplete` que no falten, sobren ni se reordenen mensajes.

## Comprobante firmado

- El sobre de identidad se resume antes de calcular el digesto del envío:
  `sealedIdentityDigest = sha256Hex(canonicalize(sobre))`.
- `submissionDigest = sha256Hex(canonicalize(solicitud))`, con `sealedIdentity` sustituido por
  `sealedIdentityDigest` y, si viene, `escalationEnvelope` por
  `escalationEnvelopeDigest = sha256Hex(canonicalize(sobre))` (`submissionDigestInput`,
  `computeSubmissionDigest`), y, si viene, `corroboration` por
  `corroborationDigest = sha256Hex(canonicalize(corroboración))`. Una solicitud sin segunda llave
  ni corroboración tiene el mismo digesto que antes. Así la autoridad lo recalcula desde
  `ComplaintDetail`, que trae `sealedIdentityDigest`, `escalationEnvelopeDigest` y
  `corroborationDigest`, y no los sobres ni la etiqueta de corroboración
  (`submissionDigestFromDetail`); la supervisora, desde la entrega de la segunda llave
  (`submissionDigestFromEscalation`). Antes de la migración 13 la corroboración entraba completa
  y el panel no podía recalcular el digesto de esas denuncias («las llaves no coinciden»).
- `payloadDigest = sha256Hex(canonicalize({ folio, submissionDigest }))` identifica el evento
  `complaint.received` de la denuncia. El comprobante no lleva `seq`: el evento recibe su lugar en
  la cadena hasta que cierra su día.
- Campos firmados: `folio`, `submissionDigest`, `receivedOn`, `payloadDigest`, `serverKeyId`.
- `signature = Ed25519(llave del servidor, canonicalize(campos firmados))`.
- Llaves de la persona denunciante: el panel recalcula `submissionDigest` desde el detalle y lo
  compara con el `payloadDigest` del evento `complaint.received` publicado (en `receivedEventSeq`,
  bajo una cabeza firmada con la llave fijada del servidor). Si coincide, las llaves del buzón, los
  hechos y las pruebas son los que envió la persona, también en modo `anonymous`. Mientras el
  evento no se publica, el estado es «pendiente».

## Bitácora

- `folioDigest = sha256Hex("sigilo/ledger/folio:" + folio)`.
- `receiptTag = sha256Hex("sigilo/ledger/receipt:" + authVerifier)` (`receiptTagFor`). Es un campo
  público solo de `identity.opened`, va también en sus datos y entra en el `hash` del evento.
- `payloadDigest = sha256Hex(canonicalize(datos del evento))`. Los datos siempre incluyen el folio:

  | Evento                     | Datos                                                                                                                     |
  | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
  | `complaint.received`       | `{ folio, submissionDigest }`                                                                                             |
  | `complaint.status_changed` | `{ folio, status, changeId, action, managementState, authorityId, actor, legalStage?, closureReason?, agreementDigest? }` |
  | `identity.approved`        | `{ folio, requestId, approvalId, legalBasis, actor }`                                                                     |
  | `identity.opened`          | `{ folio, openingId, legalBasis, receiptTag }`                                                                            |
  | `message.sent`             | `{ folio, messageId, from, sequence, envelopeDigest, actor? }` (`actor` en los de la autoridad)                           |
  | `evidence.discarded`       | `{ folio, count, discardId, actor }`                                                                                      |
  | `rule.triggered`           | `{ folio, ruleKey, rulesVersion, effect, anchorOn, dueOn, triggerId, supervisorId? }`                                     |

  `actor` es el seudónimo estable de la cuenta individual (`acct-` y 16 hexadecimales aleatorios),
  nunca un nombre. Va solo en los datos, que son privados del nodo: el evento público lleva su
  digesto, así que el actor queda comprometido sin publicarse (y sin revelar qué autoridad atiende
  qué folio). `agreementDigest` es el SHA-256 del acuerdo de cierre en versión pública.

  `changeId`, `openingId` y `discardId` son aleatorios, para que dos eventos con los mismos datos
  tengan digestos distintos. `evidence.discarded` lo registra la autoridad al descartar las pruebas
  de una denuncia; `count` es el número de archivos borrados.

- `hash = sha256Hex(canonicalize(evento sin el campo hash))`; `receiptTag` se omite si no existe.
- El primer evento usa `prevHash = LEDGER_GENESIS_HASH` (64 ceros); cada evento siguiente usa el
  `hash` del anterior, `seq` consecutivo y una fecha `at` no decreciente.
- **Cierre diario.** Un evento nuevo queda pendiente, sin `seq` ni `prevHash` (`pendingEventFor`) y
  con un identificador aleatorio. Su fecha es la mayor entre hoy y el día siguiente al último
  evento encadenado, para que las fechas no decrezcan aunque el reloj retroceda: cada cierre
  encadena los días completos de menor a mayor, así que un evento fechado antes que otro pendiente no
  rompe el orden. El último día con pendientes no sube la fecha, para que un salto del reloj hacia
  adelante no deje todo fechado en el futuro; si un pendiente tiene fecha de más de un día después
  de hoy, la tarea de cierre avisa al operador. La hora de un mensaje del buzón (`sentOn`) sigue la
  fecha de su evento. Una tarea programada (cada 10 minutos; las lecturas no publican) baraja los pendientes
  de cada día cerrado (UTC) con Fisher-Yates criptográfico (`shuffle`) y los encadena en ese orden
  (`chainEvent`), en lotes de 1000 por transacción (unos 250 ms medidos cada uno). Si el cierre se interrumpe, lo que queda del día
  se vuelve a barajar al reanudar. El orden dentro del día no revela el de llegada.
- Tope: un día admite a lo más 200 000 eventos pendientes; al alcanzarlo, las escrituras de la
  persona denunciante reciben `503 ledger_day_full`. Los eventos de la autoridad están exentos.
- Después de cerrar, el servidor hace un checkpoint del WAL de SQLite, que conserva páginas con los
  pendientes en su orden de llegada.
- Cabeza: `signature = Ed25519(llave del servidor, canonicalize({ seq, hash, at, serverKeyId }))`
  del último evento de un día publicado completo: mientras un día tenga pendientes, la cabeza no
  avanza sobre él. Regla de publicación: un día está publicado si y solo si `at <= head.at`.
- `verifyChain(events, previous?)` recalcula cada hash y comprueba secuencia, encadenamiento y fechas
  no decrecientes (motivo `'date'`) desde el génesis o, con `previous`, desde ese evento ya
  confiable. Además se verifica la firma de la cabeza y que el último evento coincida con ella.
- `verifyEventInChain(event, chain, head, serverPublicKey, { anchors })` prueba que un evento
  pertenece a la bitácora: el tramo debe empezar en ese evento y llegar sin huecos hasta la cabeza
  firmada, y los anclajes que caen dentro del tramo deben coincidir. Un anclaje anterior al tramo no
  se puede comparar con él: el resultado es `anchor-not-comparable`, nunca `valid` (antes se
  ignoraba, y un anclaje firmado que contradecía la cadena, es decir, la prueba de una bifurcación,
  pasaba como «coincide»). Los clientes (`verifyEventWithAnchors`) descargan entonces desde la
  secuencia del anclaje más antiguo y verifican el tramo extendido; si no lo consiguen, muestran
  «no pudimos comparar». Un evento con un hash coherente consigo mismo no prueba nada por sí solo.
- Seguimiento: la persona recibe su evento `complaint.received` (ausente mientras su día no cierra)
  y comprueba con `verifyReceiptEvent` que `at`, `folioDigest` y `payloadDigest` correspondan a su
  comprobante; no compara `seq`. Después descarga el tramo desde el último evento anterior a su día
  de recepción (`GET /api/v1/ledger/events?since=AAAA-MM-DD`) hasta la cabeza y lo verifica. Como
  las fechas no decrecen, ese tramo contiene su evento de recepción y toda apertura ligada a su
  recibo: no hace falta descargar la bitácora desde el génesis. Con `reconcileIdentityOpenings`
  contrasta los `identity.opened` del tramo que llevan su `receiptTag` con las aperturas del
  seguimiento (por `openingId`). No existe una ruta filtrada por `receiptTag` porque una lista
  filtrada no prueba que no falte ninguna; un tramo encadenado hasta la cabeza firmada sí.
- Anclaje: `npm run ledger:anchor` verifica la cabeza pública con la llave fijada, recalcula con
  `verifyChain` la cadena desde el anclaje anterior (o el génesis) hasta la cabeza nueva, exige que
  el evento anclado conserve su hash y escribe `anchors/AAAA-MM-DD.json` (`LedgerAnchorSchema`), que
  se versiona en el repositorio público.

## Prueba de trabajo

- Reto: `GET /api/v1/pow/challenge?purpose=complaint|message` devuelve `{ token, bits }`. El
  servidor firma el token con HMAC-SHA256 (llave aleatoria por proceso). Cualquier otro propósito
  responde `400 bad_request`.
- Usos: un reto `message` sirve para un mensaje; un reto `complaint` sirve para las hasta 10
  subidas de pruebas de una denuncia y después para la denuncia, que lo cierra. El servidor
  comprueba la cabecera antes de leer el cuerpo (`check`), pero gasta el uso (`verify`) solo cuando
  el cuerpo es válido.
- Pendientes por reto: el servidor recuerda en memoria qué pruebas subió cada reto y, si vence sin
  denuncia, las purga al vencer más 30 minutos; la purga diaria (24 a 48 h) queda de respaldo.
- Solución: un contador decimal tal que `SHA-256(token + ":" + contador)` empieza con `bits` bits en
  cero (`isPowSolution`; en promedio 2^bits intentos). El navegador lo busca en un Web Worker
  (`solvePow`).
- Cabecera: `X-Sigilo-Pow: <token>:<contador>` (`POW_HEADER`, `formatPowHeader`). La exigen
  `POST complaints`, `POST evidence` y `POST tracking/messages`.
- El servidor responde `428 proof_required` si falta, no es válida, es de otro propósito, venció,
  agotó sus usos o su dificultad es menor que `max(base, actual - 1)`.
- **Dificultad adaptativa.** La base es `SIGILO_POW_BITS` (18; 0 desactiva la exigencia). Por cada
  duplicación de los retos usados en la última hora sobre el umbral de su propósito (60 denuncias,
  300 mensajes; cada subida de pruebas cuenta como un uso más), la dificultad de ese propósito sube
  un bit, hasta `SIGILO_POW_MAX_BITS` (20 por omisión). Cuando la carga sale de la ventana, vuelve a
  bajar. El máximo no puede superar la base más 2 (el servidor no arranca): `verify` tolera un bit
  y el cliente renueva una vez, así que con más separación la carga de un atacante invalida en
  cadena los retos en curso de una persona legítima.
- **Vigencia.** `margen + 4 · p95`, donde `p95 = ln(20) · 2^bits / 50 000` segundos es el percentil
  95 del tiempo de resolución en un celular básico (`powSolveSeconds`, con
  `SLOW_DEVICE_HASHES_PER_SECOND` = 50 000). El margen es de 5 minutos. A 18 bits, `4 · p95` son unos 63 s y
  la vigencia, unos 6 minutos; a 20 bits, unos 4.2 minutos y 9 minutos.
- **Presión de la lista de gastados.** El servidor no guarda los retos emitidos (van firmados), solo
  los usados hasta que vencen, con un tope de 200 000. Al pasar del 50, 75 y 90 % de ese tope, los
  retos nuevos suman un bit cada vez y el margen se acorta hacia 1 minuto. Si la lista se llena, se
  olvidan primero los usados más antiguos (los más próximos a vencer) en vez de rechazar.
- No hay frenos globales de escrituras: un tope global sin identidad lo podría agotar un atacante
  para todas las personas.
- Residuales: quien acumule retos emitidos mientras hay poca carga puede usarlos, con su dificultad
  de emisión, durante su vigencia; un atacante con GPU resuelve SHA-256 miles de veces más rápido
  que un celular básico, así que la prueba de trabajo encarece el abuso pero no lo iguala, y puede
  alcanzar el tope diario de la bitácora; y un atacante sostenido mantiene la dificultad en el
  máximo, de modo que las personas legítimas esperan lo que tarda un reto de 20 bits.

## Llaves fijadas

Las llaves públicas del servidor y de la autoridad se incluyen en el bundle del cliente. El cliente
debe comparar las llaves que publica el servidor (`GET /keys`) con las fijadas y detenerse si no
coinciden.

En la red federada, la llave de autoridad fijada en el bundle es la del **buzón general** del nodo,
que no está en el directorio. Cada autoridad del directorio tiene su par propio: el navegador de
quien denuncia sella la identidad y los mensajes hacia la llave X25519 de la autoridad elegida,
tomada del directorio verificado con la raíz fijada (`keysForDestination`). El panel acepta la
llave importada según la cuenta (`assertAuthorityKeyFor`):

- con un solo nodo, la fijada del bundle, para todas las cuentas;
- en la red, la entrada de la autoridad de la cuenta (`account.authorityId`) en el directorio
  verificado: `keyId`, `boxPublicKey` y `signingPublicKey` deben coincidir. Se rechaza la del buzón
  y la de otra autoridad, con un mensaje que dice de quién es;
- la cuenta del buzón general sigue con la fijada; si el directorio no verifica o no se descarga,
  solo entra esa.

La misma llave abre la identidad (si el sobre va hacia otro `keyId`, el panel lo dice antes de
intentar abrirlo), abre los mensajes de la persona denunciante y firma las preguntas; el servidor
verifica esa firma con la llave de la autoridad que tiene la denuncia. Una denuncia sellada que
entró por la página propia del nodo sin pasar por la red va hacia la llave del buzón; si el buzón
la turna dentro del nodo, la autoridad receptora no puede abrir su identidad con su llave (lo mismo
con los mensajes que llegaron antes del turnado).

La autoridad genera su par en su navegador («Crear mis llaves», `generateAuthorityKeys`), descarga
la privada y entrega por oficio el candado (`keyId`, `boxPublicKey`, `signingPublicKey`). La huella
que se confirma por teléfono son los primeros 16 caracteres hexadecimales de
`sha256Hex(boxPublicKey ‖ signingPublicKey)` (bytes), en grupos de 4 (`padlockFingerprint`).

## Vectores de prueba

Los vectores de prueba viven en las pruebas unitarias de `packages/core` y los sobres fijos en
`packages/core/src/test-vectors.ts`. Incluyen casos fijos de codificación, forma canónica,
derivación desde el recibo, relleno, `contentDigest`, sobre de identidad con el AAD vigente,
mensaje del buzón con secuencia, comprobante con `payloadDigest`, bitácora con eventos pendientes
y prueba de trabajo, además de pruebas de manipulación: bit alterado, AAD
distinto (otro contexto, folio, remitente o secuencia), llave equivocada, trasplante del sobre de
identidad y eslabón modificado. Este formato redefine v1 antes del lanzamiento: los sobres creados
con el AAD anterior ya no abren.

## Datos abiertos

- Cada mes cerrado se congela una sola vez con sus conteos reales y una semilla secreta nueva
  (`open_data_months`).
- Cada conteo se redondea al azar a un múltiplo de 5, de forma insesgada: `conteo = q·5 + r` sube a
  `(q + 1)·5` con probabilidad `r / 5` y baja a `q·5` en otro caso. El valor esperado es el real.
- El azar sale de los primeros 48 bits de `HMAC-SHA256(semilla del mes, etiqueta de la celda)`: el
  valor publicado de cada celda es estable, así que volver a descargar no da muestras nuevas del
  ruido, y no se puede predecir sin la semilla.
- Lo que redondea a menos de 5 se suprime. Lo suprimido se suma por mes, se redondea igual y va en
  la fila `suprimidas`.
- Garantía: una celda con `k` denuncias y otra con `k + 1` (para `k >= 1`) pueden publicar el mismo
  valor, así que quien rellena una celda con denuncias propias y la ve aparecer o cambiar no sabe
  con certeza si había una denuncia real. Es una garantía probabilística, no privacidad
  diferencial: con 4 denuncias propias, ver la celda publicada pasa de 80 % a 100 % si existe la
  denuncia objetivo. Una celda con una sola denuncia real se publica como 5 con probabilidad 1/5,
  lo que revela que no está vacía; una celda vacía nunca aparece.

## Corroboración ciega (VOPRF)

Decisión en el [ADR 0006](adr/0006-corroboracion-ciega.md) y las señales de independencia en el
[ADR 0010](adr/0010-integridad-de-las-denuncias.md). Código: `@sigilo/corroboracion` (funciones
puras para navegador y Node) y `@sigilo/corroboracion-servicio` (`apps/corroboracion`: evaluador e
índice). Rutas: grupo «Corroboración» del Estándar S5.

### Protocolo

1. **Identificador.** El navegador normaliza el identificador según su tipo y antepone la etiqueta
   de dominio `sigilo/v1/corroboration/<tipo>:<valor>`:
   - `servidor`: `textKey(nombre)` de `@sigilo/anonimato` (sin acentos ni signos, mayúsculas, sin
     palabras vacías, espacios simples; al menos dos palabras) + `|` + clave del ente en
     mayúsculas.
   - `rfc`: mayúsculas sin espacios ni guiones; conserva `Ñ` y `&`; 12 o 13 caracteres.
   - `ocid`: mayúsculas sin espacios, con la forma `OCDS-xxxxxx-…`.
2. **Cegado.** `voprf.blind(entrada)` de `ristretto255_oprf` (@noble/curves 2.4.0), suite
   `ristretto255-SHA512`, modo VOPRF (0x01) de RFC 9497. El navegador envía
   `{ v, keyId, blinded }` a `POST /api/v1/corroboracion/evaluador/evaluaciones` con la cabecera
   `X-Sigilo-Pow` de un reto del propio evaluador.
3. **Evaluación.** El evaluador responde `{ v, suite, epoch, keyId, evaluated, proof }`, con la
   prueba DLEQ (RFC 9497, sección 2.2).
4. **Verificación.** El navegador rechaza la respuesta si la suite, la época o el `keyId` no son los
   de la llave publicada en `corroboration.evaluator` del **directorio firmado y cofirmado**, y si
   la prueba DLEQ no verifica contra esa llave (`voprf.finalize` lanza). La llave que sirve el
   propio evaluador (`GET …/evaluador/llave`) es informativa y no se usa para verificar.
5. **Etiqueta.** De la salida VOPRF de 64 bytes se derivan con HKDF-SHA256 (sal vacía) la
   **etiqueta** (`info = sigilo/v1/corroboration/tag`, 32 bytes en hexadecimal) y la **llave de
   similitud** (`info = sigilo/v1/corroboration/similarity`, 32 bytes, nunca sale del navegador).
6. **Registro.** La etiqueta viaja dentro de la denuncia cifrada hacia el nodo. El nodo la registra
   en el índice con `POST …/indice/registros`, firmado con su llave Ed25519 del directorio sobre
   `sigilo/corroboracion/index-registration/v1:` + JSON canónico: `{ nodeId, epoch, tag,
folioDigest, receivedAt, entry, similarity }`. `folioDigest = HMAC-SHA256(secreto del nodo,
"sigilo/v1/corroboration/folio:" + folio)`; `receivedAt` va redondeado a 10 minutos; `entry` es
   `relay` (ventanilla única) o `direct` (entrada propia del nodo).
7. **Estado y avisos.** El índice responde el estado del grupo (`complaints`,
   `independentSources`, `sameOriginCount`, `flags`, `signals` y un `groupId` aleatorio) y deja un
   aviso a cada nodo cuyo estado cambió (`POST …/indice/avisos`, firmado sobre
   `sigilo/corroboracion/index-notices/v1:`, con `requestedAt` a no más de 20 minutos del reloj del
   índice). Los avisos nunca dicen qué otros nodos ni qué folios forman el grupo.
8. **Confirmación, gracia y baja (H3).** Una denuncia registrada empieza `pending`: no cuenta para
   las demás y su estado es el de una denuncia sola (`isRevealed: false`, `independentSources: 1`,
   `confirmedOtherSources: 0`, un `groupId` propio), haya o no otras denuncias con la etiqueta.
   Pasa a contar y a ver su grupo cuando:
   - el nodo la **confirma** porque la autoridad la aceptó (`POST …/indice/confirmaciones`,
     firmado sobre `sigilo/corroboracion/index-confirmation/v1:`; el nodo lo deja en su bitácora);
   - o pasan **30 días naturales** (`CORROBORATION_CONFIRMATION_GRACE_DAYS`) desde su registro,
     contados con el reloj del índice y no con `receivedAt`, sin confirmación ni baja (`aged`);
   - o el registro trae `custody: true` (ve `confirmedOtherSources`, ver custodia).
     El nodo **da de baja** las denuncias que cierra como spam, improcedentes o acumuladas
     (`POST …/indice/bajas`, firmado sobre `sigilo/corroboracion/index-withdrawal/v1:`, motivo
     `spam`, `inadmissible` o `duplicate`): el índice borra el registro, recalcula el grupo y guarda
     solo el folio opaco para no aceptarlo de nuevo. `independentSources` es siempre esta fuente más
     las otras **confirmadas**; las marcas de mismo origen y campaña se devuelven aunque la denuncia
     esté pendiente, porque solo se forman con relatos parecidos o con la misma ráfaga, nodo y
     entrada. Lado del nodo (pendiente de su dueño): confirmar al aceptar, dar de baja al cerrar como
     spam o improcedente, y marcar `custody` solo en custodias reales.

Vectores: `packages/corroboracion/src/oprf.test.ts` reproduce **byte por byte** los vectores
oficiales del apéndice A.1.2 de RFC 9497 (ristretto255-SHA512, VOPRF): `DeriveKeyPair` (skSm,
pkSm), A.1.2.1 y A.1.2.2 completos (Blind, BlindedElement, EvaluationElement, Proof con su
ProofRandomScalar y Output) y el lote A.1.2.3 con una sola prueba. Se tomaron del texto publicado
en rfc-editor.org (`rfc9497.txt`, SHA-256 `95160517617374655fe23af2c6cec311eae326deb7689239f97641fd5a560432`).
Para fijar los escalares se inyecta un generador que hace que `RandomScalar` devuelva el valor del
vector (`fixedScalarSource`). Las pruebas de manipulación cubren prueba con un bit cambiado,
elemento evaluado cambiado, llave distinta de la publicada (también si la respuesta anuncia la
llave nueva o otra época), punto inválido o identidad, y la separación por tipo de identificador.

### Llaves y rotación

- **Llave OPRF** (escalar ristretto255) y **llave de firma** Ed25519 del evaluador, en
  `evaluator-key.json` (permisos `0600`). `npm run evaluador:llave -w @sigilo/corroboracion-servicio`
  la genera, nunca sobrescribe una existente e imprime el `CorroborationEvaluatorKey` que la
  operación agrega al directorio (`corroboration`, campo opcional) antes de firmarlo.
- **Época.** La llave se rota solo por compromiso: época nueva en el directorio. Las etiquetas de
  épocas distintas no coinciden; el índice agrupa por `(época, etiqueta)`. Para no perder la
  corroboración de la época anterior, el navegador puede pedir la etiqueta en las dos épocas
  mientras ambas estén vigentes (pendiente, nivel C), a costa de duplicar las consultas.
- **Retos.** Firmados con HMAC-SHA256 con un secreto aleatorio por proceso, de un solo uso, vigentes
  10 minutos. El evaluador guarda solo el nonce aleatorio del reto gastado y su vencimiento
  redondeado a 10 minutos.
- **Conteos.** `GET …/evaluador/conteos` devuelve, firmado por día cerrado
  (`sigilo/corroboracion/evaluation-count/v1:`), el número de evaluaciones, incluidos los días en
  cero. Nunca el día en curso: un contador en vivo delataría el momento de cada consulta.

### Qué ve cada servicio

| Servicio                | Ve                                                                                     | No ve nunca                                                                   | Guarda                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Navegador               | Identificador, salida VOPRF, etiqueta, llave de similitud, relato                      | La llave privada del evaluador                                                | Nada (memoria de la pestaña)                                      |
| Evaluador OPRF          | Elementos cegados (puntos uniformes), su dirección de red al llegar                    | Identificador, etiqueta, relato, folio, nodo, autoridad                       | Conteo por día y época; nonces de retos gastados hasta que vencen |
| Nodo                    | Denuncia completa (identificador incluido, como hoy), etiqueta, resumen difuso, estado | La llave del evaluador, los folios y nodos de las demás denuncias del grupo   | Lo de hoy más la etiqueta y el estado de corroboración            |
| Índice de coincidencias | Etiqueta, nodo, folio opaco, hora a 10 minutos, entrada, resumen difuso                | Identificador, relato, folio público, llave del evaluador, llave de similitud | Exactamente lo que ve, más el estado calculado y los avisos       |

La prueba `apps/corroboracion/src/scenario.test.ts` lo comprueba sobre el escenario: lee los
bytes de la base del evaluador y de su WAL y no encuentra los elementos cegados, las etiquetas, la
llave de similitud ni el identificador en ninguna forma (bytes, hexadecimal o Base64URL); y en la
base del índice no hay identificadores, nombres ni folios públicos, ni coincide ninguna etiqueta
con un diccionario de los identificadores verdaderos calculado sin el evaluador (SHA-256, HKDF o
un VOPRF con otra llave).

### Resumen difuso del relato

Sirve para la señal «textos muy parecidos» entre nodos distintos sin mandar el texto.

- **Cálculo.** En el navegador, sobre el relato ya revisado con Huella Cero: `textKey` y espacios
  como `_`; fragmentos de 5 caracteres; cada fragmento se resume con
  `HMAC-SHA256(llave de similitud, fragmento)`; 512 permutaciones por doble resumen
  (`mix32(h1 + i·h2)`); el bit i es el bit menos significativo del mínimo de la permutación i
  (MinHash de un bit). Resultado: 64 bytes. Con menos de 30 fragmentos no se manda resumen (`null`).
- **Estimación.** `J ≈ 2·(bits iguales / 512) − 1`; el error típico es de unos 0.04 a 0.06.
- **Análisis de privacidad.**
  - _Reconstrucción._ 512 bits no alcanzan para reconstruir un relato de cientos de caracteres:
    cada bit es la paridad de un mínimo, no un fragmento. No hay inversión posible del texto.
  - _Prueba de frases._ Con la llave, se podría probar si un relato contiene una frase candidata
    (un fragmento con resumen muy bajo fija bits). Por eso la llave sale de la salida VOPRF: el
    índice, que solo ve la etiqueta, no puede derivarla (HKDF con otro contexto) y para obtenerla
    necesita el identificador **y** una consulta en línea al evaluador, que ya es el riesgo de
    consulta dirigida de abajo. El nodo podría calcularla con el identificador, pero ya tiene el
    relato completo.
  - _Enlace entre denuncias._ La llave es distinta por etiqueta, así que los resúmenes de una misma
    persona sobre acusados distintos no se pueden comparar: el resumen no sirve para seguir a
    quien denuncia entre grupos.
  - _Confirmación._ Quien ya tenga un relato candidato y la llave puede confirmar si es parecido al
    registrado. Ese adversario ya es la autoridad o alguien que conoce el texto.
  - _Decisión._ Se adopta (nivel A) con esas condiciones. Si una autoridad lo considerara excesivo,
    el nodo puede mandar `similarity: null`: la señal de texto se pierde y queda solo la de ráfaga
    con mismo nodo y entrada.

### Una persona = una corroboración

`assessIndependence` agrupa las denuncias de una etiqueta (componentes conexos) cuando:

- los relatos se estiman con similitud ≥ 0.6, a cualquier hora (`similar_text`);
- o caen en la misma ventana de 120 minutos (`burst`) con similitud ≥ 0.25;
- o caen en la misma ventana sin resumen de alguna y con el mismo nodo y la misma entrada.

Cada grupo cuenta como **una** fuente. Con dos o más denuncias el grupo lleva
`possible_same_origin`; con tres o más en 24 horas, también `possible_campaign`. No hay huella de
dispositivo: no se recolecta. Los umbrales son del prototipo y se publican con la regla. Nada se
descarta ni se llama «falso»; la marca solo evita contar de más y se informa a la autoridad.
En el escenario: Marta (día 0, ventanilla única) y Luis (día 3, entrada propia del nodo Federal)
dan **2 fuentes**; las tres denuncias del atacante (día 2, 40 minutos, textos parecidos) dan
**1 fuente** con `possible_same_origin` y `possible_campaign`.

### Custodia opcional (nivel B)

Formato `CustodyRecord` y máquina de estados en `packages/corroboracion/src/custody.ts`:

- La denuncia ya cifrada hacia la autoridad se vuelve a cifrar con HPKE hacia la llave del
  custodio (`sealForCustody`, AAD `sigilo/v1/custody:<custodyId>`). El nodo guarda la custodia y no
  puede abrirla; el custodio solo obtiene otro sobre hacia la autoridad y se niega a abrir una
  custodia retenida.
- Fecha límite: `mínimo(fecha elegida, primer día del periodo de los hechos + 3 años − 12 meses)`.
  Si ya llegó, la custodia nace liberada.
- Estados `held → released`, final. Eventos: `match_reported` (lleva `confirmedOtherSources` del
  estado del índice y libera cuando esta denuncia más las otras fuentes **confirmadas** suman
  `requiredSources`, 2 por omisión; una denuncia de sondeo o spam sin confirmar no libera), `reporter_release` (firma Ed25519 sobre
  `sigilo/v1/custody-release:<custodyId>` con una llave derivada del recibo,
  `info = sigilo/v1/custody-release-key`, no ligable con las del buzón) y `clock`. Cualquier evento
  con fecha igual o posterior a la fecha límite libera por fecha límite.

### Riesgos

- **Oráculo «¿hay denuncias contra X?» (consulta dirigida).** Quien vea etiquetas (la operación
  del índice o un nodo) y adivine un identificador puede pedir su etiqueta al evaluador y buscarla.
  Mitigaciones: el evaluador lo opera alguien distinto del índice y de los nodos; cada consulta es
  en línea, con prueba de trabajo de un solo uso y tope diario opcional
  (`SIGILO_EVALUATOR_MAX_DAILY`); el conteo diario firmado se publica junto al de denuncias, de modo
  que una enumeración masiva se nota; y las fichas de unicidad del ADR 0010 (nivel C) la
  reducirían. No se impide: un atacante paciente con pocos nombres candidatos puede confirmarlos.
  La prueba «la consulta dirigida solo es posible en línea» del escenario lo documenta.
- **Sondeo a través de un nodo (G03, H3).** Conocer una etiqueta **sí** basta para preguntar por
  ella: cualquiera puede enviar una denuncia de sondeo con la etiqueta de un identificador (la web
  la calcula para cualquier texto), y el nodo la registra firmada en el índice. Antes de H3, el
  estado de esa denuncia, visible para quien la recibe en el buzón del nodo, decía cuántas
  denuncias había contra ese identificador en toda la red, y el sondeo sumaba una fuente
  «independiente» a la denuncia real. Mitigación: el índice no cuenta ni revela nada para una
  denuncia sin confirmar (`oracle.test.ts` comprueba que el estado del sondeo es idéntico haya o
  no denuncias, y que la denuncia real no cambia), y el nodo da de baja el spam. Riesgo residual:
  una persona del nodo que **acepta** un sondeo (acto que queda en la bitácora del nodo y a la
  vista del auditor), o que lo deja **30 días** sin darlo de baja, o que lo marca como custodia,
  aprende si hay otras fuentes confirmadas y lo suma como fuente. Un sondeo aceptado o envejecido
  infla en uno el conteo de la denuncia real. Lo acotan la bitácora del nodo, el auditor de
  cierres (ADR 0009) y que la cuenta del sondeo sea por fuentes, no por denuncias.
- **Colusión evaluador e índice.** Juntos recuperan el diccionario gratuito y silencioso. Solo lo
  evita la operación separada; el evaluador por umbral (nivel C) lo dificultaría.
- **Compromiso de la llave OPRF.** Expone las etiquetas de su época a un diccionario. Se rota con
  época nueva.
- **Evaluador que marca personas.** Con VOPRF y la llave fijada en el directorio cofirmado, una
  llave por persona se detecta; usar la misma llave y negarse a responder a alguien sigue siendo
  posible (denegación de servicio, no marcado).
- **Dirección de red ante el evaluador.** El navegador llama al evaluador directo: el evaluador ve
  su dirección y la hora, pero no qué identificador ni a qué nodo va la denuncia. Pasar las
  evaluaciones por el enrutador ciego lo evitaría (pendiente).
- **Falsos positivos y negativos de independencia.** Dos personas que describen lo mismo con
  palabras parecidas en la misma ventana se cuentan como una; una persona cuidadosa que varía el
  texto y el día cuenta como varias. Las señales encarecen, no impiden.
- **Normalización.** Variantes de un nombre no coinciden y dos homónimos en el mismo ente sí.

### Integración

El nodo, la red y la demostración ya usan la corroboración; queda lo marcado como pendiente:

- **Web (`apps/web`).** Paso opcional «¿Contra qué contrato, proveedor o persona?» con
  `blindCorroboration` → reto y evaluación (en un Web Worker, como la prueba de trabajo) →
  `finalizeCorroboration` con la llave del directorio verificado (`evaluatorKeyFromDirectory`) →
  `similarityDigest` sobre el relato final. La etiqueta, la época y el resumen viajan dentro de la
  denuncia cifrada; el identificador no sale de los hechos que ya ve la autoridad. Si el evaluador
  no responde o la prueba falla, la denuncia se envía igual, sin corroboración. Opción de custodia
  con fecha elegida y su explicación.
- **Nodo (`apps/server`), integrado.** Campo `corroboration` en el envío; el nodo firma el
  registro en el índice con su llave del directorio y un folio opaco (`folioDigestFor` con un
  secreto propio de 32 bytes en el directorio de datos), consulta los avisos en la tarea
  periódica, suma «coincide con otras N denuncias independientes» a la ficha de contexto y marca
  «posible nuevo indicio» si el folio está archivado (LGRA, art. 100). Pendiente: confirmar en el
  índice al aceptar y dar de baja al cerrar como spam, improcedente o acumulada (H3; el arnés de
  pruebas del nodo usa `requireConfirmation: false` hasta entonces), y la guarda de custodias con
  su evento en la bitácora y en el seguimiento (nivel B: formato y estados).
- **Enrutador (`apps/enrutador`).** Entrada de la bitácora nacional con los conteos diarios del
  evaluador junto al número de denuncias; opcionalmente, reenvío ciego de las evaluaciones.
- **Red (`packages/red`), integrado.** `buildDemoDirectory` acepta `corroboration`; `npm run
red:demo` genera la llave del evaluador y la publica en el directorio, y `compose.yaml` levanta
  el evaluador y el índice.
- **Custodio.** Servicio que tenga la llave del custodio y abra solo custodias liberadas; aún no
  existe (nivel B: formato y estados con pruebas).

### Tabla de funciones del nodo

La `FunctionTable` (formato 1) la firma el nodo con su llave Ed25519 de firma del directorio sobre
`sigilo/red/function-table/v1:` + el SHA-256 de su forma canónica (`signFunctionTable` y
`verifyFunctionTableSignature` en `packages/red/src/function-table.ts`). Viaja dentro del directorio
(`functionTables`), que además firma la operación y cofirman los testigos: la operación no puede
cambiar la tabla de un estado sin la llave de ese nodo, y el navegador rechaza un directorio con una
tabla sin firma válida de su nodo (`functionTableProblems`).

### Token de acceso entre la SESNA y los nodos

El token de `POST /oauth/token` es un JWT HS256 (`typ: at+jwt`) de 5 minutos que firma y verifica
solo el nodo que lo emitió, con una llave HMAC aleatoria de 32 bytes que nunca sale del proceso (un
reinicio invalida los tokens vigentes). Lleva `iss` = `aud` = id del nodo, `sub` = cliente, `scope`,
`iat`, `exp` y `jti`. El nodo guarda solo el SHA-256 del secreto de cada cliente y el digesto scrypt
de la contraseña del flujo `password`, y compara en tiempo constante
(`apps/server/src/network/oauth-server.ts`).

### Etiqueta HMAC del buzón (v2)

El enrutador agrega a cada sobre que entrega al buzón de red la cabecera `X-Sigilo-Relay-Auth`
(`packages/red/src/relay-auth.ts`), además del token OAuth:

```text
v2.<milisegundos>.<nonce de 16 bytes en hex>.<Base64URL(HMAC-SHA256(secreto,
  "sigilo/red/relay-auth/v2:" + milisegundos + "." + nonce + "." + cuerpo exacto))>
```

El nodo la acepta solo dentro de ±5 minutos y una sola vez por nonce. La v2 es la que envía el
enrutador por omisión (`SIGILO_ROUTER_RELAY_AUTH`); la v1 (HMAC del cuerpo sin marca de tiempo ni
nonce, dominio `sigilo/red/relay-auth/v1:`) se acepta solo durante la transición y se apaga en el
nodo con `SIGILO_RELAY_AUTH_LEGACY=0`, que `./sigilo instalar` ya deja así.

### Secretos de enlace derivados (SESNA ↔ nodo)

La SESNA y cada nodo comparten dos secretos: el **HMAC del buzón** (`relay-secret.json` en el nodo,
`relay-secrets.json` en el enrutador) y el **secreto del cliente OAuth** de la SESNA en el nodo
(`oauth-clients.json` guarda su SHA-256; `node-credentials.json`, el secreto). Ninguno viaja ni se
dicta: cada lado lo **deriva** (`deriveLinkSecrets`, `packages/red/src/node-join.ts`).

- Cada nodo genera una llave X25519 **de enlace**, distinta de su llave de red (separación de
  dominios), y la manda pública en su solicitud de alta con su época (`enlace.epoca`, 1 al
  instalar). La SESNA publica la suya en `red.json` (`enlace`).
- Los dos calculan

  ```text
  ss     = X25519(privada propia, pública del otro)
  relay  = HKDF-SHA256(ss, sal = "sigilo/enlace/v1", info = "relay|" + nodeId + "|" + época, 32)
  oauth  = HKDF-SHA256(ss, sal = "sigilo/enlace/v1", info = "oauth|" + nodeId + "|" + época, 32)
  ```

  y los escriben con los formatos de siempre: **no cambia ni el servidor ni el enrutador**. Un
  secreto común nulo (llave de orden bajo) se rechaza.

- **Rotación.** `sigilo rotar-llaves --enlace` crea una llave de enlace nueva con la época
  siguiente y un archivo de rotación firmado con la llave del nodo del directorio
  (`sigilo/red/rotacion-enlace/v1:` + SHA-256 canónico). La SESNA lo verifica contra esa llave, exige
  una época mayor y deriva los secretos nuevos; el nodo los aplica con `--aplicar`. Los tokens
  vigentes vencen en 5 minutos y los sobres que no entren mientras tanto esperan en la cola.
- **Llaves.** La del nodo vive en `llaves/enlace-key.json`, fuera del volumen del servidor (que
  solo tiene los secretos derivados). La de la SESNA vive en `llaves/enlace-key.json`, fuera del
  volumen del enrutador; se respalda junto con la de la operación.

**Lo que se acepta a cambio.** Quien robe la llave de enlace de la SESNA puede derivar los secretos
de **todos** los nodos. No es un riesgo nuevo: antes `relay-secrets.json` y `node-credentials.json`
ya vivían juntos en el enrutador con los secretos de todos los nodos, y lo siguen haciendo. Lo que se
gana es que ningún secreto pasa por correo, oficio o teléfono, que es donde más se filtran. Otro
costo: los secretos ya no son independientes entre sí (comparten `ss`), pero HKDF con `info`
distinto los separa, y conocer uno no da el otro. Si la llave de la SESNA se compromete, se rota
`red.json` (nueva llave de enlace) y cada nodo rota su enlace; es lo mismo que exigiría hoy cambiar
todos los secretos a mano.

### Alta de un nodo: solicitud firmada y huellas

- **Paquete de la red (`red.json`).** Lo firma la operación (`sigilo/red/paquete/v1:` + SHA-256
  canónico) y trae la raíz de confianza, la ventanilla y la llave de enlace de la SESNA. La firma da
  integridad; la autenticidad la da la **huella de la red**: SHA-256 de la forma canónica de la raíz
  (sin `minDirectorySerial` ni `maxDirectoryAgeDays`), 32 caracteres hexadecimales en grupos de 4,
  publicada en el oficio y en el sitio de la SESNA. El instalador del nodo se detiene si no coincide.
- **Solicitud de alta.** La firma el nodo con su llave del directorio
  (`sigilo/red/solicitud-alta/v1:` + SHA-256 canónico): prueba que tiene la llave. No lleva llaves
  privadas ni contraseñas. Su **huella** es el SHA-256 de la llave de firma, la de red y la de enlace
  del nodo (los bytes, en ese orden), 32 hexadecimales; el estado la lee por teléfono a un número
  oficial y la SESNA no acepta sin ella.
- **Por qué 128 bits y no los 64 del candado.** La huella de la red y la del nodo protegen a toda la
  red y se leen una sola vez; 64 bits quedan cortos contra una segunda preimagen dirigida. Los
  candados de las autoridades siguen con 16 (`padlockFingerprint`).

### Cola de entrega del enrutador

Cuando el nodo destino no responde, el enrutador puede guardar una denuncia sin pruebas en su cola
sin abrirla: el sobre sigue cifrado con HPKE hacia la llave X25519 del nodo. El acuse
(`RelayQueueReceipt`) lo firma la llave Ed25519 de la operación sobre
`sigilo/red/relay-queue/v1:` + forma canónica del acuse sin firma, e incluye el SHA-256 canónico
del sobre (`relayEnvelopeDigest`): la web lo verifica con la llave de la operación del directorio
verificado y solo para ese mismo sobre y nodo. El folio lo genera el navegador
(`generateFolio`, 60 bits de `crypto.getRandomValues`, el mismo generador del nodo) y viaja
dentro del sobre (`RoutedRequest.folio`); el nodo lo rechaza si ya existe. El reto de la cola es
HMAC-SHA256 con una llave propia del enrutador, con vencimiento de 10 minutos y de un solo uso.

### Turnado entre nodos (SEC-19)

El navegador de recepción y turnado arma de nuevo la denuncia con los hechos y las pruebas del
detalle (no usa la llave de su autoridad: las denuncias con identidad sellada todavía no se turnan a
otro nodo) y la cifra en un sobre del enrutador hacia el nodo de la autoridad destino
(`sealRoutedRequest`; sobre v2: el encabezado dice solo el nodo y la autoridad va cifrada en
`RoutedRequest.to`, con AAD `sigilo/red/relay/request/v2:` + nodo), conservando las llaves de seguimiento de la persona denunciante. El nodo de
origen solo lleva ese
sobre al enrutador y registra `complaint.transferred` con el SHA-256 canónico del sobre y de la
respuesta; nunca ve el contenido re-cifrado. El comprobante del nodo destino se verifica con la
llave de firma de ese nodo en el directorio antes de avisar a la persona del folio nuevo. La
segunda llave del nodo de origen no viaja: la supervisora es otra en el destino.

### Testigo en el nodo

Un nodo que el directorio nombra testigo cofirma la cabeza nacional desde su tarea periódica con
su llave de firma del directorio, con el mismo código que el proceso testigo
(`@sigilo/red/witness`): solo cofirma lo que verificó.

## Riesgos residuales

- Relleno de celdas en datos abiertos: el redondeo aleatorio lo vuelve probabilístico, pero no lo
  impide (ver «Datos abiertos»).
- Ventana de anclaje: entre dos anclajes, quien tenga la llave de firma del servidor podría
  reescribir eventos todavía no anclados.
- Retos acumulados: los retos emitidos con poca carga sirven, a su dificultad, durante su vigencia.
- Asimetría de la prueba de trabajo: una GPU resuelve miles de veces más rápido que un celular
  básico.
- Fechas futuras: mientras el reloj del servidor está adelantado, los eventos se fechan en el
  futuro y se publican hasta ese día; al corregirse el reloj, los eventos nuevos vuelven al día
  real y el operador recibe un aviso.
- Anclajes no comparables: si el servidor no entrega la parte de la bitácora donde está un
  anclaje pegado, el cliente no puede compararlo y lo dice; sin anclajes, la vista dividida no se
  detecta.

## Trabajo futuro

- Revelación por umbral 2 de 3 criptográfica (una llave por denuncia repartida entre custodios),
  para que la apertura no dependa de la política del nodo; hoy el umbral lo aplica el servidor.
- Una llave de supervisora por autoridad tomada del directorio firmado (hoy, una por nodo).
- Cifrado híbrido X25519 + ML-KEM para conservación de largo plazo.
- Llaves de autoridad protegidas con WebAuthn PRF.
