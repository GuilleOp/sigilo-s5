# Guion de la demostración

Duración: unos 9 minutos. Todo corre en local con datos sintéticos y no depende de internet. Los
comandos se ejecutan desde la raíz del repositorio con Node 22.18 o superior.

Para el guion manual (sin Docker) necesitas además:

- `exiftool`, para poner GPS ficticio a una foto propia (paso 5). Si no lo tienes, usa la foto con
  EXIF sintético `.red-demo/fixtures/cotizacion-con-exif.jpg`, que deja `npm run demo:seed` (o
  `npm run demo:todo`) al sembrar la red de Docker.
- Un comando para copiar al portapapeles: `pbcopy` en macOS; en Linux, cambia `| pbcopy` por
  `| xclip -selection clipboard`.

## Preparación (antes de la presentación)

1. Instalar y generar llaves (una sola vez):

   ```sh
   npm ci
   npm run keys:generate
   npm run accounts:generate
   ```

   `keys:generate` crea las llaves privadas en `apps/server/data/` (también la de la supervisora,
   `supervisor-demo-key.json`) y fija las públicas en `apps/web/src/config/pinned-keys.json`.
   `accounts:generate` crea las cuentas individuales de la autoridad (`authority-accounts.json`,
   solo digestos) y sus credenciales sintéticas (`authority-demo-credentials.json`). Si
   `apps/server/.env` todavía tiene `SIGILO_AUTHORITY_TOKEN`, quítalo: el servidor ya no arranca
   con un token compartido.

2. Dejar la base vacía (conserva las llaves). Con el servidor detenido:

   ```sh
   npm run demo:reset -- --yes
   ```

   Sin `--yes`, el script exige el marcador `.sigilo-demo` en `apps/server/data`, y se niega a correr
   si el servidor está en marcha. Una base creada antes de las migraciones 3 o 4 no arranca: el
   servidor pide ejecutar este mismo comando.

3. Preparar el reloj de demostración y levantar el servidor y la web, en dos terminales:

   ```sh
   printf 0 > /tmp/sigilo-reloj && chmod 600 /tmp/sigilo-reloj
   SIGILO_E2E=1 SIGILO_TEST_CLOCK_FILE=/tmp/sigilo-reloj npm run dev:server
   npm run dev:web
   ```

   Los eventos del día se publican al cerrar el día (UTC). Para mostrarlos durante la presentación
   se usa el reloj de pruebas: el servidor suma al reloj real los milisegundos escritos en el
   archivo. Solo se acepta con `SIGILO_E2E=1` (o `NODE_ENV=test`), con un archivo propio que no
   puedan escribir otros y un desfase de 0 a 400 días.

   La prueba de trabajo está activa (18 bits): al enviar, la web la resuelve en un Web Worker y
   avisa «Protegiendo tu envío contra envíos automáticos. Puede tardar unos segundos».

4. Ventanas abiertas en `http://127.0.0.1:5173`:
   - Persona denunciante: «Denunciar» y «Dar seguimiento».
   - Panel de autoridad: enlace «Panel de autoridad» del pie (o `http://127.0.0.1:5173/autoridad`).
     Se entra con una cuenta de `apps/server/data/authority-demo-credentials.json` (por ejemplo,
     `buzon.federal` para turnar y `oic-equipamiento.persona1` y `oic-equipamiento.persona2`,
     que reciben e investigan en el OIC, para abrir una identidad 2 de 3; la lista completa está en
     `docs/demo-escenario.md`, sección 2.2); la llave se importa desde
     `apps/server/data/authority-demo-key.json`.
   - Verificación: enlace «Verificar bitácora» del pie.
   - Una terminal libre.

