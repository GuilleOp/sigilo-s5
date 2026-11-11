# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado

- Ayudas automáticas al escribir el relato: cuatro partes (qué pasó, cuándo, dónde, qué efecto
  tuvo) que se marcan solas y conductas sugeridas por las palabras, todo en el navegador.
- «Ninguna se parece» (`SIN-CLASIFICAR`): la denuncia llega al buzón general, que la clasifica; aviso
  de vía propia si el relato menciona tortura o desaparición.
- Catálogo de conductas cotejado con la LGRA (DOF 15-12-2025) y el CPF (DOF 13-03-2026): LGRA 64
  Bis, 64 Ter, 64 Quáter y 73, y CPF 225; «¿Quién lo hizo?» acorta la lista.
- El detalle de la denuncia trae `s5References`: artículos de la ley de responsabilidades y del
  código penal de la entidad con su id del catálogo de faltas del S5 (95 % de 3,559 entradas).
- Cada autoridad entra al panel con su propia llave, comprobada contra el directorio firmado, y
  puede crear su par en el navegador («Crear mis llaves»).
- Cuentas por función: recepción e investigación juntas, substanciación y resolución separada
  (LGRA arts. 3 y 115) y operación del nodo; la demo pasa de 16 a 13 cuentas con nombres claros.
- Buzón general como respaldo: sin autoridad competente en el directorio, la denuncia llega al
  buzón del nodo de la entidad, que la turna (Bases de la PDN, arts. 56 y 58).
- Corte nacional de datos abiertos: el enrutador suma el CSV agregado de cada nodo y el
  observatorio lo muestra (Bases de la PDN, arts. 60 y 61).
- Un solo campo para elegir oficina y conducta (escribir y elegir en la misma lista).
- Personas ciudadanas (`docs/personas-ciudadanas.md`): aviso propio en la revisión para quien no
  trabaja en la oficina, con información sobre el soborno (LGRA, arts. 66, 88 y 89) y las
  represalias; el revisor de frases marca números de trámite, placas, direcciones y «mi negocio»;
  caso de la ventanilla en la demostración, con dos personas corroboradas.
- Confianza verificable (`docs/confianza-verificable.md`): en lugar de pedir confianza, la web da
  formas de comprobar el anonimato.
  - Paso 1: invitación a escribir en modo avión; los pasos 1 a 4 y la limpieza de fotos funcionan
    sin conexión.
  - Paso 4: «Lo que sale de tu equipo», con lo que viaja, lo que nunca sale y, en la red, una
    muestra real del relato cerrado con la llave del nodo destino.
  - Inicio: «¿Quién sabe qué de ti?», con lo que ve cada parte del camino y las dudas más comunes,
    y «Lo que SIGILO no puede hacer por ti».
  - `/verificar`: cuántas denuncias llegaron y cuántos nombres se abrieron o entregaron, contados
    con la bitácora ya comprobada.
- Catálogo de conductas alineado con el del S5: nepotismo (LGRA 63 Bis), simulación de acto
  jurídico (LGRA 60 Bis) y CPF 216, 217 Bis, 217 Ter y 222 Bis; equivalencias por entidad con el
  catálogo de faltas del S5 (`packages/contracts/src/s5/equivalencias-faltas.json` (publicado en la web como `/datos/s5/equivalencias-faltas.json`)), que el panel muestra como «En
  la ley que aplica»; y la pregunta «¿Quién lo hizo?» que acorta la lista de conductas.
- Alta de autoridades, pasos 1 a 3: página «Solicitar alta de mi institución» (`/solicitar-alta`)
  con las llaves creadas en el navegador (solo el candado viaja) y folio y huella al enviar;
  función de cuenta «Operación del nodo», que entra sin llave, no ve denuncias y aprueba solo con
  la huella confirmada por teléfono o rechaza con motivo; al aprobar entrega la entrada propuesta
  del directorio. Rutas `registrationRequests` (con prueba de trabajo `registration`),
  `operationRegistrations` y `operationRegistrationDecision` en el estándar.
