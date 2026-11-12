# Modelo de amenazas

Este documento enumera quién podría identificar a la persona denunciante, cómo y qué lo impide.
SIGILO no promete anonimato absoluto: cada ataque se marca como mitigado, parcialmente mitigado,
planeado o residual. El estado describe lo que hace el código del repositorio, no lo que se planea.

Los requisitos que cualquier nodo, enrutador o ventanilla del Estándar S5 debe cumplir frente a
estas amenazas están en el [perfil de seguridad](../estandar/perfil-seguridad.md) (SEC-xx) y el
[perfil de privacidad](../estandar/perfil-privacidad.md) (PRV-xx, API-xx); las verificaciones
automatizables, en [verificaciones.json](../estandar/verificaciones.json).

## Alcance

Versión v1:

- Modos `anonymous` y `sealed`.
- Sobre HPKE hacia la autoridad competente.
- Buzón con secuencia por remitente.
- Bitácora encadenada y publicada por lotes diarios, con anclaje.
- Huella Cero para imágenes y PDF.

También: prueba de trabajo para envíos y pruebas, y conciliación de aperturas con la etiqueta del
recibo. Desde la versión 1.1.0, la red federada, las pruebas cifradas hacia la autoridad con
cadena de custodia y la instalación de producción (sección G). La revelación por umbral 2 de 3 y la
verificación de la integridad del código servido son trabajo futuro.

## Activos

1. Identidad de la persona denunciante (nombre, contacto, testigos).
2. Vínculo entre una persona y una denuncia, aunque no haya nombre.
3. Recibo de 8 palabras y llaves derivadas.
4. Integridad de los hechos, las pruebas y la bitácora.

## Actores

| Id  | Actor                                                                                       | Capacidad                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Persona denunciada y sus aliados en el ente                                                 | Conocen el contexto interno; leen la denuncia si se filtra                                                                           |
| A2  | Personal de la autoridad que recibe la denuncia                                             | Accede al panel y a los hechos                                                                                                       |
| A3  | Operación del sistema (administración, base de datos, respaldos)                            | Acceso total al servidor y al almacenamiento                                                                                         |
| A4  | Atacante externo que compromete el servidor                                                 | Puede alterar datos y el código servido                                                                                              |
| A5  | Observador de red (empleador, proveedor de internet)                                        | Ve tráfico, DNS y horarios                                                                                                           |
| A6  | Quien accede al dispositivo de la persona denunciante                                       | Historial, caché, archivos, notas                                                                                                    |
| A7  | Cadena de suministro                                                                        | Dependencias, integración continua                                                                                                   |
| A8  | Adversario futuro                                                                           | Descifra hoy lo almacenado, con capacidades de mañana                                                                                |
| A9  | Operación de una pieza de la red federada (otro nodo, enrutador, índice, evaluador)         | Firma con su llave del directorio; reescribe su propia bitácora; sirve copias viejas del directorio; registra etiquetas en el índice |
| A10 | Persona de la autoridad que quiere enterrar la denuncia o protegerse (conflicto de interés) | Usa su cuenta y las funciones del panel: turna, cierra, califica, justifica, aprueba o bloquea cuentas                               |

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
  compuestos pierden su forma. También se detectan por contexto los dígitos de otros sistemas (pasan
  a ASCII), «º» y «ª» entre letras, superíndices antes de un dígito, «ː» y las letras modificadoras
  en palabras latinas; los homoglifos solo se convierten en contexto latino, sin transliterar
  palabras completas en otro alfabeto ni letras griegas en fórmulas. Residuales: el saltillo U+02BC
  se conserva y se ve igual que «’»; un canario hecho con sinónimos o con el orden de las frases no
  se detecta (A03).
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

