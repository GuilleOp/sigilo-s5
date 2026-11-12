# Seguridad en producción

Esta guía dice cómo desplegar la red de SIGILO fuera de la demostración. La demostración
(`compose.yaml`, `npm run demo:todo`) corre en un solo equipo, con datos sintéticos, reloj simulado,
`NODE_ENV=development` y `SIGILO_DEMO=1`. **No la copies tal cual a producción.** Aquí están la
topología, cada ajuste de endurecimiento con su variable, una lista de comprobación para los estados
y los riesgos que quedan.

## 1. Topología

```
                     Internet (solo 443)
                            │
             ┌──────────────┴──────────────┐
             │ Proxy TLS de la SESNA        │  TLS 1.3, HSTS, access_log off, error_log sin IP,
             │ ventanilla.<dominio>         │  sin X-Forwarded-For hacia atrás,
             └──────────────┬──────────────┘  client_max_body_size 23m, timeouts
                            │ red interna de la SESNA (sin salida a internet)
       ┌────────────────────┼──────────────────────┐
  enrutador:8790       evaluador:8791           índice:8792
  (ventanilla, relevo,  (solo desde el          (solo desde los nodos,
   cola, bitácora        enrutador y los         por mTLS)
   nacional)             nodos)
       │  salud con conteos de la cola: solo la VPN de operación de la SESNA
       │
       │  https + mTLS + OAuth 2.0 + HMAC v2 (SIGILO_ROUTER_ALLOW_HTTP_NODES sin definir)
       ▼
  ┌──────────────── Nodo estatal (lo opera la SESEA o la contraloría) ──────────────────┐
  │ Proxy del estado                                                                   │
  │  A) 443 «red»   → 127.0.0.1:8787 (SIGILO_PORT)                                     │
  │     /api/v1/red/inbox, /oauth/token, /v1/*, /api/v1/red/health                     │
  │     + lecturas públicas (/api/v1/keys, /api/v1/ledger/*, datos abiertos,           │
  │       /api/v1/red/directory, alta de instituciones)                                │
  │     → solo el certificado cliente o las IP de la SESNA                             │
  │  B) 443 «panel» → 127.0.0.1:8788 (SIGILO_PANEL_PORT)                               │
  │     /autoridad, /api/v1/auth/*, /api/v1/authority/*, /api/v1/operation/*,          │
  │     paso del relevo (turnado a otro nodo)                                          │
  │     → solo la VPN o la lista de IP de la institución                               │
  │  C) (opcional) bitácora pública: GET /api/v1/ledger/*, /api/v1/keys                │
  │  El servidor SIGILO escucha solo en 127.0.0.1 y no sale a internet salvo a la PDN. │
  └────────────────────────────────────────────────────────────────────────────────────┘
  Testigos: sin puertos de entrada; solo salida por https hacia el enrutador y los nodos.
```

| Servicio                    | Puerto interno | ¿Público?             | Quién entra                                                          |
| --------------------------- | -------------- | --------------------- | -------------------------------------------------------------------- |
| Proxy de la SESNA           | 443            | **Sí** (el único)     | Personas denunciantes y público                                      |
| Enrutador y ventanilla      | 8790           | No (detrás del proxy) | El proxy de la SESNA; nodos y testigos (registro, cabezas, cofirmas) |
| Salud de la red con conteos | 8790           | No                    | VPN de operación, con `SIGILO_ROUTER_OPERATION_TOKEN`                |
| Evaluador OPRF              | 8791           | No                    | El enrutador (paso) y los nodos                                      |
| Índice                      | 8792           | No                    | Los nodos                                                            |
| Nodo, frente «red»          | 443 → 8787     | Restringido           | Solo la SESNA (mTLS o lista de IP)                                   |
| Nodo, frente «panel»        | 443 → 8788     | Restringido           | VPN de la institución                                                |
| Testigos                    | —              | No                    | Nadie: no tienen entrada                                             |

