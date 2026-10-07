# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

## [0.9.1] - 2026-10-07

### Corregido

- Datos abiertos fallaban en Node 22: el SQLite integrado no acepta reutilizar el parámetro `?1`.
- Prueba del bloqueo del servidor independiente del tiempo encendido de la máquina.
- CI con matriz de Node 22.18 y la versión más reciente.

## [0.9.0] - 2026-10-07

Versión candidata a la entrega del Datatón Anticorrupción 2026.

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
- Prueba de trabajo para los mensajes de la persona denunciante (propósito `message`).
- `verifyEventInChain` en core y ruta `GET ledger/events?since=AAAA-MM-DD` para verificar la
  bitácora desde el día de recepción.
- Paginación `offset`/`limit` en el listado de la autoridad.
- Código `ledger_day_full` (503) y tope de 200 000 eventos pendientes por día.
- Variables `SIGILO_POW_MAX_BITS` (24) y `SIGILO_EVIDENCE_RETENTION_DAYS` (30).
- Huella Cero: categoría `compatibility_form`, `PUNCTUATION_CONFUSABLES`, `LEGITIMATE_MARKS` y la
  opción `shouldRemoveUncomposedMarks` para la limpieza manual.
- Web: `sendReporterMessage(request, proof)`, `listComplaints(token, offset, limit)`,
  `getLedgerSince` y `loadTrackingLedger`.
- `powSolveSeconds` y `SLOW_DEVICE_HASHES_PER_SECOND` (50 mil hashes por segundo) en core, y guía de
  calibración de la prueba de trabajo en `docs/integracion-s5.md`.
- `ComplaintDetail.evidenceDeletionOn`, visible en el panel de la autoridad.
- Migración 5: índice `ledger_events (at, seq)`.
- Comparación con anclas publicadas en el seguimiento y en el buzón de la autoridad.
- Huella Cero: dígitos de cualquier sistema a ASCII, aviso de letras modificadoras en contexto
  latino, «ꞓ», «ǃ» y «∙», «ː» según el contexto y heurística del saltillo
  (`hasIndigenousFeatures`).
- Acción «Descartar pruebas» de la autoridad: `POST authority/complaints/:folio/evidence/discard`
  (`ROUTES.authorityEvidenceDiscard`, `DiscardEvidenceResponse`), evento `evidence.discarded`
  (`{ folio, count, discardId }`), `TrackingView.evidenceDiscards`,
  `ComplaintDetail.storedEvidenceCount` y panel con confirmación accesible.
- Migración 6: registro de solo agregar `evidence_discards`.
- Purga de las pruebas pendientes de un reto que vence sin denuncia (al vencer más 30 minutos,
  `CHALLENGE_UPLOADS_GRACE_MS`), con registro en memoria por reto (`createChallengeUploads`).
- `PowGuard.check` (comprueba sin gastar) y `PowReceipt` devuelto por `verify`.
- Motivo `anchor-not-comparable` en `verifyEventInChain`, `verifyEventWithAnchors` en la web y
  estado `anchors-not-comparable` en `verifyReporterKeys`.
- `MAX_POW_ADAPTIVE_SPAN_BITS` (2) y aviso al operador ante pendientes de la bitácora con fecha
  futura.
- `docs/historial-de-seguridad.md`: resumen de las rondas de revisión para la presentación.

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
- Migración 4: tablas privadas `WITHOUT ROWID`, `secure_delete`, columna `received_month` indexada y
  semilla de ruido por mes; rechaza bases con datos anteriores e indica `demo:reset -- --yes`.
- La prueba de trabajo es adaptativa: sube un bit por cada duplicación de la carga de la última hora
  sobre su umbral, hasta 24 bits, y se endurece y acorta su vigencia cuando se llena la lista de
  retos gastados.
- Los frenos extremos por hora (3000 denuncias, 10 000 pruebas, 6000 mensajes) solo cuentan
  escrituras confirmadas.
- El cierre diario de la bitácora encadena en lotes de 5000, vuelve a barajar si se interrumpe y no
  avanza la cabeza mientras un día tenga pendientes; después hace un checkpoint del WAL.
- `verifyChain` exige fechas no decrecientes (motivo `date`).
- El seguimiento verifica el tramo desde su día de recepción en lugar de toda la bitácora.
- Datos abiertos con redondeo aleatorio insesgado y semilla secreta por mes; el CSV se guarda en
  caché hasta el siguiente congelado.
- `SIGILO_EVIDENCE_RETENTION_DAYS` reemplaza a `SIGILO_UNTRACKED_RETENTION_DAYS`, que ahora se
  rechaza; reserva del 10 % de la cuota, pendientes hasta el 25 %, tope por denuncia y desalojo de
  las denuncias sin atender más antiguas.
