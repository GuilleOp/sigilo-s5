# 0006. Corroboración ciega con OPRF

- Estado: aceptada
- Fecha: 2026-11-05
- Complementa: 0002 (criptografía), 0005 (red federada)

## Contexto

Una denuncia aislada pesa poco; varias denuncias independientes contra la misma persona, empresa o
procedimiento justifican priorizar. En la red federada (ADR 0005) esas denuncias pueden llegar a
autoridades y nodos distintos, y ningún intermediario debe poder leerlas ni saber a quién acusan.

Los identificadores con los que se puede detectar la coincidencia son públicos y enumerables: el
nombre de una persona servidora pública junto con su ente (S2 y S3), el RFC de un proveedor o el
identificador de un procedimiento de contratación (S6). Un resumen simple (`SHA-256` del
identificador) se revierte probando toda la lista pública de nombres en minutos.

Marco legal:

- **LGRA, art. 74.** La facultad de sancionar prescribe en 3 años (faltas no graves) o 7 (graves);
  la calificación la interrumpe. Una denuncia retenida no se califica, así que retenerla deja
  correr la prescripción.
- **LGRA, art. 100.** El archivo por falta de elementos se puede reabrir con nuevos indicios.
- **LGRA, art. 64, fr. III.** Revelar la identidad de un denunciante anónimo es obstrucción de la
  justicia: la corroboración no debe crear un camino nuevo hacia esa identidad.

### Lo que encontramos en `@noble/curves`

La versión instalada es **2.4.0** (`node_modules/@noble/curves/package.json`; `packages/core` la
declara como `^2.4.0`). Ofrece todo lo necesario, sin dependencias nuevas:

- `ristretto255_oprf` en `@noble/curves/ed25519.js`, ciphersuite `ristretto255-SHA512` de RFC 9497,
  con los tres modos: `oprf`, `voprf` y `poprf` (`generateKeyPair`, `deriveKeyPair`, `blind`,
  `blindEvaluate`, `finalize`, `evaluate`; en `voprf` la evaluación devuelve una prueba DLEQ).
- `ristretto255_hasher` con `hashToCurve` (RFC 9380) y `deriveToCurve` (RFC 9496).
- Se comprobó en local una ronda `voprf` completa: la misma entrada da la misma salida y entradas
  distintas, salidas distintas. `@sigilo/corroboracion` reproduce byte por byte los vectores
  oficiales del apéndice A.1.2 de RFC 9497 (ristretto255-SHA512, VOPRF), incluido el lote.
- El README declara una auditoría de Trail of Bits sobre la versión 2.3.0 (agosto de 2026) con
  alcance completo; la auditoría de Cure53 de 2024 no cubría OPRF.

Alternativa si la biblioteca no sirviera: implementar RFC 9497 sobre `ristretto255` y
`ristretto255_hasher` de la misma biblioteca, validado con los vectores del apéndice A de RFC 9497.
No se usaría otra biblioteca ni una primitiva propia (ADR 0001, principio 5).

## Decisión

### Protocolo

1. El navegador normaliza el identificador según su tipo (NFD sin diacríticos, mayúsculas,
   espacios simples) y antepone una etiqueta de dominio:
   `sigilo/v1/corroboration/<tipo>:<valor>`, con tipo `servidor` (nombre y clave del ente), `rfc` u
   `ocid`.
2. El navegador ciega la entrada (`voprf.blind`) y la envía al **evaluador OPRF**, con su propio
   reto de prueba de trabajo.
3. El evaluador responde el punto evaluado y la prueba DLEQ. El navegador verifica la prueba contra
   la llave pública del evaluador publicada en el directorio firmado (ADR 0005) y obtiene la
   **etiqueta** con `finalize`. El modo verificable impide que el evaluador use una llave distinta
   para cada persona y así la marque.
   La etiqueta es `HKDF-SHA256(salida VOPRF, info = "sigilo/v1/corroboration/tag")`; con otro
   contexto se deriva la llave del resumen difuso del relato (ADR 0010), que nunca sale del
   navegador. La llave pública se publica en el campo opcional `corroboration` del directorio,
   con su época.
4. La etiqueta viaja con la denuncia hacia el **índice de coincidencias**, que solo guarda
   `(etiqueta, nodo, folioDigest)` y cuenta coincidencias. Avisa a cada nodo involucrado con un
   identificador de grupo aleatorio, sin decirle qué nodos ni qué folios forman el grupo.

### Comportamiento por defecto: envío inmediato

La denuncia se envía y se turna de inmediato, como hoy. La coincidencia solo **suma prioridad**
explicable en la ficha de contexto («coincide con otras 2 denuncias independientes»); nunca retrasa,
descarta ni cambia el estado de una denuncia. El peso de cada coincidencia depende de las señales de
independencia del ADR 0010.

