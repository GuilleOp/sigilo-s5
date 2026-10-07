# Modelo de amenazas

Este documento enumera quién podría identificar a la persona denunciante, cómo y qué lo impide.
SIGILO no promete anonimato absoluto: cada ataque se marca como mitigado, planeado o residual.

## Alcance

Versión v1: modos `anonymous` y `sealed`, sobre HPKE hacia la autoridad competente, buzón,
bitácora encadenada y Huella Cero para imágenes y PDF. La revelación por umbral 2 de 3 es trabajo
futuro.

## Activos

1. Identidad de la persona denunciante (nombre, contacto, testigos).
2. Vínculo entre una persona y una denuncia, aunque no haya nombre.
3. Recibo de 8 palabras y llaves derivadas.
4. Integridad de los hechos, las pruebas y la bitácora.

## Actores

| Id  | Actor                                                            | Capacidad                                                  |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| A1  | Persona denunciada y sus aliados en el ente                      | Conocen el contexto interno; leen la denuncia si se filtra |
| A2  | Personal de la autoridad que recibe la denuncia                  | Accede al panel y a los hechos                             |
| A3  | Operación del sistema (administración, base de datos, respaldos) | Acceso total al servidor y al almacenamiento               |
| A4  | Atacante externo que compromete el servidor                      | Puede alterar datos y el código servido                    |
| A5  | Observador de red (empleador, proveedor de internet)             | Ve tráfico, DNS y horarios                                 |
| A6  | Quien accede al dispositivo de la persona denunciante            | Historial, caché, archivos, notas                          |
| A7  | Cadena de suministro                                             | Dependencias, integración continua                         |
| A8  | Adversario futuro                                                | Descifra hoy lo almacenado, con capacidades de mañana      |

## Categorías

- LINDDUN (privacidad): L vinculación, I identificación, N no repudio, D detección, D2 divulgación
  de datos, U desconocimiento, N2 incumplimiento.
- STRIDE (seguridad): S suplantación, T manipulación, R repudio, I divulgación, D denegación,
  E elevación de privilegios.

Estado: **M** mitigado en v1, **P** planeado, **R** residual documentado.

## A. Inferencia por el contenido

| #   | Ataque                                                              | Categoría  | Mitigación                                            | Estado                        |
| --- | ------------------------------------------------------------------- | ---------- | ----------------------------------------------------- | ----------------------------- |
| A01 | Detalle que solo conocen pocas personas                             | LINDDUN I  | Revisor de texto, vista "Así te verá la autoridad"    | R                             |
| A02 | Estilometría contra correos internos                                | LINDDUN I  | Aviso al usuario                                      | R                             |
| A03 | Versiones únicas de un documento repartido (trampa del canario)     | LINDDUN I  | Aviso; no se puede eliminar                           | R                             |
| A04 | Caracteres invisibles o homoglifos que codifican al destinatario    | LINDDUN I  | Detección y eliminación con normalización NFKC        | M                             |
| A05 | Contenido visual: capturas con nombre de usuario, reflejos, rostros | LINDDUN I  | Aviso en la vista previa                              | R                             |
| A06 | Huella del sensor de la cámara                                      | LINDDUN L  | Recodificación y reducción de resolución; lo debilita | R                             |
| A07 | Rastros internos de documentos (autor, rutas, revisiones, XMP)      | LINDDUN I  | PDF convertido a imagen; Office rechazado             | M                             |
| A08 | Metadatos de imagen (GPS, dispositivo, fecha)                       | LINDDUN I  | Inspección y recodificación en canvas                 | M                             |
| A09 | Correlación de horario entre un evento interno y el envío           | LINDDUN L  | Fechas redondeadas al día                             | M parcial; entrega en lotes P |
| A10 | Intersección a lo largo de varias respuestas del buzón              | LINDDUN L  | Horas redondeadas, revisor también en respuestas      | M parcial                     |
| A11 | Celdas pequeñas en estadísticas                                     | LINDDUN D2 | Supresión de celdas menores a 5                       | M                             |
| A12 | Ubicación precisa                                                   | LINDDUN I  | Solo entidad y municipio opcional; sin mapa           | M                             |

## B. Dispositivo y red de la persona denunciante

| #   | Ataque                                                        | Categoría  | Mitigación                                        | Estado    |
| --- | ------------------------------------------------------------- | ---------- | ------------------------------------------------- | --------- |
| B01 | Corrector ortográfico en la nube envía el texto a terceros    | LINDDUN D2 | `spellcheck="false"` en campos de texto           | M         |
| B02 | Traducción automática envía el contenido                      | LINDDUN D2 | `translate="no"`                                  | M         |
| B03 | Extensiones del navegador leen la página                      | LINDDUN D2 | Aviso; recomendar ventana privada                 | R         |
| B04 | Sincronización del navegador con cuenta institucional         | LINDDUN D2 | `autocomplete="off"`, `no-store`, aviso           | M parcial |
| B05 | Historial del portapapeles sincronizado                       | LINDDUN D2 | Aviso                                             | R         |
| B06 | Equipo institucional administrado o con software de monitoreo | LINDDUN D  | Aviso inicial explícito                           | R         |
| B07 | Inspección TLS o DNS en la red del trabajo                    | LINDDUN D  | Aviso de usar otra red                            | R         |
| B08 | Foto o archivo del recibo respaldado en la nube               | LINDDUN D2 | Sin descarga ni QR por defecto, aviso             | M         |
| B09 | Rastros locales (historial, caché, almacenamiento)            | LINDDUN D  | Nada en `localStorage`, `no-store`, salida rápida | M         |