**La regla central:** la persona denuncia solo en la ventanilla de la SESNA. El sobre llega cerrado
al nodo por su buzón. Por eso el nodo, en perfil `nodo`, **no** publica la denuncia directa: si lo
hiciera, su operador vería la IP de quien denuncia.

### Reglas para todos los proxies

1. `access_log off;` y `error_log` en nivel `crit`, o con un formato sin `$remote_addr`.
2. `proxy_set_header X-Forwarded-For ""; proxy_set_header X-Real-IP "";`. El código no lee la IP,
   pero así tampoco viaja.
3. `client_max_body_size 23m` en `/api/v1/red/relay` y en `/api/v1/red/inbox`. En el resto, `1m`,
   salvo las pruebas (`11m`) y el turnado del panel (`23m`).
4. `client_body_timeout 30s; send_timeout 30s; proxy_read_timeout 60s;`.
5. TLS 1.3, o 1.2 con AEAD como mínimo, y OCSP stapling. HSTS con `includeSubDomains`. Con el dominio
   definitivo, agrega `preload` y da de alta el dominio en hstspreload.org.
6. Que el proxy no agregue `Server` ni cabeceras propias, para que las respuestas sigan uniformes.
7. `limit_conn` por IP en una zona en memoria y sin registro, para frenar a un solo cliente sin
   guardar su IP.

Ejemplo mínimo de nginx para el frente «red» de un nodo:

```nginx
server {
  listen 443 ssl;
  server_name nodo-red.<estado>.gob.mx;
  ssl_protocols TLSv1.3;
  ssl_client_certificate /etc/nginx/sesna-ca.pem;   # mTLS: solo la SESNA
  ssl_verify_client on;
  access_log off;
  error_log /var/log/nginx/error.log crit;
  client_max_body_size 23m;
  client_body_timeout 30s;
  location / {
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Real-IP "";
    proxy_pass http://127.0.0.1:8787;
  }
}
```

## 2. Ajustes de endurecimiento y variables

### Nodo (`apps/server`)

| Variable                                                                              | Valor recomendado                   | Qué hace                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                            | `production`                        | Activa los valores seguros por omisión, entre ellos el perfil `nodo`.                                                                                                                                                                                                                  |
| `SIGILO_NODE_PROFILE`                                                                 | `nodo`                              | `nodo` publica solo los frentes **red**, **público** y **panel**. `completo` publica todo y es lo que usan el desarrollo, las pruebas E2E y un nodo único. Por omisión: `nodo` con `NODE_ENV=production` y `completo` en los demás casos.                                              |
| `SIGILO_NODE_INTAKE`                                                                  | sin definir                         | `1` reabre la recepción directa en el perfil `nodo`: denuncias, pruebas, seguimiento, retos de denuncia y mensaje, paso de la cola y pasos del evaluador y del corte nacional. Solo para un nodo que también sea ventanilla. Entonces el operador ve las conexiones de quien denuncia. |
| `SIGILO_PANEL_PORT`                                                                   | `8788`                              | Saca el panel a su propio puerto (en 127.0.0.1). El puerto principal (`SIGILO_PORT`) queda para la red y las lecturas públicas. El del panel sirve el panel y las lecturas públicas.                                                                                                   |
| `SIGILO_PUBLIC_PANEL_PORT`                                                            | `8081`                              | Solo en el contenedor: el puerto donde el lanzador publica `SIGILO_PANEL_PORT`, igual que `SIGILO_PUBLIC_PORT` publica `SIGILO_PORT`.                                                                                                                                                  |
| `SIGILO_RELAY_AUTH_LEGACY`                                                            | `0` cuando el enrutador ya envíe v2 | Con `0`, el buzón exige la etiqueta HMAC v2, con marca de tiempo (±5 min) y nonce de un solo uso. Por omisión acepta también la v1 durante la transición.                                                                                                                              |
| `SIGILO_HTTPS`                                                                        | `1`                                 | HSTS de al menos un año.                                                                                                                                                                                                                                                               |
| `SIGILO_REQUEST_LOG`                                                                  | `aggregate` u `off`                 | `requests` está prohibido en producción.                                                                                                                                                                                                                                               |
| `SIGILO_E2E`, `SIGILO_TEST_CLOCK_FILE`, `SIGILO_DEMO`, `SIGILO_PDN_SOURCES=synthetic` | **sin definir**                     | Son solo para pruebas y la demostración.                                                                                                                                                                                                                                               |

