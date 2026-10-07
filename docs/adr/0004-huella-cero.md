# 0004. Huella Cero: un solo camino de limpieza

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Los formatos de documento esconden metadatos y rastros (autores, rutas, revisiones, marcas). Limpiar
cada formato por separado es costoso y frágil.

## Decisión

- Imágenes JPEG, PNG y WebP: se decodifican y se vuelven a codificar en canvas, lo que descarta
  EXIF, XMP, IPTC y miniaturas.
- PDF: se rasteriza cada página a imagen con pdf.js. Se pierde el texto seleccionable a cambio de
  eliminar capas ocultas, adjuntos, scripts y metadatos.
- Documentos de Office, video y audio: se rechazan con una guía para convertirlos.
- Texto: se eliminan caracteres invisibles y se normaliza Unicode (NFKC). El revisor de
  reidentificación es una ayuda, no una garantía.

## Consecuencias

- La autoridad recibe solo imágenes. El digesto del original se conserva dentro de la identidad
  sellada para cadena de custodia.
