# Instala la ventanilla única y el enrutador (SESNA)

Para: el equipo de la SESNA que opera la ventanilla única nacional, el enrutador ciego, el
directorio firmado y la bitácora nacional. La parte de cada estado está en
[instalacion-nodo.md](instalacion-nodo.md).

Comandos, en el orden en que se usan:

```sh
./sigilo testigo crear-llave            # cada testigo, en su equipo (una vez)
./sigilo-sesna instalar                 # una vez
./sigilo-sesna empaquetar               # la descarga para los estados
./sigilo-sesna aceptar <solicitud>      # por cada alta o cambio
./sigilo testigo cofirmar <propuesta>   # cada testigo, en su equipo
./sigilo-sesna publicar <propuesta>     # con m cofirmas
```

Solo necesitas Docker: el CLI corre dentro de la imagen publicada del enrutador.

## Antes de empezar

| Recurso | Mínimo                                               | Recomendado                                                  |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| CPU     | 4 vCPU                                               | 8 vCPU                                                       |
| RAM     | 8 GB                                                 | 16 GB (el relevo admite 256 MiB de sobres en vuelo)          |
| Disco   | 100 GB SSD                                           | Cola de entrega (64 MiB por nodo), bitácora nacional, cortes |
| Sistema | Linux con Docker Engine ≥ 24 y Docker Compose ≥ 2.24 | Usuario de servicio sin privilegios, NTP activo              |

| Puerto | Dirección | Para qué                                                                        |
| ------ | --------- | ------------------------------------------------------------------------------- |
| 443    | entrada   | Ventanilla única (personas denunciantes), registro de nodos y cabezas, testigos |
| 80     | entrada   | Solo con Let's Encrypt                                                          |
| 443    | salida    | Cada nodo estatal (`https://`), `ghcr.io` y Let's Encrypt                       |

- **Dominio** de la ventanilla y su registro DNS.
- **Testigos:** instituciones distintas de la SESNA (CPC, ASF, academia) que cofirman cada versión
  del directorio, con su compromiso de cofirmar en un plazo (por ejemplo, 2 días hábiles).
- **Custodia de la llave de la operación:** quién la tiene, en qué equipo y su respaldo fuera de
  línea. Firma el directorio y la cabeza nacional.

## Paso 1. Prepara a los testigos

Cada testigo, en su propio equipo:

```sh
./sigilo testigo crear-llave --id observer.cpc-nacional --nombre "Comité de Participación Ciudadana" --clase cpc
```

Deja `salida/testigo-<id>.llave.json` (privada: nunca sale de su equipo) y
`salida/testigo-<id>.publico.json`, que entrega a la SESNA. Muestra una huella de 32 caracteres que
la SESNA confirma por teléfono. Copia los archivos públicos a `testigos/`.

## Paso 2. Instala

```sh
./sigilo-sesna instalar
```

Pregunta el dominio, la forma de HTTPS (automático, certificado propio o proxy existente), el
nombre de la operación y de la red, confirma las huellas de los testigos, el umbral **m de n** y la
versión mínima de los nodos. Deja:

```text
red.json                    paquete de la red para los estados (raíz, ventanilla, llave de enlace)
datos/  (0700) operator-key.json, trust.json, web-config.json → volumen del enrutador
llaves/ (0700) enlace-key.json → fuera del volumen; respáldala con la de la operación
config/ enrutador.env (0600: token de operación), Caddyfile, testigos.json, instalacion.json
```

Y termina con la **huella de la red**: publícala en el oficio a las 32 entidades y en tu sitio.

## Paso 3. Prepara la descarga para los estados

```sh
./sigilo-sesna empaquetar                  # salida/sigilo-nodo-<v>.tar.gz con red.json y SHA256SUMS
./sigilo-sesna empaquetar --sin-conexion   # además salida/sigilo-imagenes-<v>.tar (docker save)
```

## Paso 4. Da de alta un estado (cada vez)

1. Recibes `solicitud-alta-<estado>.json` y la copias a esta carpeta.
2. `./sigilo-sesna aceptar solicitud-alta-oaxaca.json`: verifica la firma del nodo, que nadie más
   cubra la entidad y la tabla; **llamas a un número oficial** y escribes la huella que te leen.
   Muestra «Cambios del directorio N → N+1» y deja `propuestas/directorio-propuesto-<N+1>.json`.
