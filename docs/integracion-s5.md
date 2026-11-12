# Integración con el S5

Guía para adoptar SIGILO en un sistema de denuncias con frontend moderno (por ejemplo Next.js) y
backend headless. La aplicación de referencia (`apps/web` y `apps/server`) muestra el flujo completo;
la integración reutiliza los paquetes, no las aplicaciones.

## Qué se reutiliza

| Paquete             | Dónde corre        | Dependencias de framework                        |
| ------------------- | ------------------ | ------------------------------------------------ |
| `@sigilo/contracts` | Cliente y servidor | Ninguna (zod). Incluye los catálogos validados   |
| `@sigilo/core`      | Cliente y servidor | Ninguna                                          |
| `@sigilo/huella`    | Cliente            | Ninguna; usa APIs del navegador (canvas, pdf.js) |

Los paquetes son ESM y TypeScript sin paso de build: el bundler del frontend los compila y Node
22.18 o superior los ejecuta directamente. La lista de exportaciones está en
[interfaces.md](interfaces.md).

## Mapeo de campos

| Segmento del formulario | SIGILO                          | Tratamiento                                                               |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Persona denunciante     | `IdentityBlock`                 | Se cifra en el navegador con `sealIdentity`; el backend guarda el sobre   |
| Datos de contacto       | Buzón                           | Se sustituyen por el buzón; no se piden                                   |
| Hechos                  | `ComplaintFacts`                | En claro para el trámite, siempre tras `stripInvisibleCharacters`         |
| Ente y conducta         | `entityId`, `offenseCode`       | Claves de los catálogos de `@sigilo/contracts`; el servidor las valida    |
| Persona denunciada      | `ComplaintFacts.accused`        | En claro                                                                  |
| Ubicación               | `stateCode`, `municipalityCode` | Claves INEGI; el municipio debe pertenecer a la entidad; sin coordenadas  |
| Testigos                | `IdentityBlock.witnesses`       | Dentro del sobre                                                          |
| Pruebas                 | `EvidenceDescriptor`            | Limpias y verificadas en el navegador; el digesto original va en el sobre |
| Folio de seguimiento    | `Folio` + recibo                | El backend genera el folio; el navegador genera el recibo                 |

## Vocabulario de la bandeja del S5

Revisado el 2026-11-07 con la cuenta compartida del buzón general de la versión de pruebas. SIGILO
usa los mismos nombres para que quien ya opera la bandeja de la SESNA reconozca el flujo; el
catálogo los publica en `s5Code` (`packages/contracts/src/catalogs/procedure.ts`).

| SIGILO (`managementState`) | Código en la bandeja del S5      | Lo que ve quien opera                                                            |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `received_in_inbox`        | `SIN_TURNAR`                     | «Bandeja general de turnado» (buzón general)                                     |
| `routed`                   | `TURNADA`                        | «Asignadas», en espera de que la institución acepte                              |
| `accepted`                 | `ACEPTADA` (evento «Aceptación») | La institución la atiende                                                        |
| `reassigned`               | `REASIGNADA`                     | «Reasignadas» (máximo 3, como en el S5; la cuarta responde `reassignment_limit`) |
| `returned_to_inbox`        | `DEVUELTA`                       | Vuelve a la bandeja general                                                      |
| `closed`                   | `CERRADA`, con su motivo         | Atendida, canalizada, improcedente, información insuficiente, acumulada u otro   |

`SIN_TURNAR` y `TURNADA` se observaron en la API de la bandeja; los demás códigos siguen el mismo
patrón y los nombres que la SESNA usó en el taller del 27 de octubre, y conviene confirmarlos con la
especificación cuando se publique. El panel de SIGILO muestra el código en la columna «Turnado» y
titula la lista según la función de la cuenta: «Bandeja general de turnado» (recepción),
«Denuncias asignadas» (investigación) o «Denuncias de tu institución» (supervisión).

