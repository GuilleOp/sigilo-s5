# sigilo-validar

Validador del Estándar S5 (paquete `@sigilo/validador`). Revisa un sitio de denuncias con las
verificaciones de [`estandar/verificaciones.json`](../../estandar/verificaciones.json) y escribe un
reporte en JSON y en HTML autocontenido.

El título, el perfil, los modos, la severidad y las referencias de cada verificación se leen de ese
archivo. `src/catalog.ts` solo declara cuáles automatiza esta versión y cuáles no; una prueba falla
si ambas listas no cubren exactamente el JSON.

| Automatizadas                  | No automatizadas en esta versión (salen como `no_aplica`) |
| ------------------------------ | --------------------------------------------------------- |
| `PRV-01` a `PRV-15`, `API-01`, | `PRV-16` a `PRV-23`, `SEC-31` a `SEC-34`, con el motivo   |
| `API-02`                       | «Verificación no automatizada en esta versión»            |

## Uso

Requisitos: Node.js 22.18 o superior y Chromium de Playwright (`npx playwright install chromium`,
una sola vez). No hay paso de compilación: Node ejecuta el TypeScript directamente.

```sh
# Modo pasivo (cualquier sitio, incluido el demo oficial). La evidencia de código se redacta.
npm run validate -- https://dev-denuncias-dataton.plataformadigitalnacional.org \
  --nombre demo-oficial --formulario /presentar-denuncia

# Modo conformidad contra la implementación de referencia local
npm run keys:generate
npm run build -w @sigilo/web
SIGILO_WEB_DIST=../web/dist SIGILO_PORT=8799 npm run start -w @sigilo/server   # otra terminal
npm run validate -- http://127.0.0.1:8799 --modo conformidad --formulario /denunciar --nombre referencia
```

