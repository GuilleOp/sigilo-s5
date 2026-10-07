# Criptografía: especificación del formato v1

Especificación normativa de los formatos de SIGILO versión 1. Las decisiones se justifican en el
[ADR 0002](adr/0002-criptografia.md); las firmas de funciones están en
[interfaces.md](interfaces.md). Las palabras "debe" y "no debe" son obligatorias.

## Primitivas

| Uso                     | Primitiva                                                                            | Implementación                                               |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Cifrado a llave pública | HPKE modo base, RFC 9180: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305 | `@hpke/core`, `@hpke/dhkem-x25519`, `@hpke/chacha20poly1305` |
| Firmas                  | Ed25519                                                                              | `@noble/curves`                                              |
| Hash                    | SHA-256                                                                              | `@noble/hashes`                                              |
| Derivación              | HKDF-SHA256                                                                          | `@noble/hashes`                                              |
| Aleatoriedad            | `crypto.getRandomValues`                                                             | Plataforma                                                   |

`Math.random` no debe usarse en ningún caso.

## Codificaciones

- Bytes en JSON: Base64URL sin relleno.
- Digestos: SHA-256 en hexadecimal minúsculo.
- Texto: UTF-8.
- Fechas: `AAAA-MM-DD` en UTC; en el buzón, `AAAA-MM-DDTHH:00Z`.

## Forma canónica

Todo valor que se firma o se resume se serializa en forma canónica, subconjunto de RFC 8785:

1. Objetos con llaves ordenadas por punto de código y sin espacios.
2. Solo cadenas, enteros, booleanos, `null`, arreglos y objetos.
3. Las propiedades con valor `undefined` se omiten.

`sha256Hex(canonicalize(valor))` es el digesto de un valor.

## Identificador de llave

`keyId = primeros 16 caracteres hexadecimales de SHA-256(llave pública)`.

## Sobre HPKE

```json
{
  "v": 1,
  "suite": "DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305",
  "keyId": "<keyId del destinatario>",
  "enc": "<llave encapsulada, Base64URL>",
  "ct": "<texto cifrado con etiqueta, Base64URL>"
}
```

- El campo `info` de HPKE es la cadena UTF-8 `sigilo/v1/hpke` (separación de dominio); la vinculación a cada uso (identidad, buzón) se hace con el AAD.
- El receptor debe rechazar sobres con `v`, `suite` o `keyId` desconocidos.

## Relleno

`padToBlock(bytes, tamaño)` antepone la longitud en 4 bytes big-endian y rellena con ceros hasta el
siguiente múltiplo del tamaño de bloque. `unpad` debe rechazar longitudes mayores que el contenido.

## Recibo y derivación

1. Se generan 11 bytes aleatorios (88 bits).
2. Se dividen en 8 grupos de 11 bits; cada grupo indexa la lista BIP39 en español (2048 palabras).
   No hay checksum.
3. La entrada se normaliza (NFKD, sin diacríticos, minúsculas) antes de compararse con la lista
   normalizada. Basta con las primeras 4 letras para identificar una palabra.
4. Con la entropía como material de entrada, HKDF-SHA256 sin sal deriva 32 bytes por contexto:

| Contexto (`info`) | Resultado                      |
| ----------------- | ------------------------------ |
| `sigilo/v1/auth`  | `authKey`                      |
| `sigilo/v1/box`   | Llave privada X25519 del buzón |
| `sigilo/v1/sign`  | Semilla Ed25519 de firma       |

5. `authVerifier = Base64URL(SHA-256(authKey))`. El servidor guarda solo este valor y compara
   `SHA-256(authKey)` en tiempo constante.

Con 88 bits de entropía no se requiere una función de derivación lenta. El recibo nunca sale del
navegador.

## Identidad sellada

- Texto en claro: forma canónica de `IdentityBlock` en UTF-8, rellenado a 4096 bytes.
- Destinatario: llave X25519 de la autoridad competente.
- AAD: `sigilo/v1/identity:` concatenado con `authVerifier`. Esto vincula el sobre a una sola
  denuncia e impide moverlo a otra.

## Buzón

- Texto en claro: mensaje en UTF-8 con prefijo de longitud, rellenado a múltiplos de 512 bytes para ocultar la longitud real.
- Destinatario: llave X25519 del buzón de la persona denunciante (si escribe la autoridad) o de la
  autoridad (si escribe la persona denunciante).
- AAD: `sigilo/v1/mailbox:` + folio + `:` + remitente (`authority` o `reporter`).
- Firma: Ed25519 del remitente sobre `canonicalize(envelope)`.
- El receptor debe verificar la firma antes de descifrar.

## Comprobante firmado

- `submissionDigest = sha256Hex(canonicalize(solicitud))` de la solicitud enviada.
- Campos firmados: `folio`, `submissionDigest`, `receivedOn`, `ledgerSeq`, `serverKeyId`.
- `signature = Ed25519(llave del servidor, canonicalize(campos firmados))`.

## Bitácora

- `folioDigest = sha256Hex("sigilo/ledger/folio:" + folio)`.
- `payloadDigest = sha256Hex(canonicalize(datos del evento))`.
- `hash = sha256Hex(canonicalize(evento sin el campo hash))`.
- El primer evento usa `prevHash = LEDGER_GENESIS_HASH` (64 ceros); cada evento siguiente usa el
  `hash` del anterior y `seq` consecutivo.
- Cabeza: `signature = Ed25519(llave del servidor, canonicalize({ seq, hash, at, serverKeyId }))`.
- La verificación debe recalcular cada hash, comprobar el encadenamiento y la firma de la cabeza.

## Llaves fijadas

Las llaves públicas del servidor y de la autoridad se incluyen en el bundle del cliente. El cliente
debe comparar las llaves que publica el servidor (`GET /keys`) con las fijadas y detenerse si no
coinciden.

## Vectores de prueba

Los vectores de prueba viven en las pruebas unitarias de `packages/core`. Incluyen casos fijos de
codificación, forma canónica, derivación desde el recibo, relleno y bitácora, además de pruebas de
manipulación: bit alterado, AAD distinto, llave equivocada y eslabón modificado.

## Trabajo futuro

- Revelación por umbral 2 de 3 de una llave por denuncia (`shamir-secret-sharing`).
- Cifrado híbrido X25519 + ML-KEM para conservación de largo plazo.
- Llaves de autoridad protegidas con WebAuthn PRF.
