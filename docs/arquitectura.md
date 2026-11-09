# Arquitectura

SIGILO es una capa de anonimato para un sistema de denuncias. Todo lo que puede identificar a la
persona denunciante se procesa en su navegador; el servidor almacena hechos, sobres cifrados y una
bitácora, y no puede leer identidades.

El estándar S5 y la red federada se deciden en los [ADR 0005 a 0010](adr/).

## Componentes

| Componente                | Ubicación                | Responsabilidad                                                                               |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Contratos                 | `packages/contracts`     | Esquemas zod, catálogos y rutas de la API v1. Fuente única de verdad.                         |
| Núcleo criptográfico      | `packages/core`          | HPKE, Ed25519, recibo, derivación de llaves, comprobante, buzón, bitácora.                    |
| Huella Cero               | `packages/huella`        | Limpieza de pruebas, marcas invisibles, revisión de texto, semáforo de riesgo.                |
| Red federada              | `packages/red`           | Directorio firmado, autoridad competente, sobres del enrutador, bitácora nacional.            |
| Grupo de anonimato        | `packages/anonimato`     | Tamaño del grupo de trabajo en el navegador, con los fragmentos de S1 y S2.                   |
| Contexto de la PDN        | `packages/contexto-pdn`  | Verificaciones con tres resultados, conflicto de interés y prioridad.                         |
| Auditor                   | `packages/auditor`       | Señales deterministas sobre las actuaciones de la autoridad (AUD-01 a AUD-08).                |
| Corroboración ciega       | `packages/corroboracion` | Cliente VOPRF, resumen difuso y señales de independencia.                                     |
| Servidor de referencia    | `apps/server`            | API v1 sobre Hono y `node:sqlite`; nodo de la red. Valida, almacena, registra y sirve la web. |
| Aplicación de referencia  | `apps/web`               | Denuncia, seguimiento, panel de autoridad, datos abiertos y verificación.                     |
| Enrutador ciego           | `apps/enrutador`         | Reenvía sobres sin poder leerlos; directorio, bitácora nacional y testigos.                   |
| Servicio de corroboración | `apps/corroboracion`     | Evaluador OPRF e índice de coincidencias.                                                     |
| Validador                 | `tools/validador`        | Revisa un sitio contra el Estándar S5 (`npm run validate`).                                   |
| Scripts                   | `scripts/`               | Llaves, cuentas, red y semilla de la demostración, anclaje y reinicio.                        |

```mermaid
flowchart LR
  subgraph Navegador_denunciante[Navegador de la persona denunciante]
    W[apps/web] --> H[huella]
    W --> C[core]
  end
  subgraph Navegador_autoridad[Navegador de la autoridad]
    P[Panel de autoridad] --> C2[core]
    K[(Llave privada de la autoridad)]
  end
  W -- mismo origen: hechos, pruebas limpias, sobres --> S[apps/server]
  P -- mismo origen, sesión de una cuenta individual --> S
  S --> DB[(SQLite: hechos, sobres, bitácora)]
  DB -- npm run ledger:anchor --> A[(anchors/ en el repositorio público)]
```

## Fronteras de confianza

1. **Navegador de la persona denunciante.** Zona de confianza. Aquí se genera el recibo, se derivan
   las llaves, se limpian las pruebas, se eliminan las marcas invisibles y se cifra la identidad.
2. **Red y servidor.** Zona no confiable para la identidad. El servidor recibe solo lo necesario para
   el trámite y no registra direcciones IP. Sí entrega el código de la web: un servidor
   comprometido puede alterarlo (ver `modelo-de-amenazas.md`, C03 y D03).
3. **Navegador de la autoridad.** Zona de confianza para la llave privada de la autoridad, que se
   importa en memoria. La identidad sellada solo se descifra ahí, después de una solicitud
   registrada.
4. **Anclaje externo.** La operación ejecuta `npm run ledger:anchor`, que escribe la cabeza pública
   firmada en `anchors/AAAA-MM-DD.json`, y versiona el archivo en el repositorio público. Cualquier
   persona puede comparar la bitácora contra esas anclas en `/verificar`.

## Qué ve cada actor