- Recorrido guiado, con la forma del tutorial de la bandeja del S5 (paso «n/N», barra de avance,
  Anterior y Siguiente), pero a pedido y sin guardar nada: para quien denuncia (desde el inicio o
  «Accesibilidad») y para el panel según la función de la cuenta. Resalta lo que explica y Esc lo
  cierra.
- Vocabulario de la bandeja del S5: el catálogo publica `s5Code` (`SIN_TURNAR`, `TURNADA`,
  `ACEPTADA`…), el panel lo muestra en la columna «Turnado» y titula la lista según la función
  («Bandeja general de turnado», «Denuncias asignadas»). Equivalencias en `docs/integracion-s5.md`.

### Cambiado

- Capa visual moderna (`styles/features/modern.css`), tras compararla con la versión de pruebas
  del S5: fondo con profundidad (brillo y ondas de líneas, sin recursos externos), barra superior
  translúcida, navegación sin mayúsculas, superficies con borde fino y sombra suave, botones sin
  bordes gruesos, avisos sin raya lateral y tarjetas de acción grandes en el inicio. El alto
  contraste no cambia.
- Distintivo del perfil en la barra: «Vista pública», «Persona denunciante», «Autoridad · sin
  sesión», «Recepción y turnado», «Investigación» o «Supervisión» (con la institución en pantallas
  anchas), con un punto de color y el nombre siempre en texto.
- Sin repeticiones: el avance del formulario se ve en las píldoras y en la barra de abajo («Paso n
  de 5» queda solo para lectores de pantalla); en el observatorio, cada tabla equivalente a una
  gráfica queda en «Ver como tabla», la tabla de entidades y la de indicadores se pliegan y las
  descargas pasan a «Datos abiertos»; el inicio ya no repite los enlaces del menú y del pie; el
  panel de autoridad no muestra la navegación de quien denuncia.
- Nombres coherentes: «Mi denuncia» (antes «Dar seguimiento») y «Registro público» (antes
  «Verificar bitácora»).

- Menos texto para quien denuncia: una frase por bloque y el detalle a un toque («¿Por qué?»,
  «Ver…»), sin palabras técnicas a la vista. El inicio pasa de unas 1,000 palabras a unas 100, con
  tres promesas y la página nueva «Cómo te cuidamos» (quién puede saber qué, cómo comprobarlo,
  límites, protecciones y asesor). El paso 4 pasa de unas 360 a unas 90 palabras: semáforo en una
  frase, «Tu denuncia llega a», aviso ciudadano compacto y la vista de la autoridad y lo que sale
  del equipo cerradas. Ayudas del paso 2 más cortas.
- Las preferencias del final de cada pantalla pasan a un menú «Accesibilidad» en la barra fija,
  como en la versión de pruebas del S5: contador de ajustes, alto contraste, tamaño del texto,
  espaciado, lectura fácil, lector en voz alta (solo voces del equipo), guía de teclado y modos de
  uso, con paneles flotantes y un botón de tema. En celular la barra ya no parte la marca ni la
  salida rápida en dos renglones.

### Corregido

- El panel de la autoridad mostraba «Las llaves no coinciden» en toda denuncia con corroboración
  ciega (Marta, Luis y los casos ciudadanos): el digesto del envío incluía la corroboración y el
  detalle no. Ahora entra su digesto (`corroborationDigest`, migración 13), que también recibe la
  supervisora; la autoridad no ve la etiqueta.

## [1.0.1] - 2026-11-05

### Corregido

- El panel de la autoridad mueve el foco después de recargar el detalle (antes podía perderse si
  la recarga tardaba).
- La integración continua instala Chromium para las pruebas del validador.
- La prueba del reenvío del contenedor del enrutador ya no espera conexiones keep-alive.
- La ficha de contexto nombra la fuente real de la gravedad y de la corroboración.

## [1.0.0] - 2026-11-05

Versión entregada al Datatón Anticorrupción 2026: Estándar S5, red federada, protección de quien
denuncia con datos de la PDN, rendición de cuentas de la autoridad, datos abiertos nuevos e
interfaz en la familia visual del S5.

