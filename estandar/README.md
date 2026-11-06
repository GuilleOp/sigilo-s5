# Estándar S5

Especificación abierta del Sistema de denuncias públicas de faltas administrativas y hechos de
corrupción (S5) de la Plataforma Digital Nacional, propuesta por SIGILO para el Datatón
Anticorrupción 2026. Es un prototipo: no es el sistema oficial.

La PDN especifica cada sistema con un diccionario de datos y un documento OpenAPI (Swagger) con
ejemplos en JSON, como ya lo hace con el S1, el S2, el S3 y el S6. El S5 todavía no tiene esa
especificación. Esta carpeta la propone con el mismo formato, para que cualquier autoridad pueda
implementar un nodo compatible y cualquier persona pueda comprobar que lo es.

## Contenido

| Archivo                     | Qué es                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `openapi.yaml`              | Documento OpenAPI 3.1: rutas, cuerpos, seguridad, errores y ejemplos. Es la referencia.       |
| `openapi.json`              | El mismo documento en JSON, para herramientas que no leen YAML.                               |
| `diccionario-de-datos.md`   | Diccionario de datos legible, con los catálogos del trámite, los plazos y los errores.        |
| `diccionario-de-datos.csv`  | El mismo diccionario en CSV (UTF-8, separador coma), una fila por campo.                      |
| `catalogo-del-tramite.json` | Estados, motivos de cierre, etapas legales, plazos y días inhábiles, para usarlos sin código. |
| `ejemplos/*.json`           | Un ejemplo sintético de cada cuerpo de petición y de respuesta.                               |
| `swagger/index.html`        | Vista navegable del documento con Swagger UI local (sin CDN ni peticiones a terceros).        |

Los perfiles de seguridad y de privacidad del denunciante (`perfil-seguridad.md` y
`perfil-privacidad.md`) están en esta carpeta; sus verificaciones automatizables, en
`verificaciones.json`. El validador (`tools/validador`, `npm run validate`) automatiza hoy
`PRV-01` a `PRV-15`, `API-01` y `API-02`; `PRV-16` a `PRV-23` y `SEC-31` a `SEC-34` salen en su
reporte como «no aplica: verificación no automatizada en esta versión» y se revisan a mano. Sus
reportes están en `reportes/`; el del demo oficial está redactado (sin código ni nombres internos) y
el detalle técnico se conserva fuera del repositorio.

## Cómo se genera

Todo, salvo este README y la vista de Swagger, se genera desde los esquemas zod de
`packages/contracts`, que son los mismos que usan el servidor y la web. Nada se edita a mano.

```sh
npm run standard:build             # genera los archivos, valida el OpenAPI y copia Swagger UI
npm run standard:build -- --check  # solo comprueba que estandar/ esté al día
```

- Las rutas salen de `ROUTES` y las operaciones de `packages/contracts/src/standard/operations.ts`.
- Los esquemas se convierten con `z.toJSONSchema` a JSON Schema 2020-12, el dialecto de OpenAPI 3.1.
- Los ejemplos están en `packages/contracts/src/standard/examples.ts`.
- El documento se valida contra el esquema oficial de OpenAPI 3.1 con `@apidevtools/swagger-parser`,
  sin conexión a internet.

`npm test` incluye `scripts/standard/standard.test.ts`, que falla si esta carpeta no coincide con lo
que generan los contratos, si el OpenAPI no es válido o si algún ejemplo no cumple su esquema. Otra
prueba (`apps/server/src/standard-conformance.test.ts`) comprueba que el servidor de referencia
registra exactamente las rutas del estándar.

## Cómo leerlo

1. Empieza por `swagger/index.html`. Sirve la carpeta con cualquier servidor estático local, por
   ejemplo `python3 -m http.server 8080 -d estandar`, y abre `http://127.0.0.1:8080/swagger/`.
   Antes ejecuta `npm run standard:build`, que copia Swagger UI a `swagger/vendor/` (no se versiona).
   La vista no permite enviar peticiones y no usa el validador en línea de Swagger.
2. Consulta cada campo en `diccionario-de-datos.md`: ruta, nombre, tipo, formato, si es
   obligatorio, descripción, valores permitidos o catálogo y un ejemplo.
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

Reglas generales:

- Las peticiones y respuestas no admiten campos que no estén en su esquema. Un nodo conforme
  rechaza con `400 bad_request` toda petición con un campo desconocido, también dentro de un objeto
  anidado; el servidor de referencia lo hace con los esquemas estrictos de `packages/contracts`.
- Las fechas se redondean al día o a la hora en UTC para reducir la correlación temporal. Los
  plazos legales, en cambio, se cuentan con el día civil en la hora del centro de México
  (`legalOn`), porque así corren en la ley.
- Los errores siempre tienen la forma `{ "error": { "code", "message" } }`, con mensajes fijos.
- Algunas reglas cruzadas se describen en texto porque JSON Schema no las expresa: el municipio debe
  pertenecer a la entidad, el modo `sealed` exige `sealedIdentity` y el resumen del detalle debe
  coincidir con sus hechos. El servidor de referencia las valida con los mismos esquemas zod.
- Los ejemplos son sintéticos: cumplen los esquemas, pero sus firmas, sobres y digestos son valores
  de relleno, no criptográficamente válidos.

## Versionado

El estándar se versiona con [SemVer](https://semver.org/lang/es/), aparte de la versión del
software (`STANDARD_VERSION`, hoy 0.2.0, en `info.version` del OpenAPI):

- **Mayor**: una ruta, un campo o un valor deja de aceptarse, o cambia de significado.
- **Menor**: se agrega algo opcional y compatible (una ruta, un campo opcional, un estado nuevo).
- **Parche**: correcciones de textos, descripciones o ejemplos.

Mientras la versión mayor sea 0, el estándar es un borrador abierto a cambios. La ruta de la API
(`/api/v1`) solo cambia con una versión mayor que rompa la compatibilidad de las peticiones.

## Licencia

CC BY-NC 4.0, como el resto del repositorio. Swagger UI se distribuye con su propia licencia
(Apache 2.0), que se copia junto con él en `swagger/vendor/`.
