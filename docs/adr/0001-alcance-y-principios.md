# 0001. Alcance y principios

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

El reto del Datatón Anticorrupción 2026 exige fortalecer el S5 de la PDN con mecanismos de
confidencialidad y anonimato en recepción, trámite y seguimiento. El proyecto lo desarrolla una
sola persona en cinco semanas.

## Decisión

1. Minimizar antes que cifrar: el buzón anónimo sustituye a los datos de contacto.
2. Anonimato graduado en dos modos técnicos: `anonymous` y `sealed`.
3. Todo lo que puede identificar se procesa en el navegador. El servidor es deliberadamente simple
   y no puede leer identidades.
4. Sin peticiones a terceros: fuentes, catálogos y dependencias se sirven desde el propio origen.
5. Criptografía estándar y auditada; no se diseñan primitivas propias.
6. Se construye una réplica mínima del flujo de denuncia; la integración con el S5 real se documenta.

## Consecuencias

- Fuera de alcance: integración real con el S5, motor de turnado, IA clasificadora, video, voz local.
- La revelación por umbral (2 de 3) queda como módulo opcional posterior.
