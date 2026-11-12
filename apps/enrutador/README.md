# Enrutador ciego de SIGILO (`@sigilo/enrutador`)

Pieza central de la red federada «un S5, muchas llaves» ([ADR 0005](../../docs/adr/0005-estandar-s5-federado.md)
y [ADR 0007](../../docs/adr/0007-rendicion-de-cuentas-de-la-autoridad.md)). Hace tres cosas:

1. **Publica el directorio de autoridades** firmado por la operación y cofirmado por m de n testigos.
2. **Reenvía sobres opacos** al nodo destino, sin poder leerlos: el sobre v2 nombra solo el nodo;
   la autoridad va cifrada adentro y la entrega el nodo.
3. **Lleva la bitácora nacional**: encadena las cabezas firmadas de cada nodo y las versiones del
   directorio, y publica una cabeza nacional que solo vale con m cofirmas de testigos.

Además, como el S1 de la PDN (cada entidad publica y la SESNA consulta por API), arma el **corte
nacional de datos abiertos** (Bases de la PDN, arts. 60 y 61): **la SESNA consulta números y
pruebas, nunca denuncias** (ver «Corte nacional de datos abiertos» más abajo).

Las funciones puras que usan el navegador, los nodos y los testigos están en
[`packages/red`](../../packages/red/src/index.ts). Las rutas y esquemas están en
`packages/contracts/src/network.ts` y se publican en `estandar/openapi.yaml` (grupo «Red»).

## Arranque

```sh
npm run red:demo                 # llaves sintéticas en .red-demo/ (no se versiona)
SIGILO_ROUTER_DATA_DIR=.red-demo/enrutador npm run dev:enrutador
```

O toda la red con `npm run demo:todo` (o `docker compose build && docker compose up -d`; ver la
[guía para conectar un estado](../../docs/guia-conecta-tu-estado.md)).

| Variable                                 | Por omisión           | Uso                                                                  |
| ---------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `SIGILO_ROUTER_DATA_DIR`                 | `apps/enrutador/data` | `directory.json`, `trust.json`, `operator-key.json` y `enrutador.db` |
| `SIGILO_ROUTER_HOST`                     | `127.0.0.1`           | `0.0.0.0` solo dentro de un contenedor                               |
| `SIGILO_ROUTER_PORT`                     | `8790`                | Puerto                                                               |
| `SIGILO_ROUTER_NODE_URLS`                | vacío                 | `node.id=http://host:puerto,...`: direcciones internas de los nodos  |
| `SIGILO_ROUTER_COLLECT_INTERVAL_SECONDS` | `600`                 | Cada cuánto recoge cabezas, emite la cabeza nacional y hace el corte |
| `SIGILO_ROUTER_CLOCK_FILE`               | vacío                 | Solo demostración (`SIGILO_DEMO=1`): reloj simulado del corte        |
| `SIGILO_ROUTER_HSTS_MAX_AGE`             | sin HSTS              | `max-age` cuando se publica detrás de HTTPS                          |
| `SIGILO_ROUTER_QUEUE_POW_BITS`           | `18`                  | Dificultad del reto propio de la cola de entrega (0 a 24)            |
| `SIGILO_ROUTER_QUEUE_INTERVAL_SECONDS`   | `15`                  | Cada cuánto revisa la cola (cada sobre lleva su siguiente intento)   |
| `SIGILO_ROUTER_QUEUE_TTL_DAYS`           | `7`                   | Días que un sobre espera antes de vencer y borrarse sin abrir        |
| `SIGILO_ROUTER_QUEUE_MAX_PER_NODE`       | `500`                 | Sobres en cola por nodo; al llenarse responde `429`                  |
| `SIGILO_ROUTER_QUEUE_MAX_MB_PER_NODE`    | `64`                  | Megabytes en cola por nodo                                           |

Al arrancar verifica `directory.json`: la primera vez contra la raíz fijada `trust.json`; después
exige la misma versión o exactamente la siguiente, cofirmada por los testigos de la anterior. Si no
verifica, no arranca.

## Rutas

Todas bajo `/api/v1/red`; el detalle está en `estandar/openapi.yaml`.

