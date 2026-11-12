# Perfil de privacidad de la persona denunciante

Requisitos verificables que protegen a quien denuncia en la recepción, el trámite y el seguimiento.
Complementa el [perfil de seguridad](perfil-seguridad.md). Cada requisito tiene un identificador
estable que comparten el validador, [verificaciones.json](verificaciones.json) y la documentación.

## Convenciones

- **DEBE**, **NO DEBE**, **DEBERÍA** y **PUEDE** se interpretan como MUST, MUST NOT, SHOULD y MAY del
  RFC 2119.
- **Modo pasivo**: el validador solo hace `GET` a páginas y recursos públicos, sin enviar
  formularios; puede usarse con cualquier sitio, incluido el S5 de prueba. **Modo conformidad**:
  contra un nodo que dice cumplir el estándar; puede enviar denuncias sintéticas
  ([datos sintéticos](../docs/datos-sinteticos.md)) y usar un navegador automatizado.
- Resultado de cada verificación: `cumple`, `no_cumple`, `advertencia` (indicio que requiere
  revisión o comprobación incompleta) o `no_aplica`, siempre con evidencia (URL, cabecera o
  fragmento) y la referencia de la norma.
- **Tercero**: todo origen cuyo dominio registrable (según la Public Suffix List) sea distinto del
  sitio evaluado, salvo los que el operador declare como propios en la configuración del validador.
- **Páginas de referencia**: el inicio y el formulario de denuncia. El validador recibe sus URL; si
  no se indica la del formulario, solo evalúa el inicio y lo dice en el reporte.
- Fundamentos citados: LGRA art. 91 (denuncia anónima y confidencialidad) y art. 64, fracción III
  (revelar la identidad de un denunciante anónimo es obstrucción); Bases de la PDN (DOF 23-10-2018),
  «Seguridad de la Información» y arts. 56 a 61; LGPDPPSO (DOF 20-03-2025), principios de
  finalidad, proporcionalidad y responsabilidad; planteamientos de la SESNA (S-02 a S-07 de
  [requisitos.md](../docs/requisitos.md)).
- Estado en SIGILO (software 1.1.0): **cumple**, **parcial** o **brecha**.

## Verificaciones

### PRV-01 Cero peticiones a terceros

- **Requisito.** Al cargar el inicio y el formulario, la ventanilla NO DEBE hacer ninguna petición a
  terceros (scripts, estilos, fuentes, imágenes, mapas, analítica, `fetch`, `WebSocket`).
- **Modo.** Pasivo.
- **Procedimiento.** (1) `GET` de cada página de referencia; (2) extrae del HTML las URL de
  `script[src]`, `link[href]`, `img[src]`, `iframe[src]`, `source[src]`, `video`, `audio`,
  `object` y `embed`; (3) descarga los CSS del mismo origen y extrae `url()` e `@import`; (4) si
  hay navegador automatizado disponible, carga cada página, espera a que la red quede inactiva y
  registra todas las peticiones; (5) clasifica cada URL como propia o de tercero.
- **Resultado.** `cumple` si ninguna petición va a terceros y se usó el navegador; `advertencia` si
  no hay terceros pero solo se hizo el análisis estático (las peticiones dinámicas no se ven);
  `no_cumple` con la lista de URL de terceros.
- **Fundamento.** LGRA art. 91; SESNA S-04 («los permisos no equivalen a garantía de privacidad»);
  Bases de la PDN, confidencialidad. Cada tercero recibe la IP, la hora y la página de quien
  denuncia.
- **SIGILO.** **Cumple.** `e2e/no-third-party.spec.ts` recorre seis pantallas con un vigilante que
  falla ante cualquier petición externa.

### PRV-02 CSP estricta como cabecera

- **Requisito.** Las páginas de la ventanilla DEBEN enviar `Content-Security-Policy` como cabecera
  HTTP con `default-src 'self'` (o `'none'`), y la directiva efectiva para scripts NO DEBE incluir
  `'unsafe-inline'`, `'unsafe-eval'`, `*`, `data:`, `http:` ni `https:`.