5. Archivos sintéticos (nunca datos reales):
   - Foto con GPS ficticio, a partir de cualquier imagen propia sin personas ni lugares
     identificables:

     ```sh
     exiftool -GPSLatitude=20.5 -GPSLatitudeRef=N -GPSLongitude=100.25 -GPSLongitudeRef=W \
       -Make=Ejemplo -Model=Demo -Artist="Persona Ficticia" foto-demo.jpg
     ```

   - Un PDF de «memo interno» con texto ficticio (imprimir como PDF una página de prueba).
   - Texto con caracteres invisibles, copiado al portapapeles:

     ```sh
     node -e "process.stdout.write('Memo interno\u200b de la Secretar\u0456a\u200c de Obras de Villa Ejemplo')" | pbcopy
     ```

6. Caso ficticio: adjudicación directa irregular en la Secretaría de Obras de Villa Ejemplo.
7. Video de respaldo grabado de todo el flujo.

## Red federada con el escenario completo (Docker, un comando)

La red de `docs/demo-escenario.md` (enrutador ciego, nodos Querétaro y Federal con su web,
evaluador, índice y dos testigos) corre en Docker, toda en local y con datos sintéticos. Es la forma
recomendada para replicar la demostración en un equipo limpio.

### Requisitos

- Docker: Docker Desktop (macOS o Windows) o Docker Engine con el complemento Compose 2.17 o
  posterior (Linux), en marcha (`docker version` muestra el servidor).
- Node.js 22.18 o posterior y las dependencias instaladas con `npm ci`. Node solo genera las
  llaves y siembra el escenario desde el equipo; los servicios corren en los contenedores.
- Conexión a internet solo la primera vez, para descargar la imagen oficial `node:22-bookworm-slim`
  y los paquetes de npm al construir. Después todo funciona sin conexión.
- Puertos libres en `127.0.0.1`: 8781, 8782, 8790, 8791 y 8792. Los puertos y el nombre del
  proyecto de Compose (`sigilo-red`, en `compose.yaml`) son fijos, así que solo puede correr una
  copia de la red a la vez en el mismo equipo: antes de levantarla desde otro clon, bájala en el
  primero (`npm run demo:apagar`).
- Un usuario normal, no root.

### Levantar y bajar

```sh
npm ci
npm run demo:todo     # requisitos, llaves, construcción, arranque, salud y semilla
npm run demo:apagar   # baja la red y borra .red-demo/
```

`demo:todo` explica cada paso en la terminal:

1. Revisa Node, Docker y Compose y que los puertos estén libres. En macOS, si Docker no responde,
   abre Docker Desktop (`open -a Docker`) y espera hasta 3 minutos.
2. Baja una red anterior de la demostración (`docker compose down`).
3. Genera llaves, directorio firmado y cuentas sintéticas nuevas en `.red-demo/`
   (`npm run red:demo -- --force`).
4. Construye las imágenes (`docker compose build`). La web de cada nodo se construye con sus llaves
   públicas fijadas; ninguna llave privada entra a las imágenes.
5. Levanta la red (`docker compose up -d --wait`) con tu UID y GID, espera a que el enrutador, los
   dos nodos, el evaluador y el índice estén sanos y prueba cada dirección por HTTP.
6. Siembra el escenario hasta el día 35 (`npm run demo:seed`).

Es idempotente: cada ejecución parte de cero (llaves nuevas, bases vacías) y deja el mismo estado.
Opciones: `npm run demo:todo -- --hasta 3` siembra solo hasta el día 3 y
`npm run demo:todo -- --sin-semilla` deja la red vacía. `demo:apagar` acepta `--conservar-datos`
(no borra `.red-demo/`) e `--imagenes` (borra también las imágenes `sigilo/*:local`).

Tiempos medidos en un equipo Apple Silicon con buena conexión (2026-11-05): construcción sin caché,
con descarga de la imagen base y de npm, unos 40 s; con caché, de 6 a 26 s (la web se reconstruye
cuando cambian las llaves fijadas); arranque hasta que todo está sano, 22 s; semilla hasta el día
35, unos 35 s; `demo:todo` completo con caché, de 66 a 100 s. La primera vez en un clon nuevo
tarda más aunque Docker ya tenga la imagen base, porque reconstruye la web de cada nodo con sus
llaves. Con una conexión lenta o un equipo modesto, cuenta de 3 a 10 minutos la primera vez.