| Método y ruta                                | Qué hace                                                     |
| -------------------------------------------- | ------------------------------------------------------------ |
| `GET /directory`                             | Directorio firmado y cofirmado                               |
| `POST /relay`                                | Sobre opaco (v2) hacia un nodo; responde el sobre de vuelta  |
| `GET /queue/challenge`                       | Reto propio para dejar una denuncia en la cola de entrega    |
| `POST /nodes/{nodeId}/registration`          | Registro firmado del nodo (secuencia creciente)              |
| `POST /nodes/{nodeId}/heads`                 | El nodo publica su cabeza firmada                            |
| `GET /national/head`                         | Última cabeza nacional con m cofirmas (`404` si aún no hay)  |
| `GET /national/pending`                      | Última cabeza emitida, para los testigos                     |
| `POST /national/cosignatures`                | Cofirma de un testigo                                        |
| `GET /national/entries?from=&limit=`         | Entradas de la bitácora nacional                             |
| `GET /national/inclusion?nodeId=&seq=&hash=` | Prueba de que esa cabeza de nodo está incluida               |
| `GET /national/open-data`                    | Último corte nacional de datos abiertos (`404` hasta el 1.º) |
| `GET /national/open-data.csv`                | El mismo corte en CSV, con las columnas del CSV de cada nodo |
| `POST /inbox` (en cada **nodo**)             | Buzón de red: lo implementa el nodo, no el enrutador         |

Además, el enrutador **recoge** periódicamente la cabeza de cada nodo en `GET /api/v1/ledger/head`,
la ruta pública que el servidor de referencia ya sirve. Por eso la bitácora nacional funciona hoy
sin cambiar `apps/server`.

## Cola de entrega («store and forward»)

`src/relay-queue.ts` y `src/queue-pow.ts`. Si un nodo se cae, los demás siguen y la denuncia no
se pierde:

1. **La ventanilla lo pide.** Cuando el nodo destino no responde (la respuesta no abre), la web
   pide `GET /queue/challenge`, resuelve ese reto (el nodo caído no puede emitir el suyo) y
   reenvía la denuncia con `deferral: { proof }`. Solo para denuncias **sin pruebas adjuntas**
   (tramo de hasta 1 MiB): una prueba se sube antes y necesita al nodo.
2. **El folio lo elige el navegador.** Toda denuncia por la red lleva `RoutedRequest.folio`,
   generado en el navegador al azar con `generateFolio` (el mismo generador que usa el nodo); el
   nodo lo rechaza si ya existe. Así la persona tiene su folio y sus 8 palabras desde el primer
   momento, aunque la denuncia espere o la respuesta se pierda.
3. **El enrutador intenta y, si no puede, guarda.** Si la entrega falla (nodo sin registrar,
   caído, sin responder a tiempo o con `503`), guarda en `relay_queue` el sobre **cerrado** tal
   como llegó (no puede abrirlo) y responde relleno con un **acuse firmado** por la operación en
   `queued` (`RelayQueueReceipt`: identificador de la cola, nodo, día de aceptación, vencimiento y
   SHA-256 del sobre). La web lo verifica con la llave de la operación del directorio verificado.
4. **Reintenta con espera exponencial**: 30 s, 1 min, 2 min… hasta 1 h entre intentos. Al
   entregar (o si el nodo lo rechaza con `400`) lo borra; a los 7 días vence y lo borra sin
   abrir. Después de borrar vacía el WAL (`wal_checkpoint(TRUNCATE)`; la base usa
   `secure_delete`).
5. **La persona consulta después.** La respuesta del nodo a una entrega desde la cola va cifrada
   hacia la llave efímera del navegador, que ya no espera: se descarta. La persona ve su
   comprobante firmado por el nodo en «Mi denuncia» con su folio y sus palabras.

Del lado del nodo, la entrega diferida (el cuerpo lleva `deferral`) solo se acepta con la
etiqueta HMAC del enrutador, solo para `submitComplaint` con folio y con un tope por hora
(`MAX_DEFERRED_PER_HOUR`); se salta la prueba de trabajo del nodo porque el enrutador cobró la
suya. Si el nodo falla (estatus 5xx) o llegó al tope, responde `503` y el sobre sigue en la cola.

Límites: 500 sobres y 64 MiB por nodo (configurable); al llenarse, `429`. Nada del contenido
queda en registros: la línea agregada por vuelta solo suma `queue: { queued, delivered,
rejected, expired, retried }`.

## Corte nacional de datos abiertos

`src/open-data-aggregator.ts`. En cada vuelta, después de recoger las cabezas, el enrutador
descarga de cada nodo del directorio su CSV público `GET /api/v1/open-data/complaints.csv` (el
mismo que cualquiera puede bajar; ninguna ruta de denuncias ni del buzón) y:

1. **Valida** el archivo completo y lo descarta si no cumple: encabezado exacto, claves de los
   catálogos de entidad, conducta y estatus, solo meses anteriores al mes en curso (cerrados y
   congelados en el nodo), conteos múltiplos de 5 y de al menos 5, sin celdas repetidas, fila final
   `suprimidas` y a lo más 4 MiB. El motivo queda en `rejection`.
2. **Suma** por entidad, conducta, mes y estatus y **vuelve a aplicar la celda mínima**: una celda
   nacional menor que el mínimo pasa a suprimidas.
