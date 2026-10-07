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
  `sealedIdentityDigest` (`submissionDigestInput`, `computeSubmissionDigest`). Así la autoridad lo
  recalcula desde `ComplaintDetail`, que trae `sealedIdentityDigest` y no el sobre
  (`submissionDigestFromDetail`).
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

  | Evento                     | Datos                                          |
  | -------------------------- | ---------------------------------------------- |
  | `complaint.received`       | `{ folio, submissionDigest }`                  |
  | `complaint.status_changed` | `{ folio, status, changeId }`                  |
  | `identity.opened`          | `{ folio, openingId, legalBasis, receiptTag }` |
  | `message.sent`             | `{ folio, messageId, from, envelopeDigest }`   |

  `changeId` y `openingId` son aleatorios, para que dos eventos con los mismos datos tengan
  digestos distintos.

- `hash = sha256Hex(canonicalize(evento sin el campo hash))`; `receiptTag` se omite si no existe.
- El primer evento usa `prevHash = LEDGER_GENESIS_HASH` (64 ceros); cada evento siguiente usa el
  `hash` del anterior, `seq` consecutivo y una fecha `at` no decreciente.
- **Cierre diario.** Un evento nuevo queda pendiente, sin `seq` ni `prevHash` (`pendingEventFor`) y
  con un identificador aleatorio. Al terminar su día (UTC), los pendientes del día se barajan con
  Fisher-Yates criptográfico (`shuffle`) y se encadenan en ese orden (`chainEvent`), en lotes de
  5000 por transacción. Si el cierre se interrumpe, lo que queda del día se vuelve a barajar al
  reanudar. El orden dentro del día no revela el de llegada.
- Tope: un día admite a lo más 200 000 eventos pendientes; al alcanzarlo, las escrituras reciben
  `503 ledger_day_full`.
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
  firmada, y los anclajes que caen dentro del tramo deben coincidir. Un evento con un hash coherente
  consigo mismo no prueba nada por sí solo.
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

- Reto: `GET /api/v1/pow/challenge?purpose=complaint|evidence|message` devuelve `{ token, bits }`.
  El servidor firma el token con HMAC-SHA256 (llave aleatoria por proceso); vence en 10 minutos,
  sirve para un solo propósito y se gasta al usarse.
- Solución: un contador decimal tal que `SHA-256(token + ":" + contador)` empieza con `bits` bits en
  cero (`isPowSolution`; en promedio 2^bits intentos). El navegador lo busca en un Web Worker
  (`solvePow`).
- Cabecera: `X-Sigilo-Pow: <token>:<contador>` (`POW_HEADER`, `formatPowHeader`). La exigen
  `POST complaints`, `POST evidence` y `POST tracking/messages`.
- El servidor responde `428 proof_required` si falta, no es válida, es de otro propósito, venció o
  ya se usó.
- **Dificultad adaptativa.** La base es `SIGILO_POW_BITS` (18; 0 desactiva la exigencia). Por cada
  duplicación de las soluciones aceptadas en la última hora sobre el umbral de su propósito (60
  denuncias, 300 pruebas, 300 mensajes), la dificultad de ese propósito sube un bit, hasta
  `SIGILO_POW_MAX_BITS` (24). Cuando la carga sale de la ventana, vuelve a bajar.
- **Presión de la lista de gastados.** El servidor no guarda los retos emitidos (van firmados), solo
  los gastados hasta que vencen, con un tope de 200 000. Al pasar del 50, 75 y 90 % de ese tope, los
  retos nuevos suman un bit cada vez y su vigencia se acorta hacia 2 minutos. Si la lista se llena,
  se olvidan primero los gastados más antiguos (los más próximos a vencer) en vez de rechazar.
- **Freno extremo.** Por encima de la prueba de trabajo, un límite por hora responde 429 y solo
  cuenta escrituras confirmadas: 3000 denuncias, 10 000 pruebas y 6000 mensajes.
- Residual: quien acumule retos emitidos mientras hay poca carga puede usarlos, con su dificultad de
  emisión, durante su vigencia.

## Llaves fijadas

Las llaves públicas del servidor y de la autoridad se incluyen en el bundle del cliente. El cliente
debe comparar las llaves que publica el servidor (`GET /keys`) con las fijadas y detenerse si no
coinciden.

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

## Riesgos residuales

- Relleno de celdas en datos abiertos: el redondeo aleatorio lo vuelve probabilístico, pero no lo
  impide (ver «Datos abiertos»).
- Ventana de anclaje: entre dos anclajes, quien tenga la llave de firma del servidor podría
  reescribir eventos todavía no anclados.
- Retos acumulados: los retos emitidos con poca carga sirven, a su dificultad, durante su vigencia.

## Trabajo futuro

- Revelación por umbral 2 de 3 de una llave por denuncia.
- Cifrado híbrido X25519 + ML-KEM para conservación de largo plazo.
- Llaves de autoridad protegidas con WebAuthn PRF.
