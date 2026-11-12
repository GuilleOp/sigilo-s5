# Registro de cambios del Estándar S5

Solo los cambios de la especificación (`estandar/`); los del software están en el
[`CHANGELOG.md`](../CHANGELOG.md) de la raíz. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
[SemVer](https://semver.org/lang/es/) (`STANDARD_VERSION`, en `info.version` de cada OpenAPI).
Mientras la versión mayor sea 0, una versión menor puede romper la compatibilidad; cada cambio que
rompe algo está marcado como **Incompatible**.

## [Sin publicar]

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
