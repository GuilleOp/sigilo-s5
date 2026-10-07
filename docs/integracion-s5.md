# Integración con el S5

Guía para adoptar SIGILO en un sistema de denuncias con frontend moderno (por ejemplo Next.js) y
backend headless. La aplicación de referencia (`apps/web` y `apps/server`) muestra el flujo completo;
la integración reutiliza los paquetes, no las aplicaciones.

## Qué se reutiliza

| Paquete             | Dónde corre        | Dependencias de framework                        |
| ------------------- | ------------------ | ------------------------------------------------ |
| `@sigilo/contracts` | Cliente y servidor | Ninguna (zod). Incluye los catálogos validados   |
| `@sigilo/core`      | Cliente y servidor | Ninguna                                          |
| `@sigilo/huella`    | Cliente            | Ninguna; usa APIs del navegador (canvas, pdf.js) |

Los paquetes son ESM y TypeScript sin paso de build: el bundler del frontend los compila y Node
22.18 o superior los ejecuta directamente. La lista de exportaciones está en
[interfaces.md](interfaces.md).

## Mapeo de campos

| Segmento del formulario | SIGILO                          | Tratamiento                                                               |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Persona denunciante     | `IdentityBlock`                 | Se cifra en el navegador con `sealIdentity`; el backend guarda el sobre   |
| Datos de contacto       | Buzón                           | Se sustituyen por el buzón; no se piden                                   |
| Hechos                  | `ComplaintFacts`                | En claro para el trámite, siempre tras `stripInvisibleCharacters`         |
| Ente y conducta         | `entityId`, `offenseCode`       | Claves de los catálogos de `@sigilo/contracts`; el servidor las valida    |
| Persona denunciada      | `ComplaintFacts.accused`        | En claro                                                                  |
| Ubicación               | `stateCode`, `municipalityCode` | Claves INEGI; el municipio debe pertenecer a la entidad; sin coordenadas  |
| Testigos                | `IdentityBlock.witnesses`       | Dentro del sobre                                                          |
| Pruebas                 | `EvidenceDescriptor`            | Limpias y verificadas en el navegador; el digesto original va en el sobre |
| Folio de seguimiento    | `Folio` + recibo                | El backend genera el folio; el navegador genera el recibo                 |

## Pasos

1. **Llaves.** Generar el par X25519 y Ed25519 de la autoridad competente fuera del servidor y fijar
   las llaves públicas en la configuración del frontend (`buildPublicKeySet`). Antes de enviar,
   compararlas con las que publica el backend.
2. **Formulario.** Antes de enviar:
   - pasar cada archivo por `classifyFile`, `sanitizeImage` o `rasterizePdf`, y volver a inspeccionar
     la copia con `inspectImageMetadata` (`includeColorProfile: false`); si conserva metadatos, no se
     sube;
   - aplicar `stripInvisibleCharacters` y `reviewText` a los textos;
   - mostrar `assessRisk` y una vista previa de lo que verá la autoridad;
   - desactivar `spellcheck`, `translate` y `autocomplete` en los campos.
3. **Envío.** Generar el recibo con `generateReceiptPhrase` y derivar llaves con
   `deriveReceiptKeys`. Para el modo sellado, construir el contexto con `identityContextFor` (vincula
   `authVerifier`, las llaves del denunciante y `contentDigest` de los hechos y las pruebas) y cifrar
   con `sealIdentity`. Enviar `SubmitComplaintRequest` sin campos extra.
4. **Backend.** Implementar las rutas de `ROUTES` o adaptarlas:
   - validar con los esquemas de contracts, incluidos los catálogos;
   - guardar `authVerifier` con índice único, nunca el recibo;
   - excluir el sobre de identidad de listados y detalle;
   - entregar el sobre solo por la ruta de apertura, que registra el fundamento en la bitácora;
   - exigir la siguiente `sequence` por remitente en el buzón y verificar las firmas con
     `verifyMailboxSignature`;
   - firmar el comprobante y los eventos con `signReceipt`, `buildEvent` y `signLedgerHead`;
   - dejar cada evento pendiente y, al cerrar el día, encadenar los pendientes en orden barajado
     (`pendingEventFor`, `shuffle`, `chainEvent`); publicar solo días cerrados;
   - firmar en el comprobante el `payloadDigest` de `complaint.received` (no su `seq`) y calcular
     `submissionDigest` con el sobre resumido (`computeSubmissionDigest`);
   - en `identity.opened`, incluir `receiptTag` (`identityOpenedPayload`);
   - exigir la prueba de trabajo (`POW_HEADER`) en los envíos de denuncias (con sus pruebas) y de
     mensajes; ver «Despliegue: calibración de la prueba de trabajo».
