# Interfaces entre paquetes

Contrato interno que respetan todos los módulos. Los cambios a este documento requieren un ADR o
una nota en el pull request que los justifique.

## `@sigilo/contracts`

Esquemas zod y tipos de la API v1, rutas (`ROUTES`) y constantes. No contiene lógica.

## `@sigilo/core`

Criptografía y formatos. Funciona igual en Node 22+ y en navegadores modernos.

| Módulo              | Exporta                                                                                                                                                                        | Notas                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encoding.ts`       | `toBase64Url`, `fromBase64Url`, `toHex`, `fromHex`, `utf8Encode`, `utf8Decode`                                                                                                 | Base64URL sin relleno                                                                                                                                          |
| `random.ts`         | `randomBytes(length)`                                                                                                                                                          | Solo `crypto.getRandomValues`                                                                                                                                  |
| `canonical-json.ts` | `canonicalize(value)`, `sha256Hex(data)`                                                                                                                                       | Llaves ordenadas, sin espacios                                                                                                                                 |
| `dates.ts`          | `toDayDate(date)`, `toHourDate(date)`                                                                                                                                          | Siempre UTC y redondeadas                                                                                                                                      |
| `folio.ts`          | `generateFolio()`, `isFolio(value)`                                                                                                                                            | 60 bits, Base32 Crockford, `XXXX-XXXX-XXXX`                                                                                                                    |
| `receipt-phrase.ts` | `generateReceiptPhrase()`, `phraseToEntropy(words)`, `normalizeWord(word)`, `completeWord(prefix)`, `RECEIPT_WORD_COUNT`                                                       | 8 palabras BIP39 español, 11 bits cada una, sin checksum. La comparación ignora acentos y mayúsculas                                                           |
| `receipt-keys.ts`   | `deriveReceiptKeys(entropy)`                                                                                                                                                   | Devuelve `authKey`, `authVerifier`, par X25519 del buzón y par Ed25519 de firma. HKDF-SHA256 con contextos `sigilo/v1/auth`, `sigilo/v1/box`, `sigilo/v1/sign` |
| `keys.ts`           | `generateBoxKeyPair()`, `generateSigningKeyPair()`, `keyIdFor(publicKey)`                                                                                                      | `keyIdFor` = primeros 16 hex de SHA-256                                                                                                                        |
| `signing.ts`        | `sign(message, privateKey)`, `verify(signature, message, publicKey)`                                                                                                           | Ed25519                                                                                                                                                        |
| `envelope.ts`       | `sealToPublicKey(plaintext, recipient, aad)`, `openEnvelope(envelope, privateKey, aad)`                                                                                        | HPKE modo base, suite de `HPKE_SUITE_V1`                                                                                                                       |
| `padding.ts`        | `padToBlock(bytes, blockSize)`, `unpad(bytes)`                                                                                                                                 | Prefijo de longitud de 4 bytes                                                                                                                                 |
| `identity.ts`       | `sealIdentity(block, authority, authVerifier)`, `openIdentity(envelope, authorityPrivateKey, authVerifier)`                                                                    | Relleno a 4096 bytes. AAD = `sigilo/v1/identity:` + `authVerifier`                                                                                             |
| `mailbox.ts`        | `sealMailboxMessage(text, recipient, senderSigningPrivateKey, binding)`, `openMailboxMessage(message, recipientPrivateKey, senderSigningPublicKey, binding)`                   | AAD = `sigilo/v1/mailbox:` + folio + `:` + remitente. Firma sobre la forma canónica del sobre                                                                  |
| `signed-receipt.ts` | `computeSubmissionDigest(request)`, `signReceipt(unsigned, serverPrivateKey)`, `verifyReceipt(receipt, serverPublicKey)`                                                       |                                                                                                                                                                |
| `ledger.ts`         | `folioDigest(folio)`, `computeEventHash(event)`, `buildEvent(previous, input)`, `verifyChain(events)`, `signLedgerHead(head, privateKey)`, `verifyLedgerHead(head, publicKey)` | Primer `prevHash` = `LEDGER_GENESIS_HASH`                                                                                                                      |
| `index.ts`          | Reexporta todo lo anterior                                                                                                                                                     |                                                                                                                                                                |

## `@sigilo/huella`

Limpieza y revisión en el navegador. Las funciones puras se prueban en Node; las que usan canvas o
pdf.js se prueban en el navegador (E2E).

| Módulo                    | Exporta                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `invisible-characters.ts` | `findInvisibleCharacters(text)`, `stripInvisibleCharacters(text)` (incluye normalización NFKC)    |
| `text-review.ts`          | `reviewText(text)` devuelve hallazgos `{ kind, start, end, excerpt, severity, suggestion }`       |
| `file-policy.ts`          | `classifyFile({ name, type, size })` devuelve `image`, `pdf` o `rejected` con motivo y guía       |
| `image-metadata.ts`       | `inspectImageMetadata(blob)` devuelve GPS, dispositivo, fecha de captura, software y otros campos |
| `image-sanitize.ts`       | `sanitizeImage(blob, options)` recodifica en canvas y devuelve un `Blob` limpio                   |
| `pdf-rasterize.ts`        | `rasterizePdf(blob, options)` devuelve una imagen JPEG por página                                 |
| `digest.ts`               | `digestBlob(blob)` SHA-256 en hexadecimal                                                         |
| `risk.ts`                 | `assessRisk(signals)` devuelve `{ level, score, reasons }`                                        |
| `index.ts`                | Reexporta todo lo anterior                                                                        |

## `@sigilo/server`

Implementa exactamente las rutas de `ROUTES` con los esquemas de `@sigilo/contracts`. Persistencia
en `node:sqlite`. Ver `docs/arquitectura.md`.

## Llaves del despliegue

`npm run keys:generate` crea:

- `apps/server/data/keys.json`: llaves privadas del servidor (no se versiona).
- `apps/server/data/authority-demo-key.json`: llave privada de la autoridad de demostración, que el
  panel importa en el navegador (no se versiona).
- `apps/web/src/config/pinned-keys.json`: llaves públicas fijadas en el bundle del cliente (sí se
  versiona, generada para la demostración).