- El registro agregado excluye `GET keys` y la bitácora.
- `server.lock` se crea con `wx`, se renueva cada 10 minutos y tiene criterios de abandono.
- Huella Cero aplica NFC en general y NFKC solo en formas de compatibilidad que marcan, amplía el
  mapa de confusables (Lisu, silabario canadiense, copto, tifinagh y versalitas), cambia el criterio
  de `mixed_script` y conserva «º», «ª», superíndices, fracciones, el saltillo y las vocales con
  marcas legítimas de lenguas indígenas de México.
- Prueba de trabajo con propósitos `complaint` y `message`: un reto por denuncia cubre sus hasta 10
  pruebas y `purpose=evidence` responde 400. `verify` exige `bits >= max(base, actual - 1)`, el
  máximo adaptativo baja a 20 bits y la vigencia es `margen + 4 · p95` (margen de 5 minutos que
  baja hasta 1 minuto bajo presión).
- Se retiran los frenos globales de denuncias, pruebas y mensajes; quedan los límites por folio de
  mensajes y de fallos de autenticación.
- Sin reserva ni desalojo de pruebas: si no caben, `507 storage_full`; se conserva la retención de
  30 días.
- La retención de 30 días aplica también a las denuncias `archived`.
- Cada subida de pruebas cuenta como carga para la dificultad adaptativa.
- El uso de un reto se gasta solo después de validar el cuerpo de la petición.
- La fecha mínima de un evento de la bitácora es el día siguiente al último encadenado, sin el
  último día con pendientes; `MailboxMessage.sentOn` sigue la fecha del evento.
- `SIGILO_POW_MAX_BITS` no puede superar `SIGILO_POW_BITS + 2`; sin definir, es `min(20, base + 2)`.
- Los eventos de la autoridad quedan exentos de `ledger_day_full`.
- Las lecturas ya no publican la bitácora: una tarea programada cada 10 minutos (cada segundo con el
  reloj de pruebas) cierra los días en lotes de 1000, cediendo el event loop entre lotes.
- Fechas monótonas de los eventos: la mayor entre hoy, el día siguiente al último encadenado y el
  último día con pendientes.
- `server.lock` se publica con `linkSync` desde un temporal, con gracia de 10 s.
- Huella Cero: «º» y «ª» entre letras, superíndices antes de un dígito, marcas legítimas apiladas,
  colapso de tabuladores y saltos de línea, tonos «ˉ», «ˊ», «ˋ» conservados y conversión de
  homoglifos solo en contexto latino. La web cuenta como quitable solo lo que desaparece y muestra
  aparte lo que hay que revisar.

### Corregido

- Accesibilidad WCAG 2.0 AA: barra fija mínima, foco gestionado tras cada acción, anunciador global,
  obligatorios marcados, periodo agrupado, recibo accesible y diálogo antes de perder el recibo.
- El límite de intentos del seguimiento ya no bloquea a la persona denunciante legítima.
- La verificación de la copia limpia ya no cuenta como metadato el perfil sRGB genérico de Chromium.
- Carrera en el cambio de estatus; fugas de URL de objeto y respuestas tardías en el panel.
- El inicio rápido del README funciona en un clon nuevo.
- El aviso de retención del panel ya no sugiere que cambiar el estatus «conserva» las pruebas sin
  explicar qué pasa al archivar.
- El comentario de `PUBLISH_BATCH_SIZE` refleja la latencia medida (unos 250 ms por lote).

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
- Una copia de la base ya no conserva el orden de llegada (`WITHOUT ROWID`, `secure_delete`, WAL).
- Pertenencia de eventos verificada hasta la cabeza firmada y las anclas (`verifyEventInChain`).
- Prueba de trabajo adaptativa también en los mensajes, contra la saturación.
- Redondeo aleatorio de los datos abiertos contra el relleno de celdas (garantía probabilística).
- Cuota de almacenamiento con reserva y desalojo, y tope de pendientes por día.
- Ningún tope global sin identidad puede usarse para dejar fuera a todas las personas.
- Las pruebas asociadas a una denuncia nunca se borran para hacer sitio.
- La autoridad puede escribir aunque el día de la bitácora esté lleno.
- Un reto de baja dificultad ya no sirve después de que la carga sube dos bits o más.
- La cuota de pruebas ya no queda bloqueada para siempre por spam archivado; la autoridad puede
  liberarla descartando pruebas, y el descarte queda a la vista.
- Llenar las pendientes ya no bloquea las subidas de 24 a 48 h.
- El seguimiento y el buzón ya no dicen que la bitácora coincide con un ancla que no compararon.
- Un salto del reloj del servidor hacia adelante ya no deja la bitácora detenida.
- Una petición mal formada ya no gasta el reto de la persona.