3. **Marca** cada nodo como `included`, `unreachable` (no respondió: «sin datos de ese nodo en
   este corte») o `rejected`. Un nodo caído no detiene el corte.
4. **Cita** la cabeza firmada de la bitácora de cada nodo vigente en la bitácora nacional al hacer
   el corte, y la entrada nacional que la contiene.

Qué se verifica y qué no, con honestidad:

| Se verifica                                                          | No se verifica                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Que cada CSV cumple las reglas de publicación del Estándar           | Que los conteos correspondan a las denuncias reales del nodo          |
| Que la suma se puede rehacer con los CSV públicos de los nodos       | Nada criptográfico de los conteos: el CSV del nodo no está firmado    |
| Qué cabeza de bitácora tenía cada nodo en el momento del corte       | La cabeza no contiene conteos: es referencia de integridad, no prueba |
| Que ningún nodo baja las reglas (mes abierto o celda pequeña: fuera) | El corte no lo firma la operación; se guarda solo en memoria          |

El corte se guarda en memoria y se rehace en cada vuelta (el primero, al arrancar). El nodo lo
pasa a su web en el mismo origen (`GET /api/v1/red/national/open-data`, validado con el esquema)
para el observatorio. En la demostración, `SIGILO_ROUTER_CLOCK_FILE` usa el reloj simulado de los
nodos solo para decidir qué meses están cerrados; la bitácora nacional y el directorio siguen con el
reloj real.

## Qué metadatos ve el enrutador y cuáles no

El diseño sigue la idea de Oblivious HTTP (RFC 9458): el enrutador conoce quién se conecta pero no
qué pide; el nodo conoce qué se pide pero no quién se conecta.

| Ve (en memoria, mientras atiende la petición)                                          | ¿Se guarda o registra?                                                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| El nodo destino (`node`): a lo más, el estado; nunca la autoridad ni el OIC            | No                                                                                      |
| El tramo de tamaño del sobre: 4 KiB, 64 KiB, 1 MiB o 16 MiB                            | No                                                                                      |
| Si la persona pidió la cola (`deferral`) cuando el nodo no respondió                   | Solo si el nodo no responde: el sobre cerrado, su nodo, el día y el siguiente intento   |
| El `keyId` del sobre (es la llave pública del nodo, que ya es pública)                 | No                                                                                      |
| La hora de llegada y cuánto tarda el nodo en responder                                 | No                                                                                      |
| La dirección IP y las cabeceras HTTP de la conexión (el sistema operativo las entrega) | No: el código no las lee y no las reenvía                                               |
| Si la entrega funcionó                                                                 | Solo contadores agregados por vuelta: entregados, no registrados, fallidos, sin destino |

| No ve                                                                                      |
| ------------------------------------------------------------------------------------------ |
| La autoridad destino (OIC, contraloría o buzón): va cifrada en `RoutedRequest.to` (v2)     |
| Hechos, narración, pruebas, identidad sellada, folio, recibo ni mensajes del buzón         |
| Qué operación se pide (denuncia, prueba, seguimiento, mensaje o reto): va dentro del sobre |
| La prueba de trabajo y la llave efímera de respuesta                                       |
| El tamaño real dentro del tramo ni el contenido de la respuesta                            |

Garantías comprobadas en `src/relay.test.ts`:

- El sobre que recibe y reenvía es `{ v: 2, node, sealed }`: ningún campo dice la autoridad. Un
  sobre v1 (con `to`) se rechaza con `400` y `RELAY_V1_REJECTION_MESSAGE` («actualiza la
  ventanilla»); el paso del mismo origen del nodo hace lo mismo antes de reenviar.
- El sobre queda ligado al nodo por su AAD: cambiar `node` en el encabezado hace que no abra.
  El nodo comprueba además que la autoridad interna esté alojada en él y vigente
  (`hostsAuthority` de `createNodeInboxHandler`); si no, responde como a un sobre que no abre y el
  enrutador devuelve relleno.
- El nodo recibe una petición armada desde cero con **solo** `Content-Type`; `User-Agent`,
  `X-Forwarded-For`, `Accept-Language` y `Cookie` de quien envía no pasan.
- La respuesta tiene el mismo estatus, las mismas cabeceras y el mismo tamaño para cualquier
  destino. Si no pudo entregar (nodo no registrado o caído), responde relleno aleatorio con la misma
  forma; el navegador lo detecta porque no abre.
- Después de reenviar, ninguna tabla cambia y ni el archivo de la base, ni su WAL ni su memoria
  compartida contienen fragmentos del sobre ni la IP enviada en `X-Forwarded-For`. La base no tiene
  ninguna tabla para IP ni cabeceras; la única con sobres es `relay_queue`, y queda vacía en un
  reenvío normal. En `src/queue.test.ts`: con el nodo caído el sobre queda cerrado (sin el
  contenido en claro ni la autoridad), se entrega al volver y después ni la tabla, ni el archivo
  ni el WAL contienen fragmentos suyos.

