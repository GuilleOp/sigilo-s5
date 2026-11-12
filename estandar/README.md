# Estándar S5

Especificación abierta del Sistema de denuncias públicas de faltas administrativas y hechos de
corrupción (S5) de la Plataforma Digital Nacional, propuesta por SIGILO para el Datatón
Anticorrupción 2026. Es un prototipo: no es el sistema oficial.

La PDN especifica cada sistema con un diccionario de datos, un documento OpenAPI (Swagger) por
sistema con ejemplos en JSON y sus catálogos, como ya lo hace con el S1, el S2, el S3 y el S6. El S5
todavía no tiene esa especificación. Esta carpeta la propone con el mismo formato, para que
cualquier autoridad pueda implementar un nodo compatible, la SESNA lo pueda revisar con sus propias
herramientas y cualquier persona pueda comprobar que lo es.

Versión actual: **0.3.0** (ver [`CHANGELOG.md`](CHANGELOG.md)).

## Contenido

| Archivo                                      | Qué es                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `openapi.yaml`, `openapi.json`               | Estándar completo en OpenAPI 3.1: rutas, cuerpos, seguridad, errores y ejemplos. Es la referencia.                               |
| `openapi-3.0.json`                           | El mismo documento en OpenAPI 3.0.3, para herramientas (como el Swagger UI de la PDN) que solo leen `3.0.x`.                     |
| `oas/OAS_API_S5_Estadisticas_Denuncias.json` | **Perfil de conexión con la PDN** en OpenAPI 3.0.3 (también en `.yaml`): solo lo que la SESNA consume de cada nodo.              |
| `oas/OAS_API_S5_*.json`                      | Un documento por grupo en OpenAPI 3.0.3: denuncia y seguimiento (nodo), red federada y corroboración ciega.                      |
| `diccionario-de-datos.md`, `.csv`            | Diccionario con el formato de la PDN (encabezado y columnas oficiales), con los catálogos del trámite, los plazos y los errores. |
| `diccionario-de-datos-pdn.md`, `.csv`        | El diccionario solo del perfil PDN.                                                                                              |
| `catalogos/*.json`, `*.csv`                  | Catálogos en pares `{ clave, valor }`, como los de `PDNMX/catalogos`.                                                            |
| `catalogo-del-tramite.json`                  | Estados, motivos de cierre, etapas legales, plazos y días inhábiles, para usarlos sin código.                                    |
| `ejemplos/*.json`                            | Un ejemplo sintético de cada cuerpo de petición y de respuesta.                                                                  |
| `swagger/index.html`                         | Swagger UI local con un desplegable de documentos, sin CDN ni peticiones a terceros.                                             |
| `CHANGELOG.md`                               | Cambios de cada versión del estándar (la SESNA no publica uno; aquí sí).                                                         |

Los perfiles de seguridad y de privacidad del denunciante (`perfil-seguridad.md` y
`perfil-privacidad.md`) están en esta carpeta; sus verificaciones automatizables, en
`verificaciones.json`. El validador (`tools/validador`, `npm run validate`) automatiza hoy
`PRV-01` a `PRV-15`, `API-01` y `API-02`; `PRV-16` a `PRV-23` y `SEC-31` a `SEC-34` salen en su
reporte como «no aplica: verificación no automatizada en esta versión» y se revisan a mano. Sus
reportes están en `reportes/`; el del demo oficial está redactado (sin código ni nombres internos) y
el detalle técnico se conserva fuera del repositorio.

## Ver el Swagger

Hay tres formas, todas sin CDN: Swagger UI sale de `swagger-ui-dist` con versión fija (5.34.1).

1. **En el enrutador.** El enrutador sirve la vista en el origen de la ventanilla, en
   `/estandar/swagger/` (por ejemplo `http://127.0.0.1:8790/estandar/swagger/` con
   `npm run dev:enrutador`), con una CSP de solo el mismo origen. Toma la carpeta de
   `SIGILO_ROUTER_STANDARD_DIR` o, por omisión, esta carpeta del repositorio. La imagen de Docker no
   incluye `estandar/`: ahí la vista se activa montando la carpeta y definiendo esa variable.
2. **En local, sin servidor de la red.** Ejecuta `npm run standard:build` (copia Swagger UI a
   `swagger/vendor/`, que no se versiona), sirve la carpeta con cualquier servidor estático, por
   ejemplo `python3 -m http.server 8080 -d estandar`, y abre `http://127.0.0.1:8080/swagger/`.
