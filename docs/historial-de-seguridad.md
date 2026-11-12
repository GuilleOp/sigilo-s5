# Historial de seguridad

Resumen de las seis rondas de revisión y corrección de SIGILO antes de la versión v1 y de la
revisión de la versión 1.1.0 (red de producción, pruebas cifradas e instalación), pensado para la
presentación. El detalle de cada hallazgo y su estado vigente está en el
[modelo de amenazas](modelo-de-amenazas.md) (sección «Historial de seguridad») y en el
[registro de cambios](../CHANGELOG.md). Los identificadores entre paréntesis (A09, C05…) remiten a
las filas del modelo de amenazas.

## Cómo se trabajó

Cada ronda empezó con una revisión adversarial del código (no de la documentación), con pruebas de
concepto que demostraban cada hallazgo contra el servidor real en memoria. Cada corrección se cerró
con una prueba unitaria o E2E que falla sin ella, y la ronda terminó con `npm run check`, la
construcción de la web y la suite E2E en verde. Las pruebas de concepto se volvieron a ejecutar
después de corregir.

## Resultado por ronda

| Ronda | Hallazgos altos                                                                                                                                                                          | Cómo se cerraron                                                                                                                                                               | Evidencia                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1     | Trasplante del sobre de identidad a otra denuncia (C07); bitácora en tiempo real que revelaba la hora de cada envío (A09); límite por folio que bloqueaba a la persona legítima (E05)    | AAD ligado a `authVerifier`, `reporterKeys` y `contentDigest` con índice único; publicación por lotes diarios; solo cuentan los fallos de acceso                               | `e2e/transplant.spec.ts`, `packages/core/src/identity.test.ts`, `apps/server/src/routes/tracking.test.ts` |
| 2     | Orden dentro del día igual al de llegada (A09); aperturas de identidad que el servidor podía ocultar (D01); llaves del buzón sin verificar en modo anónimo (C17)                         | Pendientes barajados con Fisher-Yates criptográfico al cerrar el día; `receiptTag` y conciliación en el seguimiento; verificación contra `complaint.received` publicado        | `apps/server/src/ledger-service.test.ts`, `apps/web/src/crypto/crypto-flow.test.ts`                       |
| 3     | El `rowid` conservaba el orden de llegada en una copia de la base (A09); eventos aceptados sin probar su pertenencia a la cadena (C05); cadena con fechas que retrocedían (C05)          | Migración 4 (`WITHOUT ROWID`, `secure_delete`, checkpoint del WAL); `verifyEventInChain` hasta la cabeza firmada; `verifyChain` exige fechas no decrecientes                   | `apps/server/src/db/database.test.ts`, `packages/core/src/ledger.test.ts`                                 |
| 4     | Frenos globales que servían de palanca para dejar fuera a todos (C09); desalojo que borraba pruebas de corrupción (C09); un atacante podía llenar el día y bloquear a la autoridad (C20) | Sin frenos globales, solo prueba de trabajo adaptativa; `507 storage_full` sin borrar pruebas asociadas; eventos de la autoridad exentos de `ledger_day_full`                  | `apps/server/src/security/proof-of-work.test.ts`, `apps/server/src/routes/evidence.test.ts`               |
| 5     | Ninguno alto ni crítico. Cinco defectos corregibles (R5-1 a R5-5), el principal de severidad media: la cuota podía quedar bloqueada para siempre por spam archivado                      | Retención también para `archived` y «Descartar pruebas» visible en el seguimiento; purga de pendientes por reto; anclas «no comparables»; fecha mínima sin el último pendiente | Ver la tabla siguiente                                                                                    |

## Quinta ronda en detalle

