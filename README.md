# SIGILO · Estándar S5

[![ci](https://github.com/GuilleOp/sigilo-s5/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilleOp/sigilo-s5/actions/workflows/ci.yml)
[![Licencia: CC BY-NC 4.0](https://img.shields.io/badge/licencia-CC%20BY--NC%204.0-lightgrey.svg)](LICENSE)

Capa de anonimato verificable y propuesta de estándar abierto para el Sistema de denuncias públicas
de faltas administrativas y hechos de corrupción (S5) de la Plataforma Digital Nacional (PDN).

Proyecto del **Equipo Sigilo** para el Datatón Anticorrupción 2026 (reto S5). Estado: prototipo
funcional de referencia, con pruebas unitarias y de extremo a extremo. **No es el sistema oficial**
ni está listo para recibir denuncias reales sin una evaluación de seguridad independiente (ver
[SECURITY.md](SECURITY.md)). Todos los datos de personas, entes y empresas son
[sintéticos](docs/datos-sinteticos.md).

## Qué propone

| Idea                                 | En concreto                                                                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un canal único federado              | «Un S5, muchas llaves»: una sola ventanilla, un enrutador ciego que entrega cada denuncia a la autoridad competente sin poder leerla y un nodo por autoridad con sus propias llaves ([ADR 0005](docs/adr/0005-estandar-s5-federado.md)). |
| Un estándar que se puede comprobar   | Especificación OpenAPI 3.1 y diccionario de datos del S5, perfiles de seguridad y de privacidad con fundamento en OWASP ASVS y la LGRA, y un validador que revisa cualquier sitio contra ellos ([estandar/](estandar/README.md)).        |
| La PDN como escudo                   | Los datos de la PDN protegen a quien denuncia (tamaño de su grupo de anonimato, calculado con S1) y respaldan su denuncia ante la autoridad (contexto, conflicto de interés y prioridad con S2, S3 y S6).                                |
| Rendición de cuentas de la autoridad | Plazos legales, reglas públicas de escalamiento a supervisión y un auditor que señala cierres con plantilla o calificaciones degradadas ([ADR 0007](docs/adr/0007-rendicion-de-cuentas-de-la-autoridad.md)).                             |
| Un auditor que señala y no decide    | Las reglas AUD-01 a AUD-08 son cálculos deterministas y públicos; lo que se escala lo decide una regla, no un modelo ([ADR 0009](docs/adr/0009-ia-local.md)).                                                                            |

## Cómo protege a la persona denunciante

| Etapa       | Mecanismo                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recepción   | Huella Cero: limpieza de pruebas en el navegador, eliminación de marcas invisibles, revisión del texto, semáforo de riesgo y vista previa de lo que verá la autoridad.                                                     |
| Trámite     | Identidad sellada: los datos personales se cifran en el navegador hacia la autoridad competente, vinculados a su denuncia; abrirlos exige dos personas, y cada apertura queda registrada y es visible para quien denuncia. |
| Seguimiento | Recibo de ocho palabras, buzón cifrado bidireccional sin datos de contacto, bitácora publicada por día en orden barajado, anclable y verificable, y conciliación de aperturas de identidad.                                |

Lo que no resuelve y los riesgos residuales están en el [modelo de amenazas](docs/modelo-de-amenazas.md).
Ninguna pantalla promete un anonimato absoluto: cuando hay un límite, se dice.

### Confianza verificable

En lugar de pedir confianza, la web da formas de comprobar el anonimato
([detalle](docs/confianza-verificable.md)):

- **Modo avión.** El paso 1 invita a escribir sin conexión: los pasos 1 a 4 y la limpieza de fotos
  funcionan en el equipo y nada sale hasta pulsar «Enviar».
- **«Lo que sale de tu equipo».** En el paso 4, lo que viaja, lo que nunca sale y, en la red, una
  muestra real del relato cerrado con la llave del nodo destino.
- **«¿Quién sabe qué de ti?».** En el inicio, lo que ve cada parte del camino y las dudas más
  comunes, junto con «Lo que SIGILO no puede hacer por ti» (límites honestos).
- **Cifras de la bitácora comprobada.** En `/verificar`, cuántas denuncias llegaron y cuántos
  nombres se abrieron o entregaron, contados en el navegador después de verificar la cadena contra
  la cabeza firmada.

### Personas ciudadanas

No solo denuncian las personas servidoras públicas. Para quien no trabaja en la oficina denunciada
([detalle](docs/personas-ciudadanas.md)):

- **Aviso propio en la revisión**, que explica que la persona denunciada pudo verla y cómo bajar
  ese riesgo.
- **Revisor de frases** que marca números de trámite o expediente, placas, direcciones y frases
  como «mi negocio», con una versión más general para cada uno.
- **Información sobre el soborno y las represalias** (LGRA, arts. 66, 88 y 89). Es información
  general, no asesoría legal.
- **Caso de la ventanilla** en la demostración: dos personas ciudadanas denuncian por separado la
  misma ventanilla y la corroboración ciega las junta como fuentes independientes sin revelar
  quiénes son.

## Demostración en un comando

Requisitos: Docker en marcha (Docker Desktop, o Docker Engine con Compose 2.17 o posterior) y
Node.js 22.18 o posterior. Con un usuario normal, no root:

```sh
npm ci
npm run demo:todo     # genera llaves y cuentas sintéticas, construye, levanta, espera y siembra
npm run demo:apagar   # baja la red y borra .red-demo/
```

Levanta la red federada completa (enrutador ciego, nodos Querétaro y Federal con su web, evaluador,
índice y testigos) y siembra el escenario de [demo-escenario.md](docs/demo-escenario.md) hasta el
día 35. Con caché tarda alrededor de un minuto; la primera vez descarga la imagen de Node y los
paquetes de npm.

| Qué                        | Dónde                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Web del nodo Querétaro     | <http://127.0.0.1:8781/>                                            |
| Web del nodo Federal       | <http://127.0.0.1:8782/> (panel: <http://127.0.0.1:8782/autoridad>) |
| Cuentas del panel          | `.red-demo/nodos/<nodo>/credenciales.json`                          |
| Folios y recibos sembrados | `.red-demo/semilla.json`                                            |

Usa los puertos 8781, 8782, 8790, 8791 y 8792 de `127.0.0.1`. Detalle, tiempos y problemas comunes
(incluido Linux con otro UID) en el
[guion de la demostración](docs/demo.md#red-federada-con-el-escenario-completo-docker-un-comando).

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
CORS queda desactivado.

Panel de la autoridad (enlace «Panel de autoridad» del pie, o `http://127.0.0.1:5173/autoridad`):

- Cuenta: un usuario y su contraseña de `apps/server/data/authority-demo-credentials.json`, que
  `accounts:generate` crea (una cuenta por persona, con su autoridad y sus funciones: recepción y
  turnado, investigación, las dos juntas, substanciación y resolución, o supervisión). Las
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

Hay más de 1,250 pruebas unitarias, 34 del proceso de datos en Python y más de 90 de extremo a extremo;
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
tools/validador     Validador del Estándar S5 (`npm run validate`)
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
- [Criptografía: especificación del formato v1](docs/criptografia.md)
- [Confianza verificable](docs/confianza-verificable.md)
- [Cuando denuncia una persona ciudadana](docs/personas-ciudadanas.md)
- [Decisiones de arquitectura](docs/adr/)
- [Interfaces entre paquetes](docs/interfaces.md)

Adopción y datos:

- [Integración con el S5](docs/integracion-s5.md)
- [Guía para conectar un estado](docs/guia-conecta-tu-estado.md)
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
La aplicación no usa modelos de IA por omisión ni envía datos a servicios de IA de terceros; el
auditor admite un modelo abierto local opcional, desactivado por omisión. Detalle en la
[declaración de uso de IA](docs/uso-de-ia.md).

## Datos

El repositorio no contiene datos personales reales. Las personas, entes, empresas, folios y recibos
de la demostración son sintéticos. Los datos de la PDN se usan solo en forma agregada, con su
proceso reproducible en [datos/](datos/README.md).

## Licencia

[Creative Commons Atribución-NoComercial 4.0 Internacional](LICENSE), conforme a las bases del
Datatón Anticorrupción 2026. Uso libre con fines no comerciales.