| Dato                                          | Persona denunciante  | Servidor y operación         | Autoridad competente                                 | Público                                                                                           |
| --------------------------------------------- | -------------------- | ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Hechos (descripción, ente, conducta, periodo) | Sí                   | Sí                           | Sí                                                   | No                                                                                                |
| Pruebas limpias                               | Sí                   | Sí                           | Sí                                                   | No                                                                                                |
| Pruebas originales                            | Solo en su navegador | No                           | No (solo su digesto, dentro de la identidad sellada) | No                                                                                                |
| Identidad (modo `sealed`)                     | Sí                   | Solo texto cifrado           | Sí, tras solicitud con fundamento registrada         | No                                                                                                |
| Recibo de 8 palabras                          | Sí                   | No (solo `SHA-256(authKey)`) | No                                                   | No                                                                                                |
| Mensajes del buzón                            | Sí                   | Solo texto cifrado           | Sí                                                   | No                                                                                                |
| Folio                                         | Sí                   | Sí                           | Sí                                                   | No (la bitácora pública usa `folioDigest`)                                                        |
| Eventos de la bitácora                        | Los de su denuncia   | Todos                        | Todos                                                | Solo los de días cerrados, barajados, con `folioDigest`                                           |
| Estadísticas agregadas                        | Sí                   | Sí                           | Sí                                                   | Meses congelados, redondeo aleatorio a múltiplos de 5, celdas que redondean a menos de 5 omitidas |

## Flujos por etapa

### Recepción

```mermaid
sequenceDiagram
  actor D as Persona denunciante
  participant W as Navegador (web + huella + core)
  participant S as Servidor
  D->>W: Escribe hechos y adjunta pruebas
  W->>W: Limpia pruebas, elimina marcas invisibles, revisa el texto
  W->>D: Semáforo de riesgo y vista «Así te verá la autoridad»
  W->>S: GET /keys (compara con las llaves fijadas; si difieren, no envía nada)
  W->>S: GET /pow/challenge (reto de un solo uso)
  W->>W: Resuelve la prueba de trabajo en un Web Worker
  W->>S: POST /evidence con X-Sigilo-Pow (solo imágenes limpias y verificadas)
  S-->>W: evidenceId, sha256
  W->>W: Genera recibo, deriva authKey y llaves del buzón
  W->>W: (modo sealed) Cifra la identidad con HPKE hacia la autoridad
  W->>S: POST /complaints con X-Sigilo-Pow (hechos, sobre, llaves públicas, authVerifier)
  S->>S: Valida catálogos, genera folio, deja complaint.received pendiente
  S-->>W: folio y comprobante firmado
  W->>D: Muestra folio y recibo; pide confirmar dos palabras
```

El sobre de identidad se cifra con un AAD que incluye `authVerifier`, las llaves públicas de la
persona denunciante y `contentDigest` (digesto de los hechos, las pruebas, el modo y la solicitud
de protección). Así no puede moverse a otra denuncia. Ver [criptografia.md](criptografia.md).

### Trámite

El servidor es un **nodo de varias autoridades**. Cada persona de la autoridad entra con su cuenta
individual (`authority-accounts.json`, fuera del repositorio), que tiene una autoridad y una
función:

| Función                         | Puede                                                                                                         | No puede                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Recepción y turnado (`intake`)  | Turnar desde el buzón general, aceptar, reasignar, devolver, cerrar lo improcedente del buzón, descartar spam | Solicitar ni aprobar aperturas de identidad |
| Investigación (`investigation`) | Avanzar etapas legales, cerrar con fundamento, escribir por el buzón, solicitar y aprobar aperturas           | Turnar                                      |
| Supervisión (`supervision`)     | Aprobar aperturas, leer los acuerdos de cierre (auditor) y, en la supervisora, recibir escalamientos          | Acciones del trámite                        |

Cada denuncia la tiene una autoridad (el buzón general hasta que se turna). Solo las cuentas de esa
autoridad la ven: otra recibe `404`, igual que con un folio inexistente. La sesión vence a los 15
minutos sin actividad o a las 8 horas y se cierra en el servidor.

```mermaid
sequenceDiagram
  actor R as Recepción del buzón
  actor I as Investigación de la autoridad
  participant P as Panel
  participant S as Nodo
  actor D as Persona denunciante
  R->>S: POST auth/login (cuenta propia)
  R->>S: POST procedure { route, authorityId }
  S->>S: complaint.status_changed con el seudónimo de la cuenta en sus datos
  Note over S: La recepción de la autoridad turnada acepta, reasigna o devuelve
  I->>P: Inicia sesión e importa su llave
  P->>S: GET /authority/complaints/{folio}
  S-->>P: Hechos, pruebas, llaves del denunciante, digestos, trámite, mensajes
  P->>P: Recalcula el digesto del envío y verifica las llaves del denunciante
  I->>S: POST procedure { advance_stage } / mensajes cifrados en el navegador
  I->>S: POST procedure { close, reason, legalBasis, agreement }
  S->>S: Guarda el acuerdo en versión pública (para el auditor) y registra el evento
  D->>S: Seguimiento: pasos explicados, notas públicas, cierre, plazos y reglas cumplidas
```

