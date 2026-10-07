# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado

- Estructura del monorepo, convenciones, decisiones de arquitectura (ADR), plan de trabajo,
  integración continua y hook local de términos prohibidos.
- `@sigilo/contracts`: esquemas zod y rutas de la API v1, catálogos de entidades INEGI, municipios
  de Querétaro, entes sintéticos y conductas en lectura fácil agrupadas por situación.
- `@sigilo/core`: sobres HPKE (RFC 9180), identidad sellada con relleno fijo, recibo de 8 palabras
  BIP39 en español con derivación HKDF, buzón firmado con Ed25519, comprobante firmado, bitácora
  encadenada con cabeza firmada y vectores de prueba fijos.
- `@sigilo/huella`: detección y eliminación de caracteres invisibles y homoglifos, revisor de
  reidentificación, política de archivos, inspección de metadatos, recodificación de imágenes,
  conversión de PDF a imagen sin red y semáforo de riesgo.
- `@sigilo/server`: servidor de referencia con Hono y `node:sqlite`, bitácora de solo agregar,
  buzón, apertura de identidad registrada, datos abiertos y servicio de la web en el mismo origen
  (`SIGILO_WEB_DIST`).
- `@sigilo/web`: asistente de denuncia con anonimato graduado, «Así te verá la autoridad», recibo
  con confirmación, seguimiento con buzón e historial de aperturas, panel de autoridad, datos
  abiertos y verificador de la bitácora con comparación contra anclas.
- Scripts `keys:generate`, `demo:reset` y `ledger:anchor`.
- Pruebas E2E con Playwright y axe, incluidas foco, accesibilidad y trasplante de sobres.
- Documentación: arquitectura, modelo de amenazas, especificación criptográfica, interfaces,
  integración con el S5, accesibilidad, datos sintéticos, declaración de uso de IA y guion de la
  demostración.
- Prueba de trabajo tipo hashcash para denuncias y pruebas: `GET /api/v1/pow/challenge`, retos
  firmados con HMAC de un solo uso y cabecera `X-Sigilo-Pow`, resuelta en un Web Worker.
- `receiptTag` en `identity.opened` y conciliación de aperturas en el seguimiento.
- Verificación de las llaves de la persona denunciante en el panel contra el evento
  `complaint.received` publicado, también en modo anónimo.
- Cuota total de almacenamiento de pruebas (`SIGILO_EVIDENCE_QUOTA_BYTES`, `507 storage_full`) y
  retención opcional de pruebas sin seguimiento (`SIGILO_UNTRACKED_RETENTION_DAYS`).
