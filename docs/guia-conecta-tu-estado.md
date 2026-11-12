# Guía: conecta tu estado a la red S5 (borrador)

Para el equipo técnico de una Secretaría Ejecutiva del Sistema Estatal Anticorrupción (SESEA), o de
la secretaría de buen gobierno o contraloría del estado, que va a operar el **nodo de su estado** en
la red «un S5, muchas llaves» ([ADR 0005](adr/0005-estandar-s5-federado.md)).

Así está repartida la red:

- **La SESNA** monta la **única ventanilla nacional** (la web donde denuncian ciudadanos y personas
  servidoras públicas) junto con el enrutador ciego. No tiene llaves: no puede leer denuncias.
- **Cada estado monta su propio nodo.** No hay nodo común: ningún estado vive en el nodo de otro.
  Si tu estado no monta su nodo, la ventanilla **no puede enviar** las denuncias sobre sus entes
  estatales y municipales, y lo dice así a quien denuncia. Las de entes federales sí llegan: las
  atiende el nodo federal.
- **El nodo federal** aloja solo autoridades federales y lo opera la Secretaría Anticorrupción y
  Buen Gobierno.
- Tu nodo **no tiene ventanilla pública**: solo el panel de tus autoridades y las rutas de API que
  necesita el enrutador. Las denuncias te llegan cifradas desde la ventanilla.

> Borrador del prototipo para el Datatón 2026. No es el sistema oficial. Todo lo que aparece aquí
> usa datos y llaves sintéticos; la operación con llaves reales, módulos de hardware y testigos
> institucionales es nivel C (fuera de la entrega).

## Qué necesitas

- Un equipo con Docker (Docker Desktop o Docker Engine con `docker compose` 2.17 o posterior) y
  Node.js 22.18 o posterior. SIGILO, Node y Docker Engine son software libre y gratuito; nada se
  registra con terceros. Docker Desktop (macOS y Windows) tiene su propia licencia, que pide
  suscripción a organizaciones grandes: revísala, o usa Docker Engine en Linux.
- Un usuario normal del equipo (no root) y los puertos 8781, 8782, 8783, 8790, 8791 y 8792 libres
  en `127.0.0.1` para la red de demostración.
- Una persona responsable de cada autoridad que custodiará su llave privada.
- Saber qué institución de tu entidad cumple cada función (sección 2): quién recibe y turna, quién
  investiga a cada ente, quién substancia, quién resuelve, quién supervisa, la fiscalía y el CPC.

## En orden

1. Levanta el nodo de tu estado (sección 5) con tu buzón general y tu operación.
2. Da de alta tus autoridades (sección 1) y genera sus llaves (sección 3).
3. **Declara tu tabla de funciones** y fírmala con la llave de tu nodo (sección 2).
4. La operación de la ventanilla agrega todo al directorio y los testigos lo cofirman (sección 4).

## El alta en cinco pasos

Así se da de alta una institución de un estado que **ya tiene nodo** (por ejemplo, el órgano
interno de control de una secretaría estatal). Una institución de un estado sin nodo no puede pedir
el alta: primero su estado monta su nodo.

| Paso | Quién                     | Qué                                                                                                                                 | Estado                                      |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1    | La institución            | Llena «Solicitar alta de mi institución» en la ventanilla (`/solicitar-alta`); la solicitud va al nodo de su estado                 | Construido                                  |
| 2    | La institución            | En la misma página crea sus llaves: descarga la privada; solo el candado viaja con la solicitud                                     | Construido                                  |
| 3    | Quien opera el nodo       | En la bandeja «Solicitudes de alta» (cuenta de operación) llama a la institución, confirma la huella y aprueba o rechaza con motivo | Construido                                  |
| 4    | Quien opera la ventanilla | Agrega la entrada propuesta al directorio, lo firma y los testigos lo cofirman (sección 4)                                          | Manual: la bandeja entrega la entrada lista |
| 5    | Quien opera el nodo       | Crea las cuentas de la lista; cada persona pone su contraseña y firma la carta responsiva                                           | Manual: hoy con `npm run accounts:generate` |