En la red, la ventanilla única propone la autoridad competente con el directorio. Si no encuentra
ninguna, no rechaza la denuncia: la envía al buzón general del nodo de la entidad (o del nodo común),
donde queda como `received_in_inbox` (`SIN_TURNAR`) y la recepción la turna, igual que la bandeja
general del S5. Es el canal único con protocolos de recepción y turno de las Bases de la PDN
(arts. 56 y 58). Al integrar, el buzón general del S5 se publica en el directorio con el papel
`inbox` y la misma llave que su nodo usa como autoridad en `keys.json`.

### Motivo del turno

Como en la bandeja del S5, turnar exige el motivo: `route` lleva `note` obligatoria de al menos 10
caracteres (sin contar espacios al inicio ni al final; `RoutingNoteSchema`). Sin él, el nodo
responde `bad_request` (400). El panel lo pide con «Por qué la envías a esta autoridad; la persona
lo leerá», y la persona lo lee tal cual en su seguimiento.

### Tope de reasignaciones

Como en el S5, una denuncia admite como máximo 3 reasignaciones (`MAX_REASSIGNMENTS`), contadas en
su línea de tiempo. La cuarta responde `409` con el código `reassignment_limit` y un mensaje fijo
(«La denuncia ya se reasignó 3 veces, el máximo…»), distinto de `conflict` para que el cliente lo
explique. El panel deja de ofrecer «Reasignar», dice por qué y ofrece «Devolver al buzón general»;
el buzón puede turnarla de nuevo (turnar no cuenta como reasignar). Si nadie la acepta, el semáforo
de turnado la marca vencida y la supervisión recibe el aviso.

### Semáforo de turnado

La bandeja del S5 marca en amarillo una denuncia sin turnar a 1 día y vencida a 2 días. SIGILO
tiene el mismo semáforo, además de los plazos legales de cada etapa (LGRA) y de las reglas públicas
de escalamiento:

- Aplica a las denuncias que esperan turno (`received_in_inbox` y `returned_to_inbox`, en el buzón
  general) y a las que esperan aceptación (`routed` y `reassigned`). Cuenta desde el día en que
  entraron a ese estado (recepción, turno, reasignación o devolución); al aceptarse o cerrarse
  desaparece.
- `a_tiempo` el mismo día, `por_vencer` al cumplir 1 día y `vencida` al cumplir 2. Los umbrales
  están en `TURN_SEMAPHORE` (`packages/contracts/src/catalogs/procedure.ts`) y se publican en
  `catalogo-del-tramite.json`.
- **Días hábiles**, no naturales: es la unidad de los demás plazos cortos del trámite (aviso del
  archivo, solicitud de información, inconformidad), con el mismo calendario oficial de días
  inhábiles. Una denuncia que llega el viernes no aparece vencida el lunes; el S5 de pruebas cuenta
  días naturales, así que solo difieren en fines de semana y días inhábiles.
- Los días los cuenta el reloj del nodo (el simulado en la demo), en la hora del centro de México.
- La API lo entrega en `ComplaintSummary.turnSemaphore` (listado y detalle), un campo opcional: un
  nodo anterior que no lo envía sigue cumpliendo el esquema. El panel lo muestra en la columna
  «Plazo de turnado» y en el detalle como insignia con ícono y texto («A tiempo», «Por vencer»,
  «Vencida»), nunca solo con color.
- Al vencer, el motor de reglas registra la alerta pública `alert.turn-overdue` («Turnado
  vencido», reglas 1.3.0) con la supervisora de la autoridad que la tiene. Es un aviso, no un
  escalamiento: la supervisión la ve en «Escalamientos que recibiste» sin el sobre de la segunda
  llave (`authorityEscalationEnvelope` sigue exigiendo una regla `escalate`), y la denuncia sigue
  con quien la tiene. Una nueva espera (devolución o reasignación) puede generar un aviso nuevo.

## Catálogo de conductas y leyes locales