- Registro de peticiones configurable (`SIGILO_REQUEST_LOG`), agregado por hora por omisión.
- Bloqueo `server.lock` del directorio de datos y `anchors/.gitkeep`.
- Mapa de confusables (subconjunto de UTS #39) y categorías `control`, `private_use`, `unassigned`,
  `line_separator`, `uncomposed_mark`, `confusable` y `typographic_variant` en Huella Cero.
- En core: `receiptTagFor`, `pendingEventFor`, `chainEvent`, `identityOpenedPayload`,
  `identityOpenedPayloadDigest`, `reconcileIdentityOpenings`, `sealedIdentityDigest`,
  `submissionDigestInput`, `submissionDigestFromDetail`, `randomInt`, `shuffle` y el módulo `pow`.
  En contracts: `primaryOffenseCode`, `pow.ts` y `POW_HEADER`.

### Cambiado

- La bitácora pública se publica por lotes diarios: solo incluye eventos de días anteriores.
- Los datos abiertos incluyen solo meses cerrados, con conteos redondeados a múltiplos de 5.
- El buzón usa relleno fijo de 4096 bytes y una secuencia por remitente.
- La web usa un router en memoria y los catálogos de `@sigilo/contracts`.
- Interfaz en lectura fácil y lenguaje inclusivo; fechas sin hora o en la hora del centro de México.
- Requisito mínimo: Node.js 22.18.
- `keys:generate` regenera siempre las llaves fijadas y crea `apps/server/.env` con un token
  aleatorio.
- Migración 3: los eventos del día quedan pendientes y se encadenan barajados al cerrar el día; la
  migración rechaza bases con datos anteriores e indica `demo:reset`.
- El comprobante firma `payloadDigest` en lugar de `ledgerSeq`, y `submissionDigest` se calcula con
  el sobre de identidad resumido.
- `identity.opened` incluye `openingId` y `receiptTag`; `complaint.status_changed`, `changeId`.
- `TrackingView.receivedEvent` es opcional; `ComplaintDetail` incluye `sealedIdentityDigest` y
  `receivedEventSeq`; `OpenIdentityResponse` incluye `openingId`.
- Datos abiertos congelados por mes (`open_data_months`), conducta guardada con su clave principal y
  suprimidos redondeados por mes.
- `ledger:anchor` recalcula la cadena desde el ancla anterior; la forma preferida es leer la API
  (`SIGILO_ANCHOR_URL`) y da un mensaje claro si no hay base.
- `demo:reset` exige `--yes` (o el marcador `.sigilo-demo`) y no corre con el servidor en marcha.
- Los limitadores tienen tope LRU de 100 000 llaves y barrido amortizado; las credenciales correctas
  siempre se aceptan.
- Huella Cero normaliza la tipografía por omisión (`shouldNormalizeTypography`) y `\r\n` a `\n`; la
  copia limpia acepta solo el perfil sRGB genérico del navegador (`allowGenericSrgbProfile`).

### Corregido

- Accesibilidad WCAG 2.0 AA: barra fija mínima, foco gestionado tras cada acción, anunciador global,
  obligatorios marcados, periodo agrupado, recibo accesible y diálogo antes de perder el recibo.
- El límite de intentos del seguimiento ya no bloquea a la persona denunciante legítima.
- La verificación de la copia limpia ya no cuenta como metadato el perfil sRGB genérico de Chromium.
- Carrera en el cambio de estatus; fugas de URL de objeto y respuestas tardías en el panel.
- El inicio rápido del README funciona en un clon nuevo.

### Seguridad

- El sobre de identidad queda vinculado a `authVerifier`, `reporterKeys` y `contentDigest`, con
  índice único de `authVerifier`: se cierra el trasplante entre denuncias.
- Secuencia del buzón en el AAD y en la firma contra repetición y reordenamiento.
- Publicación diaria y anclaje de la bitácora; el seguimiento verifica su evento de recepción.
- Freno global progresivo en lugar de bloqueo, límites separados por fallos y por mensajes, cuotas de
  envío y purga de pruebas pendientes.
- Catálogos validados en el servidor: no se publica texto arbitrario en los datos abiertos.
- Detección ampliada de caracteres invisibles y limpieza automática de hechos y mensajes.
- Fallo cerrado de la limpieza de pruebas y validación del tamaño de la identidad antes de subir.
- Consulta ligera del verificador para evitar un oráculo de existencia por tiempo.
- CORS desactivado por omisión y cabeceras completas para la web servida.
- El reloj de pruebas `SIGILO_TEST_CLOCK_FILE` se rechaza con `NODE_ENV=production`.
- Orden de llegada oculto dentro del día por encadenado barajado (Fisher-Yates criptográfico).
- Aperturas de identidad ocultas por el servidor detectables con `receiptTag`.
- Llaves de la persona denunciante verificadas contra el registro público en ambos modos.
- Prueba de trabajo contra envíos masivos, cuota de almacenamiento y retención.
- Registro agregado por omisión para no correlacionar envíos.
- Homoglifos aislados y caracteres de control, uso privado y no asignados eliminados.
- El reloj de pruebas solo se acepta con `SIGILO_E2E=1` o `NODE_ENV=test`, con un archivo seguro y
  un desfase de 0 a 400 días.
