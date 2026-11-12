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
- Tu nodo **no tiene ventanilla pública**: corre en perfil `nodo`, con solo el panel de tus
  autoridades y las rutas de API que necesita la SESNA. Las denuncias te llegan cifradas desde la
  ventanilla.

> Borrador del prototipo para el Datatón 2026. No es el sistema oficial. La demostración usa datos y
> llaves sintéticos.

Esta guía explica **los conceptos**: autoridades, tabla de funciones, llaves y huellas, directorio
firmado y lo que pasa con las denuncias. **Para instalar** sigue
[instalacion-nodo.md](instalacion-nodo.md) (estado) e [instalacion-sesna.md](instalacion-sesna.md)
(SESNA): son pocos comandos y ninguno pide editar JSON.

## Instalar el nodo de tu estado

Resumen de [instalacion-nodo.md](instalacion-nodo.md):

```sh
./sigilo instalar      # unas 10 preguntas; deja salida/solicitud-alta-<estado>.json y una huella
./sigilo iniciar       # cuando la SESNA confirme el alta
./sigilo diagnostico   # todo en verde
```

La solicitud de alta **no lleva secretos**: la firma tu nodo y la SESNA la confirma con la huella
que lees por teléfono. Los secretos que compartes con la SESNA (HMAC del buzón y OAuth) los
**derivan** los dos lados y nunca viajan ([criptografia.md](criptografia.md#secretos-de-enlace-derivados-sesna--nodo)).

## En orden

1. Instala tu nodo con tu buzón general y tu operación ([instalacion-nodo.md](instalacion-nodo.md)).
2. La SESNA acepta tu solicitud, los testigos cofirman y tu nodo entra al directorio (sección 4).
3. Da de alta tus autoridades (sección 1); cada una genera sus llaves en su navegador (sección 3).
4. **Completa tu tabla de funciones** y fírmala con la llave de tu nodo (sección 2).

## El alta de una institución en cinco pasos

Así se da de alta una institución de un estado que **ya tiene nodo** (por ejemplo, el órgano
interno de control de una secretaría estatal). Una institución de un estado sin nodo no puede pedir
el alta: primero su estado monta su nodo.

| Paso | Quién                     | Qué                                                                                                                                 | Herramienta                                          |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | La institución            | Llena «Solicitar alta de mi institución» en la ventanilla (`/solicitar-alta`); la solicitud va al nodo de su estado                 | Web                                                  |
| 2    | La institución            | En la misma página crea sus llaves: descarga la privada; solo el candado viaja con la solicitud                                     | Web                                                  |
| 3    | Quien opera el nodo       | En la bandeja «Solicitudes de alta» (cuenta de operación) llama a la institución, confirma la huella y aprueba o rechaza con motivo | Panel                                                |
| 4    | Quien opera la ventanilla | Agrega la entrada que exporta la bandeja a la versión siguiente del directorio; los testigos cofirman (sección 4)                   | `./sigilo-sesna aceptar <entrada.json>` y `publicar` |
| 5    | Quien opera el nodo       | Crea las cuentas de la lista; cada persona recibe una contraseña temporal y firma la carta responsiva                               | `./sigilo cuenta nueva`                              |

La cuenta de operación del nodo (función `operation`) entra al panel sin archivo de llave: no ve
denuncias, ni autoridades, ni identidades; solo las solicitudes de alta. Aprobar exige que la huella
que la institución lee por teléfono coincida con la que el navegador de la operación calcula a
partir del candado recibido, y el servidor vuelve a comprobarla. Conviene llamar a un número
obtenido por otra vía, no al de la solicitud.

## 1. Tus autoridades

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

No la escribes a mano: la arma la bandeja «Solicitudes de alta» de tu panel a partir de lo que
llenó la institución. La competencia sirve para ofrecer alternativas a quien denuncia; quién
investiga a cada ente lo decide tu tabla de funciones (sección 2).

Tu **buzón general** (papel `inbox`) lo crea `./sigilo instalar`: recibe lo que tu tabla no asigna y
una persona lo turna.

Tus **observadores** (CPC, entidad de fiscalización, organizaciones o academia) entran con su llave
de firma. Pueden ser testigos de la bitácora nacional y del directorio: cada uno crea su llave con
`./sigilo testigo crear-llave`.

## 2. Tu tabla de funciones

La tabla de funciones (`FunctionTable` en `estandar/diccionario-de-datos.md`) dice qué institución
cumple cada función en tu estado. Con ella la ventanilla propone a quién va cada denuncia, el panel
muestra quién sigue en el trámite y la página pública «¿Quién atiende tu denuncia en tu estado?» la
enseña a cualquiera.

| Función        | Clave            | En el CSV        | Quién puede ser                                                          |
| -------------- | ---------------- | ---------------- | ------------------------------------------------------------------------ |
| Buzón general  | `intake`         | `buzon`          | Tu buzón general (autoridad del directorio con papel `inbox`)            |
| Operación      | `operation`      | `operacion`      | Quien opera el nodo y da de alta autoridades (SESEA o contraloría)       |
| Investigación  | `investigation`  | `investigacion`  | Autoridad del directorio con papel `investigating`: recibe cifrado       |
| Substanciación | `substantiation` | `substanciacion` | Una autoridad o una institución                                          |
| Resolución     | `resolution`     | `resolucion`     | Una autoridad o una institución (la falta grave la resuelve el tribunal) |
| Supervisión    | `supervision`    | `supervision`    | El superior que recibe escalamientos (autoridad `supervisory`) u otra    |
| Vía penal      | `prosecution`    | `penal`          | La fiscalía anticorrupción (autoridad `prosecution` o institución)       |
| Observador     | `observer`       | `observador`     | Tu CPC (observador del directorio) u otra institución                    |

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

**Edítala como hoja de cálculo.** `./sigilo instalar` deja la tabla mínima (buzón y operación) en
`config/tabla-de-funciones.csv`, con las columnas `funcion,orden,ente,gravedad,quien,fundamento`:

```text
funcion,orden,ente,gravedad,quien,fundamento
investigacion,estatal;municipal,,,authority.contraloria-oaxaca,"LGRA, art. 3, fr. II"
resolucion,estatal;municipal,,no_grave,authority.contraloria-oaxaca,"LGRA, art. 10"
resolucion,estatal;municipal,,grave,institucion:Tribunal de Justicia Administrativa de Oaxaca,"LGRA, art. 12"
```

`./sigilo tabla revisar` la valida contra el directorio vigente y la muestra en lenguaje llano;
`./sigilo tabla firmar` sube su `version`, la firma con la llave de tu nodo y deja el archivo para la
SESNA, que lo integra con `./sigilo-sesna aceptar`. La operación no puede cambiarla sin tu firma: el
navegador rechaza un directorio con una tabla que no lleva la firma de su nodo.

## 3. Llaves y huellas

| Llave                        | Quién la genera y dónde vive                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Firma del nodo (Ed25519)     | `./sigilo instalar`; `datos/keys.json`. Firma la bitácora, el registro, la tabla y la solicitud            |
| Red del nodo (X25519)        | `./sigilo instalar`; `datos/red-node-key.json`. Abre los sobres del enrutador                              |
| Enlace con la SESNA (X25519) | `./sigilo instalar`; `llaves/enlace-key.json`, **fuera** del volumen del nodo                              |
| Buzón general                | `./sigilo instalar` la deja en `salida/` para **sacarla del servidor**, o el buzón la crea en su navegador |
| Cada autoridad               | Su responsable, en su navegador («Crear mis llaves»); la privada nunca pasa por el servidor                |

### Cómo genera una autoridad su par y entrega su candado

1. La persona responsable abre el panel de autoridad de su nodo (`/autoridad`) y, debajo del
   formulario de entrada, despliega **«¿Tu autoridad todavía no tiene llaves? Crear mis llaves»**.
   No necesita cuenta: el par se genera en su navegador con las mismas primitivas de `@sigilo/core`
   que usa el resto del proyecto, y nada se envía.
2. Descarga su **llave privada** (`llave-autoridad-<keyId>.json`, con el formato de
   `AuthorityDemoKeySchema`) y la guarda en un lugar seguro. Se queda en su equipo: nadie más la
   tiene, tampoco quien opera el nodo. Si se pierde, se genera otro par y se cambia el candado.
3. Envía su **candado**, la llave pública (`keyId`, `boxPublicKey` y `signingPublicKey`), con la
   solicitud de alta; la bandeja del nodo arma la entrada del directorio.
4. Confirman por teléfono la **huella** que muestra la pantalla (16 caracteres en grupos de 4): los
   primeros 16 caracteres hexadecimales del SHA-256 de `boxPublicKey` seguida de `signingPublicKey`
   (los bytes, no el texto base64url). Cubre las dos llaves; si no coincide, el candado no se
   agrega.
5. Cuando el directorio firmado ya trae su candado, cada cuenta de esa autoridad entra al panel con
   su usuario, su contraseña y ese archivo. El panel compara la llave con la entrada de **su**
   autoridad en el directorio verificado y rechaza la de otra autoridad o la del buzón general.

### La llave del buzón general nunca va en el servidor

Quien atiende el buzón general custodia su llave. `./sigilo instalar` la deja en
`salida/llave-buzon-<estado>.json` con la instrucción de **sacarla del servidor**; si prefieres que
nunca pase por el servidor, el buzón la crea en su navegador con «Crear mis llaves» y la instalación
recibe solo su candado (`./sigilo instalar --candado-buzon candado.json`). El servidor no la lee:
si se quedara en su volumen, quien entrara al servidor leería los hechos de todo lo que llega al
buzón. `./sigilo diagnostico` marca como problema una llave del buzón en `datos/` y como aviso una
que sigue en `salida/`.

### Las huellas largas

La **huella de la red** (32 caracteres) la publica la SESNA en su oficio y en su sitio; el
instalador la compara antes de seguir. La **huella del nodo** (32 caracteres) la lee el estado por
teléfono; la SESNA no acepta sin ella. Por qué 32 y no 16: [criptografia.md](criptografia.md#alta-de-un-nodo-solicitud-firmada-y-huellas).

## 4. El directorio firmado

La operación de la ventanilla agrega tu nodo, tu buzón y tu tabla de funciones, sube el número de
versión (`serial`), pone el digesto de la versión anterior en `previousDigest` y firma
(`./sigilo-sesna aceptar`). Después **cada testigo, por separado y con su propia llave**, revisa el
resumen de cambios contra la versión vigente, recalcula el digesto y cofirma
(`./sigilo testigo cofirmar`). La versión vale con m de n cofirmas de los testigos de la versión
anterior (`./sigilo-sesna publicar`). El enrutador se niega a arrancar con un directorio que no
verifica, que retrocede o que salta una versión, y tu nodo con uno que no verifica contra la raíz de
`red.json`.

Cuando la SESNA publica una versión nueva (otra tabla, otra autoridad, otro estado), tu nodo la
toma con `./sigilo directorio actualizar` (programado a diario con `./sigilo programar`).

## 5. Practica con la demostración

Antes de instalar, puedes ver la red completa con datos sintéticos en un equipo con Docker y Node:

```sh
npm ci
npm run demo:todo      # llaves sintéticas, construcción, arranque, salud y escenario sembrado
npm run demo:apagar    # al terminar: baja la red y borra .red-demo/
```

El detalle está en [demo.md](demo.md). La demostración **no** es una instalación de producción:
usa `NODE_ENV=development`, `SIGILO_DEMO=1`, reloj simulado y llaves de todas las instituciones en
un solo equipo (las del buzón y la supervisora, fuera de los volúmenes, en
`.red-demo/nodos/<nodo>/llaves-demo/`). Un nodo con `NODE_ENV=production` y `SIGILO_E2E=1` no
arranca, y con `SIGILO_DEMO=1` avisa en cada arranque.

## 6. Recibir denuncias por la red

Tu nodo monta el buzón de red (`POST /api/v1/red/inbox`) y se registra ante el enrutador al
arrancar: las denuncias de la ventanilla única llegan cifradas a tu nodo a través del enrutador
ciego, que no puede leerlas. Cada entrega llega con el token que tu nodo emitió a la SESNA
(`sesna:entregas`) y con la etiqueta HMAC v2 del buzón (marca de tiempo y nonce de un solo uso). El
contrato, para otras implementaciones del nodo, está en
[`apps/enrutador/README.md`](../apps/enrutador/README.md#integración-con-el-nodo).

Si tu nodo no responde, una denuncia **sin pruebas adjuntas** no se pierde: el enrutador guarda el
sobre cerrado en su cola, da a quien denuncia un acuse firmado por la operación y reintenta (desde
30 s, duplicando hasta 1 h) durante 7 días como máximo, con un tope de 500 sobres o 64 MiB por
nodo. Las denuncias con pruebas no entran a la cola: la persona vuelve a intentar.

**Salud y versión mínima.** Tu nodo responde `GET /api/v1/red/health` con su identificador y la
versión de su software. El enrutador lo consulta cada minuto y la operación de la ventanilla ve el
estado de todos los nodos en `GET /api/v1/red/health/nodes`, sin datos de denuncias. Si la SESNA fija
una versión mínima, no entrega a un nodo con una versión menor: lo que esté en cola espera hasta que
actualices (`./sigilo actualizar <versión>`). `./sigilo diagnostico` te muestra esa misma vista.

**Credenciales OAuth 2.0.** Como en las APIs del S2 y del S3 de la PDN, tu nodo es el
**proveedor**: tiene su propio servidor de autorización (`POST /oauth/token`) y la SESNA pide sus
tokens (`sesna:entregas`, `sesna:estadisticas`). Tu nodo guarda solo el digesto del secreto en
`oauth-clients.json`, con el flujo `client_credentials`. El secreto se **deriva** en los dos lados
(sección «Instalar el nodo de tu estado»); para rotarlo: `./sigilo rotar-llaves --enlace`.

## Variables del nodo

`./sigilo instalar` escribe `config/nodo.env`. Las que importan en producción (la lista completa
está en [seguridad-produccion.md](seguridad-produccion.md)):

| Variable                   | Valor                       | Para qué                                                                    |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                 | `production`                | Valores seguros por omisión                                                 |
| `SIGILO_NODE_PROFILE`      | `nodo`                      | Solo frentes red, público y panel: **sin denuncia directa** (H03)           |
| `SIGILO_PANEL_PORT`        | `8788`                      | El panel en su propio puerto (publicado en el 8081 del contenedor)          |
| `SIGILO_RELAY_AUTH_LEGACY` | `0`                         | El buzón exige la etiqueta HMAC v2 del enrutador                            |
| `SIGILO_HTTPS`             | `1`                         | HSTS de un año                                                              |
| `SIGILO_NODE_ID`           | `node.<estado>`             | Tu nodo en el directorio                                                    |
| `SIGILO_ROUTER_URL`        | la ventanilla de `red.json` | Registro, cabezas y turnados                                                |
| `SIGILO_REST_DAYS_FILE`    | `datos/dias-inhabiles.json` | Días inhábiles locales (`./sigilo calendario revisar`), que el nodo publica |
| `SIGILO_WEB_CONFIG_FILE`   | `datos/web-config.json`     | Lo que la web lee en `/config/sigilo.json` (ADR 0011)                       |

Nunca: `SIGILO_DEMO`, `SIGILO_E2E`, `SIGILO_TEST_CLOCK_FILE`, `SIGILO_PDN_SOURCES=synthetic` ni
`SIGILO_NODE_INTAKE`.

## Seguridad operativa

- Ningún proxy delante del nodo o del enrutador registra direcciones IP ni cabeceras; con el Caddy
  de la instalación ya es así.
- El frente «red» solo para la SESNA y los testigos; el panel solo por la VPN o la red de la
  institución ([seguridad-produccion.md](seguridad-produccion.md)).
- Operar el enrutador, los nodos y los testigos con instituciones distintas: ninguna sola puede leer
  denuncias ni aprobar un directorio con una llave falsa.
- Respaldos cifrados fuera del equipo (`./sigilo respaldar`), con la frase en papel y en otro lugar;
  perder la llave de una autoridad impide abrir sus denuncias.
