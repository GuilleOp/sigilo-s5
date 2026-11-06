# SIGILO

Capa de anonimato verificable para el Sistema de denuncias públicas de faltas administrativas y
hechos de corrupción (S5) de la Plataforma Digital Nacional.

Proyecto presentado al Datatón Anticorrupción 2026. Estado: prototipo funcional de referencia, con
pruebas unitarias y de extremo a extremo; no apto para recibir denuncias reales sin una evaluación
de seguridad independiente (ver [SECURITY.md](SECURITY.md)).

## Qué resuelve

Protege la identidad de la persona denunciante en las tres etapas del proceso:

| Etapa       | Mecanismo                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recepción   | Huella Cero: limpieza de pruebas en el navegador, eliminación de marcas invisibles, revisión del texto, semáforo de riesgo y vista previa de lo que verá la autoridad.                      |
| Trámite     | Identidad sellada: los datos personales se cifran en el navegador hacia la autoridad competente, vinculados a su denuncia; cada apertura queda registrada y es visible para la persona.     |
| Seguimiento | Recibo de ocho palabras, buzón cifrado bidireccional sin datos de contacto, bitácora publicada por día en orden barajado, anclable y verificable, y conciliación de aperturas de identidad. |

Lo que no resuelve y los riesgos residuales están en el [modelo de amenazas](docs/modelo-de-amenazas.md).

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
paquetes de npm. Después abre <http://127.0.0.1:8782/> (nodo Federal) o <http://127.0.0.1:8781/>
(nodo Querétaro); los folios y recibos están en `.red-demo/semilla.json` y las cuentas del panel en
`.red-demo/nodos/<nodo>/credenciales.json`. Detalle, tiempos y problemas comunes (incluido Linux con
otro UID) en el [guion de la demostración](docs/demo.md#red-federada-con-el-escenario-completo-docker-un-comando).

## Inicio rápido

Requisitos: Node.js 22.18 o superior (ver `.nvmrc`; desde 22.18 Node ejecuta TypeScript sin
compilar) y Python 3.10 o superior (`npm run check` ejecuta con `python3` las pruebas del proceso de
datos de la PDN).

```sh
npm ci
npm run keys:generate      # llaves de demostración y llaves fijadas de la web
npm run accounts:generate  # cuentas individuales sintéticas de la autoridad
npm run dev:server      # API en http://127.0.0.1:8787
npm run dev:web         # en otra terminal: http://127.0.0.1:5173
```

`keys:generate` escribe las llaves privadas en `apps/server/data/` (no versionada) y las públicas en
`apps/web/src/config/pinned-keys.json`, que sí está versionado, así que aparecerá como modificado.
No confirmes ese cambio: son las llaves sintéticas de tu equipo.

Abre `http://127.0.0.1:5173`. La web y la API comparten origen a través del proxy de Vite, así que
CORS queda desactivado.

Panel de la autoridad (enlace «Panel de autoridad» del pie, o `http://127.0.0.1:5173/autoridad`):

- Cuenta: un usuario y su contraseña de `apps/server/data/authority-demo-credentials.json`, que
  `accounts:generate` crea (una cuenta por persona, con su autoridad y su función: recepción y
  turnado, investigación o supervisión). Las denuncias nuevas llegan al buzón general
  (`recepcion.buzon`), que las turna. Abrir una identidad exige dos personas de la autoridad.
- Llave: importa el archivo `apps/server/data/authority-demo-key.json`.

Otros comandos:

| Comando                                                         | Uso                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run demo:reset -- --yes`                                   | Borra la base y las pruebas de la demostración y conserva las llaves. Se niega a correr con el servidor en marcha; sin `--yes` exige el marcador `.sigilo-demo` en `apps/server/data`. |
| `SIGILO_ANCHOR_URL=http://127.0.0.1:8787 npm run ledger:anchor` | Forma preferida: escribe `anchors/AAAA-MM-DD.json` con la cabeza pública firmada, leída de la API. Sin la variable lee la base local en solo lectura (y avisa si no existe).           |
| `npm run keys:generate -- --force`                              | Reemplaza las llaves; después reconstruye la web para fijar las nuevas.                                                                                                                |
| `npm run validate -- <url> [--modo pasivo\|conformidad]`        | Valida un sitio contra el Estándar S5 y escribe el reporte JSON y HTML en `estandar/reportes` (ver [tools/validador](tools/validador/README.md)).                                      |

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

Las pruebas E2E levantan su propio servidor en un directorio temporal y copian
`apps/server/data/keys.json`, así que requieren haber ejecutado `npm run keys:generate`. Cubren cero
peticiones a terceros, denuncia anónima y sellada, limpieza de metadatos, buzón, apertura de
identidad, bitácora y anclas, datos abiertos, salida rápida, llaves sustituidas, trasplante de
sobres, foco y accesibilidad WCAG 2.0 AA.

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
estandar/           Estándar S5: OpenAPI, diccionario de datos, catálogo, ejemplos y reportes
datos/              Proceso reproducible de la PDN (Python) y sus productos agregados
docker/             Dockerfile multietapa de los servicios de la red de demostración
compose.yaml        Red federada de demostración en local (`npm run demo:todo`)
scripts/            Llaves, cuentas, red y semilla de la demostración, anclaje y reinicio
e2e/                Pruebas de extremo a extremo
anchors/            Anclas publicadas de la bitácora (`ledger:anchor`)
docs/               Arquitectura, decisiones, modelo de amenazas y guías
```

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Modelo de amenazas](docs/modelo-de-amenazas.md)
- [Historial de seguridad](docs/historial-de-seguridad.md)
- [Criptografía: especificación del formato v1](docs/criptografia.md)
- [Interfaces entre paquetes](docs/interfaces.md)
- [Integración con el S5](docs/integracion-s5.md)
- [Accesibilidad](docs/accesibilidad.md)
- [Guion de la demostración](docs/demo.md)
- [Guion de la presentación ante el jurado](docs/guion-presentacion.md)
- [Datos sintéticos](docs/datos-sinteticos.md)
- [Datos de la PDN: proceso y productos agregados](datos/README.md)
- [Declaración de uso de IA](docs/uso-de-ia.md)
- [Convenciones](docs/convenciones.md)
- [Glosario](docs/glosario.md)
- [Plan de trabajo](docs/plan.md)
- [Decisiones de arquitectura](docs/adr/)
- [Notas de migración de la web (histórico)](docs/notas-migracion-web.md)
- [Registro de cambios](CHANGELOG.md)
- [Política de seguridad](SECURITY.md)
- [Contribuir](CONTRIBUTING.md)

## Licencia

[Creative Commons Atribución-NoComercial 4.0 Internacional](LICENSE), conforme a las bases del
Datatón Anticorrupción 2026. Uso libre con fines no comerciales.