El S5 publica su catálogo de faltas en `GET /next-api/public/catalogos?catalog=faltas`: 3,559
entradas con la ley de responsabilidades y el código penal de cada una de las 32 entidades, más la
LGRA y el CPF como entidad federal (`entidad` 33), con su clasificación (falta grave, no grave o
hecho de corrupción) y si la comete una persona servidora pública o un particular.

SIGILO conserva su catálogo corto en lenguaje llano (38 conductas en 5 situaciones, cotejadas con la LGRA y el CPF vigentes, con la clave
de la LGRA o del CPF) y lo enlaza con el del S5:

- `scripts/s5-equivalencias.ts` empareja cada entrada del S5 con una clave de SIGILO por su
  clasificación, su nombre y quién la comete, y genera `packages/contracts/src/s5/equivalencias-faltas.json` (publicado en la web como `/datos/s5/equivalencias-faltas.json`):
  3,388 entradas con equivalente (95 %). Las 171 restantes quedan listadas en `sinEquivalente`
  y se dejan fuera a propósito: tortura y desaparición forzada (tienen leyes y fiscalías propias),
  desobediencia o resistencia de particulares, falsedad, quebrantamiento de sellos, lavado de
  dinero, acoso sexual y rubros genéricos como «faltas administrativas graves» que no nombran una
  conducta.
- El S5 incluye en el cohecho el art. 80 Bis de la LGRA: no es otra falta, sino la regla que
  convierte en no grave un cohecho o desvío de monto menor ya devuelto.
- El panel muestra, bajo la conducta, «En la ley que aplica»: los artículos de la ley de la entidad
  de los hechos, o de la LGRA y el CPF si la oficina es federal. El `id` del S5 de cada artículo
  queda en el archivo para enviarlo a la bandeja del S5.
- Quien denuncia puede decir si lo hizo una persona servidora pública o un particular; la lista se
  acorta con eso y el dato no sale del navegador.

Las equivalencias son automáticas: revísalas antes de usarlas como fundamento.

## Pasos

1. **Llaves.** Generar el par X25519 y Ed25519 de la autoridad competente fuera del servidor y fijar
   las llaves públicas en la configuración del frontend (`buildPublicKeySet`). Antes de enviar,
   compararlas con las que publica el backend.
2. **Formulario.** Antes de enviar:
   - pasar cada archivo por `classifyFile`, `sanitizeImage` o `rasterizePdf`, y volver a inspeccionar
     la copia con `inspectImageMetadata` (`includeColorProfile: false`); si conserva metadatos, no se
     sube;
   - aplicar `stripInvisibleCharacters` y `reviewText` a los textos;
   - mostrar `assessRisk` y una vista previa de lo que verá la autoridad;
   - desactivar `spellcheck`, `translate` y `autocomplete` en los campos.
3. **Envío.** Generar el recibo con `generateReceiptPhrase` y derivar llaves con
   `deriveReceiptKeys`. Para el modo sellado, construir el contexto con `identityContextFor` (vincula
   `authVerifier`, las llaves del denunciante y `contentDigest` de los hechos y las pruebas) y cifrar
   con `sealIdentity`. Enviar `SubmitComplaintRequest` sin campos extra.
4. **Backend.** Implementar las rutas de `ROUTES` o adaptarlas:
   - validar con los esquemas de contracts, incluidos los catálogos;
   - guardar `authVerifier` con índice único, nunca el recibo;
   - excluir el sobre de identidad de listados y detalle;
   - entregar el sobre solo por la ruta de apertura, que registra el fundamento en la bitácora;
   - exigir la siguiente `sequence` por remitente en el buzón y verificar las firmas con
     `verifyMailboxSignature`;
   - firmar el comprobante y los eventos con `signReceipt`, `buildEvent` y `signLedgerHead`;
   - dejar cada evento pendiente y, al cerrar el día, encadenar los pendientes en orden barajado
     (`pendingEventFor`, `shuffle`, `chainEvent`); publicar solo días cerrados;
   - firmar en el comprobante el `payloadDigest` de `complaint.received` (no su `seq`) y calcular
     `submissionDigest` con el sobre resumido (`computeSubmissionDigest`);
   - en `identity.opened`, incluir `receiptTag` (`identityOpenedPayload`);
   - exigir la prueba de trabajo (`POW_HEADER`) en los envíos de denuncias (con sus pruebas) y de
     mensajes; ver «Despliegue: calibración de la prueba de trabajo».