### Custodia opcional (nivel B)

Quien denuncia puede pedir que su denuncia espere hasta que existan otras k denuncias con la misma
etiqueta. La denuncia se cifra hacia la autoridad y ese sobre se vuelve a cifrar hacia la llave del
custodio, de modo que el nodo no la puede leer antes de liberarla y el custodio nunca puede leer el
contenido. Se libera al alcanzar k o en la **fecha límite**, lo que ocurra primero:

`fecha límite = mínimo(fecha elegida, fecha de los hechos + 3 años − 12 meses)`

Se usa siempre el plazo de 3 años (faltas no graves) porque quien denuncia no califica la gravedad,
y el margen de 12 meses deja tiempo para investigar y calificar antes de que prescriba (LGRA,
art. 74). La custodia y su fecha límite quedan en la bitácora y en el seguimiento.

### Separación de servicios

El evaluador OPRF (tiene la llave, solo ve puntos cegados) lo opera alguien distinto del índice de
coincidencias y de los nodos (ven etiquetas o contenidos, nunca la llave). Si un mismo operador
tuviera la llave y las etiquetas, podría calcular en silencio la etiqueta de cada nombre de las
listas públicas y saber contra quién hay denuncias. Separados, cada intento es una consulta en línea
al evaluador, que exige prueba de trabajo y publica en la bitácora nacional el número diario de
evaluaciones junto al de denuncias: una enumeración masiva se nota.

### Reapertura por nuevos indicios

Cuando una denuncia nueva coincide con una archivada por falta de elementos, el nodo de la denuncia
archivada recibe un aviso de «posible nuevo indicio» (LGRA, art. 100). La autoridad decide si
reabre; el sistema no reabre nada por sí mismo.

### Niveles

| Parte                                               | Nivel |
| --------------------------------------------------- | ----- |
| Etiqueta VOPRF, evaluador e índice de coincidencias | A     |
| Prioridad explicable y aviso de posible reapertura  | A     |
| Custodia con fecha límite                           | B     |
| Evaluador distribuido (llave repartida por umbral)  | C     |

## Alternativas consideradas

| Alternativa                                                                 | Por qué no                                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Resumen simple del identificador                                            | Se revierte con un diccionario de las listas públicas (S2, S3, S6).                                                  |
| HMAC con llave en el mismo servicio que guarda                              | Quien opera el servicio tiene llave y etiquetas: el diccionario sigue siendo gratuito y silencioso.                  |
| OPRF sin prueba (modo `oprf`)                                               | El evaluador podría usar llaves distintas por persona y separar grupos sin que nadie lo note.                        |
| Intersección privada de conjuntos entre autoridades                         | Exige que todas las autoridades estén en línea y repitan el protocolo por pares; no escala a cientos de autoridades. |
| Custodia obligatoria al estilo de los sistemas de «coincidencia» para acoso | Retrasa denuncias legítimas y deja correr la prescripción; se ofrece solo como opción.                               |
| Sin corroboración                                                           | Se pierde la señal de prioridad más útil para la autoridad.                                                          |

## Consecuencias

### Positivas

- Ningún intermediario aprende a quién se acusa; solo que dos denuncias apuntan al mismo
  identificador.
- La corroboración funciona entre nodos y autoridades distintas sin compartir contenidos.
- La custodia nunca deja prescribir una falta: su fecha límite se calcula contra el plazo legal.

### Negativas

- La normalización favorece la precisión sobre la exhaustividad: variantes de un nombre no
  coinciden, y dos homónimos en el mismo ente sí.
- Un servicio más que operar con independencia real del índice.
- Rotar la llave del evaluador rompe la coincidencia con las etiquetas anteriores; la llave se rota
  solo por compromiso y con una época nueva en el directorio.

### Riesgos

- **Consulta dirigida.** Quien vea etiquetas en el índice puede pedir al evaluador la etiqueta de
  un nombre concreto y saber si hay denuncias contra esa persona. La prueba de trabajo y el conteo
  público la encarecen y la hacen visible, pero no la impiden. Las fichas de unicidad (ADR 0010,
  nivel C) la reducirían.
- **Colusión.** Si evaluador e índice se coluden, el diccionario vuelve a ser posible.
- **Compromiso de la llave.** Expone todas las etiquetas de su época; motiva el evaluador por
  umbral (nivel C).
- **Inflado.** Una sola persona puede enviar varias denuncias para fingir corroboración; se mitiga
  con las señales de independencia del ADR 0010.
- La coincidencia no revela la identidad de quien denuncia ni cambia la apertura de identidad, que
  sigue las reglas de los ADR 0002 y 0010.