- **Modo.** Pasivo.
- **Procedimiento.** `GET` de cada página de referencia; lee la cabecera (no la etiqueta `meta`);
  analiza las directivas; calcula la efectiva para scripts (`script-src-elem`, `script-src` o
  `default-src`, en ese orden); revisa además `report-uri` y `report-to`.
- **Resultado.** `cumple` si cumple todo; `advertencia` si la política está solo en `meta` pero es
  estricta, o si reporta a un tercero; `no_cumple` si falta, si `default-src` no es `'self'` ni
  `'none'` o si los scripts admiten alguna fuente prohibida.
- **Fundamento.** Bases de la PDN, integridad; ASVS V14.4.3. Un script inyectado lee la denuncia
  antes de que se cifre.
- **SIGILO.** **Cumple** cuando el servidor sirve la web: `WEB_CSP` en
  `apps/server/src/security/headers.ts`, probado en `apps/server/src/app.test.ts` («sirve archivos…
  y aplica cabeceras de web»).

### PRV-03 HSTS

- **Requisito.** Un sitio servido por HTTPS DEBE enviar `Strict-Transport-Security` con `max-age`
  de al menos 31536000 segundos y DEBERÍA incluir `includeSubDomains`. La ventanilla NO DEBE
  servirse por HTTP fuera de `localhost`.
- **Modo.** Pasivo.
- **Procedimiento.** `GET` de cada página de referencia por HTTPS; lee la cabecera. Si el objetivo
  es `http://` y no es `localhost` ni `127.0.0.1`, lo reporta.
- **Resultado.** `cumple` con `max-age` ≥ 31536000; `advertencia` con `max-age` entre 15724800 y
  31535999 o sin `includeSubDomains`; `no_cumple` si falta, si es menor o si el sitio se sirve por
  HTTP; `no_aplica` en `localhost`.
- **Fundamento.** Bases de la PDN, confidencialidad; ASVS V14.4.5. Sin HSTS, una red hostil degrada
  la conexión a HTTP y lee la denuncia.
- **SIGILO.** **Cumple** en la instalación: `./sigilo instalar` define `SIGILO_HTTPS=1` (un año con
  `includeSubDomains`) y el nodo y el enrutador rechazan un `max-age` menor que un año
  (`apps/server/src/config.ts`). En desarrollo, por HTTP local, no se envía.

### PRV-04 Protección contra marcos

- **Requisito.** Las páginas DEBEN impedir que otro sitio las enmarque con `frame-ancestors 'none'`
  en la CSP de cabecera o con `X-Frame-Options: DENY`.
- **Modo.** Pasivo.
- **Procedimiento.** `GET` de cada página de referencia; lee ambas cabeceras.
- **Resultado.** `cumple` con cualquiera de las dos; `advertencia` con `'self'` o `SAMEORIGIN`;
  `no_cumple` si no hay ninguna.
- **Fundamento.** ASVS V14.4.7. Un sitio falso que enmarca la ventanilla puede capturar lo que la
  persona escribe o engañarla para revelar su recibo.
- **SIGILO.** **Cumple.** Ambas (`apps/server/src/security/headers.ts`).

### PRV-05 Sin `Referer`

- **Requisito.** Las páginas DEBEN enviar `Referrer-Policy: no-referrer` como cabecera.
- **Modo.** Pasivo.
- **Procedimiento.** `GET` de cada página de referencia; lee la cabecera y la etiqueta
  `meta name="referrer"`.
- **Resultado.** `cumple` con la cabecera `no-referrer`; `advertencia` si solo está la `meta`;
  `no_cumple` con cualquier otro valor o sin política.
- **Fundamento.** ASVS V14.4.6; LGRA art. 91. Un `Referer` con la ruta del seguimiento le dice a otro
  sitio que esa persona denunció.
- **SIGILO.** **Cumple.** Cabecera y `meta` (`apps/server/src/security/headers.ts`,
  `apps/web/index.html`; `apps/server/src/app.test.ts`).

### PRV-06 `Permissions-Policy` restrictiva

- **Requisito.** Las páginas DEBEN enviar `Permissions-Policy` con `geolocation=()` y `camera=()`.
  El micrófono DEBE estar en `microphone=()` o, si hay dictado local, en `microphone=(self)`.
  Ninguna de las tres DEBE permitir otro origen ni `*`.