3. Envías la propuesta a cada testigo. Cada uno corre
   `./sigilo testigo cofirmar directorio-propuesto-<N+1>.json --llave testigo-<id>.llave.json --ventanilla https://<ventanilla>`,
   ve **el mismo resumen recalculado** contra la versión vigente y te devuelve
   `cofirma-<id>-<N+1>.json`. Las copias a `cofirmas/`.
4. `./sigilo-sesna publicar propuestas/directorio-propuesto-<N+1>.json` junta las cofirmas, verifica
   la versión, la instala, **deriva** los secretos de enlace del nodo nuevo en `relay-secrets.json` y
   `node-credentials.json` (nunca viajan) y reinicia el enrutador.
5. Avisas al estado que corra `./sigilo iniciar`.

El primer alta crea el directorio génesis (versión 1) y arranca el enrutador. Con el mismo
`aceptar` entran las tablas de funciones nuevas de un estado (`tabla-de-funciones-<estado>-vN.json`),
las entradas de autoridad que exporta la bandeja «Solicitudes de alta» de un nodo y las rotaciones
del enlace (`rotacion-enlace-<estado>-eN.json`, que no cambian el directorio).

## Paso 5. Operación diaria

- **Salud de la red:** `https://<ventanilla>/api/v1/red/health/nodes.html`. Con el token de
  `config/enrutador.env` (`Authorization: Bearer …`) incluye la cola por nodo.
- **Versión mínima:** `SIGILO_ROUTER_MIN_NODE_VERSION` en `config/enrutador.env`; avisa a los estados
  con días de anticipación antes de subirla.
- **Respaldos:** `datos/` (con `enrutador.db`, `operator-key.json`) y `llaves/enlace-key.json`,
  cifrados y fuera de línea.
- **Actualizar:** cambia `SIGILO_VERSION` (o la imagen por digesto) en `.env` y
  `./sigilo-sesna iniciar`.
- **Testigos de la bitácora nacional:** cada testigo puede correr además el proceso que cofirma
  la cabeza nacional (imagen `ghcr.io/guilleop/sigilo-testigo`), con su `testigo-<id>.llave.json`
  como `witness-key.json`, la raíz `datos/trust.json` como `trust.json` y
  `SIGILO_WITNESS_ROUTER_URL=https://<ventanilla>`.
- **Corroboración ciega (opcional):** el evaluador y el índice están en el perfil `corroboracion` de
  `compose.sesna.yaml`; conviene que los opere otra institución (ADR 0006).

## Problemas comunes

| Síntoma                                                            | Causa                                           | Qué hacer                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| «El directorio N no se puede publicar (faltan cofirmas…)»          | Menos de m cofirmas válidas de esta versión     | Revisa qué testigo falta; `publicar` cuenta solo las de este serial y digesto                |
| «… no es la versión siguiente …»                                   | Se aceptaron dos cambios sobre la misma versión | Rehaz la segunda propuesta sobre la vigente (o acepta los dos archivos en un solo `aceptar`) |
| «Ya hay una propuesta N sin publicar»                              | Propuesta pendiente                             | Publícala primero, o `--reemplazar`                                                          |
| «La huella no coincide»                                            | Solicitud alterada o error al leer              | No aceptes; pide al estado que reenvíe y vuelve a llamar                                     |
| Un nodo «unreachable»                                              | DNS, firewall o certificado del estado          | Pide al estado `./sigilo diagnostico`                                                        |
| Un nodo «below-minimum-version»                                    | No ha actualizado                               | Avísale; las denuncias sin pruebas esperan en la cola hasta 7 días                           |
| 401 al entregar                                                    | Secretos de enlace en épocas distintas          | Acepta el archivo de rotación del estado y pídele `--aplicar`                                |
| El enrutador no arranca: «… solo habla con los nodos por https://» | Un nodo con `http://` en el directorio          | Corrige el alta; solo en red privada cifrada: `SIGILO_ROUTER_ALLOW_HTTP_NODES=1`             |

## Seguridad operativa

- La operación no puede leer denuncias ni cambiar la tabla de un estado (la firma el nodo).
- Separar instituciones: operación, testigos, evaluador e índice.
- La llave de enlace de la SESNA deriva los secretos de todos los nodos: custodia como la de la
  operación ([criptografia.md](criptografia.md#secretos-de-enlace-derivados-sesna--nodo)).
- Detalle de proxies, variables y riesgos: [seguridad-produccion.md](seguridad-produccion.md).