| Opción                            | Uso                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--modo pasivo\|conformidad`      | `pasivo` por omisión. `conformidad` además envía denuncias sintéticas al nodo.                                                                                                                                                         |
| `--confirmo-nodo-propio`          | Obligatoria para el modo conformidad contra un host que no es local: declara que el nodo es propio o que hay autorización. Sin ella, el validador se niega.                                                                            |
| `--salida <carpeta>`              | Carpeta de los reportes (`estandar/reportes` por omisión). Para pruebas propias, usa una carpeta fuera del repositorio (por ejemplo, `--salida /tmp/reportes`) para no mezclar tus reportes con los publicados en `estandar/reportes`. |
| `--nombre <prefijo>`              | Prefijo del archivo; se agrega `-AAAA-MM-DD` (fecha del centro de México) y `.json` o `.html`. Por omisión, el host.                                                                                                                   |
| `--formulario <ruta>`             | Ruta del formulario de denuncia (`/presentar-denuncia` por omisión). Debe ser del mismo sitio.                                                                                                                                         |
| `--openapi <archivo>`             | Especificación para `API-01` (`estandar/openapi.yaml` del repositorio por omisión; YAML o JSON).                                                                                                                                       |
| `--max-peticiones <n>`            | Tope único de la corrida (400 por omisión): navegador, `fetch` de cabeceras, cliente de la API y sonda de borradores.                                                                                                                  |
| `--tiempo-limite <ms>`            | Tiempo máximo por navegación (30 000 por omisión).                                                                                                                                                                                     |
| `--permitir-terceros`             | Deja salir las peticiones HTTP a terceros; por omisión se registran y se bloquean.                                                                                                                                                     |
| `--redactar <auto\|ninguna\|ids>` | `auto` (por omisión): redacta la evidencia de código si el sitio no es local. `ninguna`: reporte completo, solo para la divulgación privada y fuera del repositorio. Ids separados por comas: solo esas verificaciones.                |
| `--guardar-captura`               | Guarda lo observado (cabeceras, red y código) en el directorio temporal del sistema, con cookies y almacenamiento enmascarados.                                                                                                        |
| `--archivo-captura <archivo>`     | Ruta de la captura (implica guardarla). Usa una ruta fuera del repositorio; `*.captura.json` está en `.gitignore`.                                                                                                                     |
| `--desde-captura <archivo>`       | Vuelve a analizar una captura guardada sin hacer ninguna petición (solo pasivo).                                                                                                                                                       |

Código de salida: `0` sin incumplimientos, `1` con al menos un `no_cumple`, `2` error de uso o de
ejecución.

## Ética del modo pasivo

El modo pasivo está pensado para revisar sitios ajenos, como el demo oficial, sin afectarlos:

- **Solo GET a recursos públicos.** Visita dos páginas (inicio y formulario) como lo haría una
  persona; cualquier petición con otro método que intente la página (envíos de formularios,
  `sendBeacon`, `fetch` con `POST`) se bloquea y se registra.
- **Sin enviar formularios.** No escribe en campos, no pulsa botones y no resuelve captchas.
- **Sin rutas de autenticación ni APIs privadas.** Las llamadas de datos y las navegaciones de
  documentos y marcos hacia rutas como `/auth`, `/login`, `/session`, `/token`, `/admin` o
  `/autoridad` se bloquean (salvo las dos páginas pedidas).
- **Redirecciones bajo control.** El validador sigue cada salto por su cuenta, en el navegador y en
  `fetch`: solo al propio sitio o al mismo dominio registrable, nunca a IP privadas, locales o de
  enlace local si el sitio es público, y cada salto cuenta en el tope. Si una página termina en un
  tercero, sus cabeceras no se atribuyen al sitio.
- **Sin terceros, sin WebSocket ni WebRTC.** Las peticiones HTTP a otros dominios se registran y no
  se envían. Ningún WebSocket se abre (ni al propio sitio) y WebRTC queda deshabilitado con un
  script de inicio y con las banderas de Chromium; los intentos quedan como evidencia de PRV-01.
- **Una sola corrida.** Una visita por página más un `fetch` del documento para leer sus cabeceras;
  sin reintentos ni rastreo de enlaces. Para corregir el análisis se usa `--desde-captura`, que no
  vuelve a pedir nada.
- **Tope único de peticiones** (400 por omisión) y cuerpos leídos con tope.
- **User-Agent identificable:** `sigilo-validar/<versión> (Datatón 2026)`.
- Trabajadores de servicio bloqueados y ningún permiso concedido al navegador.

El modo conformidad es solo para nodos propios o con autorización: fuera de `localhost` exige
`--confirmo-nodo-propio`. Envía tres denuncias sintéticas (una sellada y dos anónimas), consulta el
seguimiento con credenciales falsas, lee la bitácora y los datos abiertos, prueba rutas no
documentadas bajo `/api` y provoca errores de la API. Los datos son ficticios
(`docs/datos-sinteticos.md`).

## Redacción de la evidencia

Un reporte público de un sitio ajeno no debe servir de guía para explotar sus fallas. Con
`--redactar auto` (por omisión, si el sitio no es local), el reporte:

- sustituye los fragmentos de código por una línea «Evidencia de código redactada», sin URL de
  recursos JavaScript;
- deja en PRV-09 y PRV-10 solo una conclusión general (por ejemplo, «el folio se genera en el
  navegador con un generador no criptográfico… El detalle técnico se conserva fuera del repositorio»), sin
  colecciones, campos ni claves;
- quita las rutas de los recursos del propio sitio y la consulta de las URL de terceros (pueden
  llevar tokens), y enmascara las claves y valores de almacenamiento.

Las cabeceras y los dominios de terceros se conservan: son evidencia pública. La versión sin
redactar (`--redactar ninguna`) se guarda fuera del repositorio para la divulgación privada.

## Qué revisa y cómo

| Id     | Modo                 | Método                                                                                                                                                                                                                             |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRV-01 | pasivo               | Red del navegador: toda petición, WebSocket o intento de WebRTC hacia otro dominio registrable es `no_cumple` (aunque el validador lo haya bloqueado); un intento de WebRTC sin terceros es `advertencia`.                         |
| PRV-02 | pasivo               | Cabecera `Content-Security-Policy`: `default-src 'self'` (o `'none'`) y la directiva efectiva de scripts sin `'unsafe-inline'`, `'unsafe-eval'`, `*`, `data:`, `http:` ni `https:`. Estricta pero solo en `<meta>`: `advertencia`. |
| PRV-03 | pasivo               | `Strict-Transport-Security`: un año con `includeSubDomains` cumple; entre seis meses y un año, o sin `includeSubDomains`, `advertencia`; menos de 15 724 800 s o ausente, `no_cumple`. En HTTP local, `no_aplica`.                 |
| PRV-04 | pasivo               | `frame-ancestors 'none'` o `X-Frame-Options: DENY`; `SAMEORIGIN` es `advertencia`.                                                                                                                                                 |
| PRV-05 | pasivo               | `Referrer-Policy: no-referrer` como último valor reconocido de la cabecera; solo en `<meta>` es `advertencia`.                                                                                                                     |
| PRV-06 | pasivo               | `Permissions-Policy` con `geolocation=()` y `camera=()`; `microphone=()` o `(self)`. Otro origen, `*` o `(self)` en ubicación o cámara: `no_cumple`; falta alguna sin ninguna abierta: `advertencia`.                              |
| PRV-07 | pasivo               | `<script src>`, hojas de estilo, precargas, `@import` y cabecera `Link` del HTML servido, más scripts, estilos y fuentes de terceros vistos en la red.                                                                             |
| PRV-08 | pasivo               | Heurística: `webkitSpeechRecognition` o `SpeechRecognition` en el código descargado.                                                                                                                                               |
| PRV-09 | pasivo y conformidad | Pasivo (heurística, sin consultar folios): folios de ejemplo con año, expresiones de validación, construcción con prefijo y año, uso de `Math.random` y consultas de existencia. Conformidad: tres envíos y análisis.              |
| PRV-10 | pasivo y conformidad | Pasivo (heurística): usos de almacenamiento con contexto del formulario, claves de borrador, objetos serializados, avisos de guardado local y claves presentes. Conformidad: escribe una marca y la busca en el valor completo.    |
| PRV-11 | pasivo               | Red: hosts de Mapbox, Google Maps, OpenStreetMap, MapTiler, Esri, HERE, TomTom y Carto (`no_cumple`). Código: sus firmas (`advertencia`).                                                                                          |
| PRV-12 | pasivo               | `Set-Cookie` y cookies del navegador: `Secure`, `HttpOnly`, `SameSite` y nombres de rastreo conocidos (`_ga`, `_fbp`, `_hj…`).                                                                                                     |
| PRV-13 | pasivo               | Red y código: Google Analytics/gtag, GTM, Meta Pixel, Hotjar, Clarity, Sentry alojado, Segment, Mixpanel, Amplitude, New Relic, Datadog, Matomo en la nube, Plausible.                                                             |
| PRV-14 | conformidad          | `GET /api/v1/keys` con el formato del contrato y `keyId` correcto; llave fijada en el código de la web; denuncia sellada con sobre HPKE aceptada y comprobante firmado; modo sellado sin sobre rechazado.                          |
| PRV-15 | conformidad          | Seguimiento con folio existente y secreto equivocado frente a folio inexistente: estatus, cuerpo y tipo idénticos; se informan los tiempos.                                                                                        |
| API-01 | conformidad          | Cada intercambio (llaves, prueba de trabajo, envíos, seguimiento, bitácora, datos abiertos, errores y rutas no documentadas bajo `/api`) contra el OpenAPI 3.1: ruta, método, estatus, tipo de contenido y esquema (Ajv).          |
| API-02 | conformidad          | Cada respuesta de error: JSON con `{ error: { code, message } }`, sin trazas, rutas internas ni errores del motor, sin reflejar la entrada y sin `X-Powered-By`.                                                                   |

## Heurísticas y sus límites

- **Inferencia frente a observación.** Lo que solo aparece en el código es `advertencia` con
  `isHeuristic: true`; solo lo visto en cabeceras, red o respuestas es `no_cumple` o `cumple` por
  observación directa. La ausencia en el código también es una inferencia (`cumple` heurístico).
- **Cobertura del código.** Solo se analizan los recursos que el navegador descargó al cargar las dos
  páginas. Los fragmentos que se cargan al interactuar (abrir un mapa, pasar de paso) no se ven.
- **Código minificado.** Las firmas buscan cadenas y nombres de API que sobreviven a la
  minificación; una biblioteca incluida pero no usada también coincide.
- **Borradores (PRV-10 pasivo).** Un objeto serializado en el almacenamiento solo cuenta si el mismo
  recurso nombra una clave de borrador; los avisos negativos («nada queda guardado») se descartan.
  La prueba fuerte es la sonda del modo conformidad.
- **Dominio registrable.** Sin la Public Suffix List completa: se toma la última etiqueta más una
  (o dos para sufijos como `gob.mx`). Un subdominio del mismo dominio es «mismo sitio», no tercero.
- **HTML.** Las etiquetas se extraen con expresiones regulares del documento servido; lo que inserta
  JavaScript lo cubre la red (PRV-01).
- **Redirecciones en el navegador.** Chromium sigue por su cuenta las redirecciones de una respuesta
  entregada por la ruta, así que el validador sigue los saltos y entrega solo la respuesta final:
  la página queda con su URL original y las rutas relativas de una página redirigida pueden
  resolverse distinto.
- **WebSocket.** Como los documentos se entregan con `route.fulfill`, Playwright no puede conectar un
  WebSocket con el servidor real; por eso ninguno se abre, tampoco al propio sitio. Una página que
  dependa de WebSocket para cargar puede verse incompleta.
- **Cuerpos en el navegador.** Los `fetch` del validador leen en flujo con tope; las respuestas que
  entrega el navegador se leen completas (Playwright no permite leerlas en flujo) y se recortan
  después.
- **Folios (PRV-09 conformidad).** Tres muestras descartan contadores, año visible y prefijos
  comunes; no prueban la calidad del generador.
- **Tiempos (PRV-15).** Dos muestras por caso; las mediciones por red son ruidosas y solo producen
  `advertencia` si la diferencia de medianas supera 150 ms.
- **PRV-14.** El sobre lo arma el cliente sintético del validador (el mismo código de
  `apps/web/src/crypto/submission.ts`) con las llaves publicadas; el cifrado dentro de la interfaz
  lo cubren las pruebas E2E de la referencia.

## Reporte JSON

Formato estable `schemaVersion: 1`, descrito en [`report.schema.json`](report.schema.json)
(JSON Schema 2020-12). Campos principales: `tool` (nombre, versión, User-Agent), `mode`, `target`,
`startedAt`, `finishedAt`, `limits`, `summary` (conteo por estado), `checks` (uno por verificación
en el orden de `estandar/verificaciones.json`, con `severity`, `status`, `summary`, `isHeuristic`,
`evidence` y `references`), `observations` (hallazgos informativos), `network` (todas las
peticiones, con origen y si se bloquearon) y `errors`. Un cambio incompatible sube `schemaVersion`.

El reporte HTML no carga nada externo, escapa todo el contenido del sitio, usa una tabla con
encabezados, muestra cada estado con ícono y texto (no solo color) y respeta el modo oscuro con
contraste AA.

## Perfil «conexión PDN»

Reproduce, contra el nodo de un estado, los casos con que la SESNA prueba a un proveedor en su
protocolo de conexión (ValidAPI, ver [`docs/guia-conecta-tu-estado.md`](../../docs/guia-conecta-tu-estado.md)).
Solo pide tokens y consulta la estadística con las credenciales que el estado entregó a la SESNA: no
crea ni cambia nada. Las credenciales van por variables de entorno, nunca en la línea de comandos, y
el reporte no las guarda (tampoco los tokens).

```sh
SIGILO_PDN_CLIENT_ID=sesna SIGILO_PDN_CLIENT_SECRET=… \
SIGILO_PDN_USERNAME=sesna.pdn SIGILO_PDN_PASSWORD=… \
npm run validate:pdn -- \
  --token-url https://nodo.example.org/oauth/token \
  --consulta-url https://nodo.example.org/v1/denuncias/estadisticas \
  --ambiente productivo
