# Instala el nodo de tu estado

Para: el equipo de TI de la SESEA o de la contraloría que opera el nodo del estado. Tiempo: unos 30
minutos, más la espera de la SESNA. Los conceptos (autoridades, tabla de funciones, llaves y
directorio) están en [guia-conecta-tu-estado.md](guia-conecta-tu-estado.md); aquí solo se instala.

Son tres comandos:

```sh
./sigilo instalar      # unas 10 preguntas
./sigilo iniciar       # cuando la SESNA confirme
./sigilo diagnostico   # todo en verde
```

No necesitas Node, npm ni el código fuente: el CLI `sigilo` corre dentro de la imagen publicada y el
envoltorio `./sigilo` solo usa Docker. No editas YAML ni JSON.

## Antes de empezar

### Lo que necesitas

| Recurso | Mínimo                                                             | Recomendado                                                  |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| CPU     | 2 vCPU x86-64 o ARM64                                              | 4 vCPU                                                       |
| RAM     | 2 GB                                                               | 4 GB                                                         |
| Disco   | 20 GB SSD                                                          | 50 GB SSD (las pruebas cifradas usan hasta 5 GB por omisión) |
| Sistema | Linux con Docker Engine ≥ 24 y Docker Compose ≥ 2.24               | Ubuntu 22.04/24.04, RHEL/Rocky 9 o Debian 12                 |
| Usuario | Un usuario de servicio (por ejemplo «sigilo») en el grupo `docker` | Nunca root: el envoltorio se niega a correr como root        |
| Hora    | NTP activo                                                         | Las firmas, la bitácora y los plazos usan fechas             |

La imagen del nodo ocupa unos 510 MB en disco (unos 115 MB de descarga comprimida).

### Red y dominio

| Puerto | Dirección | Para qué                                                                                        | Quién debe llegar                      |
| ------ | --------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| 443    | entrada   | Frente «red»: la SESNA entrega denuncias; los testigos y la ventanilla leen tu bitácora pública | La SESNA y los testigos                |
| 8443   | entrada   | Frente «panel» de tus autoridades                                                               | Solo tu VPN o la red de la institución |
| 80     | entrada   | Solo en modo automático: validación de Let's Encrypt                                            | Internet (Let's Encrypt)               |
| 443    | salida    | Ventanilla de la SESNA, índice de corroboración, Let's Encrypt y `ghcr.io`                      | —                                      |

- **Dominio:** un subdominio institucional, por ejemplo `denuncias.oaxaca.gob.mx`.
- **DNS:** un registro A (y AAAA si hay IPv6) hacia la IP pública del servidor, **antes** de
  instalar.
- **Proxy de salida:** si tu red solo sale por un proxy, configúralo en Docker
  (`/etc/systemd/system/docker.service.d/proxy.conf`) antes de instalar.

### Lo que te da la SESNA

- La descarga `sigilo-nodo-<versión>.tar.gz`: el envoltorio `sigilo`, `compose.nodo.yaml`,
  `red.json` (el paquete de la red, sin secretos) y `SHA256SUMS`.
- Un oficio con la **huella de la red** (32 caracteres en grupos de 4), que también publica en su
  sitio oficial.

### Quiénes participan

- **TI** instala y opera el servidor.
- **La persona responsable de la operación** recibe la cuenta de operación del panel (altas de
  autoridades).
- **Quien atiende el buzón general** recibe la llave del buzón (o la crea en su navegador) y su
  cuenta.

## Paso 1. Descarga

```sh
sudo -iu sigilo
mkdir -p /opt/sigilo && cd /opt/sigilo
tar xzf sigilo-nodo-1.1.0.tar.gz --strip-components=1
sha256sum -c SHA256SUMS
```

Sin internet: la SESNA también entrega `sigilo-imagenes-1.1.0.tar`; cárgala con
`./sigilo cargar sigilo-imagenes-1.1.0.tar`.

## Paso 2. Instala

```sh
./sigilo instalar
```

| Pregunta                              | Ejemplo                                   | Para qué                                                        |
| ------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| ¿Es la misma huella?                  | `s` (después de compararla con el oficio) | Confirma que `red.json` es el de la SESNA. Si no coincide, para |
| Estado                                | `oaxaca` o `20` (o `federal`)             | Entidad que cubre el nodo                                       |
| Institución                           | `Secretaría de la Contraloría de Oaxaca`  | Quien opera el nodo (función `operation` de la tabla)           |
| Nombre e identificador                | `Nodo estatal Oaxaca` · `node.oaxaca`     | Entrada del nodo en el directorio                               |
| Dominio                               | `denuncias.oaxaca.gob.mx`                 | `baseUrl` del nodo (siempre `https://`)                         |
| HTTPS                                 | `1`, `2` o `3`                            | Ver abajo                                                       |
| Responsable, cargo, correo y teléfono | institucionales                           | Expediente de altas de la SESNA; no entran al directorio        |
| Usuarios del panel                    | `operacion.oaxaca` · `buzon.oaxaca`       | Cuentas de operación y del buzón general                        |