Los plazos se cuentan con el día civil en la hora del centro de México (`legalOn`), no con el día
UTC que se publica por privacidad. Cada paso guarda ambos.

### Motor de plazos y escalamiento

Una tarea periódica (la misma que cierra los días de la bitácora) evalúa las reglas públicas de
`ESCALATION_RULES` con `evaluateEscalationRules` de `@sigilo/core`: posible falta grave sin iniciar
el procedimiento correspondiente a los 30 días naturales (LGRA, art. 64, fr. II), archivo de una
persona identificable sin aviso por el buzón en 10 días hábiles, acto resolutivo con conflicto sin
excusa (art. 58), archivo o calificación de no grave con dos o más señales del auditor, alertas de
prescripción a 12, 6 y 3 meses e inactividad a los 5 y 6 meses. Durante la investigación la
inactividad es solo una alerta; la caducidad de la instancia (art. 74) se alerta únicamente después
de admitido el informe. La calificación de no grave se notifica por el buzón y la persona puede
inconformarse desde su seguimiento (arts. 102 a 110), abriendo su identidad solo para el recurso. Cada regla
cumplida se registra una vez (`rule.triggered`, actor `system`) y aparece en el seguimiento. Las de
escalamiento dejan la denuncia disponible para la autoridad supervisora, que recibe la **segunda
llave**: el sobre de hechos y pruebas (nunca la identidad) que la web cifró al enviar hacia la
llave fijada de la supervisora. Antes de que se cumpla una regla, el nodo no lo entrega.

### Seguimiento

```mermaid
sequenceDiagram
  actor D as Persona denunciante
  participant W as Navegador
  participant S as Servidor
  D->>W: Folio y 8 palabras
  W->>W: Deriva authKey y llaves del buzón (el recibo no sale del navegador)
  W->>S: POST /tracking (folio, authKey)
  S-->>W: Estatus, línea de tiempo, aperturas, mensajes cifrados, comprobante, evento de recepción
  W->>W: Verifica el comprobante y, si su día cerró, que el evento de recepción le corresponda
  W->>S: GET /ledger/events?since=AAAA-MM-DD (tramo desde su día de recepción)
  W->>W: Verifica el tramo hasta la cabeza firmada
  W->>W: Concilia las aperturas publicadas con su receiptTag contra las del seguimiento
  W->>W: Descifra los mensajes y avisa si falta alguno en la secuencia
  D->>W: Responde
  W->>S: GET /pow/challenge?purpose=message
  W->>S: POST /tracking/messages con X-Sigilo-Pow (sobre hacia la autoridad, firmado, con secuencia)
```

- Las credenciales inválidas y los folios inexistentes producen la misma respuesta.
- El estado de publicación del evento de recepción se muestra en lenguaje claro: pendiente de
  publicar, ya publicado o, si no coincide, un aviso de que el sistema podría mostrar cosas distintas
  a cada persona.
- Si la bitácora publicada tiene una apertura con su `receiptTag` que el seguimiento no muestra, o
  el seguimiento muestra una de un día publicado que no está en la bitácora, se avisa.
- Solo los fallos de autenticación consumen el límite por folio; los mensajes tienen su propio
  límite.

### Apertura de identidad (2 de 3)

```mermaid
sequenceDiagram
  actor A as Investigación A
  actor B as Otra persona de la autoridad
  participant S as Nodo
  actor D as Persona denunciante
  A->>S: POST identity/requests { legalBasis }
  S->>S: identity.approved (A, con su fundamento)
  B->>S: POST identity/requests/{id}/approvals { legalBasis }
  S->>S: identity.approved (B) e identity.opened con openingId y receiptTag
  A->>S: POST identity/requests/{id}/envelope
  S-->>A: Sobre de identidad (solo a quien aprobó)
  A->>A: Recalcula el contexto desde el detalle y descifra en su navegador
  D->>S: Consulta su seguimiento
  S-->>D: Apertura con fecha, fundamento y número de aprobaciones
```