5. **Seguimiento.** Autenticar comparando `computeAuthVerifier(authKey)` en tiempo constante,
   responder igual ante folio o llave inválidos y contar solo los fallos. Entregar el evento de
   recepción para que el navegador lo verifique con `verifyReceiptEvent`, y concilie sus aperturas
   con `reconcileIdentityOpenings`.
6. **Panel de autoridad.** Verificar las llaves del denunciante con `submissionDigestFromDetail`
   contra el evento `complaint.received` publicado, recalcular el contexto con
   `identityContextFromDetail` y descifrar en el navegador con la llave privada de la autoridad;
   nunca en el servidor.
7. **Despliegue.** CSP estricta como cabecera, `frame-ancestors 'none'`, sin peticiones a terceros,
   sin IP en registros, y anclaje periódico de la cabeza de la bitácora (`npm run ledger:anchor`) en
   un repositorio público.

## Backend headless

Con un CMS headless, la lógica de las rutas se implementa como extensiones de endpoints y ganchos:

- colección de denuncias con hechos, sobre de identidad, llaves del denunciante y `authVerifier`;
- permisos que nunca exponen el sobre en lectura y que solo muestran `authVerifier` y las llaves del
  denunciante a la autoridad, que los necesita para recalcular el contexto;
- gancho que agrega un evento a la bitácora en cada cambio de estatus, mensaje o apertura.

## Despliegue: calibración de la prueba de trabajo

La dificultad y la vigencia de los retos se calibran para un celular básico que resuelve SHA-256 en
JavaScript, en un solo núcleo, a **50 mil hashes por segundo** (`SLOW_DEVICE_HASHES_PER_SECOND` en
`@sigilo/core`). De esa suposición salen:

- la vigencia de cada reto: `margen + 4 · p95`, con `p95 = ln(20) · 2^bits / 50 000` segundos
  (`powSolveSeconds`);
- el estimado de espera que la web muestra a la persona (`describePowWait`).

| Bits | Intentos promedio | p95 en el celular supuesto | Vigencia (margen de 5 min) |
| ---- | ----------------- | -------------------------- | -------------------------- |
| 18   | 262 144           | unos 16 s                  | unos 6 min                 |
| 20   | 1 048 576         | unos 63 s                  | unos 9 min                 |

Antes de un despliegue real:

1. **Medir.** Ejecutar `solvePow` en los dispositivos más lentos que se quieran atender (por ejemplo,
   el celular de gama baja más común en la región) y anotar los hashes por segundo.
2. **Ajustar la dificultad.** Con `SIGILO_POW_BITS` (base, 18) y `SIGILO_POW_MAX_BITS` (máximo
   adaptativo, 20). Cada bit duplica el tiempo esperado. El máximo no puede superar la base más 2
   bits: el servidor no arranca si se configura más (ver `docs/interfaces.md`). Si los dispositivos medidos son más lentos
   que 50 mil hashes por segundo, bajar los bits; `SIGILO_POW_BITS=0` desactiva la exigencia.
3. **Ajustar la suposición.** Si la medición difiere mucho, cambiar `SLOW_DEVICE_HASHES_PER_SECOND`
   en `packages/core/src/pow.ts` y volver a construir la web y el servidor: la constante alimenta
   tanto la vigencia como el estimado que ve la persona. Hoy no es una variable de entorno.