La cuenta de operación del nodo (función `operation`) entra al panel sin archivo de llave: no ve
denuncias, ni autoridades, ni identidades; solo las solicitudes de alta. Aprobar exige que la huella
que la institución lee por teléfono coincida con la que el navegador de la operación calcula a
partir del candado recibido, y el servidor vuelve a comprobarla. Conviene llamar a un número
obtenido por otra vía, no al de la solicitud.

## 1. Da de alta tus autoridades

Cada autoridad es una entrada del directorio (`DirectoryAuthority` en `estandar/diccionario-de-datos.md`):

| Campo                      | Qué poner                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                       | `authority.` más un nombre corto en minúsculas: `authority.contraloria-queretaro`                   |
| `name`                     | Nombre oficial completo                                                                             |
| `nodeId`                   | Tu nodo (`node.<estado>`): ninguna autoridad estatal vive en el nodo de otro estado                 |
| `governmentLevel`          | `estatal` o `municipal`                                                                             |
| `stateCode`                | Clave INEGI de dos dígitos de tu entidad                                                            |
| `role`                     | `investigating` (investiga faltas), `supervisory` (recibe escalamientos) o `prosecution` (fiscalía) |
| `competence`               | Órdenes de gobierno de los entes que atiende, entidades, entes específicos (vacío = todos) y leyes  |
| `supervisorId`             | La autoridad que recibe el sobre de escalamiento si esta no actúa (ADR 0007), o `null`              |
| `validFrom` / `validUntil` | Vigencia de sus llaves                                                                              |

La competencia sirve para ofrecer alternativas a quien denuncia; quién investiga a cada ente lo
decide tu tabla de funciones (sección 2).

Registra también tu **buzón general** (papel `inbox`): recibe lo que tu tabla no asigna y una
persona lo turna. Su llave es la de `keys.json` de tu nodo.

Registra también a tus **observadores** (CPC, entidad de fiscalización, organizaciones o academia)
con su llave de firma. Pueden ser testigos de la bitácora nacional y del directorio.

## 2. Declara tu tabla de funciones

La tabla de funciones (`FunctionTable` en `estandar/diccionario-de-datos.md`) dice qué institución
cumple cada función en tu estado. Con ella la ventanilla propone a quién va cada denuncia, el panel
muestra quién sigue en el trámite y la página pública «¿Quién atiende tu denuncia en tu estado?» la
enseña a cualquiera.

| Función        | Clave            | Quién puede ser                                                          |
| -------------- | ---------------- | ------------------------------------------------------------------------ |
| Buzón general  | `intake`         | Tu buzón general (autoridad del directorio con papel `inbox`)            |
| Operación      | `operation`      | Quien opera el nodo y da de alta autoridades (SESEA o contraloría)       |
| Investigación  | `investigation`  | Autoridad del directorio con papel `investigating`: recibe cifrado       |
| Substanciación | `substantiation` | Una autoridad o una institución                                          |
| Resolución     | `resolution`     | Una autoridad o una institución (la falta grave la resuelve el tribunal) |
| Supervisión    | `supervision`    | El superior que recibe escalamientos (autoridad `supervisory`) u otra    |
| Vía penal      | `prosecution`    | La fiscalía anticorrupción (autoridad `prosecution` o institución)       |
| Observador     | `observer`       | Tu CPC (observador del directorio) u otra institución                    |

Cada función es una lista de reglas. Cada regla dice a qué órdenes de gobierno aplica (`estatal`,
`municipal`), si aplica solo a ciertos entes del catálogo (`entityIds`) y, si hace falta, a qué
gravedad (`severity`). La regla que nombra al ente gana sobre la de todo su orden. Ejemplo en
lenguaje llano:

- Investigación: entes estatales → Contraloría; municipales sin OIC propio → Contraloría (una regla
  general para el orden municipal); la Secretaría de Salud → su OIC (una regla con su `entityId`).