Siempre activos, sin variable:

- Escucha solo en `127.0.0.1`. El servidor deja `umask 077`, así bases, WAL, secretos y pruebas
  quedan en `0600`.
- Cada petición saliente lleva un tiempo límite de 30 s y `redirect: 'error'`. El servidor HTTP
  corta en 60 s por petición y 15 s para las cabeceras, y acepta 16 KiB de cabeceras como máximo.
- Cabeceras de toda respuesta: COOP, CORP `same-origin` y COEP `require-corp`, que aíslan el
  proceso del panel, donde vive la llave de la autoridad. También la Permissions-Policy con todas
  las funciones del navegador apagadas, CSP estricta, `no-store` y `no-referrer`.
- OAuth: un secreto de cliente equivocado ya no bloquea al cliente de la SESNA. El tope de fallos
  aplica solo al flujo `password` y se cuenta por cliente ya autenticado.
- Inicio de sesión del panel: tras 10 fallos en 15 min, el usuario recibe `429` **también con la
  contraseña correcta** hasta que vence la ventana. La respuesta y el costo son los mismos.
- Prueba de trabajo: hay un tope de subidas de pruebas en retos abiertos, que se calcula de la
  cuota. Al acercarse al tope sube la dificultad de las denuncias; lleno, la subida recibe `429`
  antes de leerse.
- El cuerpo del buzón tiene el mismo tope que el relevo del enrutador (`RELAY_MAX_BODY_BYTES`, que
  se deriva del tramo mayor).

### Enrutador (`apps/enrutador`)

| Variable                                  | Valor recomendado                | Qué hace                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                | `production` (sin `SIGILO_DEMO`) | En producción no arranca si alguna dirección de un nodo no es `https://`.                                                                                                        |
| `SIGILO_ROUTER_ALLOW_HTTP_NODES`          | sin definir                      | `1` permite `http://` hacia los nodos en producción. Úsalo solo en una red privada que ya cifre el tráfico, como una VPN entre la SESNA y el estado.                             |
| `SIGILO_ROUTER_MAX_RELAYS`                | `64`                             | Reenvíos simultáneos. Los que exceden reciben `429` antes de que se lea su cuerpo.                                                                                               |
| `SIGILO_ROUTER_RELAY_MAX_MB_IN_FLIGHT`    | `256`                            | Presupuesto de bytes de sobres en vuelo, reservado con `Content-Length` antes de leer el cuerpo. Un cuerpo sin `Content-Length` reserva el tope completo (~22.4 MB). Mínimo: 32. |
| `SIGILO_ROUTER_QUEUE_MAX_TOTAL_MB`        | `256`                            | Tope de la cola de entrega sumando todos los nodos, aparte del tope por nodo (`SIGILO_ROUTER_QUEUE_MAX_MB_PER_NODE` y `SIGILO_ROUTER_QUEUE_MAX_PER_NODE`).                       |
| `SIGILO_ROUTER_QUEUE_POW_BITS`            | `18`                             | Base del reto de la cola. Ahora es adaptativo: suma un bit en cada cuarto de ocupación y por cada duplicación de los retos gastados en la última hora, hasta +4.                 |
| `SIGILO_ROUTER_OPERATION_TOKEN`           | 32 caracteres aleatorios o más   | Con `Authorization: Bearer <token>`, `GET /api/v1/red/health/nodes` incluye los conteos de la cola por nodo. Sin el token, `queued` es `null`.                                   |
| `SIGILO_ROUTER_RELAY_AUTH`                | `v2` (por omisión)               | Versión de la etiqueta HMAC hacia los buzones. `v1` solo mientras haya nodos sin actualizar.                                                                                     |
| `SIGILO_ROUTER_HSTS_MAX_AGE`              | `31536000` o más                 | Ahora rechaza valores menores que un año.                                                                                                                                        |
| `SIGILO_ROUTER_CLOCK_FILE`, `SIGILO_DEMO` | **sin definir**                  | Son solo para la demostración.                                                                                                                                                   |