| #   | Ataque                                                       | Categoría   | Mitigación                                                                                                                                                                                                                                                                                                                    | Estado    |
| --- | ------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| C01 | Lectura de la base de datos o respaldos                      | STRIDE I    | Identidad, mensajes del buzón y pruebas cifrados en el navegador (G21); los hechos quedan en claro en el nodo (ver F01)                                                                                                                                                                                                       | M parcial |
| C02 | Registro de direcciones IP o de la actividad de las personas | LINDDUN L   | Registro agregado por hora por omisión, sin las rutas de la persona denunciante (incluidas las de red, inconformidad y corroboración, G09) ni `GET keys` y la bitácora; nunca IP, agente de usuario, cuerpos ni folios                                                                                                        | M parcial |
| C03 | Código JavaScript malicioso servido a víctimas específicas   | STRIDE T    | Ninguna en v1; hashes publicados por versión y verificador                                                                                                                                                                                                                                                                    | P; R      |
| C04 | Sustitución de llaves públicas de la autoridad               | STRIDE S    | Llaves fijadas en el bundle y comparadas con `GET /keys` antes de subir nada                                                                                                                                                                                                                                                  | M         |
| C05 | Reescritura de la bitácora                                   | STRIDE T, R | Cadena de hashes con fechas no decrecientes, triggers de solo agregar, cabeza firmada, anclaje con `npm run ledger:anchor` y verificación de pertenencia (`verifyEventInChain`); en la red, bitácora nacional con testigos m de n y verificación del tramo del nodo entre dos cabezas (G04)                                   | M parcial |
| C06 | Pérdida o borrado de denuncias                               | STRIDE D, R | Comprobante firmado y evento de recepción verificable en poder de la persona denunciante                                                                                                                                                                                                                                      | M         |
| C07 | Mover un sobre de identidad a otra denuncia (trasplante)     | STRIDE T    | AAD vinculado a `authVerifier`, `reporterKeys` y `contentDigest`; índice único de `authVerifier`                                                                                                                                                                                                                              | M         |
| C08 | Enumeración de folios o recibos                              | LINDDUN D   | 60 bits de folio, 88 de recibo, respuesta idéntica, consulta ligera del verificador y límite de fallos por folio                                                                                                                                                                                                              | M         |
| C09 | Saturación con denuncias, pruebas o mensajes falsos          | STRIDE D    | Prueba de trabajo adaptativa (18 a 20 bits) con un reto por denuncia y sus pruebas y otro por mensaje; cuota de 5 GiB con tope por denuncia y `507 storage_full` sin borrar pruebas asociadas; pendientes purgadas al vencer su reto; retención de 30 días para denuncias sin atender o archivadas; descarte por la autoridad | M parcial |
| C10 | Archivo malicioso contra el visor de la autoridad            | STRIDE E    | Solo JPEG y PNG; el nodo recibe el contenedor cifrado y comprueba su tamaño, y el panel revisa los bytes mágicos al descifrar, antes de mostrar; descarga con `nosniff`                                                                                                                                                       | M parcial |
| C11 | XSS en los hechos mostrados a la autoridad                   | STRIDE E    | React sin `dangerouslySetInnerHTML` y CSP estricta                                                                                                                                                                                                                                                                            | M         |
| C12 | Permisos de lectura públicos mal configurados                | STRIDE I    | Rutas de autoridad con token comparado en tiempo constante; pruebas de autorización                                                                                                                                                                                                                                           | M         |
| C13 | Dependencia comprometida                                     | STRIDE T    | Lockfile y dependencias mínimas                                                                                                                                                                                                                                                                                               | M parcial |
| C14 | Aleatoriedad débil                                           | STRIDE S    | Solo `crypto.getRandomValues`; lint prohíbe `Math.random`                                                                                                                                                                                                                                                                     | M         |
| C15 | Longitud del texto cifrado revela datos                      | LINDDUN I   | Relleno fijo de la identidad y de los mensajes del buzón a 4096 bytes                                                                                                                                                                                                                                                         | M         |
| C16 | Repetir, reordenar u omitir mensajes del buzón               | STRIDE T    | `sequence` por remitente en el AAD y en la firma; el servidor exige la siguiente; el cliente avisa si falta una                                                                                                                                                                                                               | M parcial |
| C17 | El servidor sustituye las llaves de la persona denunciante   | STRIDE S    | En ambos modos, el panel recalcula el digesto del envío y lo compara con el evento `complaint.received` publicado; en modo `sealed`, además, van en el AAD                                                                                                                                                                    | M parcial |
| C18 | Texto arbitrario en catálogos o datos abiertos               | STRIDE T    | Entidad, municipio, ente y conducta validados contra los catálogos de contracts; fórmulas neutralizadas en CSV                                                                                                                                                                                                                | M         |
| C19 | Bloquear el seguimiento de todas las personas                | STRIDE D    | Solo los fallos cuentan; el exceso global solo frena (10 ms por fallo, máximo 2 s)                                                                                                                                                                                                                                            | M parcial |
| C20 | Llenar el día de la bitácora para bloquear las escrituras    | STRIDE D    | Tope de 200 000 pendientes por día (`503 ledger_day_full`) detrás de la prueba de trabajo; los eventos de la autoridad están exentos; cierre asíncrono por lotes de 1000 en una tarea programada                                                                                                                              | M parcial |
| C21 | Dos servidores sobre la misma base                           | STRIDE T    | `server.lock` publicado con `linkSync` desde un temporal, gracia de 10 s para bloqueos recién creados y renovación cada 10 minutos; los scripts se niegan a correr con el servidor en marcha                                                                                                                                  | M         |

Notas:

- **C05.** Sin anclas, un servidor comprometido puede mostrar bitácoras distintas a distintas
  personas (vista dividida) sin que nadie lo note (R, inherente). Por eso el seguimiento y el buzón
  de la autoridad permiten pegar anclas publicadas para comparar. Un ancla anterior al tramo
  verificado ya no se ignora: el cliente descarga desde su `seq` y compara; si no puede, el
  resultado es «no comparable» y la pantalla lo dice, nunca «coincide». El anclaje requiere que la operación ejecute `ledger:anchor` y versione el archivo en
  `anchors/`. Las reescrituras entre dos anclas no se detectan: quien tiene la llave de firma del
  servidor puede rehacer la cadena posterior a la última ancla.
- **C09.** La dificultad sube un bit por cada duplicación de la carga de la última hora sobre su
  umbral, así que el costo de un ataque crece más rápido que su volumen. Ya no hay frenos globales
  de escrituras: un tope global sin identidad siempre funciona como palanca para dejar fuera a
  todas las personas. Residuales:
  - una GPU resuelve SHA-256 miles de veces más rápido que el celular básico para el que se calibra
    la dificultad (asimetría de la prueba de trabajo) (R);
  - quien acumule retos emitidos con poca carga puede usarlos a su dificultad durante su vigencia
    (R);
  - como las pruebas asociadas nunca se borran para hacer sitio, unas 100 denuncias con su tope por
    denuncia (`cuota / 100`) pueden llenar la cuota; las subidas nuevas reciben `storage_full` hasta
    que la autoridad descarte esas pruebas o venza su retención de 30 días. Archivarlas ya no las
    exime de la retención, así que el bloqueo nunca es permanente (R, inherente: el disco es un
    límite físico y sirve de palanca);
  - las pendientes de un reto que nunca termina en denuncia se purgan al vencer el reto más 30
    minutos (y no después de 24 a 48 h); cada subida cuenta como carga, así que llenar el
    almacenamiento también sube la dificultad;
  - las denuncias de solo texto no ocupan cuota de pruebas, pero cada una cuesta un reto: una
    inundación sostenida solo se frena con la dificultad y el tope diario (R, inherente).

  La autoridad conserva las pruebas de una denuncia mientras la tiene en trámite (de `routing` en
  adelante, salvo `archived`); el panel muestra la fecha de borrado (`evidenceDeletionOn`), explica
  qué pasa al archivar y ofrece «Descartar pruebas», con confirmación, para el spam. Cada descarte
  queda en la bitácora (`evidence.discarded`) y la persona denunciante lo ve en su seguimiento.