**HTTPS, tres formas:**

1. **Automático (recomendado).** Caddy pide y renueva el certificado de Let's Encrypt. Necesita los
   puertos 80 y 443 abiertos a internet.
2. **Certificado de la institución.** Copia `certificado.crt` y `llave.key` a `tls/propio/`.
3. **Ya tienes proxy o balanceador.** El nodo se publica en `127.0.0.1:8080` (red) y
   `127.0.0.1:8081` (panel); tu proxy sigue las reglas de
   [seguridad-produccion.md](seguridad-produccion.md) (sin registro de IP, sin `X-Forwarded-For`).

En los modos 1 y 2, Caddy publica el frente «red» en el 443 y el panel en el **8443**, solo para las
redes privadas (`SIGILO_PANEL_IPS=private_ranges` en `.env`; cámbialo por el rango de tu VPN). Para
limitar el 443 a la SESNA y a los testigos, agrega `SIGILO_RED_IPS=<sus IP>` a `.env`. Caddy no
escribe registro de accesos.

Sin preguntas (para automatizar), cada respuesta va por bandera o variable `SIGILO_<CLAVE>`:

```sh
./sigilo instalar --no-interactivo --huella-red "7c1e 03aa …" --estado oaxaca \
  --institucion "Secretaría de la Contraloría de Oaxaca" --dominio denuncias.oaxaca.gob.mx \
  --tls 1 --responsable "…" --cargo "…" --correo ti@oaxaca.gob.mx --telefono 9510000000
```

Al final imprime:

```text
Listo. Ahora le toca a la SESNA.
  1. Envía a la SESNA este archivo:   salida/solicitud-alta-oaxaca.json
  2. La SESNA te llamará para confirmar esta huella. Léela en voz alta:
        Huella del nodo:  4b2d 9e10 c3a7 0f58 a1e2 77c9 0d3b 5e64
  3. Contraseñas del panel (no se vuelven a mostrar; anótalas)
  4. Saca del servidor la llave del buzón general: salida/llave-buzon-oaxaca.json
  5. Haz tu primer respaldo:        ./sigilo respaldar
  6. Cuando la SESNA confirme:      ./sigilo iniciar
```

Lo que deja en la carpeta:

```text
red.json, .env                      red de la SESNA; imagen, usuario y dominio para compose
config/   nodo.env, Caddyfile, instalacion.json, tabla-de-funciones.csv, dias-inhabiles.csv
datos/    (0700) llaves y archivos del nodo: el único volumen del contenedor
llaves/   (0700) llave de enlace con la SESNA, fuera del volumen
salida/   solicitud de alta, llave del buzón (para sacarla), respaldos y diagnósticos
tls/      (0700) certificados de Caddy
```

## Paso 3. Envía tu solicitud a la SESNA

- **Qué:** `salida/solicitud-alta-<estado>.json`. Lleva las llaves **públicas** del nodo y del
  buzón, la tabla de funciones mínima firmada, la llave pública de enlace y tu contacto. **No lleva
  llaves privadas ni contraseñas**: puede ir por correo institucional o en oficio con memoria USB.
- **La llamada:** la SESNA te llama a un número oficial (no al de la solicitud) y tú le lees la
  huella del nodo. Si no coincide, no acepta.
- **La llave del buzón:** entrégala a quien atenderá el buzón (memoria USB cifrada o en persona) y
  bórrala del servidor. Si prefieres que nunca pase por el servidor, esa persona la crea en su
  navegador («Crear mis llaves» en `/autoridad`) e instalas con
  `./sigilo instalar --candado-buzon candado.json`.

## Paso 4. Arranca tu nodo

Cuando la SESNA te confirme que publicó el directorio:

```sh
./sigilo iniciar
```

```text
Buscando tu nodo en el directorio de la red…
  ✓ Directorio versión 12, firmado por la SESNA y cofirmado por 2 de 3 testigos
  ✓ node.oaxaca aparece con tus llaves (huella 4b2d 9e10 …)
  ✓ Tabla de funciones de Oaxaca, versión 1, con tu firma
  ✓ datos/directory.json, datos/web-config.json y la raíz de la red, listos
Arrancando el nodo y el certificado HTTPS…
  ✓ nodo: sano
```

Si la SESNA todavía no publica: «Tu nodo todavía no está en el directorio (versión 11)…», con
código de salida 2. Sin salida a internet, pide a la SESNA el `directory.json` y usa
`./sigilo iniciar --directorio directory.json`.

Después: `./sigilo programar` agrega a tu crontab la revisión diaria del directorio (03:15).

## Paso 5. Comprueba

```sh
./sigilo diagnostico
```

Revisa permisos, variables de demostración, el directorio, la raíz y las llaves que sirve tu web
(`/config/sigilo.json`), HTTPS y HSTS, la vista de la SESNA (arriba, registrado, recibe denuncias,
versión mínima) y la edad del último respaldo. Cada línea es ✓ (bien), ! (aviso) o ✗ (problema),
con «Qué hacer». Sale con **0**, **1** (avisos) o **2** (problemas), para usarlo desde un monitor, y
deja `salida/diagnostico-<fecha>.txt` sin secretos ni datos de denuncias.

