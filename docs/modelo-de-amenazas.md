# Modelo de amenazas

Este documento enumera quién podría identificar a la persona denunciante, cómo y qué lo impide.
SIGILO no promete anonimato absoluto: cada ataque se marca como mitigado, parcialmente mitigado,
planeado o residual. El estado describe lo que hace el código del repositorio, no lo que se planea.

## Alcance

Versión v1:

- Modos `anonymous` y `sealed`.
- Sobre HPKE hacia la autoridad competente.
- Buzón con secuencia por remitente.
- Bitácora encadenada y publicada por lotes diarios, con anclaje.
- Huella Cero para imágenes y PDF.

También: prueba de trabajo para envíos y pruebas, y conciliación de aperturas con la etiqueta del
recibo. La revelación por umbral 2 de 3 y la verificación de la integridad del código servido son
trabajo futuro.

## Activos

1. Identidad de la persona denunciante (nombre, contacto, testigos).
2. Vínculo entre una persona y una denuncia, aunque no haya nombre.
3. Recibo de 8 palabras y llaves derivadas.
4. Integridad de los hechos, las pruebas y la bitácora.

## Actores

| Id  | Actor                                                            | Capacidad                                                  |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| A1  | Persona denunciada y sus aliados en el ente                      | Conocen el contexto interno; leen la denuncia si se filtra |
| A2  | Personal de la autoridad que recibe la denuncia                  | Accede al panel y a los hechos                             |
| A3  | Operación del sistema (administración, base de datos, respaldos) | Acceso total al servidor y al almacenamiento               |
| A4  | Atacante externo que compromete el servidor                      | Puede alterar datos y el código servido                    |
| A5  | Observador de red (empleador, proveedor de internet)             | Ve tráfico, DNS y horarios                                 |
| A6  | Quien accede al dispositivo de la persona denunciante            | Historial, caché, archivos, notas                          |
| A7  | Cadena de suministro                                             | Dependencias, integración continua                         |
| A8  | Adversario futuro                                                | Descifra hoy lo almacenado, con capacidades de mañana      |

## Categorías

- LINDDUN (privacidad): L vinculación, I identificación, N no repudio, D detección, D2 divulgación
  de datos, U desconocimiento, N2 incumplimiento.
- STRIDE (seguridad): S suplantación, T manipulación, R repudio, I divulgación, D denegación,
  E elevación de privilegios.

Estado: **M** mitigado, **M parcial** mitigado con un residual descrito, **P** planeado (no
implementado), **R** residual documentado.

## A. Inferencia por el contenido

| #   | Ataque                                                              | Categoría  | Mitigación                                                                                                                                                                                                                     | Estado    |
| --- | ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| A01 | Detalle que solo conocen pocas personas                             | LINDDUN I  | Revisor de texto y vista «Así te verá la autoridad»                                                                                                                                                                            | R         |
| A02 | Estilometría contra correos internos                                | LINDDUN I  | Aviso a la persona usuaria                                                                                                                                                                                                     | R         |
| A03 | Versiones únicas de un documento repartido (trampa del canario)     | LINDDUN I  | Aviso; no se puede eliminar                                                                                                                                                                                                    | R         |
| A04 | Caracteres invisibles o homoglifos que codifican al destinatario    | LINDDUN I  | Detección ampliada, confusables en todo token, puntuación de otros sistemas y formas de compatibilidad que marcan (ver nota); eliminación automática al armar los hechos y los mensajes del buzón                              | M parcial |
| A05 | Contenido visual: capturas con nombre de usuario, reflejos, rostros | LINDDUN I  | Aviso en la vista previa                                                                                                                                                                                                       | R         |
| A06 | Huella del sensor de la cámara                                      | LINDDUN L  | Recodificación y reducción de resolución; lo debilita, no lo elimina                                                                                                                                                           | R         |
| A07 | Rastros internos de documentos (autor, rutas, revisiones, XMP)      | LINDDUN I  | PDF convertido a imagen; Office, video y audio rechazados                                                                                                                                                                      | M         |
| A08 | Metadatos de imagen (GPS, dispositivo, fecha)                       | LINDDUN I  | Recodificación en canvas y nueva inspección de la copia (solo se acepta el perfil sRGB genérico del navegador); si conserva metadatos, la prueba queda en error y no se sube                                                   | M         |
| A09 | Correlación de horario entre un evento interno y el envío           | LINDDUN L  | Fechas redondeadas al día; los eventos del día se encadenan barajados al cerrarlo, solo se publican días completos y las tablas privadas no guardan el orden de llegada (`WITHOUT ROWID`, `secure_delete`, checkpoint del WAL) | M         |
| A10 | Intersección a lo largo de varias respuestas del buzón              | LINDDUN L  | Horas redondeadas, relleno fijo de 4096 bytes, revisor también en respuestas                                                                                                                                                   | M parcial |
| A11 | Celdas pequeñas en estadísticas                                     | LINDDUN D2 | Meses congelados al cerrarse, redondeo aleatorio insesgado a múltiplos de 5 con semilla secreta por mes y supresión de lo que redondea a menos de 5                                                                            | M parcial |
| A12 | Ubicación precisa                                                   | LINDDUN I  | Solo entidad y municipio opcional; sin mapa                                                                                                                                                                                    | M         |

