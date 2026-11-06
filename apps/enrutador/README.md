# Enrutador ciego de SIGILO (`@sigilo/enrutador`)

Pieza central de la red federada «un S5, muchas llaves» ([ADR 0005](../../docs/adr/0005-estandar-s5-federado.md)
y [ADR 0007](../../docs/adr/0007-rendicion-de-cuentas-de-la-autoridad.md)). Hace tres cosas y nada más:

1. **Publica el directorio de autoridades** firmado por la operación y cofirmado por m de n testigos.
2. **Reenvía sobres opacos** al nodo de la autoridad destino, sin poder leerlos ni guardarlos.
3. **Lleva la bitácora nacional**: encadena las cabezas firmadas de cada nodo y las versiones del
   directorio, y publica una cabeza nacional que solo vale con m cofirmas de testigos.

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
| `SIGILO_ROUTER_COLLECT_INTERVAL_SECONDS` | `600`                 | Cada cuánto recoge cabezas y emite la cabeza nacional                |
| `SIGILO_ROUTER_HSTS_MAX_AGE`             | sin HSTS              | `max-age` cuando se publica detrás de HTTPS                          |

Al arrancar verifica `directory.json`: la primera vez contra la raíz fijada `trust.json`; después
exige la misma versión o exactamente la siguiente, cofirmada por los testigos de la anterior. Si no
verifica, no arranca.

## Rutas

Todas bajo `/api/v1/red`; el detalle está en `estandar/openapi.yaml`.

| Método y ruta                                | Qué hace                                                     |
| -------------------------------------------- | ------------------------------------------------------------ |
| `GET /directory`                             | Directorio firmado y cofirmado                               |
| `POST /relay`                                | Sobre opaco hacia una autoridad; responde el sobre de vuelta |
| `POST /nodes/{nodeId}/registration`          | Registro firmado del nodo (secuencia creciente)              |
| `POST /nodes/{nodeId}/heads`                 | El nodo publica su cabeza firmada                            |
| `GET /national/head`                         | Última cabeza nacional con m cofirmas (`404` si aún no hay)  |
| `GET /national/pending`                      | Última cabeza emitida, para los testigos                     |
| `POST /national/cosignatures`                | Cofirma de un testigo                                        |
| `GET /national/entries?from=&limit=`         | Entradas de la bitácora nacional                             |
| `GET /national/inclusion?nodeId=&seq=&hash=` | Prueba de que esa cabeza de nodo está incluida               |
| `POST /inbox` (en cada **nodo**)             | Buzón de red: lo implementa el nodo, no el enrutador         |

Además, el enrutador **recoge** periódicamente la cabeza de cada nodo en `GET /api/v1/ledger/head`,
la ruta pública que el servidor de referencia ya sirve. Por eso la bitácora nacional funciona hoy
sin cambiar `apps/server`.

## Qué metadatos ve el enrutador y cuáles no

El diseño sigue la idea de Oblivious HTTP (RFC 9458): el enrutador conoce quién se conecta pero no
qué pide; el nodo conoce qué se pide pero no quién se conecta.

| Ve (en memoria, mientras atiende la petición)                                          | ¿Se guarda o registra?                                                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| La autoridad destino (`to`) y, por el directorio, su nodo                              | No                                                                                      |
| El tramo de tamaño del sobre: 4 KiB, 64 KiB, 1 MiB o 16 MiB                            | No                                                                                      |
| El `keyId` del sobre (es la llave pública del nodo, que ya es pública)                 | No                                                                                      |
| La hora de llegada y cuánto tarda el nodo en responder                                 | No                                                                                      |
| La dirección IP y las cabeceras HTTP de la conexión (el sistema operativo las entrega) | No: el código no las lee y no las reenvía                                               |
| Si la entrega funcionó                                                                 | Solo contadores agregados por vuelta: entregados, no registrados, fallidos, sin destino |

| No ve                                                                                      |
| ------------------------------------------------------------------------------------------ |
| Hechos, narración, pruebas, identidad sellada, folio, recibo ni mensajes del buzón         |
| Qué operación se pide (denuncia, prueba, seguimiento, mensaje o reto): va dentro del sobre |
| La prueba de trabajo y la llave efímera de respuesta                                       |
| El tamaño real dentro del tramo ni el contenido de la respuesta                            |

Garantías comprobadas en `src/relay.test.ts`:

- El nodo recibe una petición armada desde cero con **solo** `Content-Type`; `User-Agent`,
  `X-Forwarded-For`, `Accept-Language` y `Cookie` de quien envía no pasan.
- La respuesta tiene el mismo estatus, las mismas cabeceras y el mismo tamaño para cualquier
  destino. Si no pudo entregar (nodo no registrado o caído), responde relleno aleatorio con la misma
  forma; el navegador lo detecta porque no abre.
- Después de reenviar, ninguna tabla cambia y ni el archivo de la base, ni su WAL ni su memoria
  compartida contienen fragmentos del sobre ni la IP enviada en `X-Forwarded-For`. La base no tiene
  ninguna tabla para sobres, IP ni cabeceras.

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