### Seguridad

- Sexta ronda de revisión (Etapa 5): sección G del modelo de amenazas (G01 a G11, actores A9 y
  A10, riesgos residuales 17 a 19), ajustes al perfil de seguridad y tabla H1 a H11 en
  `docs/historial-de-seguridad.md`.
- H3 (G03): el índice de coincidencias ya no sirve de oráculo de «¿hay denuncias contra X?» ni
  suma fuentes por denuncias de sondeo: una coincidencia cuenta y se revela solo cuando el nodo la
  confirma como aceptada (`POST …/indice/confirmaciones`), pasan 30 días según el reloj del índice
  o es una custodia; el nodo da de baja el spam (`POST …/indice/bajas`). La custodia se libera solo
  con fuentes confirmadas (`confirmedOtherSources`).
- H4 (G04): el enrutador y cada testigo descargan `ledgerEvents` entre la cabeza anterior y la
  nueva de un nodo y rechazan, registrándolo, una historia reescrita con secuencia mayor o que no
  se puede verificar (`packages/red/src/node-history.ts`).
- H10 (G10): `verifySignedDirectory` acepta un serial mínimo y una antigüedad máxima fijados en la
  raíz de confianza y el `validUntil` del directorio; `npm run red:demo` fija el serial vigente en
  `network-trust.json`.

### Cambiado

- Revisión de seguridad de la Etapa 5 (hallazgos H1 a H11 del servidor):
  - H1: un turnado entre nodos cede la competencia solo con el comprobante del destino ligado a la
    misma denuncia (digesto, recibo, llaves y hechos); sin él vence a los 10 días hábiles y se escala
    (`escalation.transfer-unconfirmed`).
  - H2: `escalation.declined-serious` escala de inmediato el cierre que declina una falta grave;
    `escalation.archive-signals` cubre esos cierres.
  - H3: la corroboración solo la ve la autoridad competente después de aceptar, en intervalos, y cada
    consulta queda en la bitácora; el nodo confirma ante el índice al aceptar y pide la baja firmada
    al cerrar como improcedente o acumulada.
  - H5: la justificación propia ante un conflicto ya no apaga la regla y se escala
    (`escalation.conflict-justified`); la autoridad que se excusa solo puede reasignar o turnar.
  - H6: solo un mensaje posterior al archivo o a la calificación cuenta como su notificación.
  - H7: el sobre de identidad del recurso pide dos aprobaciones (una de supervisión) dentro de la
    ventana del recurso, y toda entrega registra `identity.released`, visible en el seguimiento.
  - H8: la contraseña correcta entra aunque un tercero haya agotado el límite de intentos.
  - H9: no se cuentan por hora las rutas de quien denuncia, de la red ni del evaluador.
  - H10 (web): el directorio se verifica con el día de hoy y la frescura de la raíz.
  - H11: el buzón de red solo acepta sobres con el HMAC del enrutador y nunca turna directo a una
    supervisora.
  - Migraciones 10, 11 y 12.

- Ajuste legal con el texto vigente de la LGRA: la inconformidad (art. 102) procede contra la
  calificación de no grave, no contra un archivo. Nueva calificación con acuerdo en el trámite
  (migración 9), `POST tracking/appeal` con apertura de identidad solo para el recurso (art. 109),
  plazos de inconformidad (art. 103) y de la Sala (art. 107), y regla
  `escalation.downgrade-signals` (AUD-01, AUD-03 y AUD-04; art. 64, fr. I). `escalation.conflict`
  corre desde el primer acto resolutivo y explica el art. 58. Las alertas de inactividad en la
  investigación ya no citan la caducidad, que solo aplica después de admitido el informe
  (art. 74); el art. 64, fr. II, dice «no inicien el procedimiento correspondiente».

- El panel de autoridad ya no usa `SIGILO_AUTHORITY_TOKEN`; el servidor no arranca si se define.
  Se retiraron `POST authority/complaints/{folio}/status` y `.../identity`, reemplazados por
  `.../procedure` y las rutas de apertura 2 de 3. Migración 7 de la base.