- **C10.** Una carga hecha a mano con prefijo JPEG válido llega al decodificador del navegador de la
  autoridad. Recodificar en el servidor es trabajo futuro (P).
- **C16.** El servidor puede retener el último mensaje sin que se note; la bitácora registra cada
  `message.sent`.
- **C17.** Mientras el evento `complaint.received` no se publica (hasta que cierra su día), el panel
  muestra las llaves como «pendientes» de verificar. La comparación depende de que la persona
  denunciante haya verificado su evento contra su comprobante.
- **C19.** El freno global retrasa a todas las personas hasta 2 s y no limita el volumen de un
  atacante que envía en paralelo.
- **C20.** Si se alcanza el tope del día, las personas denunciantes no pueden escribir hasta que
  cierre (R); la autoridad sí. La prueba de trabajo adaptativa hace muy costoso llegar a 200 000
  eventos en un día desde celulares, pero no desde GPU (R, inherente). Las fechas de los eventos
  son monótonas solo respecto al último día encadenado: un salto del reloj hacia adelante deja
  pendientes con fecha futura, que se publican al llegar su día, pero los eventos nuevos vuelven al
  día real y el servidor avisa al operador.

## D. Autoridad y custodia de llaves

| #   | Ataque                                             | Categoría  | Mitigación                                                                                                                                                                                        | Estado    |
| --- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| D01 | La autoridad abre la identidad sin motivo          | LINDDUN N2 | El sobre solo se entrega por una ruta que registra el fundamento; la apertura es visible en el seguimiento. La entrega para el recurso de inconformidad exige también dos cuentas (G07)           | M parcial |
| D02 | Filtración posterior a la apertura                 | LINDDUN D2 | Registro de quién y cuándo (art. 64 LGRA)                                                                                                                                                         | R         |
| D03 | Robo de la llave privada de la autoridad           | STRIDE I   | La llave no vive en el servidor; se importa en memoria y se borra al cerrar sesión; rotación con `keyId`                                                                                          | R         |
| D04 | Una sola persona decide abrir                      | LINDDUN N2 | Aprobación de dos cuentas distintas de la autoridad competente (política del nodo, SEC-05); el umbral criptográfico 2 de 3 sigue planeado. Bloquear una cuenta custodia retrasa la apertura (G08) | M parcial |
| D05 | Identidad declarada falsa (suplantar a un tercero) | STRIDE S   | El panel muestra «Identidad declarada por la persona, no verificada»                                                                                                                              | R         |
| D06 | Cambio de administración y pérdida de llaves       | STRIDE D   | Procedimiento de rotación documentado                                                                                                                                                             | P         |

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
  En la red, cada autoridad genera su par en su equipo y solo entrega el candado (la pública) para
  el directorio firmado; el panel acepta solo la llave de la autoridad de la cuenta según el
  directorio verificado. Quien opera el nodo custodia la llave del buzón general, no la de cada
  autoridad: puede leer los hechos de lo que llega a su nodo, nunca la identidad sellada para una
  autoridad. Residual: lo que entra por la página propia del nodo sin pasar por la red (un solo
  nodo, o un cliente que no usa el directorio) se sella hacia la llave del buzón.

## E. Seguimiento

| #   | Ataque                                       | Categoría | Mitigación                                                                    | Estado    |
| --- | -------------------------------------------- | --------- | ----------------------------------------------------------------------------- | --------- |
| E01 | Pregunta del buzón diseñada para identificar | LINDDUN I | Revisor sobre la respuesta, aviso si se piden datos personales, bitácora      | M parcial |
| E02 | Sitio falso que pide las 8 palabras          | STRIDE S  | Educación y dominio visible                                                   | R         |
| E03 | Coacción para mostrar el seguimiento         | LINDDUN D | Palabras ocultas por defecto; salida rápida con botón o con Esc dos veces     | M parcial |
| E04 | Fuerza bruta del recibo                      | STRIDE S  | 88 bits y límite de fallos por folio                                          | M         |
| E05 | El límite de intentos bloquea a la persona   | STRIDE D  | Los accesos legítimos no consumen el límite de fallos; mensajes con su límite | M         |

## F. Legales e institucionales

| #   | Riesgo                                    | Mitigación                                                   | Estado |
| --- | ----------------------------------------- | ------------------------------------------------------------ | ------ |
| F01 | Orden de entrega de respaldos             | Identidad, buzón y pruebas cifrados; los hechos van en claro | R      |
| F02 | Obligación de modificar el código servido | Hashes publicados y verificador                              | P      |
| F03 | Reducción de sospechosos e interrogatorio | Fuera del alcance técnico; medidas de protección de la LGRA  | R      |

## G. Red federada y rendición de cuentas de la autoridad

G01 a G11 son los hallazgos de la sexta ronda de revisión (Etapa 5; H1 a H11 en el historial); G12 a
G20, los de la red de la versión 1.1.0; G21 a G25, los de las pruebas cifradas; G26 a G34, los
del endurecimiento para producción y la instalación (H01 a H25 en el
[registro de cambios](../CHANGELOG.md) y en [seguridad-produccion.md](seguridad-produccion.md)); y
G35 y G36, los del segundo factor del panel. El resumen está en
[historial-de-seguridad.md](historial-de-seguridad.md).