### Qué deja listo

| Qué                        | Dónde                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| Web del nodo Querétaro     | <http://127.0.0.1:8781/>                                                 |
| Web del nodo Federal       | <http://127.0.0.1:8782/> (panel: <http://127.0.0.1:8782/autoridad>)      |
| Enrutador                  | <http://127.0.0.1:8790/api/v1/red/directory>                             |
| Cuentas del panel          | `.red-demo/nodos/<nodo>/credenciales.json` (usuario y contraseña)        |
| Llave que importa el panel | `.red-demo/nodos/<nodo>/data/authority-demo-key.json` (cualquier cuenta) |
| Folios y recibos sembrados | `.red-demo/semilla.json` (8 palabras sintéticas por caso)                |
| Foto con EXIF sintético    | `.red-demo/fixtures/cotizacion-con-exif.jpg`                             |

`red:demo` deja en `.red-demo/` las llaves, el directorio firmado con la llave del evaluador, las
cuentas de cada nodo y el reloj simulado común (`reloj/desfase`, que leen los nodos y el índice).
`demo:seed` importa los 31 acuerdos con plantilla y los 5 de control, envía a Marta por la
ventanilla única (con la copia limpia de su foto; el original con EXIF sintético queda en
`.red-demo/fixtures/` para mostrar la limpieza en la web), a la persona de Querétaro, las tres
denuncias del atacante, a Luis por la entrada propia del nodo Federal y, los días 4 y 6, a las dos
personas ciudadanas de la ventanilla de licencias (`case.ventanilla-1` y `case.ventanilla-2`), que
la Contraloría de Querétaro acepta. Después adelanta el reloj:
el día 30 el OIC califica la falta grave como no grave con su plantilla y lo notifica por el buzón;
el 31 corren el auditor (AUD-01 y AUD-03) y las reglas (escalamiento por conflicto sin excusa y por
calificación con señales); el 32 la supervisora abre el expediente con la segunda llave; el 35
Marta se inconforma por la ventanilla única y abre su identidad solo para el recurso.

Lo que se ve, comprobado con la red en Docker:

- Seguimiento de Marta (folio y 8 palabras de `semilla.json`, en la web de cualquiera de los dos
  nodos): la calificación como falta no grave, el aviso del buzón y «Presentaste tu
  inconformidad…», con el plazo de la Sala.
- Panel del nodo Federal con `oic-equipamiento.persona1`: en el detalle de Marta, prioridad alta
  (85 puntos), alerta de posible conflicto de interés con el procedimiento del art. 58,
  «2 o más personas independientes denuncian lo mismo», las señales AUD-01 y AUD-03 y las reglas que
  escalaron a la supervisora.
- Supervisora (`supervision-oic`): «Escalamientos que recibiste» lista 5 denuncias
  escaladas, cada una con su folio, el día, la autoridad de origen y las reglas que se cumplieron.
  La de Marta llega por «Acto resolutivo con conflicto de interés sin excusa» y por «Calificación
  de no grave con dos o más señales del auditor»; las demás, por «Falta grave sin iniciar el
  procedimiento a los 30 días». Ninguna trae la identidad: los hechos llegan cerrados con la
  segunda llave (`GET /api/v1/authority/escalations`).

### Paso a paso, sin el comando único

```sh
npm run red:demo -- --force
docker compose build
docker compose up -d --wait
npm run demo:seed
docker compose down        # al terminar
```

En Linux con un UID distinto de 1000, antepón `SIGILO_UID=$(id -u) SIGILO_GID=$(id -g)` a
`docker compose up` (ver «Problemas comunes»). Volver a correr `demo:seed` sobre una red ya sembrada
duplica los casos y regresa el reloj al día 0: para repetir, usa `npm run demo:todo`.