Notas:

- **A04.** Se detectan los caracteres de formato (Cf), `Default_Ignorable_Code_Point`, controles,
  uso privado, no asignados, separadores de línea y de párrafo, rellenos Hangul, Braille en blanco,
  espacios no estándar, marcas combinantes sueltas o sin forma compuesta, confusables (subconjunto de
  UTS #39, unas 120 entradas, aplicado a todo token, incluso de una letra) y variantes tipográficas.
  `\r\n` pasa a `\n`. NFKC solo se aplica a las formas de compatibilidad que sirven para marcar
  (`MARKING_COMPATIBILITY_RANGES`); se conservan «º», «ª», superíndices, fracciones, el saltillo y las
  vocales con marcas legítimas de las lenguas indígenas de México (otomí, mazahua, mixteco, triqui,
  chinanteco, wixárika). Las letras de otro alfabeto sin equivalente se señalan (`mixed_script`) pero
  no se borran. Costos conocidos: los textos rusos o griegos legítimos se transliteran en parte, la
  raya de diálogo pasa a `-`, «一» y «ー» pasan a `-` también en chino o japonés, y algunos emojis
  compuestos pierden su forma. Residuales: el saltillo U+02BC se conserva y se ve igual que «’»; un
  canario hecho con sinónimos o con el orden de las frases no se detecta (A03).
- **A08.** El perfil ICC genérico se acepta por su descripción (`sRGB` de Chromium o
  `sRGB IEC61966-2.1` de WebKit), no por una huella binaria. Un perfil con esa descripción y datos
  distintos pasaría la verificación (R).
- **A11.** Con el redondeo aleatorio, quien rellena una celda con denuncias propias y la ve aparecer
  o cambiar solo sabe con cierta probabilidad si había una denuncia real, y los valores congelados no
  dan muestras nuevas del ruido. Es una garantía probabilística, no privacidad diferencial: una celda
  con una sola denuncia se publica como 5 con probabilidad 1/5, y cruzar el umbral sigue siendo
  posible (R). Ver `criptografia.md`.

## B. Dispositivo y red de la persona denunciante

| #   | Ataque                                                        | Categoría  | Mitigación                                                                      | Estado    |
| --- | ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- | --------- |
| B01 | Corrector ortográfico en la nube envía el texto a terceros    | LINDDUN D2 | `spellcheck="false"` en campos de texto                                         | M         |
| B02 | Traducción automática envía el contenido                      | LINDDUN D2 | `translate="no"` y `notranslate`                                                | M         |
| B03 | Extensiones del navegador leen la página                      | LINDDUN D2 | Aviso; recomendar ventana privada                                               | R         |
| B04 | Sincronización del navegador con cuenta institucional         | LINDDUN D2 | `autocomplete="off"`, `no-store`, aviso                                         | M parcial |
| B05 | Historial del portapapeles sincronizado                       | LINDDUN D2 | Aviso; el portapapeles se vacía a los 60 s cuando el navegador lo permite       | R         |
| B06 | Equipo institucional administrado o con software de monitoreo | LINDDUN D  | Aviso inicial explícito                                                         | R         |
| B07 | Inspección TLS o DNS en la red del trabajo                    | LINDDUN D  | Aviso de usar otra red                                                          | R         |
| B08 | Foto o archivo del recibo respaldado en la nube               | LINDDUN D2 | Sin descarga ni QR; aviso de escribirlo en papel                                | M         |
| B09 | Rastros locales (caché, almacenamiento)                       | LINDDUN D  | Nada en `localStorage`, `sessionStorage` ni IndexedDB; `no-store`               | M         |
| B10 | Rutas y títulos de la aplicación en el historial              | LINDDUN D  | Router en memoria: una sola entrada de historial; la salida rápida la sustituye | M parcial |

Nota B10: mientras la página está abierta, el título de la última pantalla sigue en esa única
entrada; la salida rápida lo reemplaza al navegar a la página neutra.

## C. Servidor, operación y cadena de suministro

| #   | Ataque                                                       | Categoría   | Mitigación                                                                                                                                                                                                                                                              | Estado    |
| --- | ------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| C01 | Lectura de la base de datos o respaldos                      | STRIDE I    | Identidad y mensajes del buzón cifrados en el cliente; hechos y pruebas limpias en claro (ver F01)                                                                                                                                                                      | M parcial |
| C02 | Registro de direcciones IP o de la actividad de las personas | LINDDUN L   | Registro agregado por hora por omisión, sin las rutas de la persona denunciante ni `GET keys` y la bitácora; nunca IP, agente de usuario, cuerpos ni folios                                                                                                             | M         |
| C03 | Código JavaScript malicioso servido a víctimas específicas   | STRIDE T    | Ninguna en v1; hashes publicados por versión y verificador                                                                                                                                                                                                              | P; R      |
| C04 | Sustitución de llaves públicas de la autoridad               | STRIDE S    | Llaves fijadas en el bundle y comparadas con `GET /keys` antes de subir nada                                                                                                                                                                                            | M         |
| C05 | Reescritura de la bitácora                                   | STRIDE T, R | Cadena de hashes con fechas no decrecientes, triggers de solo agregar, cabeza firmada, anclaje con `npm run ledger:anchor` y verificación de pertenencia (`verifyEventInChain`)                                                                                         | M parcial |
| C06 | Pérdida o borrado de denuncias                               | STRIDE D, R | Comprobante firmado y evento de recepción verificable en poder de la persona denunciante                                                                                                                                                                                | M         |
| C07 | Mover un sobre de identidad a otra denuncia (trasplante)     | STRIDE T    | AAD vinculado a `authVerifier`, `reporterKeys` y `contentDigest`; índice único de `authVerifier`                                                                                                                                                                        | M         |
| C08 | Enumeración de folios o recibos                              | LINDDUN D   | 60 bits de folio, 88 de recibo, respuesta idéntica, consulta ligera del verificador y límite de fallos por folio                                                                                                                                                        | M         |
| C09 | Saturación con denuncias, pruebas o mensajes falsos          | STRIDE D    | Prueba de trabajo adaptativa (18 a 24 bits) para denuncias, pruebas y mensajes; frenos extremos sobre escrituras confirmadas; cuota de 5 GiB con reserva, tope por denuncia y desalojo de las sin atender más antiguas; retención de 30 días para denuncias sin atender | M parcial |
| C10 | Archivo malicioso contra el visor de la autoridad            | STRIDE E    | Solo JPEG y PNG, bytes mágicos y tamaño en el servidor; descarga como adjunto con `nosniff`                                                                                                                                                                             | M parcial |
| C11 | XSS en los hechos mostrados a la autoridad                   | STRIDE E    | React sin `dangerouslySetInnerHTML` y CSP estricta                                                                                                                                                                                                                      | M         |
| C12 | Permisos de lectura públicos mal configurados                | STRIDE I    | Rutas de autoridad con token comparado en tiempo constante; pruebas de autorización                                                                                                                                                                                     | M         |
| C13 | Dependencia comprometida                                     | STRIDE T    | Lockfile y dependencias mínimas                                                                                                                                                                                                                                         | M parcial |
| C14 | Aleatoriedad débil                                           | STRIDE S    | Solo `crypto.getRandomValues`; lint prohíbe `Math.random`                                                                                                                                                                                                               | M         |
| C15 | Longitud del texto cifrado revela datos                      | LINDDUN I   | Relleno fijo de la identidad y de los mensajes del buzón a 4096 bytes                                                                                                                                                                                                   | M         |
| C16 | Repetir, reordenar u omitir mensajes del buzón               | STRIDE T    | `sequence` por remitente en el AAD y en la firma; el servidor exige la siguiente; el cliente avisa si falta una                                                                                                                                                         | M parcial |
| C17 | El servidor sustituye las llaves de la persona denunciante   | STRIDE S    | En ambos modos, el panel recalcula el digesto del envío y lo compara con el evento `complaint.received` publicado; en modo `sealed`, además, van en el AAD                                                                                                              | M parcial |
| C18 | Texto arbitrario en catálogos o datos abiertos               | STRIDE T    | Entidad, municipio, ente y conducta validados contra los catálogos de contracts; fórmulas neutralizadas en CSV                                                                                                                                                          | M         |
| C19 | Bloquear el seguimiento de todas las personas                | STRIDE D    | Solo los fallos cuentan; el exceso global solo frena (10 ms por fallo, máximo 2 s)                                                                                                                                                                                      | M parcial |
| C20 | Llenar el día de la bitácora para bloquear las escrituras    | STRIDE D    | Tope de 200 000 pendientes por día (`503 ledger_day_full`) detrás de la prueba de trabajo y los frenos; cierre por lotes de 5000                                                                                                                                        | M parcial |
| C21 | Dos servidores sobre la misma base                           | STRIDE T    | `server.lock` atómico (`wx`), renovado cada 10 minutos; los scripts se niegan a correr con el servidor en marcha                                                                                                                                                        | M         |

Notas:

- **C05.** El anclaje requiere que la operación ejecute `ledger:anchor` y versione el archivo en
  `anchors/`. Las reescrituras entre dos anclas no se detectan: quien tiene la llave de firma del
  servidor puede rehacer la cadena posterior a la última ancla.
- **C09.** La dificultad sube un bit por cada duplicación de la carga de la última hora sobre su
  umbral, así que el costo de un ataque crece más rápido que su volumen. Aun así, un atacante con
  cómputo suficiente puede pagarla, y quien acumule retos emitidos con poca carga puede usarlos a su
  dificultad durante su vigencia (R). Los frenos extremos y la cuota son el último recurso: si se
  agotan, afectan a todas las personas (R). La autoridad conserva las pruebas de una denuncia
  atendiéndola (moviéndola de `received`); las de denuncias sin atender pueden desalojarse o
  vencer.
- **C10.** Una carga hecha a mano con prefijo JPEG válido llega al decodificador del navegador de la
  autoridad. Recodificar en el servidor es trabajo futuro (P).
- **C16.** El servidor puede retener el último mensaje sin que se note; la bitácora registra cada
  `message.sent`.
- **C17.** Mientras el evento `complaint.received` no se publica (hasta que cierra su día), el panel
  muestra las llaves como «pendientes» de verificar. La comparación depende de que la persona
  denunciante haya verificado su evento contra su comprobante.
- **C19.** El freno global retrasa a todas las personas hasta 2 s y no limita el volumen de un
  atacante que envía en paralelo.
- **C20.** Si se alcanza el tope del día, nadie puede escribir hasta que cierre (R). La prueba de
  trabajo adaptativa hace muy costoso llegar a 200 000 eventos en un día.

## D. Autoridad y custodia de llaves

| #   | Ataque                                             | Categoría  | Mitigación                                                                                                 | Estado    |
| --- | -------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| D01 | La autoridad abre la identidad sin motivo          | LINDDUN N2 | El sobre solo se entrega por una ruta que registra el fundamento; la apertura es visible en el seguimiento | M parcial |
| D02 | Filtración posterior a la apertura                 | LINDDUN D2 | Registro de quién y cuándo (art. 64 LGRA)                                                                  | R         |
| D03 | Robo de la llave privada de la autoridad           | STRIDE I   | La llave no vive en el servidor; se importa en memoria y se borra al cerrar sesión; rotación con `keyId`   | R         |
| D04 | Una sola persona decide abrir                      | LINDDUN N2 | Revelación por umbral 2 de 3                                                                               | P         |
| D05 | Identidad declarada falsa (suplantar a un tercero) | STRIDE S   | El panel muestra «Identidad declarada por la persona, no verificada»                                       | R         |
| D06 | Cambio de administración y pérdida de llaves       | STRIDE D   | Procedimiento de rotación documentado                                                                      | P         |

Notas:

- **D01.** Cada apertura publica un `identity.opened` con `receiptTag`, derivado del recibo. La
  persona denunciante verifica el tramo de la bitácora desde su día de recepción hasta la cabeza
  firmada (`since`), busca ahí los eventos con su etiqueta y los concilia con las aperturas de su
  seguimiento: detecta una apertura que el servidor ocultó o registró con otro folio. Como las fechas
  no decrecen, ese tramo contiene todas las aperturas posibles.
  Aun así, es un control de política: quien tenga la llave privada de la autoridad y una copia de la
  base puede descifrar sin pasar por la ruta, y eso no deja evento.
- **D03.** La llave se importa en una página entregada por el mismo servidor. Si ese código se altera
  (A4), puede exfiltrarla en cuanto se importa. Mitigaciones futuras (P): descifrar con una
  herramienta separada y firmada, o con llaves no extraíbles (WebAuthn PRF).

## E. Seguimiento

| #   | Ataque                                       | Categoría | Mitigación                                                                    | Estado    |
| --- | -------------------------------------------- | --------- | ----------------------------------------------------------------------------- | --------- |
| E01 | Pregunta del buzón diseñada para identificar | LINDDUN I | Revisor sobre la respuesta, aviso si se piden datos personales, bitácora      | M parcial |
| E02 | Sitio falso que pide las 8 palabras          | STRIDE S  | Educación y dominio visible                                                   | R         |
| E03 | Coacción para mostrar el seguimiento         | LINDDUN D | Palabras ocultas por defecto; salida rápida con botón o con Esc dos veces     | M parcial |
| E04 | Fuerza bruta del recibo                      | STRIDE S  | 88 bits y límite de fallos por folio                                          | M         |
| E05 | El límite de intentos bloquea a la persona   | STRIDE D  | Los accesos legítimos no consumen el límite de fallos; mensajes con su límite | M         |

## F. Legales e institucionales

| #   | Riesgo                                    | Mitigación                                                        | Estado |
| --- | ----------------------------------------- | ----------------------------------------------------------------- | ------ |
| F01 | Orden de entrega de respaldos             | Identidad y buzón cifrados; hechos y pruebas limpias van en claro | R      |
| F02 | Obligación de modificar el código servido | Hashes publicados y verificador                                   | P      |
| F03 | Reducción de sospechosos e interrogatorio | Fuera del alcance técnico; medidas de protección de la LGRA       | R      |

## Riesgos residuales principales

1. El contenido de los hechos puede identificar a la persona; el revisor ayuda pero no garantiza.
2. Un servidor comprometido puede servir código malicioso a usuarios futuros y robar la llave de la
   autoridad cuando se importa.
3. Un dispositivo o una red vigilados quedan fuera de lo que una aplicación web puede controlar.
4. Con un solo destinatario, la autoridad competente puede abrir la identidad; la bitácora lo hace
   visible pero no lo impide. El umbral 2 de 3 reduce este riesgo.
5. Los respaldos contienen los hechos y las pruebas limpias en claro.
6. Entre dos anclas, la operación con la llave del servidor puede rehacer la bitácora.
7. El relleno de celdas puede hacer cruzar el umbral de publicación en los datos abiertos.
8. Las cuotas globales son el último recurso contra el abuso y pueden agotarse para todos.
9. El perfil sRGB genérico se acepta por su descripción, no por su contenido.
10. Los retos de prueba de trabajo emitidos con poca carga sirven, a su dificultad, durante su
    vigencia.

## Historial de seguridad

Hallazgos de la revisión interna de SIGILO, corregidos antes de la versión v1:

| Hallazgo                                                                | Corrección                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| El sobre de identidad podía trasplantarse a otra denuncia               | AAD con `contentDigest` y `reporterKeys`; índice único (C07) |
| La bitácora en tiempo real revelaba la hora exacta de envíos y mensajes | Publicación por lotes diarios (A09)                          |
| La bitácora no tenía anclaje externo                                    | `npm run ledger:anchor` y comparación en `/verificar` (C05)  |
| El límite por folio bloqueaba a la persona denunciante legítima         | Solo cuentan los fallos; límite de mensajes aparte (E05)     |
| El límite global permitía dejar fuera a todas las personas              | Freno progresivo sin bloqueo (C19)                           |
| Los catálogos aceptaban texto libre que llegaba al CSV público          | Validación contra catálogos en el servidor (C18)             |
| Faltaban caracteres invisibles por detectar y la limpieza era opcional  | Detección ampliada y limpieza automática (A04)               |
| Una copia limpia con metadatos podía subirse                            | Fallo cerrado de la limpieza (A08)                           |
| El buzón admitía repetición y revelaba la longitud de los mensajes      | Secuencia y relleno fijo (C15, C16)                          |
| El seguimiento tenía un oráculo de existencia por tiempo                | Consulta ligera del verificador antes de cargar (C08)        |
| CORS quedaba activo por omisión                                         | Desactivado salvo configuración explícita                    |
| Las rutas de la aplicación quedaban en el historial del navegador       | Router en memoria (B10)                                      |

Segunda ronda:

| Hallazgo                                                                   | Corrección                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| El orden de los eventos dentro del día revelaba el de llegada              | Eventos pendientes y encadenado barajado al cerrar el día (A09)             |
| El comprobante con `seq` ataba el orden de la bitácora al de llegada       | El comprobante firma `payloadDigest`                                        |
| El servidor podía ocultar una apertura de identidad                        | `receiptTag` en `identity.opened` y conciliación en el seguimiento (D01)    |
| En modo anónimo, el panel confiaba en las llaves que entregaba el servidor | Verificación contra el evento `complaint.received` publicado (C17)          |
| Sin prueba de trabajo, las cuotas eran la única defensa                    | Hashcash con retos HMAC de un solo uso (C09)                                |
| Almacenamiento sin tope                                                    | Cuota total de pruebas y retención opcional (C09)                           |
| Los registros por petición permitían correlacionar envíos                  | Registro agregado por hora por omisión (C02)                                |
| Homoglifos aislados y otros caracteres pasaban la limpieza                 | Mapa de confusables en todo token y categorías nuevas (A04)                 |
| Los conteos publicados cambiaban con los estatus                           | Meses congelados al cerrarse (A11)                                          |
| El anclaje confiaba en el hash almacenado                                  | Recalcula la cadena desde el ancla anterior (C05)                           |
| El reloj de pruebas podía activarse fuera de pruebas                       | Solo con `SIGILO_E2E=1` o `NODE_ENV=test`, archivo seguro y desfase acotado |

Tercera ronda:

| Hallazgo                                                                                 | Corrección                                                                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| El `rowid` de las tablas privadas conservaba el orden de llegada en una copia de la base | Migración 4: `WITHOUT ROWID`, `secure_delete` y checkpoint del WAL (A09)                     |
| Un cierre de día interrumpido podía publicar un día a medias                             | Lotes de 5000, rebarajado al reanudar y cabeza detenida mientras el día tenga pendientes     |
| Un día podía crecer sin límite                                                           | Tope de 200 000 pendientes (`ledger_day_full`) (C20)                                         |
| Una cadena podía tener fechas que retrocedían                                            | `verifyChain` exige `at` no decreciente (motivo `date`) (C05)                                |
| Un evento con hash coherente se aceptaba sin probar su pertenencia                       | `verifyEventInChain` hasta la cabeza firmada y las anclas (C05)                              |
| El seguimiento descargaba la bitácora desde el génesis                                   | Tramo desde el día de recepción con `since` (D01)                                            |
| Los mensajes no pedían prueba de trabajo y su dificultad era fija                        | Propósito `message` y dificultad adaptativa (C09)                                            |
| La lista de retos gastados podía crecer sin control                                      | Presión al 50, 75 y 90 %, vigencia acortada y olvido de los más antiguos (C09)               |
| Los frenos contaban peticiones rechazadas                                                | Frenos extremos solo sobre escrituras confirmadas (C09)                                      |
| El redondeo determinista dejaba ver el cruce exacto del umbral                           | Redondeo aleatorio insesgado con semilla secreta por mes (A11)                               |
| Las pruebas de denuncias con seguimiento no vencían nunca                                | Retención de 30 días para denuncias sin atender, reserva, tope por denuncia y desalojo (C09) |
| El registro agregado contaba `GET keys` y la bitácora                                    | Se excluyen del registro (C02)                                                               |
| El bloqueo del servidor podía tomarse dos veces o quedar huérfano                        | `server.lock` con `wx`, renovación y criterios de abandono (C21)                             |
| NFKC completo cambiaba usos legítimos del español y de lenguas indígenas                 | NFC general, NFKC solo en formas que marcan y marcas legítimas protegidas (A04)              |

## Observaciones sobre sistemas de terceros

Las observaciones sobre sistemas de terceros se comunican primero a la institución responsable.