| #    | Defecto                                                                  | Corrección                                                                                                                | Evidencia                                                                                                                                     |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R5-1 | Cuota bloqueada 31 días, o para siempre si se archivaba el spam (media)  | Retención para `received` y `archived`; acción «Descartar pruebas» con `evidence.discarded`; aviso del panel corregido    | Prueba de concepto `r5-storage`: con denuncias archivadas, de 0 a 20 purgadas y la subida pasa de 507 a 201; `evidence.test.ts`; E2E          |
| R5-2 | Llenar las pendientes bloqueaba las subidas de 24 a 48 h                 | Pruebas por reto en memoria, purgadas al vencer el reto más 30 minutos; cada subida cuenta como carga                     | `r5-storage`: la subida legítima pasa de 507 a 201 desde el mismo día; `evidence.test.ts`, `proof-of-work.test.ts`                            |
| R5-3 | «Coincide con los anclajes» sin haberlos comparado                       | `anchor-not-comparable`; descarga desde el ancla más antigua y frase honesta en el seguimiento y el buzón de la autoridad | `r5-anchor-vacuous`: el ancla contradictoria pasa de `valid` a `anchor-not-comparable`; `ledger.test.ts`, `crypto-flow.test.ts`               |
| R5-4 | Un salto del reloj hacia adelante dejaba la bitácora detenida            | Fecha mínima = día siguiente al último encadenado; aviso al operador si hay pendientes con fecha futura                   | `r5-clockforward`: de `503` y cabeza en seq 0 a fechas del día real y cabeza que avanza; `r4-clockback` sin cambios; `ledger-service.test.ts` |
| R5-5 | Separación de bits sin tope, `sentOn` del reloj, retos gastados en balde | `SIGILO_POW_MAX_BITS` ≤ base + 2 al arrancar; `sentOn` con la fecha del evento; el uso se gasta tras validar el cuerpo    | `config.test.ts`, `tracking.test.ts`, `proof-of-work.test.ts`; `r5-inflight` muestra por qué la separación debe ser de a lo más 2 bits        |

## Sexta ronda (Etapa 5, red y rendición de cuentas)

Revisión de la red federada, la corroboración ciega y las reglas de rendición de cuentas de la
autoridad. Cada hallazgo tiene su fila en la sección G del
[modelo de amenazas](modelo-de-amenazas.md) y una prueba de concepto; la coordinación actualiza el
estado al integrar cada corrección.

| #   | Hallazgo                                                                                                      | Severidad  | Fila | Corrección propuesta                                                                                                                                     | Estado    |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| H1  | El turnado entre nodos acepta un comprobante ajeno: se puede enterrar la denuncia o avisar otro folio         | Alta       | G01  | Comprobante del nodo destino ligado al folio y a la denuncia                                                                                             | M         |
| H2  | Un cierre o una calificación que declina una falta grave no llega a la supervisora                            | Alta       | G02  | Regla pública de escalamiento con segunda llave de la supervisora                                                                                        | M         |
| H3  | La corroboración funciona como oráculo de «¿hay denuncias contra X?» y una denuncia de sondeo suma fuentes    | Media      | G03  | Solo cuentan y se revelan las coincidencias confirmadas o envejecidas; confirmación y baja firmadas por el nodo                                          | M parcial |
| H4  | La bitácora nacional y los testigos aceptan una historia reescrita del nodo con secuencia mayor               | Media      | G04  | El enrutador y los testigos verifican el tramo de `ledgerEvents` entre cabezas; rechazo registrado                                                       | M         |
| H5  | La autoridad con conflicto de interés se autojustifica y apaga la regla de escalamiento                       | Media      | G05  | La justificación la valida otra persona o la supervisora                                                                                                 | M         |
| H6  | La notificación se compara por día y no por instante: un aviso anterior al acto cuenta como notificación      | Media      | G06  | Comparar por orden en la bitácora                                                                                                                        | M parcial |
| H7  | La identidad para el recurso de inconformidad se entrega a una sola cuenta, sin vencimiento ni evento público | Media      | G07  | Dos aprobaciones, vencimiento y evento público                                                                                                           | M         |
| H8  | Se puede bloquear la cuenta de una persona custodia con intentos fallidos                                     | Media-baja | G08  | Freno sin bloqueo o desbloqueo por la supervisora, con aviso; la 1.1.0 (H05) volvió al bloqueo de 15 minutos y lo acota con el panel detrás de VPN (G28) | M parcial |
| H9  | El conteo por hora incluye rutas de red, de inconformidad y de corroboración                                  | Baja       | G09  | Excluirlas del conteo                                                                                                                                    | M         |
| H10 | Se puede volver a servir una versión anterior del directorio                                                  | Baja       | G10  | Serial mínimo y frescura en la verificación del directorio                                                                                               | M         |
| H11 | El buzón de red de un nodo acepta sobres que no pasaron por el enrutador                                      | Baja       | G11  | Aceptar solo peticiones del enrutador                                                                                                                    | M         |