3. **En el Swagger UI de la PDN.** Los documentos de `oas/` son OpenAPI 3.0.3, como los del S1 al
   S6, así que el visor de la SESNA
   ([plataformadigitalnacional.org/oas/ui/](https://www.plataformadigitalnacional.org/oas/ui/)) puede
   sumarlos a su desplegable con la URL `raw` del archivo en GitHub, igual que los suyos.

El desplegable ofrece «S5 - Estadísticas de denuncias (PDN)» (el primero), «S5 - Denuncia y
seguimiento (nodo)», «S5 - Red federada», «S5 - Corroboración ciega» y el estándar completo. Una
liga directa usa `?urls.primaryName=`, como en la PDN; la del encabezado de cada diccionario abre su
documento. La vista no permite enviar peticiones y no usa el validador en línea de Swagger.

## Perfil de conexión con la PDN

`oas/OAS_API_S5_Estadisticas_Denuncias.json` es lo que la SESNA consume de cada nodo, con la
metodología de las APIs del S2 y del S3 y las reglas con que las prueba ValidAPI:

| Ruta                                         | Qué hace                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /oauth/token`                          | Servidor de autorización del nodo: flujos `password` y `client_credentials`, `refresh_token`.      |
| `POST /v1/denuncias/estadisticas`            | Estadística agregada de meses cerrados con `{ sort, page, pageSize, query }` y paginación.         |
| `GET /v1/denuncias/estadisticas/autoridades` | Autoridades del nodo, sin repetidas y en orden alfabético por nombre (como `dependencias` del S2). |

- **Token.** Credenciales en el cuerpo o en `Authorization: Basic`; token Bearer de 5 minutos;
  `refresh_token` de un solo uso que dura 7 minutos más (`refresh_token_expires_in`: 720).
- **Errores.** `resError`: `{ "code": <estatus HTTP>, "message": "…" }` en el primer nivel, también
  en `401`, `403` y `500`. En `/oauth/token` van además los campos de RFC 6749 (`error`,
  `error_description`), para los clientes OAuth: los dos formatos conviven sin chocar.
- **Consulta.** `{}` es válido (página 1 de 10 filas); `pageSize` de 1 a 200 (fuera de rango,
  `400`); `page` menor que 1, `400`; una página después de la última, `200` con `results: []`. Los
  filtros se combinan con AND; uno con cadena vacía se ignora; un `id` que no existe da
  `results: []`.
- **Filas.** Cada fila trae `id` (`mes|autoridad|entidad|conducta`) y `fechaCaptura`, y sus valores
  de catálogo van en español como `{ clave, valor }` (`entidad`, `conducta`, y los conteos por
  motivo de cierre y por estatus con claves como `ATENDIDA` o `TURNADA`). Solo meses cerrados,
  conteos redondeados a múltiplos de 5 y suprimidos (`null`) bajo 5.

## Cómo valida un estado su nodo

1. **Perfil de conexión PDN** (lo que probará la SESNA):

   ```sh
   SIGILO_PDN_CLIENT_ID=sesna SIGILO_PDN_CLIENT_SECRET=… \
   SIGILO_PDN_USERNAME=sesna.pdn SIGILO_PDN_PASSWORD=… \
   npm run validate:pdn -- \
     --token-url https://tu-nodo.example/oauth/token \
     --consulta-url https://tu-nodo.example/v1/denuncias/estadisticas \
     --ambiente desarrollo
   ```

   Reproduce los casos públicos de ValidAPI (`CPDEN-01` a `CPDEN-17`: token, vida del token,
   renovación, https, paginación, `pageSize`, filtros vacíos, `id`, orden, autoridades, `resError` y
   el aviso de menos de 50 registros). Con `--ambiente productivo`, http ya no se aprueba. Detalle
   en [`tools/validador/README.md`](../tools/validador/README.md#perfil-conexión-pdn).

2. **Privacidad y seguridad del sitio de denuncias**: `npm run validate -- <url>` (modo pasivo) o
   `--modo conformidad` contra un nodo propio.

3. Con todo aprobado, sigue el protocolo de conexión de la SESNA (solicitud a pdn@sesna.gob.mx,
   pruebas en desarrollo y en productivo): ver la sección «Conexión oficial con la PDN» de
   [`docs/guia-conecta-tu-estado.md`](../docs/guia-conecta-tu-estado.md).

## Cómo se genera

Todo, salvo este README, el `CHANGELOG.md`, `swagger/index.html` y `swagger/swagger.css`, se genera
desde los esquemas zod de `packages/contracts`, que son los mismos que usan el servidor y la web.
Nada más se edita a mano.

```sh
npm run standard:build             # genera los archivos, valida cada OpenAPI y copia Swagger UI
npm run standard:build -- --check  # solo comprueba que estandar/ esté al día
```

- Las rutas salen de `ROUTES` y las operaciones de `packages/contracts/src/standard/`.
- Los esquemas se convierten con `z.toJSONSchema` a JSON Schema 2020-12, el dialecto de OpenAPI 3.1.
- `scripts/standard/profiles.ts` arma un documento por grupo (solo sus rutas y los esquemas que
  citan) y lo convierte a OpenAPI 3.0.3: `const` a `enum`, `null` a `nullable`, `examples` a
  `example`, registros de un catálogo a objetos con sus propiedades y `$ref` con hermanos a `allOf`.
- `scripts/standard/dictionary.ts` y `scripts/standard/catalogs.ts` arman los diccionarios y los
  catálogos.
- Cada documento se valida contra el esquema oficial de su versión de OpenAPI (3.1 o 3.0) con
  `@apidevtools/swagger-parser`, sin conexión a internet.

`npm test` incluye `scripts/standard/standard.test.ts`, que falla si esta carpeta no coincide con lo
que generan los contratos, si un OpenAPI no es válido, si el perfil PDN trae algo más que sus tres
rutas o si algún ejemplo no cumple su esquema. Otra prueba
(`apps/server/src/standard-conformance.test.ts`) comprueba que el servidor de referencia registra
exactamente las rutas del estándar.

## Cómo leerlo

1. Empieza por el Swagger (sección anterior): el perfil PDN si conectas un nodo con la SESNA, el
   del nodo si implementas la recepción de denuncias.
2. Consulta cada campo en `diccionario-de-datos.md`, con las columnas de los diccionarios de la PDN:
   `Path` (ruta del objeto, al estilo JSON Pointer), `Variable`, `Obligatorio`, `Formato`
   (Alfanumérico, Numérico, Fecha en formato ISO 8601…), `Tipo de dato` (String, Number,
   Object…), `Público` (si el dato se publica: la identidad, el contacto, los hechos y los testigos
   nunca) y `Descripción`; al final, las restricciones, los valores permitidos y un ejemplo.
3. Revisa el trámite en la sección «Catálogo del trámite» del diccionario. Tiene dos capas:
   - **Flujo de gestión del S5**: recibida en el buzón general, turnada, aceptada, reasignada,
     devuelta al buzón general y cerrada con uno de seis motivos (atendido, canalizado,
     improcedente, información insuficiente, acumulado u otro).
   - **Etapas legales**: faltas administrativas (investigación, calificación, Informe de Presunta
     Responsabilidad Administrativa, envío del expediente, pruebas, alegatos, cierre de la
     instrucción y resolución) y hechos de corrupción (investigación, intermedia, juicio y
     sentencia), con quién actúa y sus plazos legales en días naturales o hábiles.

   Cada estado y etapa explica en lenguaje sencillo qué significa para la persona denunciante, por
   ejemplo qué quiere decir que su denuncia fue «turnada».

4. Los catálogos de `catalogos/` usan el formato de `PDNMX/catalogos`, para proponerlos a la SESNA
   tal cual: `faltas` (cada clave con su ley, `claveLey`, artículo, gravedad y, donde la falta de la
   LGRA es la misma, `s3TipoFalta`, el puente con el catálogo `tipoFalta` del S3), `entidades`,
   `municipios` (claves INEGI siempre como texto), `funciones-tabla`, `funciones-cuenta`,
   `motivos-cierre` y `estatus-denuncia`.

Reglas generales:

- Las peticiones y respuestas no admiten campos que no estén en su esquema. Un nodo conforme
  rechaza con `400 bad_request` toda petición con un campo desconocido, también dentro de un objeto
  anidado; el servidor de referencia lo hace con los esquemas estrictos de `packages/contracts`.
- Las fechas se redondean al día o a la hora en UTC para reducir la correlación temporal. Los
  plazos legales, en cambio, se cuentan con el día civil en la hora del centro de México
  (`legalOn`), porque así corren en la ley.
- Los errores del API del nodo tienen la forma `{ "error": { "code", "message" } }`, con mensajes
  fijos (la misma del demo del S5). Las rutas de la PDN usan `resError` (`{ code, message }`).
- Algunas reglas cruzadas se describen en texto porque JSON Schema no las expresa: el municipio debe
  pertenecer a la entidad, el modo `sealed` exige `sealedIdentity` y el resumen del detalle debe
  coincidir con sus hechos. El servidor de referencia las valida con los mismos esquemas zod.
- Los ejemplos son sintéticos: cumplen los esquemas, pero sus firmas, sobres y digestos son valores
  de relleno, no criptográficamente válidos.

## Versionado

El estándar se versiona con [SemVer](https://semver.org/lang/es/), aparte de la versión del
software (`STANDARD_VERSION`, hoy 0.3.0, en `info.version` de cada OpenAPI, y `STANDARD_DATE`, la
fecha del encabezado de los diccionarios). Los cambios de cada versión están en
[`CHANGELOG.md`](CHANGELOG.md):

- **Mayor**: una ruta, un campo o un valor deja de aceptarse, o cambia de significado.
- **Menor**: se agrega algo opcional y compatible (una ruta, un campo opcional, un estado nuevo).
- **Parche**: correcciones de textos, descripciones o ejemplos.

Mientras la versión mayor sea 0, el estándar es un borrador abierto a cambios y una versión menor
puede romper la compatibilidad (el registro de cambios lo marca). La ruta de la API (`/api/v1`, y
`/v1/...` en el perfil PDN, como en la PDN) solo cambia con una versión mayor que rompa la
compatibilidad de las peticiones.

## Licencia

CC BY-NC 4.0, como el resto del repositorio. Swagger UI se distribuye con su propia licencia
(Apache 2.0), que se copia junto con él en `swagger/vendor/` y que el enrutador sirve en
`/estandar/swagger/vendor/LICENSE`.