Riesgos que quedan (ADR 0005, «Riesgos»): con colusión entre enrutador y nodo se pueden
correlacionar hora, tramo e IP con una denuncia (no su contenido). Mitigaciones de nivel C: operar
el enrutador por una institución distinta a los nodos, ponerlo detrás de un relevo independiente o
de Tor, y agrupar envíos con retraso aleatorio. Un proxy inverso delante del enrutador no debe
registrar IP ni cabeceras.

## Testigos

`npm run witness -w @sigilo/enrutador` corre un testigo con `SIGILO_WITNESS_DATA_DIR` (contiene
`witness-key.json` y `trust.json`), `SIGILO_WITNESS_ROUTER_URL` y
`SIGILO_WITNESS_INTERVAL_SECONDS`. En cada vuelta verifica el directorio con la raíz fijada,
descarga la cabeza pendiente y el tramo nuevo desde su última cofirma y comprueba con
`verifyNationalExtension` que la bitácora solo creció, que cada cabeza de nodo está firmada por su
nodo del directorio y que ninguna retrocede ni se bifurca. Solo entonces cofirma. Si la historia
cambió, responde `refused:regression` y no avanza.

## Integración con el nodo

El servidor de referencia (`apps/server`) ya cumple este contrato (`src/routes/network.ts` y
`src/network/`); se conserva como guía para otras implementaciones del nodo:

1. **Llaves.** `npm run red:demo` deja en `.red-demo/nodos/<nodo>/data/`: `keys.json` (la llave
   de firma del servidor es la del nodo en el directorio, así su cabeza ya verifica),
   `red-node-key.json` con la llave X25519 del nodo (`boxPrivateKey`) para abrir sobres de red, y
   el directorio firmado con su raíz (`directory.json`, `network-trust.json`).
2. **Buzón de red.** Montar `POST NETWORK_ROUTES.nodeInbox` (`/api/v1/red/inbox`) con
   `createNodeInboxHandler` de `@sigilo/red`:

   ```ts
   const inbox = createNodeInboxHandler({
     nodeBoxPrivateKey,
     nodeId, // sobres dirigidos a otro nodo no abren
     relaySecret, // etiqueta HMAC del enrutador (H11)
     // La autoridad viaja cifrada (sobre v2): el nodo solo entrega a las que aloja y están vigentes.
     hostsAuthority: (authorityId) => isHostedAndValidToday(authorityId),
     handle: async (routed) =>
       responseToRoutedReply(await app.request(routedRequestToFetch(routed))),
   });
   app.post(NETWORK_ROUTES.nodeInbox, (c) => inbox(c.req.raw));
   ```

   `routedRequestToFetch` traduce las operaciones `getPowChallenge`, `uploadEvidence`,
   `submitComplaint`, `getTracking` y `sendReporterMessage` a sus rutas v1, con solo el tipo de
   contenido y la prueba de trabajo. El límite de cuerpo de esa ruta debe admitir el tramo mayor
   (unos 22.4 MB, `MAX_RELAY_BODY_BYTES` en `apps/enrutador/src/app.ts`). La prueba de conformidad del servidor deberá sumar
   `NETWORK_OPERATIONS` con `servedBy: 'node'`.

3. **Registro.** Al arrancar, y cuando el buzón esté listo, `createNodeNetworkClient({ routerUrl,
nodeId, signingPrivateKey }).register({ sequence, standardVersion, acceptsRelay: true })`, con
   una secuencia creciente (por ejemplo, segundos Unix). Hasta registrarse, el enrutador responde
   relleno a los sobres para ese nodo.
4. **Cabeza.** Después de cada cierre diario, `publishHead(ledger.head())`. Es opcional: el
   enrutador también la recoge.
5. **Varias autoridades por nodo.** `keys.json` lleva el buzón general del nodo; las demás
   autoridades usan sus llaves del directorio verificado. Las privadas, para su panel, están en
   `.red-demo/autoridades/`.
6. **Testigo propio.** El nodo Querétaro es testigo y cofirma desde su tarea periódica con
   `runWitnessOnce` de `@sigilo/red/witness`, el mismo código del proceso testigo.
7. **Web.** Para la ventanilla única, la web fijará `network-trust.json` (se genera junto a
   `pinned-keys.json`), verificará el directorio con `verifySignedDirectory`, propondrá la
   autoridad con `proposeCompetentAuthority` y cifrará con `sealRoutedRequest`. Como la web no
   hace peticiones a otros orígenes, el directorio firmado debe servirse en el mismo origen (un
   nodo puede servir una copia: está firmado).
