# Guía: conecta tu estado a la red S5 (borrador)

Para el equipo técnico de una Secretaría Ejecutiva del Sistema Estatal Anticorrupción (SESEA) que
quiere operar un **nodo estatal** de la red «un S5, muchas llaves» ([ADR 0005](adr/0005-estandar-s5-federado.md)).
Si tu entidad no opera nodo, sus autoridades se alojan en el **nodo común** y solo se hace el paso 1.

> Borrador del prototipo para el Datatón 2026. No es el sistema oficial. Todo lo que aparece aquí
> usa datos y llaves sintéticos; la operación con llaves reales, módulos de hardware y testigos
> institucionales es nivel C (fuera de la entrega).

## Qué necesitas

- Un equipo con Docker (Docker Desktop o Docker Engine con `docker compose` 2.17 o posterior) y
  Node.js 22.18 o posterior. SIGILO, Node y Docker Engine son software libre y gratuito; nada se
  registra con terceros. Docker Desktop (macOS y Windows) tiene su propia licencia, que pide
  suscripción a organizaciones grandes: revísala, o usa Docker Engine en Linux.
- Un usuario normal del equipo (no root) y los puertos 8781, 8782, 8790, 8791 y 8792 libres en
  `127.0.0.1` para la red de demostración.
- Una persona responsable de cada autoridad que custodiará su llave privada.
- Saber qué autoridades de tu entidad reciben denuncias y de qué entes.

## 1. Da de alta tus autoridades

Cada autoridad es una entrada del directorio (`DirectoryAuthority` en `estandar/diccionario-de-datos.md`):

| Campo                      | Qué poner                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                       | `authority.` más un nombre corto en minúsculas: `authority.contraloria-queretaro`                   |
| `name`                     | Nombre oficial completo                                                                             |
| `nodeId`                   | Tu nodo (`node.<estado>`) o el nodo común                                                           |
| `governmentLevel`          | `estatal` o `municipal`                                                                             |
| `stateCode`                | Clave INEGI de dos dígitos de tu entidad                                                            |
| `role`                     | `investigating` (investiga faltas), `supervisory` (recibe escalamientos) o `prosecution` (fiscalía) |
| `competence`               | Órdenes de gobierno de los entes que atiende, entidades, entes específicos (vacío = todos) y leyes  |
| `supervisorId`             | La autoridad que recibe el sobre de escalamiento si esta no actúa (ADR 0007), o `null`              |
| `validFrom` / `validUntil` | Vigencia de sus llaves                                                                              |

Con esa competencia el navegador propone la autoridad de cada denuncia y explica por qué
(`proposeCompetentAuthority` en `packages/red`). Revisa los casos de tu entidad: un ente estatal
debe ir a la contraloría; un ente con órgano interno de control propio, a ese órgano; un ente
municipal sin órgano municipal en el directorio cae, como respaldo, en la contraloría estatal.

Registra también a tus **observadores** (CPC, entidad de fiscalización, organizaciones o academia)
con su llave de firma. Pueden ser testigos de la bitácora nacional y del directorio.

## 2. Genera llaves

Cada autoridad genera **en su propio equipo** un par X25519 (cifrado) y un par Ed25519 (firma) y
entrega solo las públicas. El nodo genera su llave de firma (la que firma su bitácora y su
registro) y su llave X25519 de red (la que abre los sobres que llegan del enrutador).

Para practicar, `npm run red:demo` genera todo sintético en `.red-demo/` (no se versiona):

```text
.red-demo/
  enrutador/   directory.json (firmado), trust.json (raíz fijada), operator-key.json
  nodos/<nodo>/data/keys.json          llave de firma del nodo, públicas de su buzón y segunda llave
  nodos/<nodo>/data/authority-demo-key.json   llave del buzón general del nodo
  nodos/<nodo>/data/authority-accounts.json   cuentas individuales (solo digestos)
  nodos/<nodo>/data/red-node-key.json  llave X25519 de red del nodo
  nodos/<nodo>/data/relay-secret.json  secreto del buzón compartido con el enrutador (HMAC)
  enrutador/relay-secrets.json         secretos del buzón de cada nodo
  nodos/<nodo>/data/directory.json     directorio firmado y network-trust.json (raíz fijada)
  nodos/<nodo>/credenciales.json       usuarios y contraseñas sintéticas del panel
  nodos/<nodo>/web/pinned-keys.json    llaves públicas que fija la web del nodo
  nodos/<nodo>/node.env                red, fuentes sintéticas, índice y reloj simulado
  autoridades/<id>.json                llaves de cada autoridad (las abre su panel)
  evaluador/ e indice/                 llave del evaluador OPRF; directorio del índice
  reloj/desfase                        reloj simulado común de la demostración
  testigos/<id>/                       llave y raíz fijada de cada testigo observador
```

Los archivos con llaves privadas quedan con permisos `0600`. Nunca se copian a las imágenes: entran
como volúmenes al arrancar.

## 3. Firma del directorio

La operación de la ventanilla única agrega tus entradas, sube el número de versión (`serial`),
pone el digesto de la versión anterior en `previousDigest` y firma. Después **cada testigo, por
separado y con su propia llave**, recalcula el digesto y cofirma (`cosignDirectory`). La versión
vale con m de n cofirmas de los testigos de la versión anterior; en la demostración, 2 de 3
(CPC Querétaro, Universidad Ejemplo y el nodo Querétaro). El enrutador se niega a arrancar con un
directorio que no verifica, que retrocede o que salta una versión.