- **Modo.** Pasivo.
- **Procedimiento.** `GET` de cada página de referencia; analiza la cabecera como diccionario
  estructurado (RFC 8941); ignora `Feature-Policy`.
- **Resultado.** `cumple` si las tres están restringidas; `advertencia` si falta alguna de las tres
  pero ninguna está abierta; `no_cumple` si falta la cabecera o alguna admite otro origen o `*`.
- **Fundamento.** SESNA S-02 (ubicación) y S-04; LGPDPPSO, proporcionalidad. El permiso de
  ubicación de un navegador entrega coordenadas precisas.
- **SIGILO.** Cumple. El servidor envía `Permissions-Policy` con geolocalización, micrófono,
  cámara, pagos y USB deshabilitados (`PERMISSIONS_POLICY` en `apps/server/src/security/headers.ts`,
  probado en `apps/server/src/app.test.ts`).

### PRV-07 Sin recursos de terceros en el HTML

- **Requisito.** El HTML de las páginas de referencia NO DEBE referir scripts, hojas de estilo,
  fuentes ni marcos de terceros.
- **Modo.** Pasivo.
- **Procedimiento.** `GET` de cada página de referencia; revisa `script[src]`, `link[rel]`
  (`stylesheet`, `preload`, `modulepreload`, `preconnect`, `dns-prefetch`, `icon`), `iframe[src]`,
  `@import` y `@font-face` en `style` en línea y en los CSS del mismo origen.
- **Resultado.** `cumple` si no hay ninguno; `no_cumple` con la lista.
- **Fundamento.** Bases de la PDN, confidencialidad e integridad. A diferencia de PRV-01, no depende
  de ejecutar JavaScript: es la evidencia mínima que cualquier persona puede reproducir.
- **SIGILO.** **Cumple.** `apps/web/index.html` no refiere recursos externos; la tipografía es la
  del sistema (`apps/web/src/styles/tokens.css`).

### PRV-08 Sin reconocimiento de voz remoto

- **Requisito.** La ventanilla NO DEBE usar `webkitSpeechRecognition` ni `SpeechRecognition`, que
  en los navegadores más usados envían el audio a servidores del fabricante. Un dictado DEBE
  ejecutarse en el dispositivo.
- **Modo.** Pasivo.
- **Procedimiento.** Descarga el HTML y los scripts del mismo origen enlazados (incluidos los
  `import` de módulos, hasta 50 archivos o 20 MB) y busca esos identificadores.
- **Resultado.** `cumple` si no aparecen; `no_cumple` con el archivo y un fragmento.
- **Fundamento.** LGRA art. 91; SESNA S-07 (dictado para personas con poca experiencia digital
  solo si no expone la voz). La voz identifica a la persona.
- **SIGILO.** **Cumple.** No hay uso de esas interfaces; el dictado local es diseño (nivel C).

### PRV-09 Folio no secuencial ni predecible

- **Requisito.** El folio DEBE tener al menos 60 bits aleatorios y NO DEBE derivar del tiempo, de un
  contador ni de datos de la denuncia.
- **Modo.** Pasivo y conformidad.
- **Procedimiento.** Pasivo: busca en el HTML y en el código descargado indicios del formato
  (folios de ejemplo, expresiones de validación, construcción en el navegador con año o con un
  generador no criptográfico, consultas de existencia) y, con un folio de muestra que dé el operador,
  estima la entropía máxima del formato (longitud por bits del alfabeto). El modo pasivo NO DEBE
  consultar folios ajenos ni vecinos. Conformidad, solo contra nodos propios o con autorización:
  crea al menos 3 denuncias sintéticas seguidas y compara sus folios (prefijos comunes, diferencias
  numéricas, año visible y orden respecto a la hora de envío); PUEDE consultar folios vecinos de los
  que creó.
- **Resultado.** `cumple` si el formato admite al menos 60 bits, ningún vecino existe y los folios no
  muestran orden ni prefijo común más allá de lo esperado al azar; `no_cumple` si el formato tiene
  menos de 60 bits, algún vecino existe o los folios son consecutivos; `advertencia` en pasivo si el
  código muestra un formato enumerable; `no_aplica` en pasivo sin indicios ni folio de muestra.
