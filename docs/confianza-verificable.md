# Confianza verificable

Una persona que desconfía del gobierno no va a creer «es anónimo» solo porque lo diga una página
del gobierno. SIGILO no le pide confianza: le da formas de **comprobarlo ella misma** o de apoyarse
en alguien que no sea el gobierno. Este documento describe esas piezas, qué prueba cada una y qué
no, y las que se proponen para la adopción.

Regla de redacción: ninguna pantalla dice «100 % anónimo». Cada afirmación debe coincidir con el
[modelo de amenazas](modelo-de-amenazas.md); cuando hay un límite, se dice. Prometer de más es lo
que más rápido destruye la confianza, porque basta que alguien encuentre un límite callado.

## Piezas en la web

| Pieza                                    | Dónde                          | Qué demuestra                                                                                                                                           | Qué no demuestra                                                              | Prueba                                                    |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| «Compruébalo tú»: escribir en modo avión | Paso 1 (`ModeStep`)            | Que los hechos, el revisor de frases y la limpieza de fotos corren en el equipo: nada sale hasta pulsar «Enviar»                                        | Lo que pasa después de enviar (lo cubren las demás piezas)                    | E2E `trust.spec.ts` (sin peticiones de red)               |
| «Lo que sale de tu equipo»               | Paso 4 (`OutgoingPanel`)       | Qué viaja y qué nunca sale; en la red, el relato cerrado con la llave del nodo, tal como lo ve el enrutador                                             | Que el nodo destino sea honesto: lo cubren la bitácora y las reglas públicas  | `outgoing.test.ts`, `outgoing-sample.integration.test.ts` |
| «Así te verá la autoridad»               | Paso 4 (`AuthorityPreview`)    | Lo que leerá quien tramita, sin nada que identifique en modo anónimo                                                                                    | Lo que el texto revela por su contenido (lo señala el revisor de frases)      | E2E `submit-complaint.spec.ts`                            |
| «¿Quién sabe qué de ti?»                 | Inicio (`WhoKnowsWhat`)        | Qué ve cada parte del camino y las respuestas a las dudas más comunes                                                                                   | Es una explicación; la prueba está en el código abierto y en la bitácora      | E2E `trust.spec.ts`                                       |
| «Lo que SIGILO no puede hacer por ti»    | Inicio (`HonestLimits`)        | Los límites, dichos antes de denunciar, con lo que ayuda en cada caso                                                                                   | —                                                                             | E2E `trust.spec.ts`                                       |
| Cifras de la bitácora comprobada         | `/verificar` (`LedgerFigures`) | Cuántas denuncias llegaron, cuántas aperturas de nombres sellados y cuántas entregas de su sobre registró el nodo, contadas por el equipo de la persona | Aperturas fuera del sistema con la llave robada y una copia de la base (D01)  | `ledger-summary.test.ts`, E2E `trust.spec.ts`             |
| Libro de aperturas y conciliación        | Seguimiento (`IdentityStatus`) | Con el recibo, si abrieron su nombre, y si el servidor ocultó una apertura                                                                              | —                                                                             | E2E `tracking.spec.ts` (D01)                              |
| Llaves fijadas y directorio firmado      | Envío                          | Que la página cifra hacia las llaves fijadas o las del directorio firmado, y no hacia otras; si no coinciden, no envía nada                             | Que el código de la página sea el auditado (ver «Huella de la página», abajo) | E2E `key-pinning.spec.ts`                                 |

Las cifras de `/verificar` se calculan solo después de verificar la cadena completa contra la
cabeza firmada: no son números que el servidor afirma. Cubren la bitácora del nodo que sirve la
página; cada nodo de la red publica la suya.

## Mensajes por momento

| Momento              | Miedo                                | Mensaje                                                                          |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Al llegar            | «Es del gobierno, me van a rastrear» | «No te pedimos que confíes en nosotros. Esto es lo que puede ver cada parte.»    |
| Al empezar           | «Lo que escriba ya lo están viendo»  | «Pon tu teléfono en modo avión: puedes llenar todo sin conexión.»                |
| Antes de enviar      | «¿Qué se llevan realmente?»          | «Aquí está exactamente lo que enviaremos y lo que no.»                           |
| Al recibir el recibo | «¿Y si piden mis palabras?»          | Las 8 palabras se crean en el equipo y nunca viajan; no hay cuenta que entregar. |
| Después              | «¿Abrieron mi nombre sin decirme?»   | Libro de aperturas en el seguimiento y cifras públicas en `/verificar`.          |

## Para la adopción (propuestas, sin código)

1. **Entradas que no sean del gobierno.** Universidades, organizaciones de la sociedad civil y
   colectivos pueden publicar la misma web en su dominio. La denuncia llega igual a la autoridad
   competente por la red; quien no confía en un sitio de gobierno entra por uno en el que sí
   confía. Encaja con «un S5, muchas llaves»: la web no tiene secretos, solo llaves públicas.
2. **Huella de la página.** Cada versión publica el SHA-256 de su paquete web en la bitácora, con
   la cofirma de los observadores, y el repositorio permite reconstruirlo. Una extensión o el
   validador comparan la página servida con esa huella. Hoy las llaves fijadas impiden cifrar hacia
   otra llave, pero no prueban que el código servido sea el auditado.
3. **Auditoría y reto públicos.** Invitar a organizaciones de derechos digitales a revisar el
   código y el validador, y publicar un reto: «esta es una denuncia sintética; demuestra quién la
   envió».
4. **Umbral criptográfico para abrir nombres.** Hoy las dos aprobaciones son una regla del nodo
   (D04 en el modelo de amenazas); el umbral 2 de 3 en la criptografía convertiría esa regla en una
   garantía que no depende de la honestidad del servidor.
