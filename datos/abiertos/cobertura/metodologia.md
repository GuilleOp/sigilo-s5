# Metodología: matriz de cobertura de la PDN

Conjunto nuevo de datos abiertos que describe qué trae realmente la descarga masiva de la
Plataforma Digital Nacional por entidad federativa, sistema y año. Sirve para que una verificación
contra la PDN distinga «no hay registro» de «la fuente no cubre ese ente o periodo»: la ausencia
nunca es evidencia (ADR 0008).

## Archivos

| Archivo                | Contenido                                 |
| ---------------------- | ----------------------------------------- |
| `matriz-cobertura.csv` | Una fila por entidad, sistema y periodo   |
| `diccionario.csv`      | Campo, tipo y descripción de cada columna |

La misma matriz está en `datos/cobertura/matriz.json` (con las notas como lista) y
`datos/cobertura/matriz.csv`.

## Construcción

- **Entidades:** las 32 entidades federativas con su clave INEGI y la clave `00` para lo federal
  (APF y órganos autónomos nacionales: SFP, SABG, BANXICO, CNDH, INEGI, COFECE). La entidad de cada
  registro es la de su proveedor (carpeta de la descarga), porque el campo de entidad de los
  registros es heterogéneo (clave o nombre).
- **Sistemas:** S1, S2, S3 servidores (`S3S`: faltas graves y no graves), S3 particulares (`S3P`:
  personas físicas y morales) y S6.
- **Periodo:** año de `metadata.actualizacion` (S1), del ejercicio fiscal (S2), de
  `resolucion.fechaResolucion` o, si falta, `fecha` (S3), y de `tender.tenderPeriod.startDate` o,
  si falta, `date` (S6). Las fechas anteriores a 1990 o posteriores a la descarga (como la
  fecha de relleno 1900 de BCS en S6) van al periodo `sin_fecha`.
- **Fila «total»:** una por cada par entidad y sistema, también cuando no hay datos
  (`hay_datos = false`), con las notas de calidad.
- **Notas:** descargas incompletas (registros leídos frente a `meta.total_count` en S3), fechas
  implausibles, registros sin institución y notas verificadas en el inventario de la Etapa 0 (por
  ejemplo, SFP solo con 2022 en S1, proveedores que lista la API pero no trae la descarga).

## Privacidad

Los conteos de 1 a 4 registros se publican como `1-4` y sin fechas mínima ni máxima, porque en S1 y
S3 la unidad es una persona. Si un par entidad y sistema tiene periodos suprimidos, su fila «total»
no publica el total exacto (restarle los periodos publicados reconstruiría los suprimidos) sino un
rango: los registros publicados más de 1 a 4 por periodo suprimido. Sus fechas mínima y máxima
salen solo de los periodos publicados. No contiene nombres ni registros individuales.

## Limitaciones

- Describe la descarga masiva del 2026-11-05, no la API en vivo: un proveedor puede estar
  conectado a la API y faltar en la descarga (o al revés, como Oaxaca en S2).
- «Hay datos» no significa cobertura completa de todas las instituciones de la entidad.