- Las peticiones rechazan campos desconocidos (`z.strictObject`), también anidados (SEC-18).
- `remainingDays` y `evaluateDeadline` cuentan un plazo vencido en la misma unidad que el aviso
  (`remainingUnit`).
- HSTS exige al menos un año y se envía con `SIGILO_HTTPS=1` (SEC-31, PRV-03).
- El servidor rechaza caracteres invisibles en los hechos (PRV-23).
- OpenAPI: `limit` con máximo 500 y `Cache-Control: no-store` en cada respuesta; el patrón del
  folio sale de `FOLIO_PATTERN`.

### Agregado

- Web, piezas de B y C en el lenguaje de A: recibo como talón perforado que se imprime solo; sellos
  fechados con nota al margen en las etapas del seguimiento; regla del plazo; sello de lacre con el
  libro de aperturas en «Tu identidad»; grafo del conflicto de interés en el panel; mapa de nodos de
  las 32 entidades en el observatorio. «Preferencias» al final de cada pantalla; el seguimiento
  ordena estado, etapas, plazos, identidad, mensajes y anclajes (plegados), y muestra un solo
  estado vigente.
- Contratos: `IdentityOpeningRequestView.purpose` (`authority` o `appeal`) distingue la solicitud
  de apertura para el recurso de inconformidad.

- Web, dirección visual A «Puente PDN → S5»: distintivos de sistema con anillo abierto (S1, S2,
  S3, S5, S6, 69B) en las verificaciones y la ficha de contexto; identidad sellada como anillo de
  tres llaves con su registro de aperturas y de entregas del sobre (`identity.released`) en el
  seguimiento y en el panel; grupo de anonimato como constelación; «Tu escudo» y constelación
  decorativa en el inicio; ruta de etapas con los plazos en el seguimiento; navegador de pasos
  inferior; contadores sobre banda en el observatorio; Mulish autoalojada (OFL); selector de tema
  (claro, oscuro, alto contraste o «como mi sistema»), recordado en el navegador salvo en quiosco.
- Panel: la supervisora ve sus escalamientos; el recurso de inconformidad pide dos aprobaciones (al
  menos una de supervisión) antes de entregar el sobre (H7); una autoridad excusada solo puede
  reasignar, devolver o turnar.
- Seguimiento: el titular dice la etapa legal real (por ejemplo, «Calificación de la falta»).
- Web, ventanilla única por la red: con `apps/web/src/config/network-trust.json` (lo escribe
  `npm run red:demo`; `null` = un solo nodo) la web verifica el directorio del mismo origen,
  propone la autoridad competente con su razonamiento (la persona puede corregirla), cifra hacia el
  nodo destino y envía por el enrutador ciego. El seguimiento busca el folio en todos los nodos.
- Nodo: copia del directorio firmado (`GET /api/v1/red/directory`) y pasos sin cabeceras al
  enrutador (`POST /api/v1/red/relay`) y al evaluador OPRF (`GET .../evaluador/reto`,
  `POST .../evaluador/evaluaciones`), para que la web no pida nada a otro origen.
- Web: aviso del grupo de anonimato (un cargador y un fragmento por denuncia, servido en
  `/datos/grupos-anonimato/`) con su factor en el semáforo; corroboración ciega opcional con VOPRF
  en un Web Worker; seguimiento con etapas, plazos, reglas, escalamiento, ventana de inconformidad
  y turnado entre nodos; panel con ficha de contexto, conflicto (`respond_conflict`), señales del
  auditor, corroboración, sanción declarada y turnado que vuelve a cifrar en el navegador
  (SEC-19); observatorio `/observatorio`; modos de quiosco, asistida, poca conexión y lectura
  fácil; franja «Prototipo para el Datatón 2026 · no es el sistema oficial».
- El servidor de referencia es un nodo de la red federada: buzón de red `POST /api/v1/red/inbox`,
  registro ante el enrutador, cabeza en la bitácora nacional y cofirma como testigo
  (`@sigilo/red/witness`); varias autoridades por nodo con sus llaves del directorio verificado;
  turnado a otro nodo re-cifrado en el navegador (SEC-19) con `complaint.transferred` y el folio
  nuevo en el seguimiento. Migración 8.