### Problemas comunes

- **«Docker no responde».** Docker Desktop está cerrado o el servicio detenido. En macOS,
  `open -a Docker` y espera a que `docker version` muestre el servidor. En Linux,
  `sudo systemctl start docker` y revisa que tu usuario pueda usarlo (grupo `docker`).
- **«Los puertos … están ocupados».** Otro programa, u otra copia del repositorio con la red en
  marcha, usa 8781, 8782, 8790, 8791 u 8792. `lsof -i :8790` lo muestra; en la otra copia,
  `npm run demo:apagar -- --conservar-datos`.
- **Linux: un nodo sale con `EACCES: permission denied` o con «El archivo del reloj de pruebas debe
  pertenecer al usuario del servidor».** Tu UID no es 1000 y los contenedores corren por omisión
  como 1000. El nodo exige que el reloj simulado sea suyo (quien lo escribe decide qué días publica
  la bitácora) y escribe sus bases en carpetas `0700`. `npm run demo:todo` ya usa tu UID; a mano:
  `SIGILO_UID=$(id -u) SIGILO_GID=$(id -g) docker compose up -d`. No abras los permisos de
  `.red-demo/` ni la cambies a root: la validación del reloj es la misma que en producción.
- **«No ejecutes la demostración como root».** Los contenedores nunca corren como root. Usa tu
  usuario normal; si generaste `.red-demo/` como root, bórrala (`sudo rm -rf .red-demo`) y vuelve a
  correr `npm run demo:todo`.
- **Linux con Docker sin root o con `userns-remap`** (no probado). Los UID del contenedor se
  traducen a otros en el equipo, así que el dueño de `.red-demo/` no coincide. Lo más simple es usar
  Docker con tu usuario en el grupo `docker`.
- **`docker compose build` falla al descargar.** La primera construcción necesita internet (Docker
  Hub y el registro de npm). Detrás de un proxy, configúralo en Docker Desktop o en el servicio de
  Docker.
- **Avisos `Module "crypto" has been externalized for browser compatibility` al construir la
  web.** Son normales: los imprime Vite porque `@hpke/common` importa el módulo `crypto` de Node como
  respaldo; en el navegador no se usa, porque ahí toma Web Crypto (`globalThis.crypto`). No
  detienen la construcción.
- **«Docker Compose … es muy antiguo» o `additional_contexts` no reconocido.** Se necesita Compose
  2.17 o posterior: actualiza Docker Desktop o el paquete `docker-compose-plugin`.
- **«No se pudo ejecutar la tarea periódica…» en los registros de un nodo durante los primeros
  segundos.** Es normal: los nodos arrancan antes que el enrutador, que espera a que estén sanos.
  Desaparece en cuanto el enrutador responde.
- **El panel dice «Esta llave no corresponde a la autoridad de este despliegue».** Se importó otra
  llave. El panel de cada nodo acepta solo `.red-demo/nodos/<nodo>/data/authority-demo-key.json` de
  ese nodo, que cambia en cada `demo:todo`.
- **El seguimiento no reconoce el folio.** `.red-demo/semilla.json` es de otra ejecución. Usa el
  de la red en marcha o vuelve a correr `npm run demo:todo`.

Para ver los registros: `docker compose logs -f nodo-federal` (o el servicio que falle). Para
comprobar desde fuera del contenedor que la web no pide nada a terceros:
`npm run validate -- http://127.0.0.1:8781 --modo pasivo --formulario /denunciar`.

Pendiente en esta versión: los cierres históricos con sanción declarada, la vista a la fiscalía y
la resolución de la Sala (el nodo muestra su plazo, pero no la registra).

## Acto 0. Planteamiento (30 s)

Una persona denuncia a su superior y al día siguiente él sabe quién fue. No hizo falta vulnerar el
sistema: bastaron la foto adjunta, el texto y el acceso de alguien dentro. SIGILO cierra esas tres
puertas.