## Después de instalar

| Tarea                            | Comando                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Dar de alta autoridades          | Bandeja «Solicitudes de alta» del panel ([guía](guia-conecta-tu-estado.md))                  |
| Completar la tabla de funciones  | Edita `config/tabla-de-funciones.csv`; `./sigilo tabla revisar` y `./sigilo tabla firmar`    |
| Crear cuentas del panel          | `./sigilo cuenta nueva` (contraseña temporal; reinicia el nodo)                              |
| Días inhábiles locales           | Edita `config/dias-inhabiles.csv` (`fecha,nombre,fundamento`); `./sigilo calendario revisar` |
| Respaldo                         | `./sigilo respaldar` (frase de 8 palabras en papel; `--frase-de-archivo` para cron)          |
| Revisar un respaldo              | `./sigilo respaldar --verificar salida/respaldos/<archivo>`                                  |
| Restaurar                        | `./sigilo restaurar <archivo>` (a una carpeta) o `--sobrescribir` (detiene el nodo)          |
| Actualizar                       | `./sigilo actualizar 1.2.0` (respaldo, imagen, diagnóstico y regreso si falla)               |
| Regresar a la versión anterior   | `./sigilo actualizar --regresar`                                                             |
| Rotar los secretos con la SESNA  | `./sigilo rotar-llaves --enlace`, enviar el archivo, y `--aplicar` cuando confirme           |
| Ver registros / estado / detener | `./sigilo registros` · `./sigilo estado` · `./sigilo detener`                                |

Los días inhábiles locales se suman a los oficiales (LFT, art. 74) en los plazos, las reglas de
escalamiento, el auditor y el semáforo de turnado, y el nodo los publica en
`/datos/dias-inhabiles.json` para que cualquiera recalcule tus plazos.

## Problemas comunes

| Mensaje o síntoma                                             | Causa                                          | Qué hacer                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| «Docker no responde»                                          | Servicio detenido o usuario sin permiso        | `sudo systemctl start docker`; agrega el usuario al grupo `docker`               |
| «Eres root»                                                   | Corriste con `sudo`                            | Usa el usuario de servicio: `sudo chown -R sigilo: /opt/sigilo`                  |
| «La huella de la red no coincide»                             | Descarga equivocada o manipulada               | No sigas; pide a la SESNA la descarga oficial                                    |
| «… todavía no resuelve en el DNS»                             | Falta el registro A o no ha propagado          | `dig +short <dominio>`; espera el TTL                                            |
| Puerto 80 o 443 ocupado al iniciar                            | Apache o nginx ya escuchan                     | Detenlos o reinstala con el modo 3 (proxy existente)                             |
| `tls` se reinicia; Let's Encrypt falla                        | Puerto 80 cerrado en el firewall perimetral    | Ábrelo o usa el modo 2                                                           |
| «Tu nodo todavía no está en el directorio»                    | La SESNA no ha publicado                       | Espera la confirmación; `./sigilo iniciar` otra vez                              |
| «… aparece en el directorio con OTRAS llaves»                 | Reinstalaste después del alta                  | No arranques; llama a la SESNA para un alta nueva                                |
| `EACCES` o «El dueño de datos/ no es…»                        | Carpetas de otro usuario                       | `sudo chown -R <usuario> datos llaves salida tls`                                |
| «La SESNA no te entrega denuncias: versión menor a la mínima» | Nodo desactualizado                            | `./sigilo actualizar <versión>`                                                  |
| «not-registered» en la vista de la SESNA                      | El nodo no pudo registrarse ante el enrutador  | Salida a 443 hacia la SESNA; hora del equipo (`timedatectl`)                     |
| «El directorio de la red no verifica (expired/stale)»         | Directorio vencido y la tarea diaria no corrió | `./sigilo directorio actualizar`; `./sigilo programar`                           |
| «https://… no responde desde este equipo»                     | NAT de regreso (hairpin)                       | Es un aviso: confírmalo en la vista de la SESNA o desde fuera                    |
| La web dice «Este sitio no está disponible por ahora»         | Falta o no es válido `datos/web-config.json`   | `./sigilo iniciar`                                                               |
| El panel rechaza la llave                                     | Se importó la llave de otra autoridad          | Ver [guia-conecta-tu-estado.md](guia-conecta-tu-estado.md#3-llaves-y-huellas)    |
| «Hay variables de demostración en config/nodo.env»            | Se copió una plantilla de la demostración      | Bórralas: un nodo real nunca lleva `SIGILO_DEMO`, `SIGILO_E2E` ni reloj simulado |

## Seguridad operativa (resumen)

- Ningún proxy delante del nodo registra IP; con Caddy ya es así.
- Las llaves de las autoridades y la del buzón nunca entran al servidor.
- El frente «red» solo para la SESNA y los testigos; el panel solo por VPN.
- Respaldo cifrado fuera del equipo; la frase en papel y en otro lugar.
- Detalle: [seguridad-produccion.md](seguridad-produccion.md).