5. **Seguimiento.** Autenticar comparando `computeAuthVerifier(authKey)` en tiempo constante,
   responder igual ante folio o llave inválidos y contar solo los fallos. Entregar el evento de
   recepción para que el navegador lo verifique con `verifyReceiptEvent`, y concilie sus aperturas
   con `reconcileIdentityOpenings`.
6. **Panel de autoridad.** Verificar las llaves del denunciante con `submissionDigestFromDetail`
   contra el evento `complaint.received` publicado, recalcular el contexto con
   `identityContextFromDetail` y descifrar en el navegador con la llave privada de la autoridad;
   nunca en el servidor.
7. **Despliegue.** CSP estricta como cabecera, `frame-ancestors 'none'`, sin peticiones a terceros,
   sin IP en registros, y anclaje periódico de la cabeza de la bitácora (`npm run ledger:anchor`) en
   un repositorio público.

## Backend headless

Con un CMS headless, la lógica de las rutas se implementa como extensiones de endpoints y ganchos:

- colección de denuncias con hechos, sobre de identidad, llaves del denunciante y `authVerifier`;
- permisos que nunca exponen el sobre en lectura y que solo muestran `authVerifier` y las llaves del
  denunciante a la autoridad, que los necesita para recalcular el contexto;
- gancho que agrega un evento a la bitácora en cada cambio de estatus, mensaje o apertura.

## Despliegue: calibración de la prueba de trabajo

La dificultad y la vigencia de los retos se calibran para un celular básico que resuelve SHA-256 en
JavaScript, en un solo núcleo, a **50 mil hashes por segundo** (`SLOW_DEVICE_HASHES_PER_SECOND` en
`@sigilo/core`). De esa suposición salen:

- la vigencia de cada reto: `margen + 4 · p95`, con `p95 = ln(20) · 2^bits / 50 000` segundos
  (`powSolveSeconds`);
- el estimado de espera que la web muestra a la persona (`describePowWait`).

| Bits | Intentos promedio | p95 en el celular supuesto | Vigencia (margen de 5 min) |
| ---- | ----------------- | -------------------------- | -------------------------- |
| 18   | 262 144           | unos 16 s                  | unos 6 min                 |
| 20   | 1 048 576         | unos 63 s                  | unos 9 min                 |

Antes de un despliegue real:

1. **Medir.** Ejecutar `solvePow` en los dispositivos más lentos que se quieran atender (por ejemplo,
   el celular de gama baja más común en la región) y anotar los hashes por segundo.
2. **Ajustar la dificultad.** Con `SIGILO_POW_BITS` (base, 18) y `SIGILO_POW_MAX_BITS` (máximo
   adaptativo, 20). Cada bit duplica el tiempo esperado. El máximo no puede superar la base más 2
   bits: el servidor no arranca si se configura más (ver `docs/interfaces.md`). Si los dispositivos medidos son más lentos
   que 50 mil hashes por segundo, bajar los bits; `SIGILO_POW_BITS=0` desactiva la exigencia.
3. **Ajustar la suposición.** Si la medición difiere mucho, cambiar `SLOW_DEVICE_HASHES_PER_SECOND`
   en `packages/core/src/pow.ts` y volver a construir la web y el servidor: la constante alimenta
   tanto la vigencia como el estimado que ve la persona. Hoy no es una variable de entorno.
4. **Considerar la asimetría.** Una GPU resuelve miles de veces más rápido que un celular; la prueba
   de trabajo encarece el abuso, pero no lo iguala. Conviene combinarla con límites en el proxy de
   entrada del despliegue.

## Pruebas

`SIGILO_TEST_CLOCK_FILE` desplaza el reloj del servidor de referencia para probar el cierre diario
de la bitácora y los meses congelados de los datos abiertos. Solo se acepta con `SIGILO_E2E=1` o
`NODE_ENV=test`, con un archivo del usuario del servidor que no puedan escribir otros y un desfase de
0 a 400 días. Una integración propia debe ofrecer un reloj inyectable equivalente.

## Compatibilidad

- Navegadores con WebCrypto, `createImageBitmap` y canvas: versiones actuales de Chrome, Edge,
  Firefox y Safari. Las pruebas automáticas solo cubren Chromium.
- Node.js 22.18 o superior en el servidor.