Siempre activos, sin variable:

- El primer intento de entregar un sobre con `deferral` va **sin** la marca. Si el nodo está
  arriba, cobra su propia prueba de trabajo adaptativa. La marca solo viaja en los reintentos
  desde la cola, cuando el nodo no estuvo disponible.
- Las entregas de la cola se reparten por turnos entre nodos.
- Los tiempos límite de salida y del servidor HTTP son los mismos que en el nodo. Los testigos
  usan los mismos de salida.
- El reenvío TCP del contenedor cierra las conexiones inactivas a los 120 s y acepta 512 a la vez
  como máximo.

### Corroboración (`apps/corroboracion`)

- El evaluador ya no responde CORS. La web llega por el paso del mismo origen (ventanilla o nodo),
  así el evaluador no ve la IP de quien denuncia.
- Mismas cabeceras de aislamiento, tiempos límite del servidor HTTP y `umask 077`.

### Contenedores (`compose.yaml`, `docker/Dockerfile`)

- Cada servicio tiene `mem_limit`, `pids_limit`, `cpus`, `ulimits.nofile`, `init`, `read_only`,
  `cap_drop: ALL`, `no-new-privileges` y `/tmp` como tmpfs `noexec,nosuid,nodev`. Conserva el perfil
  seccomp por omisión de Docker y nunca uses `unconfined`.
- La imagen base y el frontend de BuildKit van fijados por digest del índice multiarquitectura.
  Dependabot propone las actualizaciones. A mano:
  `docker buildx imagetools inspect node:22-bookworm-slim`.
- La etapa de ejecución no trae npm, npx, corepack ni yarn.
- El evaluador y el índice no publican puerto ni tienen salida a internet.
- En la demostración, los nodos corren con `SIGILO_NODE_PROFILE=nodo`.

### Integración continua (`.github/`)

- Las acciones van fijadas por SHA del commit. Se corre `npm audit signatures`.
- Se publica el SBOM CycloneDX de las dependencias de producción como artefacto.
- Dependabot cubre npm, las acciones y Docker.

## 3. Lista de comprobación para un estado

Antes de conectar el nodo a la red:

- [ ] El nodo corre con `NODE_ENV=production`, **sin** `SIGILO_E2E`, `SIGILO_DEMO`,
      `SIGILO_TEST_CLOCK_FILE` ni `SIGILO_PDN_SOURCES=synthetic`.
- [ ] El perfil es `nodo` (por omisión en producción) y `SIGILO_NODE_INTAKE` no está definido.
- [ ] El panel tiene su puerto (`SIGILO_PANEL_PORT`) y solo se llega a él por la VPN o la lista de IP
      de la institución.
- [ ] Al frente «red» solo llega la SESNA, por mTLS o por lista de IP.
- [ ] El proxy no registra accesos ni IP y borra `X-Forwarded-For` y `X-Real-IP`.
- [ ] TLS 1.3 en el proxy y `SIGILO_HTTPS=1` en el nodo, con HSTS de al menos un año.
- [ ] `baseUrl` del nodo en el directorio con `https://`.
- [ ] El servidor no tiene salida a internet, salvo hacia la PDN si la usa.
- [ ] El directorio de datos es del usuario del servicio, con `0700`. Las llaves privadas están en
      `0600` y **fuera** del volumen del nodo: la llave de la autoridad nunca va en el servidor.
- [ ] `oauth-clients.json` solo trae `client_credentials` (y `password` únicamente si la PDN lo
      exige). Su secreto se rota según la guía.