```

Sin `SIGILO_PDN_USERNAME` y `SIGILO_PDN_PASSWORD` usa `client_credentials`. `--esperar-vencimiento`
espera `expires_in` segundos para comprobar que el token vencido ya no sirve. El reporte JSON va a
`estandar/reportes/<host>-pdn-AAAA-MM-DD.json`. Cada caso sale como `aprobado`, `no_aprobado`,
`advertencia` o `no_evaluado`; el código de salida es 1 si hay al menos un `no_aprobado`.

| Caso       | Categoría | Qué revisa (regla de ValidAPI)                                                                                |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `CPDEN-01` | seguridad | Token Bearer con las credenciales en el cuerpo y con `Authorization: Basic`; la ruta contiene `/oauth/token`. |
| `CPDEN-02` | seguridad | `expires_in` de 5 minutos a 1 hora.                                                                           |
| `CPDEN-03` | seguridad | Un token nuevo en cada petición.                                                                              |
| `CPDEN-04` | seguridad | El token vencido responde `401` con `resError` (solo con `--esperar-vencimiento`).                            |
| `CPDEN-05` | seguridad | `refresh_token` (opcional): dura de 5 a 10 minutos más que `expires_in`, renueva y es de un solo uso.         |
| `CPDEN-06` | seguridad | Un token inválido responde `401` con `resError`.                                                              |
| `CPDEN-07` | seguridad | https en las rutas: en productivo es obligatorio; en desarrollo, http es una advertencia.                     |
| `CPDEN-08` | funcional | «Respuesta sin envío de parámetros»: `{}` responde con `page` 1 y `pageSize` 10.                              |
| `CPDEN-09` | funcional | La página `techo(totalRows/pageSize) + 1` da `results: []` con el mismo `totalRows`; `page` 0 es error.       |
| `CPDEN-10` | funcional | `pageSize` 0 y 201 son error; 200 es válido.                                                                  |
| `CPDEN-11` | funcional | Filtrado por `id`: solo esa fila; un `id` inexistente da `results: []`, nunca un error.                       |
| `CPDEN-12` | funcional | Un filtro con cadena vacía se ignora.                                                                         |
| `CPDEN-13` | funcional | Orden ascendente y descendente por `mes`.                                                                     |
| `CPDEN-14` | funcional | Autoridades sin repetidas, en orden alfabético por nombre y congruentes con la consulta.                      |
| `CPDEN-15` | funcional | Cada error tiene `code` (el estatus HTTP 4xx) y `message` en el primer nivel.                                 |
| `CPDEN-16` | funcional | Aviso si el endpoint trabaja con menos de 50 registros.                                                       |
| `CPDEN-17` | estrés    | No se reproduce (la SESNA no publica la duración ni la concurrencia): siempre `no_evaluado`.                  |

Los casos salen de leer las reglas públicas de ValidAPI; no son la herramienta de la SESNA ni
sustituyen su revisión. No están en `estandar/verificaciones.json` porque ese catálogo es de las
verificaciones de privacidad y seguridad del sitio de denuncias.

## Pruebas

`npm test` incluye las pruebas del validador: verificaciones sobre capturas sintéticas (sin código
copiado de ningún sitio), un sitio local «bueno», uno «malo» y uno hostil (WebSocket, WebRTC con un
STUN local y redirecciones a `/admin` y al tercero) cargados en Chromium, con un tercero simulado que
Chromium resuelve a 127.0.0.1 y cualquier otro nombre bloqueado; el servidor de referencia en
memoria, un nodo que filtra trazas, la sonda de borradores con la marca más allá del recorte, la
redacción y el enmascarado de capturas, y el perfil «conexión PDN» contra un nodo de referencia en
el mismo proceso (con meses cerrados) y contra nodos que incumplen. Nada sale a internet.

## Pendiente

- Automatizar `PRV-16` a `PRV-23` y `SEC-31` a `SEC-34` (hoy `no_aplica`; se revisan a mano).
- Permitir WebSocket al propio sitio en el modo conformidad sin perder el control de redirecciones.