4. **Considerar la asimetría.** Una GPU resuelve miles de veces más rápido que un celular; la prueba
   de trabajo encarece el abuso, pero no lo iguala. Conviene combinarla con límites en el proxy de
   entrada del despliegue.

## APIs entre la SESNA y los nodos

Siguen la metodología de las APIs actuales de la PDN: **cada nodo estatal es el proveedor** que
expone su servidor de autorización OAuth 2.0 y su recurso, y **la SESNA es el cliente** que consulta
con las credenciales que le entrega cada nodo (modelo _pull_). Nunca viaja contenido de denuncias.

| Llamada                                      | Quién sirve | Permiso              | Qué viaja                                               |
| -------------------------------------------- | ----------- | -------------------- | ------------------------------------------------------- |
| `POST /oauth/token`                          | Nodo        | (credenciales)       | Token de acceso de 5 minutos                            |
| `POST /api/v1/red/inbox` (entrega de sobres) | Nodo        | `sesna:entregas`     | Sobre HPKE opaco; además la etiqueta HMAC del enrutador |
| `POST /v1/denuncias/estadisticas`            | Nodo        | `sesna:estadisticas` | Estadística agregada de meses cerrados                  |
| `GET /v1/denuncias/estadisticas/autoridades` | Nodo        | `sesna:estadisticas` | Clave y nombre de las autoridades del nodo              |
| `GET /api/v1/red/national/statistics`        | Enrutador   | público              | Corte nacional para el portal (Bases, art. 61)          |
| (reservado: salud del nodo)                  | Nodo        | `sesna:salud`        | Todavía sin ruta                                        |

**Token.** `POST /oauth/token` en el origen del nodo, en formulario o JSON. Flujos: `password`
(`grant_type=password` con `username`, `password`, `client_id`/`client_secret` y `scope`, el de la
PDN; OAuth 2.1 lo desaconseja), `client_credentials` (recomendado; el que usa el enrutador) y
`refresh_token` (de un solo uso, solo tras `password`). El cliente se autentica con
`Authorization: Basic` o con `client_id` y `client_secret` en el cuerpo. La respuesta trae
`access_token`, `token_type: "Bearer"`, `expires_in`, `scope` y, con `password`,
`refresh_token` y `refresh_token_expires_in`. Errores de RFC 6749 (`invalid_client`,
`invalid_grant`, `invalid_scope`, `unsupported_grant_type`...). El token es un JWT HS256 que solo
verifica el nodo que lo emitió: `iss` = `aud` = id del nodo, `sub` = cliente, `scope`, `iat`,
`exp`, `jti`.

**Estadística.** `POST /v1/denuncias/estadisticas` con
`{ "sort": { "mes": "desc" }, "page": 1, "pageSize": 10, "query": { "mesDesde": "2026-09", "entidad": "22" } }`
y respuesta `{ "pagination": { "pageSize", "page", "totalRows", "hasNextPage" }, "results": [...] }`.
`pageSize` es 10 por omisión y 200 como máximo; una página fuera de rango o un campo desconocido
responden `400` con `{ "code", "message" }`. Filtros: `mes`, `mesDesde`, `mesHasta`, `entidad`,
`autoridad`, `conducta` y `estatus`. Cada fila (mes cerrado, autoridad, entidad, conducta) trae
`recibidas`, `turnadas` y `aceptadas` (`aTiempo` y `vencidas` según el semáforo de turnado),
`archivadas` por motivo, `calificadas` (`graves`, `noGraves`), `escalamientos`,
`estatusAlCierre` y `tiemposMedianosDiasHabiles` (turno, aceptación, archivo). Reglas de
protección, las mismas del CSV de datos abiertos: solo meses cerrados, cada mes congelado una sola
vez, conteos redondeados al azar a múltiplos de 5 y suprimidos (`null`) bajo 5, medianas solo con
10 observaciones o más, y filtros que solo eligen filas ya publicadas (ninguna consulta vuelve a
sumar, así que filtrar no reconstruye una celda suprimida).