- Resolución: falta no grave → Contraloría; falta grave → Tribunal de Justicia Administrativa.

Si una denuncia no encaja en ninguna regla de investigación, llega a tu buzón general y una persona
la turna. Tu tabla solo cubre entes estatales y municipales de tu entidad (los federales los atiende
el nodo federal) y solo puede nombrar autoridades de tu propio nodo.

**Fírmala con la llave de tu nodo** (`signFunctionTable` en `packages/red`, con tu llave de firma
del directorio) y entrégala a la operación de la ventanilla, que la pone en el directorio
(`functionTables`). Cada cambio sube su `version`. La operación no puede cambiarla sin tu firma: el
navegador rechaza un directorio con una tabla que no lleva la firma de su nodo. La red de
demostración trae la tabla de cada nodo en `demoFunctionTables` (`packages/red/src/demo-network.ts`).

## 3. Genera llaves

Cada autoridad genera **en su propio equipo** un par X25519 (cifrado) y un par Ed25519 (firma) y
entrega solo las públicas. El nodo genera su llave de firma (la que firma su bitácora y su
registro) y su llave X25519 de red (la que abre los sobres que llegan del enrutador).

### Cómo genera la autoridad su par y entrega su candado

1. La persona responsable abre el panel de autoridad de su nodo (`/autoridad`) y, debajo del
   formulario de entrada, despliega **«¿Tu autoridad todavía no tiene llaves? Crear mis llaves»**.
   No necesita cuenta: el par se genera en su navegador con las mismas primitivas de `@sigilo/core`
   que usa el resto del proyecto, y nada se envía.
2. Descarga su **llave privada** (`llave-autoridad-<keyId>.json`, con el formato de
   `AuthorityDemoKeySchema`) y la guarda en un lugar seguro. Se queda en su equipo: nadie más la
   tiene, tampoco quien opera el nodo. Si se pierde, se genera otro par y se cambia el candado.
3. Envía por oficio su **candado**, la llave pública (`candado-<keyId>.json`: `keyId`,
   `boxPublicKey` y `signingPublicKey`), a la operación de la ventanilla única, que lo copia en la
   entrada de su autoridad del directorio (sección 1) antes de firmar (sección 4).
4. Confirman por teléfono la **huella** que muestra la pantalla (16 caracteres en grupos de 4): los
   primeros 16 caracteres hexadecimales del SHA-256 de `boxPublicKey` seguida de `signingPublicKey`
   (los bytes, no el texto base64url). Cubre las dos llaves; si no coincide, el candado no se
   agrega.
5. Cuando el directorio firmado ya trae su candado, cada cuenta de esa autoridad entra al panel con
   su usuario, su contraseña y ese archivo. El panel compara la llave con la entrada de **su**
   autoridad en el directorio verificado (`keyId`, `boxPublicKey` y `signingPublicKey`) y rechaza la
   de otra autoridad o la del buzón general del nodo.

Quien opera el nodo custodia solo la llave del **buzón general** (`authority-demo-key.json`), que
usan las cuentas del buzón y con la que se sellan las denuncias que entran por la página propia del
nodo sin pasar por la red. Puede leer los hechos de lo que llega a su nodo, pero nunca la identidad
sellada para una autoridad.

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
  nodos/<nodo>/web/pinned-keys.json    llaves públicas que fija la web del nodo (perfil panel)
  ventanilla/web/network-trust.json    raíz de confianza que fija la ventanilla única (SESNA)
  nodos/<nodo>/node.env                red, fuentes sintéticas, índice y reloj simulado
  autoridades/<id>.json                llave privada de cada autoridad (la importa su panel)
  evaluador/ e indice/                 llave del evaluador OPRF; directorio del índice
  reloj/desfase                        reloj simulado común de la demostración
  testigos/<id>/                       llave y raíz fijada de cada testigo observador