## 4. Levanta tu nodo

Primero practica con la red completa de demostración. Desde la raíz del repositorio, con Docker en
marcha:

```sh
npm ci
npm run demo:todo      # llaves sintéticas, construcción, arranque, salud y escenario sembrado
npm run demo:apagar    # al terminar: baja la red y borra .red-demo/
```

Con caché tarda alrededor de un minuto; la primera vez, de 1 a 10 minutos según la conexión
(descarga la imagen `node:22-bookworm-slim` y los paquetes de npm). El detalle de cada paso, los
tiempos medidos y los problemas comunes están en [demo.md](demo.md#red-federada-con-el-escenario-completo-docker-un-comando).
Los pasos sueltos son:

```sh
npm run red:demo -- --force   # o tus propias llaves en la misma estructura
docker compose build
docker compose up -d --wait   # en Linux con UID distinto de 1000: SIGILO_UID=$(id -u) SIGILO_GID=$(id -g) docker compose up -d --wait
npm run demo:seed             # opcional: el escenario de docs/demo-escenario.md
```

| Servicio                 | Dirección                                    |
| ------------------------ | -------------------------------------------- |
| Enrutador                | <http://127.0.0.1:8790/api/v1/red/directory> |
| Nodo Querétaro (con web) | <http://127.0.0.1:8781/>                     |
| Nodo Federal (con web)   | <http://127.0.0.1:8782/>                     |
| Evaluador OPRF           | <http://127.0.0.1:8791/>                     |
| Índice de coincidencias  | <http://127.0.0.1:8792/>                     |

Para tu estado, copia el servicio `nodo-queretaro` de `compose.yaml` con otro nombre, otro puerto y
tu carpeta de llaves. La imagen del nodo es el servidor de referencia `apps/server` tal cual, con
la web en el mismo origen y las llaves de tu nodo fijadas al construir. Si tu nodo usa otro
software, debe cumplir el Estándar S5 (`estandar/openapi.yaml`) y puedes revisarlo con
`npm run validate`.

Usuario de los contenedores: todos corren sin privilegios (`cap_drop: ALL`, sistema de archivos de
solo lectura, `no-new-privileges`) con el UID y GID de `SIGILO_UID` y `SIGILO_GID`, 1000 por omisión
(el usuario `node` de la imagen). Ese usuario debe ser el dueño de las carpetas de llaves y datos
del equipo: el nodo escribe ahí sus bases (carpetas `0700`) y, en la demostración, solo acepta un
reloj simulado que sea suyo. En macOS y Windows, Docker Desktop presenta los archivos montados con
el dueño del contenedor y funciona con cualquier UID; en Linux, el dueño real cuenta. Por eso
`npm run demo:todo` levanta la red con tu `id -u` e `id -g`, y a mano en Linux se antepone
`SIGILO_UID=$(id -u) SIGILO_GID=$(id -g)`. Nunca uses root: genera las llaves con tu usuario normal.
En operación real, crea un usuario de servicio para el nodo, haz que sea dueño de su carpeta de
datos y fíjalo en `SIGILO_UID`.

Antes de abrir tu nodo, comprueba desde fuera del contenedor que su web no pide nada a terceros y
que envía las cabeceras de seguridad:

```sh
npm run validate -- http://127.0.0.1:8781 --modo pasivo --formulario /denunciar
```

Con la red de demostración da 10 `cumple`, 0 `no_cumple`, 1 `advertencia` (PRV-10, heurística: el
código incluye el texto `draft-2020-12` de JSON Schema, no un borrador de la denuncia) y el resto
`no_aplica` en modo pasivo.

Comprueba que tu nodo entró a la bitácora nacional: en un minuto el enrutador recoge su cabeza en
`/api/v1/ledger/head`, los testigos cofirman y

```sh
curl "http://127.0.0.1:8790/api/v1/red/national/inclusion?nodeId=node.queretaro&seq=<seq>&hash=<hash>"
```

devuelve la prueba (con `seq` y `hash` de `http://127.0.0.1:8781/api/v1/ledger/head`). Para ver el
umbral 2 de 3, detén un testigo (`docker compose stop testigo-universidad-ejemplo`): la cabeza
nacional se sigue cofirmando con los otros dos.

## 5. Recibir denuncias por la red

El servidor de referencia ya monta el buzón de red (`POST /api/v1/red/inbox`) y se registra ante el
enrutador al arrancar: las denuncias de la ventanilla única llegan cifradas a tu nodo a través del
enrutador ciego, que no puede leerlas. El escenario de demostración lo usa (Marta y la persona de
Querétaro envían por la ventanilla única). El contrato, para otras implementaciones del nodo, está
en [`apps/enrutador/README.md`](../apps/enrutador/README.md#integración-con-el-nodo).

## Seguridad operativa

- El enrutador y el proxy que lo publique no deben registrar direcciones IP ni cabeceras.
- Operar el enrutador, los nodos y los testigos con instituciones distintas: ninguna sola puede leer
  denuncias ni aprobar un directorio con una llave falsa.
- Respaldar las llaves privadas fuera de línea; perder la de una autoridad impide abrir sus
  denuncias.
- Publicar con HTTPS (`SIGILO_HSTS_MAX_AGE`, `SIGILO_ROUTER_HSTS_MAX_AGE`) fuera del entorno local.
