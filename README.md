# SIGILO · Estándar S5

[![ci](https://github.com/GuilleOp/sigilo-s5/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilleOp/sigilo-s5/actions/workflows/ci.yml)
[![Licencia: CC BY-NC 4.0](https://img.shields.io/badge/licencia-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)

Capa de anonimato verificable y propuesta de estándar abierto para el Sistema de denuncias públicas
de faltas administrativas y hechos de corrupción (S5) de la Plataforma Digital Nacional (PDN).
Protege a quien denuncia de ser identificada por lo que envía y por quien opera el sistema, y hace
visible cuando una autoridad deja morir una denuncia.

Proyecto del **Equipo Sigilo** para el Datatón Anticorrupción 2026 (reto S5). Versión **1.1.0** del
software y **0.3.0** del Estándar S5. Estado: prototipo funcional de referencia, con pruebas
unitarias y de extremo a extremo. **No es el sistema oficial** ni está listo para recibir denuncias
reales sin una evaluación de seguridad independiente (ver [SECURITY.md](SECURITY.md)). Las
personas, empresas y casos son [sintéticos](docs/datos-sinteticos.md); los catálogos de entes
públicos (directorio de la PDN) y de municipios (INEGI) son reales, y ninguna institución real
aparece denunciada en la demostración.

## El modelo: un S5, muchas llaves

- **Una sola ventanilla nacional en la SESNA**, donde denuncian ciudadanos y personas servidoras
  públicas, junto con un **enrutador ciego** que entrega cada denuncia cifrada sin poder leerla.
- **Un nodo por estado** (más el federal, solo con autoridades federales), sin nodo común. Cada
  autoridad tiene sus propias llaves, y en producción el nodo no recibe denuncias directas (perfil
  `nodo`).
- **Una tabla de funciones por nodo**, firmada por el estado: quién recibe, investiga, substancia,
  resuelve y supervisa para cada orden de gobierno y ente. Con ella el navegador propone la
  autoridad competente. Viaja en un **directorio firmado** que cofirman testigos m de n.
- **APIs con la SESNA como las de la PDN** (OAuth 2.0, igual que S2 y S3): entregas al buzón del
  nodo y estadística agregada para el portal.

Detalle en la [arquitectura](docs/arquitectura.md#red-federada) y el
[ADR 0005](docs/adr/0005-estandar-s5-federado.md).

## Pruébalo en 1 comando

Requisitos: Docker en marcha (Docker Desktop, o Docker Engine con Compose 2.17 o posterior) y
Node.js 22.18 o posterior. Con un usuario normal, no root:

```sh
npm ci
npm run demo:todo     # genera llaves y cuentas sintéticas, construye, levanta, espera y siembra
npm run demo:apagar   # baja la red y borra .red-demo/
```

Levanta la red federada completa (la ventanilla de la SESNA con el enrutador ciego; los nodos de
Querétaro, Federal y Oaxaca, solo con su panel; evaluador, índice y testigos) y siembra el escenario
de [demo-escenario.md](docs/demo-escenario.md) hasta el día 35. Con caché tarda alrededor de un
minuto; la primera vez descarga la imagen de Node y los paquetes de npm.

| Qué                        | Dónde                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Ventanilla única (SESNA)   | <http://127.0.0.1:8790/>                                                                          |
| Paneles de los nodos       | <http://127.0.0.1:8781/autoridad>, `:8782/autoridad` y `:8783/autoridad`                          |
| Cuentas del panel          | `.red-demo/nodos/<nodo>/credenciales.json`                                                        |
| Llaves de las autoridades  | `.red-demo/autoridades/<id>.json`; la del buzón general, en `.red-demo/nodos/<nodo>/llaves-demo/` |
| Folios y recibos sembrados | `.red-demo/semilla.json`                                                                          |

Usa los puertos 8781, 8782, 8783 y 8790 de `127.0.0.1`; el evaluador y el índice no publican puerto
(la web llega al evaluador por la ventanilla). Detalle, tiempos y problemas comunes (incluido Linux
con otro UID) en el
[guion de la demostración](docs/demo.md#red-federada-con-el-escenario-completo-docker-un-comando).

## Instala el nodo de tu estado

Para el equipo de TI del estado: un servidor Linux con Docker, un dominio y tres comandos. No se
necesita Node, npm ni el código fuente; el CLI `sigilo` corre dentro de la imagen publicada
(`ghcr.io/guilleop/sigilo-nodo`, genérica: las llaves del nodo se leen al arrancar).

```sh
./sigilo instalar      # unas 10 preguntas; deja una solicitud de alta sin secretos y una huella
./sigilo iniciar       # cuando la SESNA confirme el alta
./sigilo diagnostico   # todo en verde
```

La SESNA acepta la solicitud con la huella que el estado lee por teléfono y la publica en el
directorio con las cofirmas de los testigos (`./sigilo-sesna aceptar` y `publicar`). Los secretos
que comparten (HMAC del buzón y OAuth) se derivan en los dos lados y nunca viajan. Guías:
[instalacion-nodo.md](docs/instalacion-nodo.md) (estado),
[instalacion-sesna.md](docs/instalacion-sesna.md) (SESNA),
[seguridad-produccion.md](docs/seguridad-produccion.md) y
[ADR 0011](docs/adr/0011-configuracion-en-tiempo-de-ejecucion.md).

## El Estándar S5

Propuesta de especificación del S5 con el formato de las de la PDN ([estandar/](estandar/README.md),
versión 0.3.0, con su propio [registro de cambios](estandar/CHANGELOG.md)):

- **OpenAPI:** un documento por grupo en OpenAPI 3.0.3, el que lee el Swagger UI de la PDN
  ([`estandar/oas/`](estandar/oas/)), con el perfil de conexión con la PDN aparte
  ([`OAS_API_S5_Estadisticas_Denuncias.json`](estandar/oas/OAS_API_S5_Estadisticas_Denuncias.json)),
  y el estándar completo en OpenAPI 3.1 ([`openapi.yaml`](estandar/openapi.yaml)).
- **Diccionarios de datos** con las columnas oficiales: el
  [completo](estandar/diccionario-de-datos.md) y el
  [del perfil PDN](estandar/diccionario-de-datos-pdn.md).
- **Catálogos** en pares CSV y JSON `{ clave, valor }` ([`estandar/catalogos/`](estandar/catalogos/)).
- **Perfiles** de [seguridad](estandar/perfil-seguridad.md) y de
  [privacidad](estandar/perfil-privacidad.md), con fundamento en OWASP ASVS y la LGRA.
- **Validador** ([tools/validador](tools/validador/README.md)): `npm run validate -- <url>` revisa
  la privacidad de cualquier sitio de denuncias y `npm run validate:pdn` reproduce los casos
  públicos de ValidAPI contra un nodo.
- **Swagger UI sin CDN:** la ventanilla lo sirve en `/estandar/swagger/`; con la demostración,
  <http://127.0.0.1:8790/estandar/swagger/>. Sin Docker: `npm run standard:build` y después
  `python3 -m http.server 8080 -d estandar`, en <http://127.0.0.1:8080/swagger/>.

## Seguridad en breve

| Etapa       | Mecanismo                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recepción   | Huella Cero: limpieza de pruebas en el navegador, eliminación de marcas invisibles, revisión del texto, semáforo de riesgo y vista previa de lo que verá la autoridad.                                                     |
| Trámite     | Identidad sellada: los datos personales se cifran en el navegador hacia la autoridad competente, vinculados a su denuncia; abrirlos exige dos personas, y cada apertura queda registrada y es visible para quien denuncia. |
| Seguimiento | Recibo de ocho palabras, buzón cifrado bidireccional sin datos de contacto, bitácora publicada por día en orden barajado, anclable y verificable, y conciliación de aperturas de identidad.                                |

- **Pruebas cifradas con cadena de custodia.** El navegador quita los metadatos, convierte los PDF a
  imagen y cifra cada archivo hacia la autoridad competente; el nodo, la SESEA y la SESNA guardan o
  transportan solo el contenedor cifrado. Su digesto y un compromiso salado se anclan en la
  bitácora, y al turnar a otro nodo se vuelven a cifrar y el origen borra sus copias
  ([criptografia.md](docs/criptografia.md#pruebas-cifradas-de-extremo-a-extremo)).
- **Nadie en medio lee.** El enrutador ve solo el nodo destino, la hora y un tramo de tamaño fijo,
  y no registra la IP. En producción el nodo no recibe conexiones de quien denuncia, y cada entrega
  lleva un token OAuth y la etiqueta HMAC v2 (marca de tiempo y nonce de un solo uso).
- **Llaves fuera del servidor.** La llave de cada autoridad vive en su equipo; la del buzón general
  queda fuera del volumen del nodo al instalar, para sacarla del servidor.
- **Lo que no resuelve.** Los hechos quedan en claro en el nodo de destino, el panel aún no tiene
  segundo factor y persiste la correlación por tiempo entre la ventanilla y un nodo. Riesgos y
  residuales en el [modelo de amenazas](docs/modelo-de-amenazas.md) y en
  [seguridad-produccion.md](docs/seguridad-produccion.md#4-riesgos-que-quedan). Ninguna pantalla
  promete un anonimato absoluto: cuando hay un límite, se dice.

En lugar de pedir confianza, la web da formas de comprobar el anonimato: escribir en modo avión,
«Lo que sale de tu equipo», «¿Quién sabe qué de ti?» y las cifras de la bitácora comprobada
([confianza-verificable.md](docs/confianza-verificable.md)). También protege a la persona ciudadana
que denuncia a quien la atendió ([personas-ciudadanas.md](docs/personas-ciudadanas.md)).

## Qué más propone

| Idea                                 | En concreto                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| La PDN como escudo                   | Los datos de la PDN protegen a quien denuncia (tamaño de su grupo de anonimato, calculado con S1) y respaldan su denuncia ante la autoridad (contexto, conflicto de interés y prioridad con S2, S3 y S6).    |
| Rendición de cuentas de la autoridad | Plazos legales, reglas públicas de escalamiento a supervisión y un auditor que señala cierres con plantilla o calificaciones degradadas ([ADR 0007](docs/adr/0007-rendicion-de-cuentas-de-la-autoridad.md)). |
| Un auditor que señala y no decide    | Las reglas AUD-01 a AUD-08 son cálculos deterministas y públicos; lo que se escala lo decide una regla, no un modelo ([ADR 0009](docs/adr/0009-ia-local.md)).                                                |
| Corroboración ciega                  | Varias denuncias independientes sobre lo mismo se juntan sin revelar quiénes las presentaron ([ADR 0006](docs/adr/0006-corroboracion-ciega.md)).                                                             |

## Para revisar el proyecto

| Busco                                     | Dónde                                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El modelo (ventanilla, nodos y funciones) | [Arquitectura](docs/arquitectura.md), [ADR 0005](docs/adr/0005-estandar-s5-federado.md) y la [guía para conectar un estado](docs/guia-conecta-tu-estado.md)                      |
| El estándar                               | [estandar/README.md](estandar/README.md): OpenAPI, diccionarios, catálogos, perfiles y validador                                                                                 |
| La instalación                            | [Nodo del estado](docs/instalacion-nodo.md), [SESNA](docs/instalacion-sesna.md) y [demostración](docs/demo.md)                                                                   |
| La seguridad                              | [Modelo de amenazas](docs/modelo-de-amenazas.md), [producción](docs/seguridad-produccion.md), [historial](docs/historial-de-seguridad.md) y [criptografía](docs/criptografia.md) |
| El manejo de las pruebas                  | [Pruebas cifradas](docs/criptografia.md#pruebas-cifradas-de-extremo-a-extremo) y [cadena de custodia](docs/arquitectura.md#pruebas-y-cadena-de-custodia)                         |
| El fundamento legal                       | [Marco legal](docs/requisitos.md#marco-legal) (LGRA, LGSNA y Bases de la PDN) y [ADR 0007](docs/adr/0007-rendicion-de-cuentas-de-la-autoridad.md)                                |
| El uso de IA                              | [Declaración de uso de IA](docs/uso-de-ia.md)                                                                                                                                    |
| El cumplimiento del reto                  | [Matriz de requisitos](docs/requisitos.md)                                                                                                                                       |

## Inicio rápido (un solo nodo, sin Docker)

Requisitos: Node.js 22.18 o superior (ver `.nvmrc`; desde 22.18 Node ejecuta TypeScript sin
compilar) y Python 3.10 o superior (`npm run check` ejecuta con `python3` las pruebas del proceso de
datos de la PDN).

```sh
npm ci
npm run keys:generate      # llaves de demostración y llaves fijadas de la web
npm run accounts:generate  # cuentas individuales sintéticas de la autoridad
npm run dev:server         # API en http://127.0.0.1:8787
npm run dev:web            # en otra terminal: http://127.0.0.1:5173
```

`keys:generate` escribe las llaves privadas en `apps/server/data/` (no versionada) y las públicas en
`apps/web/src/config/pinned-keys.json`, que sí está versionado, así que aparecerá como modificado.
No confirmes ese cambio: son las llaves sintéticas de tu equipo.

Abre `http://127.0.0.1:5173`. La web y la API comparten origen a través del proxy de Vite, así que
CORS queda desactivado. Sin `VITE_SIGILO_PERFIL`, la web se compila en perfil `completo`: todas las
pantallas sobre un solo nodo, sin red. La red de Docker usa los otros dos perfiles de la web:
`ventanilla` (la web pública que sirve el enrutador) y `panel` (solo `/autoridad`, en cada nodo,
cuyo servidor corre en perfil `nodo`).

Panel de la autoridad (enlace «Panel de autoridad» del pie, o `http://127.0.0.1:5173/autoridad`):

- Cuenta: un usuario y su contraseña de `apps/server/data/authority-demo-credentials.json`, que
  `accounts:generate` crea (una cuenta por persona, con su autoridad y sus funciones: recepción y
  turnado, investigación, las dos juntas, substanciación y resolución, supervisión u operación del
  nodo, que solo ve las solicitudes de alta). Las
  denuncias nuevas llegan al buzón general (`buzon.federal`), que las turna. Abrir una identidad exige dos personas de la autoridad.
- Llave: importa el archivo `apps/server/data/authority-demo-key.json`.

Otros comandos:

| Comando                                                         | Uso                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run demo:reset -- --yes`                                   | Borra la base y las pruebas de la demostración y conserva las llaves. Se niega a correr con el servidor en marcha; sin `--yes` exige el marcador `.sigilo-demo` en `apps/server/data`. |
| `SIGILO_ANCHOR_URL=http://127.0.0.1:8787 npm run ledger:anchor` | Forma preferida: escribe `anchors/AAAA-MM-DD.json` con la cabeza pública firmada, leída de la API. Sin la variable lee la base local en solo lectura (y avisa si no existe).           |
| `npm run keys:generate -- --force`                              | Reemplaza las llaves; después reconstruye la web para fijar las nuevas.                                                                                                                |
| `npm run validate -- <url> [--modo pasivo\|conformidad]`        | Valida un sitio contra el Estándar S5 y escribe el reporte JSON y HTML en `estandar/reportes` (ver [tools/validador](tools/validador/README.md)).                                      |
| `npm run standard:build`                                        | Regenera `estandar/` (OpenAPI, diccionario, catálogo y ejemplos) desde los esquemas de `packages/contracts`; con `-- --check` solo comprueba que esté al día.                          |
| `npm run auditor:eval`                                          | Regenera `packages/auditor/EVALUACION.md`, la evaluación del auditor; con `-- --check` solo comprueba que esté al día.                                                                 |

Un solo origen sin Vite:

```sh
npm run build -w @sigilo/web
SIGILO_WEB_DIST=../web/dist npm run start -w @sigilo/server
```

La web queda en `http://127.0.0.1:8787` con su CSP, `frame-ancestors 'none'` y `X-Frame-Options`
como cabeceras.

Las variables del servidor están documentadas en `apps/server/.env.example` y en
[interfaces.md](docs/interfaces.md). Entre ellas: `SIGILO_POW_BITS` (prueba de trabajo, 18 bits por
omisión, adaptativa hasta `SIGILO_POW_MAX_BITS`, 20), `SIGILO_EVIDENCE_QUOTA_BYTES` (5 GiB),
`SIGILO_EVIDENCE_RETENTION_DAYS` (30 días para denuncias sin atender o archivadas) y `SIGILO_REQUEST_LOG`
(`aggregate` por omisión). `SIGILO_UNTRACKED_RETENTION_DAYS` se retiró y el servidor se niega a
arrancar si se define.

Una base creada antes de las migraciones 3 o 4 del servidor no arranca: el servidor indica
ejecutar `npm run demo:reset -- --yes` (con el servidor detenido).

## Pruebas

Requisitos: los del inicio rápido, incluido Python 3.10 o superior para `npm run data:test`, que
`npm run check` ejecuta al final.

```sh
npm run check                         # formato, lint, tipos, pruebas unitarias (Vitest) y del proceso de datos
npx playwright install chromium       # una sola vez
npm run test:e2e                      # construye la web y ejecuta las pruebas E2E (Playwright + axe)
```

Hay 1,559 pruebas unitarias en 177 archivos, 34 del proceso de datos en Python y 98 de extremo a
extremo;
la [integración continua](.github/workflows/ci.yml) las corre en cada push con Node 22.18 y la
versión más reciente, junto con `npm audit` de las dependencias de producción.

Las pruebas E2E levantan su propio servidor en un directorio temporal y copian
`apps/server/data/keys.json`, así que requieren haber ejecutado `npm run keys:generate`. Cubren cero
peticiones a terceros, denuncia anónima y sellada, limpieza de metadatos, buzón, apertura de
identidad, bitácora y anclas, datos abiertos, salida rápida, llaves sustituidas, trasplante de
sobres, confianza verificable (sin peticiones de red hasta enviar), aviso ciudadano, foco y
accesibilidad WCAG 2.0 AA.

## Estructura

```
packages/contracts  Esquemas, catálogos y rutas de la API (fuente única de verdad)
packages/core       Criptografía: HPKE, Ed25519, recibo, buzón, comprobante y bitácora
packages/huella     Limpieza de pruebas, marcas invisibles y revisión de riesgo
packages/red        Red federada: directorio firmado, autoridad competente, sobres y bitácora nacional
packages/anonimato  Grupo de anonimato en el navegador, con los fragmentos de datos/grupos-anonimato
packages/contexto-pdn  Verificaciones contra la PDN, conflicto de interés y prioridad (nodo y panel)
packages/auditor    Señales deterministas sobre las actuaciones de la autoridad (AUD-01 a AUD-08)
packages/corroboracion  Corroboración ciega: cliente VOPRF, resumen difuso y señales de independencia
apps/server         Servidor de referencia y nodo de la red (Hono + node:sqlite)
apps/web            Aplicación de referencia (Vite + React)
apps/enrutador      Enrutador ciego, directorio y bitácora nacional; incluye el proceso de testigo
apps/corroboracion  Evaluador OPRF e índice de coincidencias de la corroboración ciega
tools/validador     Validador del Estándar S5 (`npm run validate` y `npm run validate:pdn`)
tools/sigilo        CLI de instalación y operación de nodos, SESNA y testigos (`./sigilo`)
instalacion/        Envoltorios `sigilo` y `sigilo-sesna` y compose de producción (imágenes de GHCR)
estandar/           Estándar S5: OpenAPI, diccionario de datos, perfiles, catálogo, ejemplos y reportes
datos/              Proceso reproducible de la PDN (Python) y sus productos agregados
docker/             Dockerfile multietapa de los servicios de la red de demostración
compose.yaml        Red federada de demostración en local (`npm run demo:todo`)
scripts/            Llaves, cuentas, red y semilla de la demostración, anclaje y reinicio
e2e/                Pruebas de extremo a extremo
anchors/            Anclas publicadas de la bitácora (`ledger:anchor`)
docs/               Arquitectura, decisiones, modelo de amenazas y guías
```

## Documentación

Para empezar:

- [Matriz de requisitos](docs/requisitos.md): cada requisito del reto, su nivel y su evidencia
- [Guion de la demostración](docs/demo.md) y [escenario sintético](docs/demo-escenario.md)
- [Arquitectura](docs/arquitectura.md)
- [Estándar S5](estandar/README.md), con los perfiles de [seguridad](estandar/perfil-seguridad.md)
  y de [privacidad](estandar/perfil-privacidad.md)

Diseño y seguridad:

- [Modelo de amenazas](docs/modelo-de-amenazas.md)
- [Historial de seguridad](docs/historial-de-seguridad.md)
- [Seguridad en producción](docs/seguridad-produccion.md)
- [Criptografía: especificación del formato v1](docs/criptografia.md)
- [Confianza verificable](docs/confianza-verificable.md)
- [Cuando denuncia una persona ciudadana](docs/personas-ciudadanas.md)
- [Decisiones de arquitectura](docs/adr/)
- [Interfaces entre paquetes](docs/interfaces.md)

Adopción y datos:

- [Integración con el S5](docs/integracion-s5.md)
- [Instala el nodo de tu estado](docs/instalacion-nodo.md) y
  [la ventanilla de la SESNA](docs/instalacion-sesna.md)
- [Guía para conectar un estado](docs/guia-conecta-tu-estado.md) (conceptos)
- [Datos de la PDN: proceso y productos agregados](datos/README.md)
- [Datos sintéticos](docs/datos-sinteticos.md)
- [Accesibilidad](docs/accesibilidad.md)

Proyecto:

- [Guion de la presentación ante el jurado](docs/guion-presentacion.md)
- [Declaración de uso de IA](docs/uso-de-ia.md)
- [Plan de trabajo](docs/plan.md)
- [Convenciones](docs/convenciones.md) y [glosario](docs/glosario.md)
- [Notas de migración de la web (histórico)](docs/notas-migracion-web.md)
- [Registro de cambios](CHANGELOG.md)
- [Política de seguridad](SECURITY.md)
- [Contribuir](CONTRIBUTING.md)

## Uso de inteligencia artificial

El desarrollo usó Claude Code (Anthropic) como asistente, bajo la dirección y revisión del equipo.
La aplicación no usa modelos de IA ni envía datos a servicios de IA de terceros; el paquete del
auditor trae un adaptador para un modelo abierto local opcional, desactivado y todavía sin conectar
al servidor. Detalle en la
[declaración de uso de IA](docs/uso-de-ia.md).

## Datos

El repositorio no contiene datos personales reales. Las personas, empresas, autoridades del
directorio de la red, folios y recibos de la demostración son sintéticos, y los casos usan entes
rotulados «(ficticia)». Los catálogos públicos son reales: 7,213 entes del directorio de la PDN y
2,478 municipios del INEGI ([detalle](packages/contracts/src/entes/README.md)). Los datos de la PDN se usan solo en forma agregada, con su
proceso reproducible en [datos/](datos/README.md).

## Licencia

[Creative Commons Atribución-NoComercial 4.0 Internacional](LICENSE), conforme a las bases del
Datatón Anticorrupción 2026. Uso libre con fines no comerciales.