- [ ] El secreto HMAC del buzón (`relay-secret.json`) mide al menos 32 bytes y es distinto por nodo.
- [ ] Cuando el enrutador ya envía la etiqueta v2: `SIGILO_RELAY_AUTH_LEGACY=0`.
- [ ] Contraseñas del panel generadas (`npm run accounts:generate`) y no elegidas a mano.
- [ ] Respaldos cifrados del directorio de datos, con pruebas de restauración.
- [ ] Contenedores con los límites de `compose.yaml` y la imagen fijada por digest.
- [ ] Prueba final, desde fuera de la red de la SESNA:
      `curl -i -X POST https://<nodo>/api/v1/complaints` responde `404` y
      `curl -i https://<nodo>/api/v1/red/inbox` no conecta.

Y la SESNA, en el enrutador:

- [ ] `NODE_ENV=production` sin `SIGILO_DEMO`. El enrutador no arranca con un nodo en `http://`.
- [ ] `SIGILO_ROUTER_OPERATION_TOKEN` definido y la salud con conteos solo por la VPN de operación.
- [ ] `SIGILO_ROUTER_HSTS_MAX_AGE` de al menos un año.
- [ ] El evaluador y el índice, solo en la red interna.

## 4. Riesgos que quedan

- **Pruebas en claro en el disco del nodo (H04).** Se están cifrando hacia la autoridad en otro
  cambio. Hasta entonces, el disco y los respaldos del nodo deben ir cifrados.
- **Metadatos de las pruebas (H14).** El servidor no comprueba que la imagen venga sin EXIF. Esa
  limpieza vive en el navegador y se revisa con el cambio de pruebas.
- **Sin segundo factor en el panel (H05).** El bloqueo por usuario ya frena la adivinanza, pero un
  tercero que conozca el usuario puede bloquear a su dueña durante 15 minutos. Eso es aceptable
  solo con el panel detrás de VPN. **Trabajo futuro recomendado:** TOTP (RFC 6238) o, mejor,
  WebAuthn, que la Permissions-Policy ya deja disponible para el propio origen.
- **Paso del relevo en el frente del panel.** El turnado a otro nodo lo usa desde el navegador, así
  que sigue abierto en el frente del panel, sin sesión. Quien entre a la red del panel puede usarlo
  como cualquier persona usa la ventanilla. Es otra razón para la VPN. Pendiente: exigir la sesión
  de la autoridad en ese paso.
- **Cuota de pruebas por reto en bytes (H06).** Por ahora el tope cuenta subidas, no bytes. La
  cuota por reto llega con el nuevo almacén de pruebas.
- **Análisis de tráfico (H13).** Quien observe la entrada de la SESNA y el enlace hacia un estado
  puede correlacionar por tiempo y por tramo. El tramo de 16 MiB delata «denuncia con pruebas».
  No hay retardo mínimo ni tráfico de cobertura.
- **Prueba de trabajo SHA-256 (H25).** Frena a un celular, no a una GPU. Contra el volumen cuentan
  los topes de arriba y los del proxy.
- **Versiones visibles en la salud pública (H08).** Ayudan a elegir nodos desactualizados. La cola
  ya no se publica.
- **Trusted Types (H11).** Sin activar: `new Worker(url)` es un sumidero de `TrustedScriptURL` y
  rompería los workers de la prueba de trabajo y de pdf.js sin una política con nombre. Hay que
  probarlo en el navegador antes de activarlo.
- **Rotación de secretos (H24).** No está documentada la rotación del HMAC del buzón ni de la llave
  de caja del nodo. La llave HMAC de los JWT y la de los retos cambian en cada reinicio.
- **Refresh token sin detección de reuso (H21).** Reusar uno ya gastado no revoca su familia.
- **Estado en memoria.** Los topes (relevo, nonces, retos) son por proceso. Si se escala a varias
  réplicas del enrutador, cada una tiene su propio presupuesto, y los nonces de la etiqueta v2 no
  se comparten entre réplicas de un mismo nodo.
