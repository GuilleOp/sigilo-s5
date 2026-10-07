# 0002. Criptografía: HPKE, Ed25519 y derivación desde el recibo

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Se requiere cifrar la identidad y los mensajes del buzón hacia llaves públicas, firmar comprobantes y
eventos, y permitir que la persona denunciante recupere sus llaves solo con su recibo.

## Decisión

- Cifrado a llave pública: HPKE modo base (RFC 9180), suite DHKEM(X25519, HKDF-SHA256),
  HKDF-SHA256, ChaCha20-Poly1305 (`@hpke/*`).
- Firmas: Ed25519 (`@noble/curves`). Hash: SHA-256 (`@noble/hashes`).
- Recibo: 88 bits aleatorios codificados como 8 palabras de la lista BIP39 en español (11 bits por
  palabra, sin checksum).
- Derivación: HKDF-SHA256 sobre la entropía del recibo con contextos separados
  (`sigilo/v1/auth`, `sigilo/v1/box`, `sigilo/v1/sign`). Con 88 bits no se requiere KDF lento.
- El servidor guarda solo `SHA-256(authKey)`.
- Forma canónica para hashes y firmas: JSON con llaves ordenadas y sin espacios (subconjunto de
  RFC 8785).
- El texto en claro de la identidad se rellena a 4096 bytes antes de cifrar.

## Consecuencias

- Perder el recibo implica perder el acceso; no hay recuperación por diseño.
- Las llaves públicas de autoridad y servidor se fijan en el bundle del cliente.