- Contexto PDN en el nodo: ficha con prioridad explicable, conflicto de interés al turnar (alerta
  con excusa o justificación, LGRA art. 58) y verificación de la sanción declarada al cerrar
  contra S3. Fuentes sintéticas en la demostración o SQLite (`SIGILO_PDN_SOURCES`).
- Auditor en la tarea periódica con `audit.signal`, importación de acuerdos (`closures.imported`) y
  conteos para el observatorio; reglas `escalation.conflict` y `escalation.archive-signals`.
- Corroboración ciega en el nodo: registro firmado en el índice, avisos de coincidencia y «posible
  nuevo indicio» sobre un archivo (LGRA art. 100).
- `compose.yaml` con el evaluador y el índice; `npm run red:demo` con cuentas por nodo y reloj
  simulado; `npm run demo:seed` siembra el escenario de `docs/demo-escenario.md`.

- Nodo de varias autoridades del Estándar S5 (0.2.0): cuentas individuales por persona con su
  autoridad y su función (recepción y turnado, investigación, supervisión), inicio de sesión con
  scrypt, sesiones que vencen a los 15 minutos sin actividad o a las 8 horas, límite de 10 fallos
  por usuario y registro de seguridad sin IP (SEC-06, SEC-12, SEC-14, SEC-15, SEC-21).
  `npm run accounts:generate` crea las cuentas sintéticas de la demostración.
- Trámite con el catálogo: turnar, aceptar, reasignar, devolver al buzón general, avanzar de etapa
  legal y cerrar con uno de los seis motivos, su fundamento y el acuerdo en versión pública, con
  competencia por folio y notas públicas. El seguimiento muestra la línea de tiempo explicada, el
  cierre, los plazos (en curso, por vencer, vencido) y las reglas cumplidas.
- Apertura de identidad 2 de 3: dos personas distintas de la autoridad competente, cada una con su
  fundamento; el servidor solo entrega el sobre a quien aprobó (SEC-05).
- Motor de plazos y escalamiento con reglas públicas (`ESCALATION_RULES`) y segunda llave: la web
  cifra los hechos y las pruebas hacia la supervisora y el nodo los entrega solo cuando se cumple
  una regla de escalamiento (ADR 0007).
- `toMexicoCentralDay` en `@sigilo/core`: los plazos se cuentan en la hora del centro de México.
- `@sigilo/auditor` (ADR 0009, nivel B): reglas deterministas AUD-01 a AUD-08 que señalan con
  evidencia lado a lado y nunca deciden (cierre con plantilla por shingles y Jaccard, archivo contra
  pruebas, corroboración o datos confirmados de la PDN, calificación degradada con fundamento en la
  LGRA art. 64-I, plazos con el catálogo y `@sigilo/core`, actuación vacía, tasa de archivo en casos
  corroborados, concentración de archivos y movimiento antes de prescribir), umbrales publicados en
  `config/umbrales.json` y clasificación orientativa por palabras clave.
- Adaptador opcional de modelo abierto local (Ollama o llama.cpp server solo en 127.0.0.1),
  desactivado por omisión y con falla cerrada: texto como dato delimitado, salida validada con zod y
  contra el propio texto, descarte de toda salida fuera del esquema y doble de pruebas con
  respuestas maliciosas.
- Evaluación publicada del auditor (`npm run auditor:eval`, `packages/auditor/EVALUACION.md`) con un
  conjunto sintético etiquetado que incluye el escenario y casos difíciles.
- `AuditLedgerRecordSchema` en `@sigilo/contracts` (`audit.ts`): registro de bitácora de cada señal
  con la versión de las reglas o el digesto del modelo y los digestos de entrada y salida.