Una misma persona no cuenta dos veces, quien turna no participa y la solicitud vence a los 7 días.
El servidor nunca descifra: solo decide a quién y cuándo entregar el sobre, y cada entrega queda en
el registro de seguridad. Sigue siendo un control de política: quien tenga la llave de la
autoridad y una copia de la base puede descifrar sin pasar por la ruta.

## Bitácora

- Cada evento (`complaint.received`, `complaint.status_changed`, `identity.approved`,
  `identity.opened`, `message.sent`, `evidence.discarded`, `rule.triggered`) se encadena con el hash del anterior. Triggers de SQLite impiden modificar o borrar eventos.
- **Cierre diario barajado.** Un evento nuevo queda pendiente, sin `seq`, con una fecha que nunca
  es anterior a la del último evento. Una tarea programada (cada 10 minutos; las lecturas no
  publican) baraja los pendientes de cada día cerrado (UTC) con aleatoriedad criptográfica y los
  encadena en lotes de 1000, sin bloquear el servidor. La cabeza
  pública es la del último evento encadenado; un día está publicado si y solo si `at <= head.at`.
  Así ni la hora ni el orden de llegada se pueden deducir de la bitácora.
- **Etiqueta del recibo.** `identity.opened` lleva `receiptTag`, derivado del `authVerifier`, para que
  la persona denunciante encuentre sus aperturas aunque se registren con otro folio.
- **Anclaje.** `ledger:anchor` verifica la cabeza pública con la llave fijada, recalcula la cadena
  desde la ancla anterior (o el génesis) y escribe `anchors/AAAA-MM-DD.json`. La forma preferida es
  leer la API pública (`SIGILO_ANCHOR_URL`); sin ella lee la base local en solo lectura.
- **Verificación.** `/verificar` descarga la bitácora pública, comprueba la cadena y la cabeza
  firmada, y permite pegar un ancla para comprobar que la cadena contiene ese `seq` y ese hash.

Ver [criptografia.md](criptografia.md).

## Red federada

La red «un S5, muchas llaves» ([ADR 0005](adr/0005-estandar-s5-federado.md)) agrega tres piezas
sin cambiar la API v1 del nodo:

| Pieza                 | Ubicación                    | Responsabilidad                                                                                         |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Red (funciones puras) | `packages/red`               | Directorio firmado y cofirmado, autoridad competente, sobres de red, bitácora nacional, cliente de nodo |
| Enrutador ciego       | `apps/enrutador`             | Publica el directorio, reenvía sobres opacos, lleva la bitácora nacional y el corte de datos abiertos   |
| Testigos              | `apps/enrutador/src/witness` | Verifican que la bitácora nacional solo creció y cofirman su cabeza (m de n)                            |

```mermaid
flowchart LR
  N[Navegador] -- 1. directorio firmado --> R[Enrutador ciego]
  N -- 2. sobre HPKE al nodo, solo con la autoridad destino --> R
  R -- 3. mismo sobre, sin cabeceras de la persona --> Q[Nodo Querétaro]
  R --> F[Nodo Federal / común]
  Q -- cabeza firmada --> R
  F -- cabeza firmada --> R
  T1[Testigo CPC] -- cofirma --> R
  T2[Testigo academia] -- cofirma --> R
  Q -- cofirma como testigo --> R
  F -- registro firmado, folio opaco --> I[Índice de coincidencias]
  N -- elemento cegado OPRF --> E[Evaluador]
```

- **Directorio.** Documento canónico versionado (`AuthorityDirectory`) con nodos, autoridades
  (entidad, orden de gobierno, competencia por órdenes, entidades, entes y leyes, llaves X25519 y
  Ed25519, vigencia y supervisora) y observadores. Lo firma la operación sobre su digesto
  (`sigilo/red/directory/operator/v1:`) y lo cofirman los testigos (`.../witness/v1:`). El
  navegador fija solo la llave de la operación y las de los testigos (`NetworkTrustAnchor`) y exige
  m cofirmas válidas de testigos fijados distintos. Una versión nueva debe encadenar el digesto
  anterior y llevar m cofirmas de los testigos de la anterior.
- **Autoridad competente.** `proposeCompetentAuthority` corre en el navegador: la conducta define
  la ley (LGRA o CPF), el ente el orden de gobierno, y gana quien atiende al ente por nombre sobre
  quien atiende a todo su orden en la entidad. Devuelve el razonamiento en lenguaje claro. Las
  supervisoras nunca se proponen; un ente municipal sin órgano municipal cae en la contraloría
  estatal, marcado como respaldo.