- **Fundamento.** LGRA art. 91; ASVS V6.3.1. Un folio secuencial permite enumerar denuncias y
  fechar cuándo llegó cada una.
- **SIGILO.** **Cumple.** 60 bits en Base32 Crockford (`packages/core/src/folio.ts`,
  `folio.test.ts`).

### PRV-10 Sin borradores en el almacenamiento del navegador

- **Requisito.** La ventanilla NO DEBE escribir hechos, identidad, recibo ni llaves en
  `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies.
- **Modo.** Pasivo (estático) y conformidad.
- **Procedimiento.** Pasivo: en los scripts del mismo origen busca `localStorage.setItem`,
  `sessionStorage.setItem`, `indexedDB.open`, `caches.open` y asignaciones a `document.cookie`.
  Conformidad: con navegador automatizado llena el formulario con un marcador sintético único,
  avanza hasta antes de enviar y después de enviar, y vuelca todo el almacenamiento del origen.
- **Resultado.** Pasivo: `cumple` si no aparece ninguna escritura; `advertencia` si aparece (una
  biblioteca puede tenerla sin usarla). Conformidad: `cumple` si el marcador no aparece en ningún
  almacén; `no_cumple` si aparece.
- **Fundamento.** LGRA art. 91; ASVS V8.2.2; modelo de amenazas B09. Quien revise el equipo de la
  persona (familia, empleador) no debe encontrar el borrador.
- **SIGILO.** **Cumple** por diseño (`apps/web/src/state/memory-store.ts`). **Brecha de prueba:** no
  hay una prueba E2E que vuelque el almacenamiento con un marcador.

### PRV-11 Sin mapas ni geocodificación externos

- **Requisito.** La ventanilla NO DEBE usar mapas, teselas ni geocodificación de terceros (Mapbox,
  Google Maps, OpenStreetMap, Esri, HERE u otros) y NO DEBERÍA pedir la ubicación del dispositivo.
- **Modo.** Pasivo.
- **Procedimiento.** Busca en el HTML, la CSP y los scripts del mismo origen los dominios
  `api.mapbox.com`, `*.tiles.mapbox.com`, `maps.googleapis.com`, `maps.google.com`,
  `tile.openstreetmap.org`, `nominatim.openstreetmap.org`, `*.arcgis.com`, `*.hereapi.com` y las
  cadenas `mapboxgl`, `google.maps`; busca además `navigator.geolocation`.
- **Resultado.** `cumple` si no hay ninguno; `advertencia` si solo aparece `navigator.geolocation`;
  `no_cumple` si aparece un servicio externo.
- **Fundamento.** SESNA S-02 («el mapa externo no es preciso»); LGPDPPSO, proporcionalidad. Un
  servicio de mapas recibe la ubicación buscada junto con la IP de quien denuncia.
- **SIGILO.** **Cumple.** Solo entidad y municipio, sin mapa (modelo de amenazas A12).

### PRV-12 Cookies seguras y sin rastreo

- **Requisito.** Si el sitio usa cookies, cada una DEBE tener `Secure`, `HttpOnly` y `SameSite`
  (`Strict` o `Lax`). NO DEBE haber cookies de rastreo ni de analítica.
- **Modo.** Pasivo.
- **Procedimiento.** Reúne `Set-Cookie` de las páginas de referencia y de los recursos públicos
  descargados; analiza atributos y nombres (`_ga`, `_gid`, `_gcl_*`, `_fbp`, `_hj*`, `_clck`,
  `_clsk`, `ajs_*`, `mp_*`, `_pk_*`).
- **Resultado.** `cumple` si no hay cookies o todas cumplen; `no_cumple` si alguna carece de un
  atributo o es de rastreo.
- **Fundamento.** ASVS V3.4.1, V3.4.2, V3.4.3; LGPDPPSO, finalidad. Una cookie persistente vincula la
  denuncia con otras visitas.
- **SIGILO.** **Cumple.** El servidor no emite cookies.

### PRV-13 Sin analítica ni rastreadores

- **Requisito.** La ventanilla NO DEBE incluir analítica, píxeles, grabación de sesiones ni
  reporte de errores de terceros.
- **Modo.** Pasivo.
- **Procedimiento.** Busca en HTML, CSP y scripts del mismo origen: `googletagmanager.com`,
  `google-analytics.com`, `gtag(`, `dataLayer`, `connect.facebook.net`, `fbq(`, `hotjar`,
  `clarity.ms`, `sentry.io`, `sentry-cdn.com`, `segment.com`, `mixpanel`, `newrelic`, `matomo`.
- **Resultado.** `cumple` si no hay ninguno; `advertencia` si es analítica autoalojada (por ejemplo,
  Matomo en el mismo origen); `no_cumple` si es de tercero.
- **Fundamento.** LGRA art. 91; Bases de la PDN, confidencialidad; LGPDPPSO, finalidad.
- **SIGILO.** **Cumple.** Sin analítica (`apps/web/index.html`; `e2e/no-third-party.spec.ts`).

### PRV-14 Identidad cifrada en el navegador

- **Requisito.** El nodo DEBE publicar las llaves públicas de cifrado de sus autoridades, y la
  ventanilla DEBE cifrar la identidad en el dispositivo en un sobre HPKE (RFC 9180) de tamaño fijo
  hacia una de esas llaves. Ningún dato de identidad DEBE viajar en claro.
- **Modo.** Conformidad.
- **Procedimiento.** (1) `GET` de la ruta de llaves de `estandar/openapi.yaml`: cada llave tiene 32
  bytes y `keyId` igual a los primeros 16 hexadecimales de su SHA-256. (2) Con navegador
  automatizado, llena el formulario en modo de identidad sellada con un nombre y un correo
  sintéticos únicos y captura todas las peticiones del envío. (3) Busca los marcadores (en UTF-8,
  Base64 y Base64URL) en URL, cabeceras y cuerpos. (4) Valida el sobre: `v`, `suite`, `keyId`
  publicado y longitud del texto cifrado.
- **Resultado.** `cumple` si las llaves son válidas, el marcador no aparece y el sobre es válido;
  `no_cumple` si el marcador aparece o el sobre no corresponde a una llave publicada.
- **Fundamento.** LGRA art. 91 y art. 64, fracción III; SESNA S-04; Bases de la PDN,
  confidencialidad.
- **SIGILO.** **Cumple.** `e2e/sealed-complaint.spec.ts` (incluye «la base de datos no contiene el
  nombre sintético en ninguna tabla») y `e2e/key-pinning.spec.ts`.

### PRV-15 Respuesta indistinguible ante folio o secreto inválidos

- **Requisito.** El seguimiento DEBE responder igual (estatus, cuerpo y cabeceras salvo `Date`) a un
  folio inexistente y a un secreto incorrecto, y NO DEBERÍA mostrar diferencias de tiempo medibles.
- **Modo.** Conformidad.
- **Procedimiento.** Crea una denuncia sintética. Envía 5 consultas con su folio y un secreto
  incorrecto y 5 con un folio inexistente bien formado y un secreto con formato válido; compara las
  respuestas byte a byte y la mediana de tiempos. No supera el límite de fallos por folio.
- **Resultado.** `cumple` si las respuestas son idénticas y la diferencia de medianas es menor de
  20 ms; `advertencia` si son idénticas pero la diferencia es mayor; `no_cumple` si difieren.
- **Fundamento.** LGRA art. 91; ASVS V6.2.8; API2:2023. Un oráculo de existencia confirma a un
  tercero que alguien denunció.
- **SIGILO.** **Cumple.** `apps/server/src/routes/tracking.test.ts` («responde exactamente igual a
  folio inexistente y a verificador incorrecto»).

### PRV-16 Enlaces externos sin fuga de origen

- **Requisito.** Todo enlace a otro origen DEBERÍA llevar `rel="noreferrer"` y los que abren
  pestaña, además, `noopener`.
- **Modo.** Pasivo.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** En el HTML de las páginas de referencia revisa cada `a[href]` y `area[href]`
  hacia otro origen.
- **Resultado.** `cumple` si todos lo llevan o no hay enlaces externos; `advertencia` si falta pero
  PRV-05 cumple (la política global lo cubre); `no_cumple` si falta y PRV-05 no cumple.
- **Fundamento.** LGRA art. 91. Seguir un enlace no debe decirle al destino de dónde viene la
  persona.
- **SIGILO.** **Cumple.** Sin enlaces externos; los de pruebas usan `noreferrer noopener`
  (`apps/web/src/pages/authority/EvidenceGallery.tsx`).

### PRV-17 Sin caché

- **Requisito.** Las páginas de la ventanilla y las respuestas de la API con datos de una denuncia
  DEBEN enviar `Cache-Control: no-store`.
- **Modo.** Pasivo y conformidad.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** Pasivo: `GET` de las páginas de referencia y de la ruta de llaves.
  Conformidad: también la respuesta del seguimiento de una denuncia sintética.
- **Resultado.** `cumple` si todas llevan `no-store`; `no_cumple` si alguna no.
- **Fundamento.** ASVS V8.1.1, V8.2.1; modelo de amenazas B04 y B09.
- **SIGILO.** **Cumple.** `apps/server/src/security/headers.ts`; `apps/server/src/app.test.ts`.

### PRV-18 Sin traducción ni indexación remotas

- **Requisito.** Las páginas DEBERÍAN declarar `translate="no"` o
  `<meta name="google" content="notranslate">`, y `<meta name="robots" content="noindex">`. Los
  campos de texto libre DEBERÍAN llevar `spellcheck="false"`.
- **Modo.** Pasivo.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** `GET` de las páginas de referencia y revisión del HTML; si hay navegador
  automatizado, revisa también los `textarea` e `input` que dibuja el formulario, sin enviarlo.
- **Resultado.** `cumple` con ambas declaraciones; `advertencia` si falta una o si algún campo de
  texto no desactiva el corrector; `no_cumple` si faltan ambas.
- **Fundamento.** LGRA art. 91; modelo de amenazas B01 y B02. La traducción automática y el
  corrector en la nube envían el relato a terceros.
- **SIGILO.** **Cumple.** `apps/web/index.html` y campos con `spellCheck: false` y
  `autoComplete: 'off'` (`apps/web/src/components/Field.tsx`).

### PRV-19 Fechas públicas sin hora exacta

- **Requisito.** Las fechas visibles para terceros o guardadas junto a la denuncia (bitácora
  pública, comprobante, seguimiento, datos abiertos) DEBEN tener resolución de día; los mensajes del
  buzón, a lo sumo de hora. El orden público de los eventos de un día NO DEBE ser el de llegada.
- **Modo.** Pasivo y conformidad.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** Pasivo: si el nodo publica la bitácora, `GET` de sus eventos y revisión de que
  los campos de fecha tengan forma `AAAA-MM-DD`. Conformidad: además, comprobante y seguimiento de
  una denuncia sintética.
- **Resultado.** `cumple` si ninguna fecha tiene hora, minuto o segundo (salvo hora redondeada en el
  buzón); `no_cumple` si alguna la tiene; `no_aplica` si no hay bitácora pública en el modo pasivo.
- **Fundamento.** LGRA art. 91; modelo de amenazas A09. La hora exacta de un envío se cruza con
  quién salió de una reunión o quién usó la red del trabajo.
- **SIGILO.** **Cumple.** Fechas por día y eventos barajados al cerrar el día
  (`apps/server/src/ledger-service.test.ts`); buzón por hora.

### PRV-20 Pruebas sin metadatos aceptadas por el nodo

- **Requisito.** Además de la limpieza en el navegador, el nodo DEBERÍA rechazar o recodificar
  imágenes que conserven EXIF, XMP, IPTC, GPS o comentarios.
- **Modo.** Conformidad.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** Sube, con su prueba de trabajo, un JPEG sintético con EXIF que incluye
  coordenadas GPS y modelo de cámara inventados; si el nodo lo acepta, lo descarga por la ruta de
  autoridad de prueba (si el operador da credenciales de un nodo de pruebas) y busca los metadatos.
- **Resultado.** `cumple` si lo rechaza o si la copia guardada no tiene metadatos; `advertencia` si
  lo acepta y no hay credenciales para revisar la copia; `no_cumple` si la copia conserva
  metadatos.
- **Fundamento.** SESNA S-03 («el relato y las pruebas identifican»); LGPDPPSO, proporcionalidad.
  Una ventanilla alternativa o una carga directa a la API se salta la limpieza del navegador.
- **SIGILO.** **Parcial.** El nodo acepta solo contenedores cifrados hacia la autoridad y rechaza
  cualquier otra cosa, incluido el JPEG del procedimiento
  (`apps/server/src/services/evidence-service.ts`). Por lo mismo, no ve la imagen y no puede
  comprobar sus metadatos: la limpieza está solo en el navegador (Huella Cero, modelo de amenazas
  A08), y el panel revisa el tipo al descifrar.

### PRV-21 Denuncia sin datos personales

- **Requisito.** El contrato y la ventanilla DEBEN permitir presentar una denuncia sin nombre,
  correo, teléfono, CURP ni ningún otro dato de identidad, y NO DEBEN exigir crear una cuenta.
- **Modo.** Conformidad.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** Envía una denuncia sintética en modo anónimo con solo los campos que
  `estandar/openapi.yaml` marca como obligatorios y revisa que ninguno sea de identidad; con
  navegador, comprueba que el formulario llega al envío sin llenar campos de identidad.
- **Resultado.** `cumple` si el nodo acepta la denuncia y ningún campo obligatorio es de identidad;
  `no_cumple` en otro caso.
- **Fundamento.** LGRA art. 91; LGPDPPSO, proporcionalidad (minimización).
- **SIGILO.** **Cumple.** Modo `anonymous` (`e2e/submit-complaint.spec.ts`).

### PRV-22 Datos abiertos sin celdas pequeñas

- **Requisito.** Los conteos publicados DEBEN suprimir las celdas con menos de 5 denuncias y
  redondearse; NO DEBEN incluir folios, fechas con hora ni texto libre.
- **Modo.** Pasivo.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** `GET` de los datos abiertos del nodo (ruta de `estandar/openapi.yaml`);
  revisión de que cada conteo sea 0 o al menos 5 y, si el nodo declara redondeo, múltiplo de su
  base; revisión de columnas.
- **Resultado.** `cumple` si ningún conteo está entre 1 y 4 y no hay columnas prohibidas;
  `no_cumple` en otro caso; `no_aplica` si el nodo no publica datos abiertos.
- **Fundamento.** SESNA S-06; Bases de la PDN, arts. 60 y 61. Una celda con una sola denuncia de un
  municipio pequeño identifica a quien denunció.
- **SIGILO.** **Cumple.** `apps/server/src/routes/open-data.test.ts`; `e2e/open-data.spec.ts`.

### PRV-23 Caracteres invisibles en los hechos

- **Requisito.** La ventanilla DEBE eliminar caracteres invisibles y homoglifos de los hechos antes
  de enviarlos, y el nodo DEBERÍA rechazar o normalizar los que lleguen.
- **Modo.** Conformidad.
- **Validador.** Manual (pendiente de automatizar).
- **Procedimiento.** Con navegador, escribe en los hechos un texto sintético con U+200B, U+200D,
  U+2060 y U+FEFF, envía y revisa el cuerpo de la petición. Por la API, envía otra denuncia con esos
  caracteres y observa la respuesta.
- **Resultado.** `cumple` si el cuerpo del navegador no los contiene y la API rechaza o normaliza;
  `advertencia` si la API los acepta sin que se pueda observar lo que guarda; `no_cumple` si el
  navegador los envía.
- **Fundamento.** SESNA S-03; modelo de amenazas A04. Un documento repartido con marcas invisibles
  distintas por persona (trampa del canario) delata a quien lo copia.
- **SIGILO.** **Parcial.** La ventanilla los elimina (`packages/huella`); el servidor los acepta tal
  cual.

### API-01 Conformidad con el contrato

- **Requisito.** Las rutas del nodo DEBEN responder conforme a `estandar/openapi.yaml`: rutas,
  métodos, estatus, tipos de contenido y esquemas de cuerpo. NO DEBE haber rutas públicas fuera del
  contrato.
- **Modo.** Conformidad.
- **Procedimiento.** Para cada operación pública del contrato, envía una petición válida con datos
  sintéticos (resolviendo la prueba de trabajo cuando se exige) y valida estatus y cuerpo contra el
  esquema; prueba `GET` a rutas comunes no documentadas bajo el prefijo de la API
  (`/api/v1/internal`, `/api/v1/admin`, `/api/v1/debug`, `/api/v1/metrics`,
  `/api/v1/swagger.json`). Fuera del prefijo (incluidas otras versiones como `/api/v0`), una
  ventanilla de una sola página responde su `index.html` a cualquier ruta, así que esas rutas se
  revisan a mano.
- **Resultado.** `cumple` si todas las respuestas validan y las rutas no documentadas responden 404;
  `no_cumple` con la lista de diferencias.
- **Fundamento.** Bases de la PDN (especificación por diccionario y OpenAPI); SESNA S-11;
  API9:2023.
- **SIGILO.** **Cumple.** `estandar/openapi.yaml` se genera desde `packages/contracts`; el validador
  en modo conformidad compara 29 respuestas de la referencia sin diferencias
  (`estandar/reportes/referencia-2026-11-05.json`).

### API-02 Errores comunes sin datos sensibles

- **Requisito.** Todo error DEBE seguir el esquema común (`error.code` del catálogo y
  `error.message` fijo) y NO DEBE incluir trazas, rutas internas, consultas, versiones ni datos de
  la petición.
- **Modo.** Conformidad.
- **Procedimiento.** Envía JSON mal formado, tipo de contenido incorrecto, cuerpo mayor al límite,
  ruta inexistente, método no permitido y un folio con un marcador sintético; valida cada respuesta
  contra el esquema y busca patrones de traza (`at `, `node_modules`, `/src/`, `Error:`,
  `SQLITE`, `SELECT `) y el marcador.
- **Resultado.** `cumple` si todas validan y no hay patrones; `no_cumple` con la respuesta.
- **Fundamento.** ASVS V7.4.1; API8:2023; LGRA art. 91.
- **SIGILO.** **Cumple.** `apps/server/src/http/errors.ts`; `apps/server/src/app.test.ts` («responde
  404 uniforme a rutas desconocidas»).

## Lo que una verificación automática no puede probar

Un reporte del validador con todo en `cumple` no significa que una persona denunciante esté
protegida. Significa que no se encontraron los fallos que se pueden ver desde fuera. En concreto:

- **El contenido identifica.** Ningún validador sabe si el relato contiene un detalle que solo
  conocen tres personas, ni si una foto muestra un reflejo o una pantalla con un nombre (SESNA S-03).
  Lo atienden el revisor de texto y la vista «Así te verá la autoridad», con decisión humana.
- **Lo que pasa dentro del nodo.** Desde fuera no se ve si el proxy registra la IP, si los respaldos
  están cifrados, quién tiene la llave privada ni si alguien abre identidades sin pasar por la ruta
  registrada. Eso es revisión manual del perfil de seguridad (SEC-02, SEC-11, SEC-22).
- **Código distinto para personas distintas.** El validador ve el código que le sirven a él; un
  servidor comprometido puede servir otro a una víctima concreta (SEC-36).
- **Análisis estático incompleto.** La búsqueda de cadenas en scripts no detecta código ofuscado o
  cargado después; un resultado limpio en modo pasivo es un indicio, no una prueba.
- **Tiempo de respuesta.** Una medición desde la red del validador no descarta diferencias de
  tiempo que sí se midan desde más cerca.
- **El dispositivo y la red de la persona.** Extensiones, equipos administrados, inspección TLS en el
  trabajo y respaldos de fotos en la nube quedan fuera de lo que una aplicación web controla
  (modelo de amenazas B03 a B08).
- **Muestras pequeñas.** Tres folios no prueban aleatoriedad; solo descartan contadores y prefijos
  evidentes.
- **El cumplimiento legal.** Que la autoridad respete los plazos, la confidencialidad del art. 91 y
  la prohibición del art. 64, fracción III, de la LGRA depende de personas e instituciones.

## Estado de SIGILO

| Estado  | Verificaciones                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Cumple  | PRV-01 a PRV-19 (PRV-03 con la instalación; PRV-10 sin prueba E2E propia), PRV-21, PRV-22, API-01, API-02 |
| Parcial | PRV-20 (el nodo no ve la imagen cifrada; limpia el navegador), PRV-23 (solo en el navegador)              |