## Acto 1. Recepción con Huella Cero (2 min 30 s)

1. Mostrar la barra mínima con «Salida rápida» y mencionar el atajo: Esc dos veces.
2. Elegir «Anónima (recomendada)» o «Identidad sellada» y explicar la diferencia en una frase.
3. En «Hechos», pegar el texto del portapapeles: aparece «Encontramos N caracteres invisibles o de
   otro alfabeto» con el aviso de marcas escondidas y el botón «Eliminar caracteres invisibles».
   Aunque no se quiten, se eliminan siempre al enviar. La «і» cirílica de «Secretaria» pasa a «i»
   sola; una letra de otro alfabeto sin equivalente se señala con «Hay 1 letra de otro alfabeto que
   se ve igual a una de las nuestras» y se pide escribir esa palabra de nuevo, porque podría ser
   parte de un nombre.
4. Escribir «soy la única auxiliar contable del área»: el revisor la subraya y sugiere otra
   redacción.
5. En «Pruebas», adjuntar la foto. El panel «Esta foto revela» muestra el lugar exacto, el
   dispositivo y el autor. Limpiar y mostrar el antes y el después, con «Revisado: la copia limpia ya
   no tiene datos escondidos».
6. Adjuntar el PDF: cada hoja se convierte en una foto, y se explica por qué.
7. En «Revisión», mostrar el semáforo de riesgo, «Tu denuncia llega a» y «Ver lo que leerá la autoridad».
8. Enviar. Aparecen el folio y el recibo de 8 palabras; confirmar dos palabras (basta con las
   primeras 4 letras).
9. En las herramientas del navegador, mostrar que no hay peticiones a terceros y que la identidad
   viaja cifrada.

## Acto 2. Trámite (1 min)

1. En el panel, entrar como `buzon.federal`, abrir la denuncia (hechos, pruebas limpias e
   identidad «sellada») y turnarla al OIC del Instituto Federal Ficticio de Equipamiento. Quien
   turna no ve el formulario para abrir la identidad.
2. Entrar como `oic-equipamiento.persona1` (recibe e investiga en el OIC), aceptarla y avanzar a
   la etapa «Investigación». El panel muestra los plazos que corren. Después del informe de
   presunta responsabilidad, las etapas las avanza otra persona, `oic-equipamiento.substanciacion`
   (LGRA, art. 115).
3. Enviar por el buzón: «¿Recuerda el número de contrato?».

## Acto 3. Seguimiento (1 min 30 s)

1. Entrar en «Dar seguimiento» con el folio y las 8 palabras.
2. Ver la línea de tiempo, el comprobante verificado, la pregunta descifrada en el navegador y el
   aviso de que su anotación está pendiente de publicar.
3. Responder; el revisor avisa si la respuesta revela algo. La respuesta también resuelve una
   prueba de trabajo (propósito `message`) antes de enviarse.
4. Ver «Tu nombre sigue bajo llave. Nadie lo ha abierto».

## Acto 4. Apertura con rendición de cuentas (1 min 30 s)

1. En el panel, `oic-equipamiento.persona1` solicita abrir la identidad con un fundamento escrito:
   sola no puede. En otra ventana, `oic-equipamiento.persona2` aprueba con su propio fundamento.
   Entonces la primera abre el sobre y el panel la muestra como «Identidad declarada por la
   persona, no verificada».
2. La identidad se descifra solo en el navegador de la autoridad.
3. En el seguimiento aparece la apertura con fecha y fundamento.
4. Cierre: revelar la identidad de un denunciante anónimo es obstrucción de la justicia según el
   artículo 64 de la LGRA; ahora queda evidencia de quién lo hizo.

## Acto 5. Integridad: bitácora, ancla y trasplante (1 min 30 s)

