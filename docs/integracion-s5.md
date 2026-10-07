# Integración con el S5

Guía para adoptar SIGILO en un sistema de denuncias con frontend moderno (por ejemplo Next.js) y
backend headless. La aplicación de referencia (`apps/web` y `apps/server`) muestra el flujo completo;
la integración reutiliza los paquetes, no las aplicaciones.

## Qué se reutiliza

| Paquete             | Dónde corre        | Dependencias de framework                        |
| ------------------- | ------------------ | ------------------------------------------------ |
| `@sigilo/contracts` | Cliente y servidor | Ninguna (zod)                                    |
| `@sigilo/core`      | Cliente y servidor | Ninguna                                          |
| `@sigilo/huella`    | Cliente            | Ninguna; usa APIs del navegador (canvas, pdf.js) |

Los paquetes son ESM y TypeScript sin paso de build, así que el bundler del frontend los compila.

## Mapeo de campos

| Segmento del formulario | SIGILO                          | Tratamiento                                                             |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Persona denunciante     | `IdentityBlock`                 | Se cifra en el navegador con `sealIdentity`; el backend guarda el sobre |
| Datos de contacto       | Buzón                           | Se sustituyen por el buzón; no se piden                                 |
| Hechos                  | `ComplaintFacts`                | Se guardan en claro para el trámite, tras `stripInvisibleCharacters`    |
| Persona denunciada      | `ComplaintFacts.accused`        | En claro                                                                |
| Ubicación               | `stateCode`, `municipalityCode` | Precisión reducida; sin coordenadas                                     |
| Testigos                | `IdentityBlock.witnesses`       | Dentro del sobre                                                        |
| Pruebas                 | `EvidenceDescriptor`            | Limpias en el navegador; el digesto original va en el sobre             |
| Folio de seguimiento    | `Folio` + recibo                | El backend genera el folio; el navegador genera el recibo               |

## Pasos

1. **Llaves.** Generar el par X25519 y Ed25519 de la autoridad competente fuera del servidor y
   publicar las llaves públicas en la configuración del frontend (llaves fijadas).
2. **Formulario.** Antes de enviar:
   - pasar cada archivo por `classifyFile`, `sanitizeImage` o `rasterizePdf`;
   - aplicar `stripInvisibleCharacters` y `reviewText` a los textos;
   - mostrar `assessRisk` y una vista previa de lo que verá la autoridad;
   - desactivar `spellcheck`, `translate` y `autocomplete` en los campos.
3. **Envío.** Generar el recibo con `generateReceiptPhrase`, derivar llaves con
   `deriveReceiptKeys`, cifrar la identidad con `sealIdentity` y enviar
   `SubmitComplaintRequest`.
4. **Backend.** Implementar las rutas de `ROUTES` o adaptarlas:
   - guardar `authVerifier`, nunca el recibo;
   - excluir el sobre de identidad de listados y detalle;
   - entregar el sobre solo por la ruta de apertura, que registra el fundamento en la bitácora;
   - firmar el comprobante y los eventos con `signReceipt` y `buildEvent`.
5. **Seguimiento.** Autenticar con `SHA-256(authKey)`, responder igual ante folio o llave
   inválidos y limitar intentos.
6. **Panel de autoridad.** Descifrar en el navegador con la llave privada de la autoridad; nunca en
   el servidor.
7. **Despliegue.** CSP estricta, sin peticiones a terceros, sin IP en registros y publicación diaria
   de la cabeza de la bitácora.

## Backend headless

Con un CMS headless, la lógica de las rutas se implementa como extensiones de endpoints y ganchos:

- colección de denuncias con hechos, sobre de identidad y `authVerifier`;
- permisos que nunca exponen el sobre ni `authVerifier` en lectura;
- gancho que agrega un evento a la bitácora en cada cambio de estatus, mensaje o apertura.

## Compatibilidad

- Navegadores con WebCrypto, `createImageBitmap` y canvas: versiones actuales de Chrome, Edge,
  Firefox y Safari.
- Node.js 22.13 o superior en el servidor.
