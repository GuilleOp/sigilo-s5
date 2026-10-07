# Arquitectura

SIGILO es una capa de anonimato para un sistema de denuncias. Todo lo que puede identificar a la
persona denunciante se procesa en su navegador; el servidor almacena hechos, sobres cifrados y una
bitácora, y no puede leer identidades.

## Componentes

| Componente               | Ubicación            | Responsabilidad                                                                |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------ |
| Contratos                | `packages/contracts` | Esquemas zod, catálogos y rutas de la API v1. Fuente única de verdad.          |
| Núcleo criptográfico     | `packages/core`      | HPKE, Ed25519, recibo, derivación de llaves, comprobante, buzón, bitácora.     |
| Huella Cero              | `packages/huella`    | Limpieza de pruebas, marcas invisibles, revisión de texto, semáforo de riesgo. |
| Servidor de referencia   | `apps/server`        | API v1 sobre Hono y `node:sqlite`. Valida, almacena, registra y sirve la web.  |
| Aplicación de referencia | `apps/web`           | Denuncia, seguimiento, panel de autoridad, datos abiertos y verificación.      |
| Scripts                  | `scripts/`           | Llaves de demostración, anclaje de la bitácora y reinicio de la demostración.  |

```mermaid
flowchart LR
  subgraph Navegador_denunciante[Navegador de la persona denunciante]
    W[apps/web] --> H[huella]
    W --> C[core]
  end
  subgraph Navegador_autoridad[Navegador de la autoridad]
    P[Panel de autoridad] --> C2[core]
    K[(Llave privada de la autoridad)]
  end
  W -- mismo origen: hechos, pruebas limpias, sobres --> S[apps/server]
  P -- mismo origen, con token --> S
  S --> DB[(SQLite: hechos, sobres, bitácora)]
  DB -- npm run ledger:anchor --> A[(anchors/ en el repositorio público)]
```

## Fronteras de confianza

1. **Navegador de la persona denunciante.** Zona de confianza. Aquí se genera el recibo, se derivan
   las llaves, se limpian las pruebas, se eliminan las marcas invisibles y se cifra la identidad.
2. **Red y servidor.** Zona no confiable para la identidad. El servidor recibe solo lo necesario para
   el trámite y no registra direcciones IP. Sí entrega el código de la web: un servidor
   comprometido puede alterarlo (ver `modelo-de-amenazas.md`, C03 y D03).
3. **Navegador de la autoridad.** Zona de confianza para la llave privada de la autoridad, que se
   importa en memoria. La identidad sellada solo se descifra ahí, después de una solicitud
   registrada.
4. **Anclaje externo.** La operación ejecuta `npm run ledger:anchor`, que escribe la cabeza pública
   firmada en `anchors/AAAA-MM-DD.json`, y versiona el archivo en el repositorio público. Cualquier
   persona puede comparar la bitácora contra esas anclas en `/verificar`.

## Qué ve cada actor

| Dato                                          | Persona denunciante  | Servidor y operación         | Autoridad competente                                 | Público                                                     |
| --------------------------------------------- | -------------------- | ---------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Hechos (descripción, ente, conducta, periodo) | Sí                   | Sí                           | Sí                                                   | No                                                          |
| Pruebas limpias                               | Sí                   | Sí                           | Sí                                                   | No                                                          |
| Pruebas originales                            | Solo en su navegador | No                           | No (solo su digesto, dentro de la identidad sellada) | No                                                          |
| Identidad (modo `sealed`)                     | Sí                   | Solo texto cifrado           | Sí, tras solicitud con fundamento registrada         | No                                                          |
| Recibo de 8 palabras                          | Sí                   | No (solo `SHA-256(authKey)`) | No                                                   | No                                                          |
| Mensajes del buzón                            | Sí                   | Solo texto cifrado           | Sí                                                   | No                                                          |
| Folio                                         | Sí                   | Sí                           | Sí                                                   | No (la bitácora pública usa `folioDigest`)                  |
| Eventos de la bitácora                        | Los de su denuncia   | Todos                        | Todos                                                | Solo los de días anteriores, con `folioDigest`              |
| Estadísticas agregadas                        | Sí                   | Sí                           | Sí                                                   | Meses cerrados, múltiplos de 5, celdas menores a 5 omitidas |

## Flujos por etapa

### Recepción

```mermaid
sequenceDiagram
  actor D as Persona denunciante
  participant W as Navegador (web + huella + core)
  participant S as Servidor
  D->>W: Escribe hechos y adjunta pruebas
  W->>W: Limpia pruebas, elimina marcas invisibles, revisa el texto
  W->>D: Semáforo de riesgo y vista «Así te verá la autoridad»
  W->>S: GET /keys (compara con las llaves fijadas; si difieren, no envía nada)
  W->>S: POST /evidence (solo imágenes limpias y verificadas)
  S-->>W: evidenceId, sha256
  W->>W: Genera recibo, deriva authKey y llaves del buzón
  W->>W: (modo sealed) Cifra la identidad con HPKE hacia la autoridad
  W->>S: POST /complaints (hechos, sobre, llaves públicas, authVerifier)
  S->>S: Valida catálogos, genera folio, registra complaint.received
  S-->>W: folio y comprobante firmado
  W->>D: Muestra folio y recibo; pide confirmar dos palabras
```