Residuales: H3 (M parcial) conserva el oráculo inherente a la corroboración ciega para quien
adivina un identificador y tiene acceso al panel de la autoridad competente (ver G03); H6 (M parcial)
compara la notificación por número de secuencia del buzón, pero aún no la marca como aviso dentro
del AAD firmado; H8 (M parcial) admite de nuevo el bloqueo de 15 minutos desde la 1.1.0 (ver G08 y
G28). Las pruebas de regresión están en `apps/server/src/security-regressions.test.ts`,
`apps/corroboracion/src/oracle.test.ts`, `packages/red/src/node-history.test.ts` y
`packages/red/src/directory.test.ts`.

## Versión 1.1.0 (producción, pruebas cifradas e instalación)

Los identificadores de esta revisión llevan dos dígitos (H01 a H25) para no confundirse con los de
la sexta ronda (H1 a H11). El detalle está en el [registro de cambios](../CHANGELOG.md), sección
«Seguridad» de la 1.1.0, y los riesgos que quedan en
[seguridad-produccion.md](seguridad-produccion.md#4-riesgos-que-quedan).

| Tema                                     | Corrección                                                                                                                            | Filas     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| El operador del nodo veía la conexión    | Perfil `nodo`: sin denuncia directa; la persona denuncia solo en la ventanilla de la SESNA (H03)                                      | G26       |
| Sobres repetibles entre enrutador y nodo | Etiqueta HMAC v2 con marca de tiempo y nonce de un solo uso, y `https://` hacia los nodos (H13)                                       | G27       |
| Pruebas en claro en el disco del nodo    | Cifradas en el navegador hacia la autoridad, compromiso salado anclado y cadena de custodia al turnar                                 | G21 a G25 |
| Llave del buzón en el servidor           | Fuera del volumen del nodo en la instalación y en `red:demo`; `sigilo diagnostico` la marca                                           | G32       |
| Secretos compartidos por correo u oficio | Derivados con X25519 y HKDF en los dos lados; alta con huellas de 128 bits leídas por teléfono                                        | G30, G31  |
| Contenedores y cadena de suministro      | Límites de recursos, solo lectura, sin capacidades, imagen por digesto, acciones fijadas por SHA, SBOM y firma de imágenes (H10, H15) | —         |

Lo que sigue abierto (segundo factor del panel, paso del relevo sin sesión, análisis de tráfico,
detección de reuso del token de renovación) está en la sección 4 de la guía de producción y en
G27 a G29 del modelo de amenazas.

## Lo que queda (residuales inherentes)

No tienen corrección dentro del diseño; se aceptan y se explican en el modelo de amenazas:

- **Tope diario frente a GPU.** Un atacante con GPU puede llenar los 200 000 eventos del día; la
  autoridad sigue escribiendo.
- **El disco como palanca.** Llenar la cuota deja sin subidas a todos hasta el descarte o la
  retención.
- **Inundación de denuncias de solo texto.** Solo la frenan la dificultad y el tope diario.
- **Vista dividida sin anclas.** Sin anclas publicadas fuera del servidor no se detecta.
- **Marcas visibles.** Un canario con sinónimos o con marcas legítimas conservadas no se puede quitar
  sin dañar el texto.
- **Dificultad sostenida en el máximo.** Durante un ataque continuo, las personas legítimas esperan
  lo que tarda un reto de 20 bits, pero no quedan fuera.

Además siguen los riesgos de fondo de cualquier aplicación web: el contenido de los hechos puede
identificar a la persona, un servidor comprometido puede servir código malicioso y los dispositivos
o redes vigilados quedan fuera del control de la aplicación.