- **Enrutador ciego.** El navegador cifra con HPKE hacia la llave del nodo una petición de la API
  v1 (`RoutedRequest`) rellenada a un tramo fijo (4 KiB, 64 KiB, 1 MiB o 16 MiB) e incluye una
  llave efímera para la respuesta. El encabezado externo solo dice la autoridad destino. El
  enrutador no guarda el sobre, no lee la IP ni reenvía cabeceras, y responde con la misma forma
  para cualquier destino (relleno si no pudo entregar). Qué ve y qué no: `apps/enrutador/README.md`.
- **Bitácora nacional.** Entradas encadenadas por hash con cada cabeza firmada de nodo y cada
  versión del directorio. El enrutador recoge las cabezas en `GET /api/v1/ledger/head` de cada
  nodo (o el nodo las publica) y rechaza las que retroceden o se bifurcan. La cabeza nacional la
  firma la operación y vale con m cofirmas; cada testigo cofirma solo después de recalcular el
  tramo desde su última cofirma. `GET /api/v1/red/national/inclusion` entrega la prueba de que una
  cabeza de nodo quedó incluida, que el navegador verifica con `verifyNodeHeadInclusion`.
- **Corte nacional de datos abiertos (Bases de la PDN, arts. 60 y 61).** Igual que en el S1, donde
  cada entidad publica y la SESNA consulta por API, aquí **la SESNA consulta números y pruebas,
  nunca denuncias**. En cada vuelta el enrutador descarga el CSV público de cada nodo del
  directorio (`GET /api/v1/open-data/complaints.csv`, el mismo que cualquiera puede bajar), lo
  valida y descarta completo el que no cumpla: encabezado exacto, claves de los catálogos, solo
  meses anteriores al mes en curso, conteos múltiplos de 5 y de al menos 5, sin celdas repetidas y
  con su fila de suprimidas. Suma por entidad, conducta, mes y estatus, vuelve a aplicar la celda
  mínima después de sumar y publica el corte en `GET /api/v1/red/national/open-data` (JSON) y
  `GET /api/v1/red/national/open-data.csv`. Un nodo que no responde queda `unreachable` («sin
  datos de ese nodo en este corte») y el corte se publica igual. La web lo lee por el paso del
  mismo origen del nodo y el observatorio lo muestra; sin red, el observatorio usa la línea base
  sintética rotulada «Datos de ejemplo».
  - **Qué se verifica:** que cada CSV cumple las reglas de publicación (un nodo que publica un
    mes abierto o una celda pequeña no entra al corte) y que la suma es reproducible: cualquiera
    puede rehacerla con los CSV públicos de los nodos.
  - **Qué no se verifica:** que los conteos correspondan a las denuncias reales del nodo. El CSV
    no está firmado y la bitácora del nodo no contiene conteos. Cada nodo del corte lleva la cabeza
    firmada de su bitácora vigente en la bitácora nacional solo como referencia de integridad del
    momento del corte, no como prueba de los números. El corte tampoco lo firma la operación: el
    nodo que lo pasa a la web podría alterarlo, y se compara contra el del enrutador.
  - El reloj del corte es el reloj real; en la demostración, con `SIGILO_ROUTER_CLOCK_FILE`, es el
    reloj simulado de los nodos, para que «mes cerrado» signifique lo mismo en ambos lados.
- **El nodo en la red.** El servidor de referencia monta el buzón de red, se registra ante el
  enrutador (acepta sobres), publica su cabeza después de cada cierre y, si el directorio lo nombra
  testigo, cofirma la cabeza nacional. Aloja varias autoridades con sus llaves del directorio
  verificado. Una denuncia que llega por el enrutador queda turnada a la autoridad que eligió el
  navegador; el turnado a otro nodo lo re-cifra el navegador de la autoridad y el nodo solo lo
  transporta (SEC-19), con `complaint.transferred` en la bitácora y el folio nuevo en el
  seguimiento.