| #   | Ataque                                                                                             | Actor   | Categoría    | Mitigación propuesta                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Severidad  | Estado    |
| --- | -------------------------------------------------------------------------------------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------- |
| G01 | Turnar una denuncia a otro nodo con un comprobante ajeno para enterrarla o avisar otro folio       | A10, A9 | STRIDE T, R  | El turnado exige el comprobante del nodo destino ligado al folio y a la denuncia; el aviso a la persona usa solo ese comprobante                                                                                                                                                                                                                                                                                                                                                                 | Alta       | M         |
| G02 | Cerrar o calificar de forma que se declina una falta grave sin que llegue a la supervisora         | A10     | LINDDUN N2   | Regla pública de escalamiento para los cierres que declinan una falta grave (improcedente, no grave), con segunda llave de la supervisora                                                                                                                                                                                                                                                                                                                                                        | Alta       | M         |
| G03 | Usar la corroboración como oráculo de «¿hay denuncias contra X?» e inflar las fuentes              | A2, A9  | LINDDUN D, L | El índice no cuenta ni revela nada para una denuncia sin confirmar; confirmación al aceptar y baja del spam firmadas por el nodo; custodia liberada solo con fuentes confirmadas                                                                                                                                                                                                                                                                                                                 | Media      | M parcial |
| G04 | Publicar una historia reescrita del nodo con una secuencia mayor                                   | A9      | STRIDE T, R  | El enrutador y cada testigo descargan `ledgerEvents` entre la cabeza anterior y la nueva y verifican la cadena; si no pueden, rechazan y lo registran                                                                                                                                                                                                                                                                                                                                            | Media      | M         |
| G05 | La autoridad con conflicto de interés se justifica a sí misma y desactiva la regla                 | A10     | LINDDUN N2   | La justificación del conflicto la valida otra persona o la supervisora; la regla no se apaga con la palabra de quien tiene el conflicto                                                                                                                                                                                                                                                                                                                                                          | Media      | M         |
| G06 | Un aviso enviado el mismo día pero antes del archivo cuenta como notificación del archivo          | A10     | STRIDE R     | Comparar por instante (orden en la bitácora), no por día; el plazo corre desde el aviso posterior al acto                                                                                                                                                                                                                                                                                                                                                                                        | Media      | M parcial |
| G07 | La identidad para el recurso de inconformidad se entrega a una sola cuenta, sin vencimiento        | A10     | LINDDUN N2   | Entrega con aprobación de dos cuentas, vencimiento y evento público de la entrega                                                                                                                                                                                                                                                                                                                                                                                                                | Media      | M         |
| G08 | Bloquear la cuenta de una persona custodia con intentos fallidos para impedir una aprobación       | A10     | STRIDE D     | Freno global sin rechazo y aviso del intento en el registro de seguridad; desde H05 el tope por usuario (10 fallos en 15 min) rechaza también la contraseña correcta, y en la 1.1.0 los códigos equivocados del segundo factor suman en el mismo tope (también en un reto señuelo, para no revelar la contraseña). El bloqueo de 15 minutos sigue siendo posible y se acota con el panel detrás de VPN (G28); para aprobar ya no basta una contraseña robada: hace falta el segundo factor (G35) | Media-baja | M parcial |
| G09 | El conteo por hora incluye rutas de red, de inconformidad y de corroboración                       | A3      | LINDDUN L    | Excluir esas rutas del conteo por hora, como las de la persona denunciante                                                                                                                                                                                                                                                                                                                                                                                                                       | Baja       | M         |
| G10 | Volver a servir una versión anterior del directorio con llaves revocadas                           | A9      | STRIDE S     | Serial mínimo fijado en la raíz de confianza de la web y frescura (`issuedOn`, `validUntil`) al verificar                                                                                                                                                                                                                                                                                                                                                                                        | Baja       | M         |
| G11 | Entregar sobres al buzón de red de un nodo sin pasar por el enrutador                              | A9, A5  | STRIDE S, D  | El buzón de red acepta solo peticiones del enrutador (autenticación del enrutador o red interna), con la misma respuesta uniforme                                                                                                                                                                                                                                                                                                                                                                | Baja       | M         |
| G12 | La operación del enrutador cuenta denuncias por autoridad (OIC) leyendo el encabezado              | A9      | LINDDUN L, D | Sobre v2: el encabezado dice solo el nodo; la autoridad va cifrada y el nodo la entrega solo si la aloja; el sobre v1 se rechaza                                                                                                                                                                                                                                                                                                                                                                 | Media      | M         |
| G13 | Llenar la cola de entrega o colar denuncias sin trabajo por la entrega diferida                    | A2, A9  | STRIDE D, S  | Reto propio del enrutador de un solo uso; topes de sobres y bytes por nodo; el nodo acepta lo diferido solo con la etiqueta HMAC, solo denuncias con folio y con tope por hora                                                                                                                                                                                                                                                                                                                   | Media      | M         |
| G14 | Un nodo con software viejo (con fallas conocidas) sigue recibiendo denuncias                       | A9      | STRIDE T, I  | Versión mínima en el enrutador: no entrega a un nodo con versión menor o desconocida, avisa y la salud lo publica; lo que pidió la cola espera                                                                                                                                                                                                                                                                                                                                                   | Media-baja | M         |
| G15 | Robar o adivinar las credenciales OAuth que un nodo entregó a la SESNA                             | A9, A4  | STRIDE S     | Secretos aleatorios de 32 bytes y solo digestos en el nodo (scrypt para la contraseña); comparación en tiempo constante, también con clientes desconocidos; 429 tras 10 fallos                                                                                                                                                                                                                                                                                                                   | Media      | M         |
| G16 | Reusar un token de acceso filtrado contra el buzón o la estadística                                | A9, A5  | STRIDE S, I  | Tokens de 5 minutos con `aud` del nodo y permiso mínimo; el buzón exige además el HMAC del enrutador; los tokens no se registran ni se devuelven en errores                                                                                                                                                                                                                                                                                                                                      | Media-baja | M         |
| G17 | Reconstruir una celda suprimida con filtros o con cortes sucesivos de la estadística               | A9, A2  | LINDDUN I, L | Meses cerrados y congelados una vez; redondeo al azar con semilla que se borra al congelar; supresión bajo 5; filtros que solo eligen filas, sin totales ni marginales                                                                                                                                                                                                                                                                                                                           | Media      | M parcial |
| G18 | Un nodo publica de más (mes abierto, autoridad ajena) en la estadística nacional                   | A9      | STRIDE T     | El enrutador valida esquema (múltiplos de 5, mínimo 5), meses cerrados, autoridades del propio nodo y repetidas; descarta completo al nodo                                                                                                                                                                                                                                                                                                                                                       | Baja       | M         |
| G19 | La operación de la ventanilla cambia la tabla de funciones de un estado                            | A9      | STRIDE T     | Tabla firmada por su nodo dentro del directorio; el navegador rechaza la que no lleva esa firma o nombra autoridades de otro nodo o entidad; los testigos ven cada versión                                                                                                                                                                                                                                                                                                                       | Media      | M         |
| G20 | Colar una llave falsa por la solicitud de alta de una autoridad                                    | A9, A2  | STRIDE S     | Prueba de trabajo; se aprueba solo si la huella del candado leída por teléfono coincide con la que calcula el navegador de la operación, y el servidor la recalcula                                                                                                                                                                                                                                                                                                                              | Media      | M parcial |
| G21 | El nodo, la SESEA o la SESNA leen las pruebas que guardan o transportan                            | A9, A4  | LINDDUN D, I | Cifrado en el navegador hacia la autoridad (HPKE para la llave de cada archivo, folio y autoridad en el AAD); el nodo guarda solo el contenedor                                                                                                                                                                                                                                                                                                                                                  | Alta       | M         |
| G22 | Confirmar con la bitácora que una imagen conocida es la prueba de una denuncia                     | A10, A2 | LINDDUN I, L | Se ancla un compromiso con sal secreta de 32 bytes que viaja cifrada, no el SHA-256 de la imagen; sin la sal no se recalcula                                                                                                                                                                                                                                                                                                                                                                     | Media      | M         |
| G23 | Cambiar, reordenar o trasplantar una prueba cifrada sin que la autoridad lo note                   | A9      | STRIDE T     | Digesto del contenedor en el comprobante firmado y en evidence.received; el AAD liga folio, tipo y compromiso; el panel compara con lo anclado                                                                                                                                                                                                                                                                                                                                                   | Media      | M         |
| G24 | Quedarse con copias de las pruebas después de turnar la denuncia a otro nodo                       | A9, A10 | LINDDUN D    | Con el comprobante firmado del destino, el origen borra sus copias y registra evidence.custody_transferred; sin él las conserva                                                                                                                                                                                                                                                                                                                                                                  | Media      | M parcial |
| G25 | Supervisora o autoridad destino sin acceso a las pruebas cifradas hacia otra llave                 | A10     | STRIDE D     | Llave de cada archivo en la segunda llave; dentro del nodo, llaves re-cifradas en el navegador hacia la autoridad destino antes de turnar                                                                                                                                                                                                                                                                                                                                                        | Media-baja | M         |
| G26 | El operador de un nodo ve la conexión (IP, hora) de quien denuncia directo en su nodo              | A9      | LINDDUN L, I | Perfil `nodo` en producción: sin frente de denuncia directa, lista positiva de rutas (`http/exposure.ts`, H03); la persona denuncia solo en la ventanilla de la SESNA                                                                                                                                                                                                                                                                                                                            | Alta       | M         |
| G27 | Correlacionar por hora y tramo una entrada a la ventanilla con una entrega a un nodo               | A5, A9  | LINDDUN L    | Tramos de tamaño fijos y HMAC v2; no hay retardo mínimo ni tráfico de cobertura entre el enrutador y los nodos                                                                                                                                                                                                                                                                                                                                                                                   | Media      | Residual  |
| G28 | Bloquear 15 minutos la cuenta de una persona del panel con intentos fallidos                       | A2      | STRIDE D     | Panel solo por VPN o red institucional (frente «panel», Caddy en el 8443 con `SIGILO_PANEL_IPS`); el segundo factor (G35) evita que la adivinanza abra la cuenta, no el bloqueo                                                                                                                                                                                                                                                                                                                  | Media-baja | M parcial |
| G29 | Usar el paso del relevo del frente «panel» sin sesión como una ventanilla más                      | A2      | STRIDE S     | El paso sigue en el frente «panel» porque el turnado lo usa desde el navegador; solo se llega por VPN. Pendiente: exigir la sesión de la autoridad                                                                                                                                                                                                                                                                                                                                               | Baja       | M parcial |
| G30 | Colar un nodo o un `red.json` falsos durante la instalación                                        | A9, A2  | STRIDE S     | `red.json` firmado y huella de la red de 128 bits contra el oficio; solicitud firmada por el nodo y huella del nodo de 128 bits leída por teléfono a un número oficial; m de n testigos revisan el resumen de cambios                                                                                                                                                                                                                                                                            | Media      | M         |
| G31 | Robar la llave de enlace de la SESNA y derivar los secretos de todos los nodos                     | A9, A4  | STRIDE S, I  | Llave fuera del volumen del enrutador y respaldada como la de la operación; por época y rotable (`rotar-llaves --enlace`); el mismo alcance que ya tenían `relay-secrets.json` y `node-credentials.json`                                                                                                                                                                                                                                                                                         | Media      | M parcial |
| G32 | Leer lo que llega al buzón con la llave privada del buzón guardada en el servidor                  | A9, A4  | LINDDUN D    | La instalación y `red:demo` la dejan fuera del volumen del nodo (o la crea el buzón en su navegador); `sigilo diagnostico` la marca si aparece en `datos/`                                                                                                                                                                                                                                                                                                                                       | Alta       | M         |
| G33 | Un nodo real arranca con datos sintéticos, reloj simulado o rutas de prueba                        | A9      | STRIDE T     | Con `NODE_ENV=production`, `SIGILO_E2E=1` impide arrancar y `SIGILO_DEMO=1` avisa en cada arranque; el reloj simulado y las fuentes sintéticas ya se rechazaban; `sigilo diagnostico` lo marca                                                                                                                                                                                                                                                                                                   | Media      | M         |
| G34 | Sustituir las llaves que la web lee en `/config/sigilo.json`                                       | A9      | STRIDE S, T  | Mismo origen y misma confianza que el bundle (ADR 0011); la web sigue verificando el directorio contra la raíz y las llaves servidas; archivo inválido = la web no se monta; `sigilo diagnostico` compara con `red.json`                                                                                                                                                                                                                                                                         | Media      | M         |
| G35 | Entrar al panel o aprobar una apertura con una contraseña robada (phishing, reutilización)         | A2, A10 | STRIDE S     | Segundo factor TOTP (RFC 6238) obligatorio con `SIGILO_MFA=requerido` (por omisión en producción y en el perfil «nodo») para toda función, también la operación del nodo; cada código sirve una sola vez; el primer paso no revela si la contraseña era correcta; secreto cifrado en reposo con `mfa-key`. Residual: TOTP no resiste un phishing en tiempo real (WebAuthn es el siguiente paso)                                                                                                  | Media-baja | M parcial |
| G36 | Inscribir un segundo factor propio con la contraseña temporal de otra persona, o pedir su reinicio | A2, A10 | STRIDE S     | La contraseña temporal se entrega en persona y la cuenta inscribe el factor en su primer acceso; `mfa_enrollment_required`, `mfa_enrolled` y `mfa_reset` quedan en el registro de seguridad; `./sigilo cuenta reiniciar-mfa` exige confirmar en persona y deja sin panel las sesiones abiertas de la cuenta                                                                                                                                                                                      | Media-baja | M parcial |