El sobre de identidad se cifra con un AAD que incluye `authVerifier`, las llaves públicas de la
persona denunciante y `contentDigest` (digesto de los hechos, las pruebas, el modo y la solicitud
de protección). Así no puede moverse a otra denuncia. Ver [criptografia.md](criptografia.md).

### Trámite

```mermaid
sequenceDiagram
  actor A as Autoridad
  participant P as Panel de autoridad
  participant S as Servidor
  A->>P: Inicia sesión con token e importa su llave
  P->>S: GET /authority/complaints
  S-->>P: Resúmenes (sin identidad)
  P->>S: GET /authority/complaints/{folio}
  S-->>P: Hechos, pruebas, llaves públicas del denunciante, mensajes
  A->>P: Cambia estatus o envía pregunta por el buzón
  P->>P: Cifra la pregunta hacia el buzón del denunciante, con la siguiente secuencia, y la firma
  P->>S: POST status / messages
  S->>S: Exige la secuencia esperada y registra el evento en la bitácora
```

### Seguimiento

```mermaid
sequenceDiagram
  actor D as Persona denunciante
  participant W as Navegador
  participant S as Servidor
  D->>W: Folio y 8 palabras
  W->>W: Deriva authKey y llaves del buzón (el recibo no sale del navegador)
  W->>S: POST /tracking (folio, authKey)
  S-->>W: Estatus, línea de tiempo, aperturas, mensajes cifrados, comprobante, evento de recepción
  W->>W: Verifica el comprobante y que el evento de recepción le corresponda
  W->>S: GET /ledger/events (consulta si el evento ya se publicó)
  W->>W: Descifra los mensajes y avisa si falta alguno en la secuencia
  D->>W: Responde
  W->>S: POST /tracking/messages (sobre hacia la autoridad, firmado, con secuencia)
```

- Las credenciales inválidas y los folios inexistentes producen la misma respuesta.
- El estado de publicación del evento de recepción se muestra como «publicado», «aparecerá mañana» o
  «no coincide».
- Solo los fallos de autenticación consumen el límite por folio; los mensajes tienen su propio
  límite.

### Apertura de identidad

```mermaid
sequenceDiagram
  actor A as Autoridad
  participant P as Panel
  participant S as Servidor
  actor D as Persona denunciante
  A->>P: Solicita abrir identidad con fundamento legal
  P->>S: POST /authority/complaints/{folio}/identity
  S->>S: Registra identity.opened con el fundamento
  S-->>P: Sobre de identidad
  P->>P: Recalcula el contexto desde el detalle y descifra con la llave de la autoridad
  D->>S: Consulta su seguimiento
  S-->>D: Historial de aperturas con fecha y fundamento
```

El servidor solo entrega el sobre de identidad a través de esta ruta, que siempre registra el evento.
Los listados y el detalle nunca lo incluyen. Es un control de política: quien tenga la llave de la
autoridad y una copia de la base puede descifrar sin pasar por la ruta.

## Bitácora

- Cada evento (`complaint.received`, `complaint.status_changed`, `identity.opened`, `message.sent`)
  se encadena con el hash del anterior. Triggers de SQLite impiden modificar o borrar eventos.
- **Publicación por lotes diarios.** Las rutas públicas (`/ledger/head` y `/ledger/events`) solo
  incluyen eventos con fecha anterior al día actual (UTC). La cabeza pública es la del último evento
  publicado, firmada por el servidor. Así la bitácora no revela la hora de cada envío.
- **Anclaje.** `npm run ledger:anchor` verifica la cabeza pública con la llave fijada, comprueba que
  la cadena aún contiene la ancla anterior y escribe `anchors/AAAA-MM-DD.json`. Lee la base local o,
  con `SIGILO_ANCHOR_URL`, la API pública. La base debe existir: el servidor tiene que haber arrancado
  al menos una vez.
- **Verificación.** `/verificar` descarga la bitácora pública, comprueba la cadena y la cabeza
  firmada, y permite pegar un ancla para comprobar que la cadena contiene ese `seq` y ese hash.

Ver [criptografia.md](criptografia.md).

## Despliegue

- **Un solo origen.** En desarrollo, el proxy de Vite sirve web y API desde `127.0.0.1:5173`. En
  despliegue, `SIGILO_WEB_DIST` hace que el servidor entregue `apps/web/dist` con respaldo de SPA a
  `index.html`. CORS está desactivado salvo que `SIGILO_ALLOWED_ORIGIN` lo configure.
- **Cabeceras de la web:** CSP como cabecera con `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `nosniff`, `Cache-Control: no-store` y
  `Strict-Transport-Security` cuando se define `SIGILO_HSTS_MAX_AGE`.
- **Cabeceras de la API:** `Content-Security-Policy: default-src 'none'`, `no-store` y `nosniff`.
- **Sin terceros.** La web no hace peticiones fuera de su origen; una prueba E2E lo comprueba.
- **Historial.** La web usa un router en memoria: no deja rutas ni entradas nuevas en el historial.
- **Registros.** Solo método, ruta normalizada (sin folio), estatus y duración; sin direcciones IP.
- **Llaves.** Las llaves privadas viven en `apps/server/data/` y no se versionan. Las públicas se
  fijan en `apps/web/src/config/pinned-keys.json`.
- **Reloj de pruebas.** `SIGILO_TEST_CLOCK_FILE` desplaza el reloj del servidor solo en pruebas; el
  servidor se niega a arrancar con esa variable si `NODE_ENV=production`.