- **Contexto, auditor y corroboración en el nodo.** Al turnar, el nodo revisa el conflicto de
  interés de la persona titular con S1 y S2 (alerta y pide excusa o justificación; nunca bloquea).
  El detalle de la autoridad trae la ficha con prioridad explicable, las señales del auditor y las
  fuentes independientes del índice. La tarea periódica corre el auditor sobre los acuerdos del
  nodo y los importados (`audit.signal`), reverifica sanciones contra S3 y aplica las reglas
  públicas, entre ellas `escalation.conflict` (resolver con conflicto sin excusa, LGRA art. 58) y
  `escalation.archive-signals` (archivo con dos o más señales AUD-01 y AUD-02). Las fuentes son
  sintéticas en la demostración o las bases SQLite descargadas; ninguna consulta sale del nodo.
- **Despliegue local.** `npm run red:demo` genera llaves y cuentas sintéticas en `.red-demo/` y
  `docker compose up` levanta el enrutador, los nodos Querétaro y Federal (el servidor de
  referencia tal cual, con su web en el mismo origen), el evaluador, el índice y dos testigos
  observadores. `npm run demo:seed` siembra el escenario. Guía:
  [conecta tu estado](guia-conecta-tu-estado.md).
- **Pendiente.** La web sigue en el perfil de nodo único (ventanilla única, panel con la ficha y
  turnado re-cifrado en el navegador) y la guarda de custodias de la corroboración (nivel B).

## Despliegue

- **Un solo origen.** En desarrollo, el proxy de Vite sirve web y API desde `127.0.0.1:5173`. En
  despliegue, `SIGILO_WEB_DIST` hace que el servidor entregue `apps/web/dist` con respaldo de SPA a
  `index.html`. CORS está desactivado salvo que `SIGILO_ALLOWED_ORIGIN` lo configure.
- **Cabeceras de la web:** CSP como cabecera con `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `nosniff`, `Cache-Control: no-store` y
  `Strict-Transport-Security` (al menos un año, con `includeSubDomains`) con `SIGILO_HTTPS=1` o
  `SIGILO_HSTS_MAX_AGE`.
- **Cabeceras de la API:** `Content-Security-Policy: default-src 'none'`, `no-store` y `nosniff`.
- **Sin terceros.** La web no hace peticiones fuera de su origen; una prueba E2E lo comprueba.
- **Historial.** La web usa un router en memoria: no deja rutas ni entradas nuevas en el historial.
- **Abuso.** Prueba de trabajo adaptativa (`SIGILO_POW_BITS`, 18; `SIGILO_POW_MAX_BITS`, 20): un
  reto por denuncia con sus pruebas y otro por mensaje. Límites en memoria con tope LRU (fallos de
  autenticación y mensajes por folio), sin frenos globales de escrituras. Cuota total de pruebas con
  tope por denuncia (`SIGILO_EVIDENCE_QUOTA_BYTES`; si no cabe, `507 storage_full`, sin borrar
  pruebas asociadas), retención de pruebas de denuncias sin atender o archivadas
  (`SIGILO_EVIDENCE_RETENTION_DAYS`), descarte de pruebas por la autoridad (queda en la bitácora y
  en el seguimiento), purga de las pendientes de retos vencidos y tope de pendientes por día en la bitácora, del que están
  exentos los eventos de la autoridad.
- **Almacenamiento.** Tablas privadas `WITHOUT ROWID`, `secure_delete` y checkpoint del WAL tras cada
  cierre diario, para que una copia de la base no conserve el orden de llegada.
- **Registros.** Por omisión, contadores agregados por hora sin las rutas de la persona denunciante
  ni `GET keys` y la bitácora (`SIGILO_REQUEST_LOG=aggregate`); nunca IP, agente de usuario, cuerpos
  ni folios.
- **Un solo servidor por base.** `server.lock` en el directorio de datos, creado con `wx` y
  renovado cada 10 minutos.
- **Cuentas.** `authority-accounts.json` en el directorio de datos (no se versiona) declara las
  autoridades del nodo, el buzón general y una cuenta por persona con su digesto scrypt;
  `npm run accounts:generate` crea las sintéticas de la demostración. Los fallos de acceso, las
  sesiones vencidas y las entregas de sobres quedan en `authority_security_events`, sin IP.
- **Llaves.** Las llaves privadas viven en `apps/server/data/` y no se versionan. Las públicas se
  fijan en `apps/web/src/config/pinned-keys.json`.
- **Reloj de pruebas.** `SIGILO_TEST_CLOCK_FILE` desplaza el reloj del servidor solo en pruebas
  (`SIGILO_E2E=1` o `NODE_ENV=test`), con un archivo propio no escribible por otros y un desfase de
  0 a 400 días.