Notas:

- **G35 y G36 (segundo factor).** Ver [seguridad-produccion.md](seguridad-produccion.md#segundo-factor-del-panel).
  El código TOTP se puede robar en tiempo real con una página falsa que lo pida y lo use enseguida;
  una llave de seguridad o una passkey (WebAuthn, ya permitida por la Permissions-Policy para el
  propio origen) lo resolvería y es el siguiente paso, también para aprobar aperturas. Quien
  tenga la base y `mfa-key` (por ejemplo, un respaldo con su frase) obtiene los secretos TOTP.

- **G26 a G34 (producción e instalación).** Ver [seguridad-produccion.md](seguridad-produccion.md),
  [instalacion-nodo.md](instalacion-nodo.md) y el
  [ADR 0011](adr/0011-configuracion-en-tiempo-de-ejecucion.md). G26 depende de que nadie defina
  `SIGILO_NODE_INTAKE=1`: con él, el nodo vuelve a ver las conexiones de quien denuncia. G27 es un
  residual de diseño (riesgo 24). G28 y G29 son aceptables solo con el panel detrás de VPN.

- **G21 a G25.** Pruebas cifradas de extremo a extremo y cadena de custodia (ver
  [criptografia.md](criptografia.md), «Pruebas cifradas de extremo a extremo»). Residuales: la
  autoridad que abre las pruebas puede copiarlas fuera del sistema (G24 solo controla las copias
  del nodo); el nodo ya no comprueba el tipo real de la imagen, lo hace el panel antes de
  mostrarla; el tamaño de cada contenedor sigue visible; y una autoridad que turna dentro del nodo
  sin compartir las llaves deja a la destino sin pruebas (el panel lo impide, la API no puede).

- **G03.** Conocer una etiqueta basta para preguntar por ella: cualquiera puede enviar una denuncia
  de sondeo con la etiqueta de un identificador, y el nodo la registra. Con la corrección, el
  estado de una denuncia sin confirmar es idéntico haya o no otras denuncias, no cuenta para las
  demás y el nodo da de baja el spam. Residual (riesgo 17): una persona del nodo que acepta un
  sondeo, lo deja 30 días sin baja o lo marca como custodia aprende si hay fuentes confirmadas y
  suma una fuente; queda en la bitácora del nodo.
- **G04.** El enrutador ya rechazaba una cabeza que retrocede o que repite la secuencia con otro
  hash, pero aceptaba cualquier secuencia mayor. Con la corrección, una cabeza nueva solo se acepta
  si el nodo sirve el tramo que la une con la anterior. Residual (riesgo 18): la primera cabeza que
  ve un testigo nuevo no tiene con qué compararse, y un nodo que no sirve su bitácora deja de
  avanzar en la bitácora nacional.
- **G15–G17 (APIs entre la SESNA y los nodos).** El nodo es su propio servidor de autorización
  y la SESNA el cliente, como en las APIs de la PDN. Residual (riesgo 20): el bloqueo por fallos
  es por cliente, así que quien conozca el identificador `sesna` puede forzar `429` hasta 15
  minutos y retrasar entregas y consultas (los sobres se responden con relleno); los secretos de
  32 bytes no se pueden adivinar, el bloqueo protege sobre todo la contraseña del flujo
  `password`. Residual (riesgo 21): la estadística por autoridad y conducta es más fina que el
  CSV; una fila con un solo indicador publicado revela que los demás quedaron bajo 5 (como la
  supresión del CSV) y las medianas, aun con 10 observaciones, describen a un grupo pequeño.
- **G10.** Una versión vieja del directorio sigue bien firmada y cofirmada. La raíz de confianza
  admite `minDirectorySerial` y `maxDirectoryAgeDays`, y el directorio, `validUntil`. Residual
  (riesgo 19): una web construida antes de una revocación acepta copias viejas hasta su
  `validUntil` o hasta que se reconstruya con el serial nuevo.
- **G12.** Con el sobre v1 el enrutador leía `to` (la autoridad) y podía llevar, sin guardar
  nada, un conteo de denuncias por OIC. Con el sobre v2 ve el nodo (estado), el tramo de tamaño,
  la hora y la conexión, nada más; el seguimiento, las respuestas del buzón, la inconformidad y la
  búsqueda del folio en todos los nodos (`receivingAuthorityPerNode`) viajan con el mismo
  encabezado. Residual: en un nodo que aloja una sola autoridad, el nodo equivale a la autoridad;
  y el tramo y la hora siguen visibles (ver «Qué metadatos ve el enrutador» en su README).
- **G13.** La cola guarda sobres cerrados: el enrutador no los abre, pero mientras esperan su
  base contiene el sobre, el nodo, el día y el siguiente intento (de los que se deduce la hora
  aproximada de llegada). Al entregar o vencer se borran con `secure_delete` y se vacía el WAL.
  Un enrutador comprometido podría meter denuncias sin prueba de trabajo del nodo por la entrega
  diferida: el tope por hora del nodo (`MAX_DEFERRED_PER_HOUR`) lo acota. Residual: lo que vence
  a los 7 días sin que el nodo vuelva se pierde; la persona no recibe aviso (su folio no aparece
  en «Mi denuncia») y la web lo advierte al dejarla en la cola.
- **G19.** Un estado sí puede declarar una tabla que no corresponde a su ley: la firma prueba quién
  la declaró, no que sea correcta. «¿Quién atiende tu denuncia en tu estado?» la publica para que
  cualquiera la revise.
- **G20.** La huella solo protege si la llamada va a un número obtenido por otra vía, no al de la
  solicitud; el paso 4 (agregar la entrada al directorio) sigue siendo manual.
- **G14.** La versión la declara el propio nodo en `GET /api/v1/red/health`: un nodo puede
  mentir. La mínima sirve para detener a tiempo los nodos que no se han actualizado, no contra
  uno malicioso (que ya es A9). La salud se publica sin autenticación: revela qué nodo está caído
  y cuántos sobres esperan para él, nunca qué autoridad ni qué denuncia.

## Riesgos residuales principales

1. El contenido de los hechos puede identificar a la persona; el revisor ayuda pero no garantiza.
2. Un servidor comprometido puede servir código malicioso a usuarios futuros y robar la llave de la
   autoridad cuando se importa.
3. Un dispositivo o una red vigilados quedan fuera de lo que una aplicación web puede controlar.
4. Con un solo destinatario, la autoridad competente puede abrir la identidad; la bitácora lo hace
   visible pero no lo impide. El umbral 2 de 3 reduce este riesgo.
5. Los respaldos contienen los hechos en claro; las pruebas van cifradas hacia la autoridad (G21).
6. Entre dos anclas, la operación con la llave del servidor puede rehacer la bitácora.
7. El relleno de celdas puede hacer cruzar el umbral de publicación en los datos abiertos.
8. La cuota de almacenamiento es global y puede agotarse para todos (el disco como palanca); la
   autoridad la libera descartando pruebas y la retención la libera a los 30 días.
9. El perfil sRGB genérico se acepta por su descripción, no por su contenido.
10. Los retos de prueba de trabajo emitidos con poca carga sirven, a su dificultad, durante su
    vigencia.
11. La prueba de trabajo es asimétrica: una GPU resuelve mucho más rápido que un celular básico y
    puede alcanzar el tope diario de la bitácora.
12. Unas 100 denuncias pueden llenar la cuota de pruebas (`storage_full`) hasta que la autoridad
    las descarte o venza su retención.
13. Un tope global sin identidad siempre funciona como palanca para dejar fuera a todos.
14. Mientras el reloj del servidor está adelantado, los eventos se fechan en el futuro.
15. Sin anclas, el servidor puede mostrar bitácoras distintas a distintas personas.
16. Las marcas legítimas sobre vocales (`LEGITIMATE_MARKS`) se conservan a propósito por las lenguas
    indígenas, y pueden servir de canal de marca.
17. Una persona del nodo que acepta una denuncia de sondeo, la deja 30 días sin dar de baja o la
    marca como custodia aprende si hay otras fuentes confirmadas contra el identificador y suma una
    fuente (G03); lo acotan la bitácora del nodo y el auditor.
18. La historia de un nodo solo se verifica si el nodo sirve su bitácora y desde la segunda cabeza
    que ve cada verificador: la primera cabeza no tiene con qué compararse (G04).
19. Hasta reconstruir la web con el serial nuevo o hasta el `validUntil` del directorio, una copia
    anterior con llaves revocadas sigue verificando (G10).
20. Quien conozca el identificador del cliente de la SESNA puede bloquearlo 15 minutos ante un
    nodo con intentos fallidos y retrasar entregas y consultas (G15).
21. La estadística para la PDN es más fina que el CSV de datos abiertos: lo suprimido se nota por
    ausencia y una mediana describe a un grupo de al menos 10 (G17).
22. Un nodo en perfil «nodo» no recibe conexiones directas de quien denuncia: la denuncia entra solo
    por la ventanilla de la SESNA. El residual queda en un nodo que reabre la recepción
    (`SIGILO_NODE_INTAKE=1`), cuyo operador vuelve a ver esas conexiones (G26).
23. El paso del relevo sigue en el frente «panel» y se usa sin sesión: quien llegue a la red del
    panel puede usarlo como cualquier persona usa la ventanilla (G29).
24. Persiste la correlación por tiempo y tramo del tráfico del enrutador hacia un nodo: no hay
    retardo mínimo ni tráfico de cobertura (G27).
25. Un tercero que conozca un usuario del panel puede bloquearlo 15 minutos; es aceptable solo con
    el panel detrás de VPN (G28).
26. El segundo factor del panel es TOTP (G35): ya no basta una contraseña robada, pero un phishing
    en tiempo real puede pedir el código y usarlo dentro de su ventana de 30 s, y un código de
    recuperación robado sirve una vez. La inscripción en el primer acceso confía en quien tenga la
    contraseña temporal (G36). WebAuthn (llaves de seguridad o passkeys) es el siguiente paso,
    también para aprobar aperturas. Con `SIGILO_MFA=opcional` (la demostración), las cuentas sin
    factor inscrito siguen entrando solo con contraseña.

Residuales inherentes (no tienen corrección dentro del diseño; se aceptan y se documentan):

- **Tope diario frente a GPU.** Un atacante con GPU puede llegar a los 200 000 eventos del día; la
  autoridad sigue escribiendo, las personas denunciantes no hasta que cierre el día (C20).
- **El disco como palanca.** La cuota es un límite físico; llenarla deja sin subidas a todos hasta
  el descarte o la retención (C09).
- **Inundación de denuncias de solo texto.** No ocupan cuota de pruebas; solo las frenan la
  dificultad y el tope diario (C09).
- **Vista dividida sin anclas.** Sin anclas publicadas fuera del servidor no se detecta (C05).
- **Marcas visibles.** Un canario hecho con sinónimos, con el orden de las frases o con marcas
  legítimas conservadas no se puede quitar sin dañar el texto (A03, A04).
- **La persona ciudadana ya vista.** Si la persona denunciada atendió cara a cara a quien denuncia,
  puede deducir quién fue; el anonimato la protege del resto, no de ese recuerdo. Lo reducen el
  revisor de trámites, placas y direcciones, el aviso de la revisión y la corroboración; la LGRA no
  prevé medidas de protección para particulares ([personas-ciudadanas.md](personas-ciudadanas.md)).
- **Dificultad sostenida en el máximo.** Un ataque continuo mantiene la prueba de trabajo en 20
  bits: las personas legítimas esperan lo que tarda ese reto (hasta unos 63 s en un celular básico
  el 95 % de las veces), pero no quedan fuera (C09).

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

Cuarta ronda:

| #   | Hallazgo                                                                                   | Corrección                                                                                  |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| N1  | Los frenos globales de escrituras servían de palanca para dejar fuera a todas las personas | Se retiraron; quedan la prueba de trabajo adaptativa, la cuota y el tope diario (C09)       |
| N2  | Una denuncia con pruebas resolvía hasta 11 retos                                           | Un reto `complaint` cubre sus hasta 10 pruebas; `purpose=evidence` responde 400 (C09)       |
| N3  | Un reto de baja dificultad seguía sirviendo después de subir la carga                      | `verify` exige `bits >= max(base, actual - 1)` (C09)                                        |
| N4  | Con 24 bits y vigencia fija, un celular básico podía no terminar a tiempo                  | Máximo de 20 bits y vigencia `margen + 4 · p95` calibrada a 50 mil hashes por segundo (C09) |
| N5  | El desalojo borraba pruebas de corrupción para hacer sitio                                 | Sin reserva ni desalojo: `507 storage_full`; fecha de borrado visible en el panel (C09)     |
| N6  | Un atacante podía llenar el día y bloquear a la autoridad                                  | Eventos de la autoridad exentos de `ledger_day_full` (C20)                                  |
| N7  | Las lecturas publicaban días cerrados y bloqueaban el servidor                             | Tarea programada asíncrona cada 10 minutos, lotes de 1000 con `setImmediate` (C20)          |
| N8  | Un reloj que retrocedía podía romper el orden de fechas de la cadena                       | Fechas monótonas e índice `(at, seq)` (migración 5) (C05)                                   |
| N9  | Dos servidores podían ver un bloqueo vacío o a medio escribir                              | `server.lock` con temporal y `linkSync`, gracia de 10 s (C21)                               |

Quinta ronda (cierre):

| #    | Hallazgo                                                                                                    | Corrección                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R5-1 | La cuota quedaba bloqueada 31 días, o para siempre si la autoridad archivaba el spam                        | Retención también para `archived`, acción «Descartar pruebas» con `evidence.discarded` visible en el seguimiento y aviso del panel corregido (C09) |
| R5-2 | Llenar las pendientes bloqueaba las subidas de 24 a 48 h                                                    | Pruebas por reto en memoria, purgadas al vencer el reto más 30 minutos; cada subida cuenta como carga (C09)                                        |
| R5-3 | `/seguimiento` decía «coincide con los anclajes» sin compararlos si eran anteriores al tramo                | `anchor-not-comparable` en `verifyEventInChain`; descarga desde el ancla más antigua y frase honesta en el seguimiento y en el buzón (C05)         |
| R5-4 | Un salto del reloj hacia adelante dejaba todo fechado en el futuro, la cabeza detenida y el tope compartido | La fecha mínima es solo el día siguiente al último encadenado; aviso al operador (C20)                                                             |
| R5-5 | `SIGILO_POW_MAX_BITS` sin tope de separación, `sentOn` del reloj y retos gastados por cuerpos inválidos     | Máximo de la base más 2 validado al arrancar, `sentOn` con la fecha del evento y el uso se gasta tras validar el cuerpo (C09)                      |

## Observaciones sobre sistemas de terceros

Las observaciones sobre sistemas de terceros se comunican primero a la institución responsable.