**Qué se tomó de la PDN y de dónde** (consultado el 11 de noviembre de 2026):

| Elemento                                                                                                           | Fuente                                                                                                | Estado                 |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| `POST /v1/<recurso>` con `sort`, `page` (1), `pageSize` (10, máx. 200) y `query`                                   | `PDNMX/api_docs`: `S2/oas/OAS_API_servidores_intervienen_contrataciones.json` (v1.1, `POST /v1/spic`) | Verificado             |
| Respuesta `{ pagination: { pageSize, page, totalRows, hasNextPage }, results }`; `400` «Página inválida»           | El mismo archivo y `S3/oas/OAS_API_Servidores_Sancionados.json` (v1.1.0, `POST /v1/ssancionados`)     | Verificado             |
| Catálogo `GET /v1/<recurso>/dependencias` (nombre, siglas, clave)                                                  | Mismos archivos (`/v1/spic/dependencias`, `/v1/ssancionados/dependencias`); aquí solo clave y nombre  | Verificado             |
| Error `resError` `{ code, message }`                                                                               | Mismos archivos                                                                                       | Verificado             |
| `securitySchemes` OAuth 2.0 con flujo `password`                                                                   | Mismos archivos (`tokenUrl: /oauth`, sin scopes); aquí `/oauth/token` y con permisos                  | Verificado             |
| `POST /oauth/token` con `grant_type=password` o `refresh_token`, cliente por Basic o en el cuerpo                  | `PDNMX/piloto_oauth2.0`, `AuthorizationServer.js` (versión del 2 de mayo de 2022)                     | Verificado             |
| Respuesta `access_token`, `token_type: Bearer`, `expires_in`, `refresh_token`, `refresh_token_expires_in`, `scope` | El mismo archivo                                                                                      | Verificado             |
| Errores del token de la PDN `{ code: "401", message }` y `422` por scope                                           | El mismo archivo; aquí se usan los de RFC 6749 (`error`, `error_description`)                         | Verificado, difiere    |
| Que la PDN en producción use exactamente este servidor OAuth y estos tiempos de vida                               | Documentación en Google Docs enlazada desde el README de `piloto_oauth2.0`                            | No verificado          |
| `client_credentials`                                                                                               | No aparece en las especificaciones de la PDN; se agrega por RFC 6749 §4.4 y OAuth 2.1                 | Propio                 |
| La versión 2 del S3 (`S3/s3-v2.json`) usa `GET /items/...` con `apiKey` en `Authorization`                         | `PDNMX/api_docs`                                                                                      | Verificado, no seguido |

**Configuración.** El nodo lee `oauth-clients.json` (`SIGILO_OAUTH_CLIENTS_FILE`): por cliente,
el digesto SHA-256 del secreto, permisos, flujos y, para `password`, el usuario con su digesto
scrypt. El enrutador lee `node-credentials.json` en su directorio de datos (0600). `npm run
red:demo` genera ambos con secretos sintéticos. Ver la [guía para conectar un
estado](guia-conecta-tu-estado.md#credenciales-oauth-20-para-la-sesna).

## Pruebas

`SIGILO_TEST_CLOCK_FILE` desplaza el reloj del servidor de referencia para probar el cierre diario
de la bitácora y los meses congelados de los datos abiertos. Solo se acepta con `SIGILO_E2E=1` o
`NODE_ENV=test`, con un archivo del usuario del servidor que no puedan escribir otros y un desfase de
0 a 400 días. Una integración propia debe ofrecer un reloj inyectable equivalente.

## Compatibilidad

- Navegadores con WebCrypto, `createImageBitmap` y canvas: versiones actuales de Chrome, Edge,
  Firefox y Safari. Las pruebas automáticas solo cubren Chromium.
- Node.js 22.18 o superior en el servidor.