- Corroboración ciega (ADR 0006 y 0010): paquete `@sigilo/corroboracion` con la normalización y
  etiqueta de dominio del identificador (`servidor`, `rfc`, `ocid`), el cliente VOPRF de RFC 9497
  sobre `ristretto255-SHA512` (`ristretto255_oprf` de @noble/curves) validado con los vectores
  oficiales del apéndice A.1.2, el resumen difuso del relato con llave derivada de la salida VOPRF,
  las señales de independencia («posible mismo origen» y «posible campaña») y la custodia opcional
  (formato y máquina de estados, nivel B).
- Servicios `@sigilo/corroboracion-servicio` (`apps/corroboracion`, Hono y `node:sqlite`): evaluador
  OPRF con prueba de trabajo de un solo uso, tope diario opcional y conteos diarios firmados de
  días cerrados; índice de coincidencias que acepta solo registros firmados por nodos del
  directorio, cuenta fuentes independientes y deja avisos por nodo. Prueba de extremo a extremo
  del escenario (Marta y Luis: 2 fuentes; atacante: 1 con posible campaña) que inspecciona ambas
  bases.
- Grupo «Corroboración» en el Estándar S5 y campo opcional `corroboration` del directorio con la
  llave pública del evaluador. Sección «Corroboración ciega (VOPRF)» en `docs/criptografia.md`
  con el protocolo, las llaves, qué ve cada servicio, los riesgos y la integración pendiente.
- Red federada (ADR 0005 y 0007): paquete `@sigilo/red` con el directorio de autoridades firmado
  por la operación y cofirmado por testigos m de n, la propuesta de autoridad competente con su
  razonamiento (para el navegador), los sobres del enrutador ciego con tramos fijos, la bitácora
  nacional y el cliente del nodo (registro, cabeza y buzón de red).
- Enrutador ciego `@sigilo/enrutador` (Hono y `node:sqlite`): sirve el directorio, reenvía
  sobres opacos sin guardar contenido, IP ni cabeceras y con respuesta idéntica para cualquier
  destino, recoge las cabezas de los nodos y publica la cabeza nacional cofirmada 2 de 3, con
  pruebas de inclusión. Incluye el proceso de testigo.
- Grupo «Red» en el Estándar S5 (`estandar/openapi.yaml`, diccionario y ejemplos).
- `compose.yaml` y `docker/Dockerfile` multietapa sobre `node:22-bookworm-slim` (usuario sin
  privilegios, sin secretos en la imagen): enrutador, nodos Querétaro y Federal con su web y tres
  testigos. `npm run red:demo` genera las llaves sintéticas en `.red-demo/`.
- Guía en borrador `docs/guia-conecta-tu-estado.md` y sección «Red federada» en
  `docs/arquitectura.md`.
- Estándar S5 en `estandar/`: OpenAPI 3.1 (`openapi.yaml` y `openapi.json`) generado desde
  `packages/contracts` con `z.toJSONSchema`, diccionario de datos en Markdown y CSV con el formato
  de la PDN, catálogo del trámite en JSON, ejemplos sintéticos de cada cuerpo, vista local con
  Swagger UI sin CDN y `README.md` con la generación, la lectura y el versionado SemVer (0.1.0).
- Script `npm run standard:build` (con `-- --check`), validación del OpenAPI con
  `@apidevtools/swagger-parser` sin red y pruebas que fallan si `estandar/` no está al día, si un
  ejemplo no cumple su esquema o si el servidor no registra exactamente las rutas del estándar.
- Catálogo del trámite en `@sigilo/contracts`: flujo de gestión del S5 (buzón general, turnada,
  aceptada, reasignada, devuelta y cerrada con seis motivos), etapas legales de faltas
  administrativas y de hechos de corrupción, quién actúa, explicaciones en lenguaje sencillo y
  plazos de la LGRA con su fundamento (arts. 64, 74, 96, 100, 103 y 107).
- Días de descanso obligatorio de 2025 a 2028 (Ley Federal del Trabajo, art. 74) como lista
  explícita.
- `@sigilo/core` (`deadlines.ts`): vencimientos en días naturales, hábiles (calendario configurable),
  meses y años, y situación del plazo (en curso, por vencer o vencido).