```

Los archivos con llaves privadas quedan con permisos `0600`. Nunca se copian a las imágenes: entran
como volúmenes al arrancar.

## 4. Firma del directorio

La operación de la ventanilla única agrega tus entradas y tu tabla de funciones firmada, sube el número de versión (`serial`),
pone el digesto de la versión anterior en `previousDigest` y firma. Después **cada testigo, por
separado y con su propia llave**, recalcula el digesto y cofirma (`cosignDirectory`). La versión
vale con m de n cofirmas de los testigos de la versión anterior; en la demostración, 2 de 3
(CPC Querétaro, Universidad Ejemplo y el nodo Querétaro). El enrutador se niega a arrancar con un
directorio que no verifica, que retrocede o que salta una versión.

## 5. Levanta tu nodo

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

| Servicio                             | Dirección                                    |
| ------------------------------------ | -------------------------------------------- |
| Ventanilla única y enrutador (SESNA) | <http://127.0.0.1:8790/>                     |
| Directorio firmado                   | <http://127.0.0.1:8790/api/v1/red/directory> |
| Nodo Querétaro (solo panel)          | <http://127.0.0.1:8781/autoridad>            |
| Nodo Federal (solo panel)            | <http://127.0.0.1:8782/autoridad>            |
| Nodo Estado Ejemplo (solo panel)     | <http://127.0.0.1:8783/autoridad>            |
| Evaluador OPRF                       | <http://127.0.0.1:8791/>                     |
| Índice de coincidencias              | <http://127.0.0.1:8792/>                     |

Para tu estado, copia el servicio `nodo-ejemplo` de `compose.yaml` con otro nombre, otro puerto y
tu carpeta de llaves, y agrega su dirección interna a `SIGILO_ROUTER_NODE_URLS` del enrutador y a
`SIGILO_WITNESS_NODE_URLS` de los testigos. La imagen del nodo es el servidor de referencia
`apps/server` tal cual, con la web en el mismo origen en **perfil panel** (argumento
`SIGILO_WEB_PROFILE: panel`): solo `/autoridad`; las demás rutas dicen dónde está la ventanilla
única (`SIGILO_VENTANILLA_URL`). Las llaves de tu nodo se fijan al construir. Si tu nodo usa otro
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
npm run validate -- http://127.0.0.1:8790 --modo pasivo --formulario /denunciar
```

(es la ventanilla, donde está el formulario; tu nodo en perfil panel no lo tiene). Con la red de
demostración da 10 `cumple`, 0 `no_cumple`, 1 `advertencia` (PRV-10, heurística: el
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

Tu nodo también entra al corte nacional de datos abiertos: en cada vuelta el enrutador descarga tu
`/api/v1/open-data/complaints.csv` (solo meses cerrados, múltiplos de 5, celdas menores a 5
omitidas) y lo suma con los demás. Para ver si se sumó o por qué se descartó:

```sh
curl -s http://127.0.0.1:8790/api/v1/red/national/open-data | jq '.nodes[] | {nodeId, status, rejection}'
```

## 6. Recibir denuncias por la red

El servidor de referencia ya monta el buzón de red (`POST /api/v1/red/inbox`) y se registra ante el
enrutador al arrancar: las denuncias de la ventanilla única llegan cifradas a tu nodo a través del
enrutador ciego, que no puede leerlas. El escenario de demostración lo usa: todas las denuncias
llegan por la ventanilla única. El contrato, para otras implementaciones del nodo, está
en [`apps/enrutador/README.md`](../apps/enrutador/README.md#integración-con-el-nodo).

## Seguridad operativa

- El enrutador y el proxy que lo publique no deben registrar direcciones IP ni cabeceras.
- Operar el enrutador, los nodos y los testigos con instituciones distintas: ninguna sola puede leer
  denuncias ni aprobar un directorio con una llave falsa.
- Respaldar las llaves privadas fuera de línea; perder la de una autoridad impide abrir sus
  denuncias.
- Publicar con HTTPS (`SIGILO_HSTS_MAX_AGE`, `SIGILO_ROUTER_HSTS_MAX_AGE`) fuera del entorno local.
