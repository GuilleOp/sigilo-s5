# Registro de cambios del Estándar S5

Solo los cambios de la especificación (`estandar/`); los del software están en el
[`CHANGELOG.md`](../CHANGELOG.md) de la raíz. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
[SemVer](https://semver.org/lang/es/) (`STANDARD_VERSION`, en `info.version` de cada OpenAPI).
Mientras la versión mayor sea 0, una versión menor puede romper la compatibilidad; cada cambio que
rompe algo está marcado como **Incompatible**.

## [Sin publicar]

## [0.4.0] - 2026-11-16

Ciclo de vida legal completo de la denuncia según la LGRA y, en la vía penal, el CNPP. Todo es
nacional: las etapas, acciones, recursos, funciones, plazos y motivos de cierre usan solo las
leyes generales; cada nodo asigna quién cumple cada función. Detalle en
`docs/ciclo-de-vida-legal.md`.

### Agregado

- Etapas administrativas nuevas: `report_prevented` (prevención del informe, art. 195),
  `abstention` (art. 101), `report_admitted` (art. 208 fr. I), `summoned` (art. 208 fr. II),
  `initial_hearing` (art. 208 fr. III a VII), las etapas del Tribunal `court_received`,
  `court_evidence_hearing`, `court_closing_arguments`, `court_instruction_closed` y
  `court_resolution` (art. 209), `final` (art. 206) y `executed` (arts. 222 y 225).
- Transiciones con sus dos ramas después de la audiencia inicial (no grave ante la substanciadora
  y resolutora; grave o de particulares ante el Tribunal), la devolución del Tribunal y la función
  que da cada paso (`ADMINISTRATIVE_TRANSITIONS`, `CRIMINAL_TRANSITIONS`; catálogo
  `transiciones`).
- Vía penal en una capa aparte (`criminalStage` en `ProcedureState` y `ProcedureView`), en paralelo
  a la administrativa, con las etapas `criminal_complaint_filed`, `prosecutor_determination`,
  `judicial_review` y `alternative_exit`.
- Función de cuenta `court` (Tribunal): solo actúa en sus etapas y en los recursos que resuelve. Si
  el estado no le da cuentas, la substanciación registra sus actuaciones con `courtRecord`
  (número de expediente y fundamento), marcado en la línea de tiempo como registro de otra
  autoridad.
- Acciones `order_reclassification`, `request_precautionary`, `decide_precautionary`,
  `file_remedy`, `resolve_remedy`, `refer_to_prosecutor`, `flag_federal_funds`,
  `send_federal_notice`, `register_sanction` y `record_withdrawal`; `advance_stage` admite
  `legalBasis`, `agreement` y `courtRecord`; `close` admite `legalOutcome`, `destination` y
  `courtRecord`.
- Pasos nuevos de la línea de tiempo (`ProcedureAction`) y sus datos (`ProcedureStep.record`).
- Recursos (`RemedyKind`: inconformidad, reclamación, revocación, apelación y revisión) con su
  resultado (`RemedyOutcome`), quién los presenta (`RemedyFiledBy`) y su efecto; catálogo
  `recursos`.
- Motivo legal del cierre (`LegalClosureReason`), aparte de los seis motivos del S5; catálogo
  `motivos-legales-cierre`.
- Plazos nuevos: prevención y admisión del informe, audiencia inicial, cita de las partes (en
  horas: unidad `hours`), pruebas, alegatos, resolución y su notificación, envío al Tribunal,
  reclasificación, medidas cautelares, reclamación, revocación, apelación, revisión, informe de
  ejecución e impugnación de la determinación del Ministerio Público.
- Estatus de la API v1 `in_procedure`, `in_court`, `under_remedy`, `final_sanction`,
  `final_no_sanction` y `prescribed_or_expired`, también en la estadística de la PDN.
- `ProcedureView`: abstención, inconformidad (con el plazo contado por el nodo), recursos, medida
  cautelar (sin la medida concreta para la persona), recursos federales, inscripción de la sanción
  en el S3 y, en el panel, si la substanciación registra las actuaciones del Tribunal.
- Regla de recursos federales en entes locales (`FEDERAL_FUNDS_RULE`): ASF, SABG y FGR con su
  fundamento, en los dos sentidos entre el nodo Federal y los estatales.
- Catálogo `etapas-legales`.

### Cambiado

- **Incompatible:** el aviso de inconformidad (`POST trackingAppeal`) ya no es la inconformidad: el
  recurso cuenta cuando la autoridad registra el escrito con firma autógrafa (`file_remedy` con
  `signed: true`, LGRA art. 109). `AppealResponse.resolutionDueOn` queda obsoleto y ya no se envía;
  se agrega `filingDueOn`. El plazo `appeal_resolution` corre desde el escrito firmado.
- **Incompatible:** las etapas penales ya no van en `legalStage` sino en `criminalStage`; los saltos
  de etapa ya no se aceptan (cada paso sigue una transición del catálogo) y `case_file_sent` solo
  cabe en la rama grave.
- El estatus de las etapas posteriores a la admisión del informe es `in_procedure` o `in_court`
  (antes `classified`).
- El semáforo de turnado se nombra «meta de turnado del S5»: no es un plazo legal.
- `estatusAlCierre` de la estadística de la PDN trae los estatus nuevos; los meses congelados antes
  los publican como suprimidos.

## [0.3.0] - 2026-11-12

Perfil de conexión con la PDN: el grupo «PDN» se publica y se comporta como las especificaciones
del S2 y del S3, y como lo prueba ValidAPI, la herramienta con que la SESNA valida a los
proveedores.

### Agregado

- Grupo «PDN»: servidor de autorización OAuth 2.0 del nodo (`/oauth/token`), estadística agregada
  con paginación (`/v1/denuncias/estadisticas`) y su catálogo de autoridades, con la metodología
  del S2 y del S3. Salió con el software 1.1.0 todavía con la etiqueta 0.2.0; desde aquí tiene su
  versión.
- Un documento OpenAPI por grupo en `oas/`, con el nombre al estilo de la PDN
  (`OAS_API_S5_<Descripción>.json`), en **OpenAPI 3.0.3**: el Swagger UI de la PDN solo reconoce
  `3.0.x`. El perfil PDN (`OAS_API_S5_Estadisticas_Denuncias.json` y `.yaml`) trae solo
  `POST /oauth/token`, `POST /v1/denuncias/estadisticas` y
  `GET /v1/denuncias/estadisticas/autoridades`, con los esquemas `resError` y `resErrorToken`.
- El estándar completo también en OpenAPI 3.0.3 (`openapi-3.0.json`), convertido sin perder
  significado; `openapi.yaml` y `openapi.json` siguen en 3.1 y son la referencia.
- Swagger UI con el desplegable `urls` (perfil PDN, denuncia y seguimiento, red, corroboración y
  el completo), también servido por el enrutador en `/estandar/swagger/`.
- `diccionario-de-datos-pdn.csv` y `.md`: el diccionario solo del perfil PDN.
- Catálogos en `catalogos/`, en pares `.csv` y `.json` de `{ clave, valor }` como los de
  `PDNMX/catalogos`: `faltas` (con `claveLey` y el puente `s3TipoFalta` con el catálogo `tipoFalta`
  del S3 donde la falta de la LGRA es la misma), `entidades`, `municipios`, `funciones-tabla`,
  `funciones-cuenta`, `motivos-cierre` y `estatus-denuncia`.
- Estadística: cada fila trae `id` (`mes|autoridad|entidad|conducta`) y `fechaCaptura` (el cierre
  del mes); filtro `query.id`.
- Las rutas de la PDN documentan su `500` con `resError`.
- Segundo factor del panel (TOTP, RFC 6238; SEC-13 pasa a parcial): `POST /api/v1/auth/login/code`
  (`loginCode`), `POST /api/v1/auth/mfa/enroll` (`enrollMfa`) y `POST /api/v1/auth/mfa/confirm`
  (`confirmMfa`), con los esquemas `LoginResponse`, `LoginCodeRequest`, `LoginSession`,
  `MfaEnrollment`, `MfaConfirmRequest` y `MfaConfirmResponse`.

### Cambiado

- **Incompatible.** `POST /api/v1/auth/login` responde `LoginResponse`: `step: "session"` (la
  sesión de antes, con los mismos campos), `step: "code"` (falta el código del segundo factor) o
  `step: "enroll"` (sesión limitada para inscribirlo). Un usuario inexistente o una contraseña
  equivocada ya no reciben `401` en este paso: reciben un reto señuelo `step: "code"`, y el fallo
  se dice hasta `loginCode`, sin revelar si la contraseña era correcta.

- **Incompatible.** `PdnError` (`resError`): `code` es el estatus HTTP como número (`400`, `401`,
  `403`, `413`, `415`, `500`), no una cadena como `unauthorized`. ValidAPI exige `code` de 400 a
  499 igual al estatus y `message` en el primer nivel.
- `POST /oauth/token`: sus errores conservan `error` y `error_description` (RFC 6749) y agregan
  `code` y `message` (`resError`). Un cliente OAuth sigue leyendo los primeros.
- **Incompatible.** Token de renovación de 720 s (el de acceso, 300 s, más 7 minutos): ValidAPI
  pide entre 5 y 10 minutos más que `expires_in`. Sigue siendo de un solo uso y falla al vencer
  aunque no se haya usado. Antes duraba 3600 s.
- **Incompatible.** Fila de la estadística en español y con `{ clave, valor }`: `entidad` y
  `conducta` son objetos; `archivadas` y `estatusAlCierre` son arreglos de
  `{ clave, valor, total }`, uno por elemento del catálogo y en su orden, con claves como
  `ATENDIDA` o `EN_INVESTIGACION`. El filtro `query.estatus` usa esas claves.
- **Incompatible.** Una página después de la última responde `200` con `results: []` y
  `hasNextPage: false` (antes, `400`), como prueba ValidAPI. `page` menor que 1 y `pageSize` fuera
  de 1 a 200 siguen siendo `400`.
- Un filtro con cadena vacía se ignora, y un `id` que no existe da `results: []` (nunca un error).
- El catálogo de autoridades va en orden alfabético por nombre (antes, por clave).
- Diccionario de datos con el formato oficial de la PDN: encabezado (nombre, objetivo, fecha de
  última actualización, versión y liga al Swagger) y columnas
  `Path, Variable, Obligatorio, Formato, Tipo de dato, Público, Descripción`, más las propias al
  final (esquema, restricciones, valores permitidos y ejemplo). `Path` va al estilo JSON Pointer.

## [0.2.0] - 2026-11-05

Publicada junto con la 0.1.0 en el software 1.0.0.

### Agregado

- Nodo de varias autoridades: cuentas individuales de la autoridad con su función, inicio de sesión
  (`authorityBearer`), trámite con el catálogo (turnar, aceptar, reasignar, devolver, avanzar de
  etapa y cerrar), apertura de identidad 2 de 3 y alta de autoridades.
- Grupo «Red»: directorio firmado y cofirmado, enrutador ciego, registro y salud de nodos, bitácora
  nacional cofirmada y buzón de red.
- Grupo «Corroboración»: evaluador OPRF e índice de coincidencias.

## [0.1.0] - 2026-11-05

### Agregado

- Primera versión: OpenAPI 3.1 generado desde `packages/contracts`, diccionario de datos en
  Markdown y CSV, catálogo del trámite, ejemplos sintéticos de cada cuerpo y vista local con
  Swagger UI sin CDN.

[Sin publicar]: #sin-publicar
[0.3.0]: #030---2026-11-12
[0.2.0]: #020---2026-11-05
[0.1.0]: #010---2026-11-05