1. Avanzar el reloj de demostración un día y abrir «Verificar bitácora»: la cadena coincide con el
   registro firmado.

   ```sh
   printf 86400000 > /tmp/sigilo-reloj
   ```

   Al cerrar el día, los eventos se encadenan en orden barajado: el orden en la bitácora no es el de
   llegada. En el seguimiento, el aviso del registro público pasa de «pendiente de publicar» a «ya aparece en el registro público» y la
   apertura de identidad aparece conciliada con la bitácora.

2. Anclar la cabeza pública en un directorio temporal y pegar el contenido del archivo en
   «Verificar bitácora»: «La bitácora contiene el anclaje publicado».

   ```sh
   SIGILO_ANCHOR_URL=http://127.0.0.1:8787 SIGILO_ANCHORS_DIR=/tmp/sigilo-anclas npm run ledger:anchor
   cat /tmp/sigilo-anclas/*.json
   ```

3. Manipulación por un administrador, en una copia de la base. Detener el servidor (Ctrl+C) y
   ejecutar:

   ```sh
   rm -rf /tmp/sigilo-copia && cp -R apps/server/data /tmp/sigilo-copia && rm -f /tmp/sigilo-copia/server.lock
   node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/tmp/sigilo-copia/sigilo.db');db.exec('DROP TRIGGER ledger_events_no_update');db.prepare('UPDATE ledger_events SET payload_digest=? WHERE seq=0').run('0'.repeat(64))"
   SIGILO_DATA_DIR=/tmp/sigilo-copia SIGILO_E2E=1 SIGILO_TEST_CLOCK_FILE=/tmp/sigilo-reloj npm run dev:server
   ```

   Primero hay que quitar el trigger que impide modificar eventos. Al verificar de nuevo, la página
   indica que la bitácora no coincide. Después, detener ese servidor y volver a levantar el original.

4. Trasplante del sobre de identidad: detener el servidor y la web (las pruebas E2E usan los puertos
   8787 y 4173), ejecutar la prueba que reproduce el ataque y mostrar que se rechaza.

   ```sh
   npm run test:e2e -- e2e/transplant.spec.ts
   ```

   Un `authVerifier` repetido se rechaza con 400, y un sobre copiado con otro recibo no abre.

## Acto 6. Adopción (1 min)

1. Mostrar los paquetes `core` y `huella` y la [guía de integración](integracion-s5.md).
2. Mostrar «Datos abiertos»: solo meses congelados al cerrarse, conteos redondeados al azar a múltiplos de 5
   y las denuncias que no se muestran para proteger a quienes denunciaron.
3. Lámina final: recepción, trámite y seguimiento, con sus mecanismos.

## Después de la presentación

```sh
npm run demo:reset -- --yes
rm -rf /tmp/sigilo-reloj /tmp/sigilo-anclas /tmp/sigilo-copia
```

## Preguntas previstas

| Pregunta                                    | Respuesta breve                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Y si el servidor entrega código malicioso? | Riesgo residual documentado; hashes publicados por versión y verificador son trabajo futuro.                                           |
| ¿Y si la autoridad abre sin motivo?         | Abrir exige a dos personas distintas de la autoridad (2 de 3), cada una con su fundamento; queda registrado y visible para la persona. |
| ¿Y si pierdo el recibo?                     | No hay recuperación por diseño; se puede presentar otra denuncia citando el folio.                                                     |
| ¿Es legal la apertura?                      | La LGRA obliga a la autoridad a mantener la confidencialidad (art. 91); el sistema la hace verificable.                                |
| ¿Qué evita el abuso masivo?                 | Prueba de trabajo por envío, límites, cuota de almacenamiento y, como último recurso, cuotas globales.                                 |
| ¿Por qué la bitácora tarda un día?          | Publicar al instante revelaría la hora exacta de cada envío; los lotes diarios lo evitan.                                              |
| ¿Quién garantiza que no reescriben todo?    | Las anclas versionadas en un repositorio público; entre dos anclas sigue siendo posible, y así se documenta.                           |