## C. Servidor, operación y cadena de suministro

| #   | Ataque                                                     | Categoría   | Mitigación                                                             | Estado       |
| --- | ---------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- | ------------ |
| C01 | Lectura de la base de datos o respaldos                    | STRIDE I    | Identidad y buzón cifrados en el cliente                               | M            |
| C02 | Registro de direcciones IP                                 | LINDDUN L   | Sin IP en registros, sin analítica                                     | M            |
| C03 | Código JavaScript malicioso servido a víctimas específicas | STRIDE T    | Hashes publicados de cada versión; verificador                         | P; R         |
| C04 | Sustitución de llaves públicas de la autoridad             | STRIDE S    | Llaves fijadas en el bundle y comparadas con `GET /keys`               | M            |
| C05 | Reescritura de la bitácora                                 | STRIDE T, R | Cadena de hashes, cabeza firmada y anclada fuera                       | M            |
| C06 | Pérdida o borrado de denuncias                             | STRIDE D, R | Comprobante firmado en poder del denunciante                           | M            |
| C07 | Mover un sobre de identidad a otra denuncia                | STRIDE T    | AAD vinculado a `authVerifier`                                         | M            |
| C08 | Enumeración de folios o recibos                            | LINDDUN D   | 60 bits de folio, 88 de recibo, respuesta idéntica, límite de intentos | M            |
| C09 | Saturación con denuncias falsas                            | STRIDE D    | Límite de envíos; prueba de trabajo autoalojada                        | M parcial; P |
| C10 | Archivo malicioso contra el visor de la autoridad          | STRIDE E    | Solo imágenes, validación de tipo y tamaño en servidor                 | M            |
| C11 | XSS en los hechos mostrados a la autoridad                 | STRIDE E    | Escape de salida y CSP estricta                                        | M            |
| C12 | Permisos de lectura públicos mal configurados              | STRIDE I    | Rutas de autoridad con token; pruebas de autorización                  | M            |
| C13 | Dependencia comprometida                                   | STRIDE T    | Lockfile, dependencias mínimas y auditadas                             | M parcial    |
| C14 | Aleatoriedad débil                                         | STRIDE S    | Solo `crypto.getRandomValues`; lint prohíbe `Math.random`              | M            |
| C15 | Longitud del texto cifrado revela datos                    | LINDDUN I   | Relleno de la identidad a 4096 bytes                                   | M            |

## D. Autoridad y custodia de llaves

| #   | Ataque                                             | Categoría  | Mitigación                                                                  | Estado    |
| --- | -------------------------------------------------- | ---------- | --------------------------------------------------------------------------- | --------- |
| D01 | La autoridad abre la identidad sin motivo          | LINDDUN N2 | Apertura solo por ruta que registra fundamento; visible para el denunciante | M         |
| D02 | Filtración posterior a la apertura                 | LINDDUN D2 | Registro de quién y cuándo (art. 64 LGRA)                                   | R         |
| D03 | Compromiso de la llave privada de la autoridad     | STRIDE I   | Llave fuera del servidor; rotación con `keyId`                              | M parcial |
| D04 | Una sola persona decide abrir                      | LINDDUN N2 | Revelación por umbral 2 de 3                                                | P         |
| D05 | Identidad declarada falsa (suplantar a un tercero) | STRIDE S   | Etiqueta "identidad declarada, no verificada"                               | R         |
| D06 | Cambio de administración y pérdida de llaves       | STRIDE D   | Procedimiento de rotación documentado                                       | P         |

## E. Seguimiento

| #   | Ataque                                       | Categoría | Mitigación                                          | Estado    |
| --- | -------------------------------------------- | --------- | --------------------------------------------------- | --------- |
| E01 | Pregunta del buzón diseñada para identificar | LINDDUN I | Revisor sobre la respuesta; mensajes en la bitácora | M parcial |
| E02 | Sitio falso que pide las 8 palabras          | STRIDE S  | Educación y dominio visible                         | R         |
| E03 | Coacción para mostrar el seguimiento         | LINDDUN D | Palabras ocultas por defecto, salida rápida         | M parcial |
| E04 | Fuerza bruta del recibo                      | STRIDE S  | 88 bits y límite de intentos                        | M         |

## F. Legales e institucionales

| #   | Riesgo                                    | Mitigación                                                  | Estado |
| --- | ----------------------------------------- | ----------------------------------------------------------- | ------ |
| F01 | Orden de entrega de respaldos             | Solo contienen texto cifrado                                | M      |
| F02 | Obligación de modificar el código servido | Hashes publicados y verificador                             | P      |
| F03 | Reducción de sospechosos e interrogatorio | Fuera del alcance técnico; medidas de protección de la LGRA | R      |

## Riesgos residuales principales

1. El contenido de los hechos puede identificar a la persona; el revisor ayuda pero no garantiza.
2. Un servidor comprometido puede servir código malicioso a usuarios futuros.
3. Un dispositivo o una red vigilados quedan fuera de lo que una aplicación web puede controlar.
4. Con un solo destinatario, la autoridad competente puede abrir la identidad; la bitácora la hace
   visible pero no la impide. El umbral 2 de 3 reduce este riesgo.

## Observaciones sobre sistemas de terceros

Las observaciones sobre sistemas de terceros se comunican primero a la institución responsable.