- Descripciones en español en los esquemas de `@sigilo/contracts`.
- Validador del Estándar S5 (`tools/validador`, `npm run validate`): modo pasivo (PRV-01 a PRV-13)
  y modo conformidad (PRV-09, PRV-10, PRV-14, PRV-15, API-01 y API-02), reporte JSON con esquema y
  reporte HTML accesible. Reportes del demo oficial y de la referencia en `estandar/reportes`.
- Proceso reproducible de datos de la PDN (`datos/proceso/`, Python 3 sin dependencias): grupos de
  anonimato por entidad con generalización jerárquica y cubetas, matriz de cobertura, equivalencias
  de instituciones S1-S2-S3-S6, salidas privadas en SQLite fuera del repositorio y tres conjuntos
  de datos abiertos con diccionario y metodología. Script `npm run data:test`, incluido en
  `npm run check` y en CI.
- `@sigilo/anonimato`: grupo de anonimato en el navegador. Carga del mismo origen el índice y un
  solo fragmento por denuncia (fetch inyectable, SHA-256 contra el índice), devuelve cubeta, nivel,
  marca de contratación de S2, riesgo y un texto sencillo con acciones sugeridas, y dice con
  honestidad cuando no hay datos. Normalización idéntica a `datos/proceso` (prueba cruzada con
  Python) y `withAnonymityFactor` para sumar el factor al semáforo de Huella Cero.
- `@sigilo/contexto-pdn`: verificaciones con tres resultados (`confirmed`, `contradicted`,
  `no_coverage` con motivo) que consultan la matriz de cobertura, conflicto de interés antes de
  turnar (S1 y cadena de mando de S2), contrato citado contra S6, lista tipo 69-B, sanciones contra
  S3 con la regla «sanción no verificable», y ficha de contexto con prioridad explicable
  (`config/prioridad.json`). Fuentes sintéticas del escenario y fuentes SQLite en solo lectura.
  Las sanciones se buscan por expediente y entidad (y por institución cuando el registro la trae):
  los números de expediente se repiten entre entidades.

### Cambiado

- `docs/uso-de-ia.md` declara el auditor y el modelo local opcional (finalidad, alcance, límites,
  que no ve identidades y que no decide); se conserva la declaración del uso de IA en el desarrollo.
- El escenario fija los umbrales de `signal.template-closure` en similitud 0.75 y 5 coincidencias
  (la propuesta de 0.9 y 20 no detectaba las tres variantes de la plantilla). Nuevo ámbito de commit
  `auditor` en `docs/convenciones.md`.
- `@sigilo/huella` expone también `./risk` y `./months`.
- El escenario de la demostración usa `no_coverage` y los cuatro motivos de «sin cobertura»
  (`state-without-system`, `institution-not-connected`, `period-out-of-range`,
  `record-not-found`), más `ambiguous-record` para expedientes repetidos.
- El estatus HTTP y el mensaje de cada código de error pasan a `@sigilo/contracts`
  (`API_ERROR_HTTP_STATUS`, `API_ERROR_MESSAGES`); el servidor responde exactamente igual.
- La web toma los nombres y explicaciones de los estatus de `COMPLAINT_STATUSES`, sin cambiar los
  textos.
- `swagger-ui-dist` trae `@scarf/scarf`; su telemetría queda desactivada con `scarfSettings` y su
  script de instalación no se ejecuta.

## [0.9.1] - 2026-10-07

### Corregido

- Auditor (reglas 1.1.0), contra el texto vigente de la LGRA: la caducidad de la instancia
  (art. 74) solo se cita en el procedimiento ya admitido el Informe de Presunta Responsabilidad, y
  se aclara que se decreta a solicitud del presunto infractor; en la investigación la señal es
  «inactividad prolongada» (`signal.prolonged-inactivity`). AUD-04 dice «no iniciar el
  procedimiento correspondiente» (art. 64, fr. II). AUD-01 y AUD-03 se aplican también a acuerdos
  de calificación, y AUD-02 ya no trata una calificación como archivo.
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
