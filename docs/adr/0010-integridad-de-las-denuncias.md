# 0010. Integridad de las denuncias

- Estado: aceptada
- Fecha: 2026-11-05
- Complementa: 0006 (corroboración ciega)

## Contexto

La corroboración (ADR 0006) y la prioridad son útiles solo si no se pueden fabricar. Una persona
puede enviar muchas denuncias para inflar la prioridad; un grupo puede organizar una campaña contra
alguien; y quien es investigado puede contradenunciar a quien lo investiga. Al mismo tiempo, el
sistema no debe castigar ni desacreditar a quien denuncia de buena fe, ni exponer a la persona
denunciada, que no ha sido declarada responsable.

Marco legal:

- **LGRA, art. 91.** Denuncias anónimas y confidencialidad.
- **LGRA, art. 64, fr. III.** Revelar la identidad de un denunciante anónimo es obstrucción de la
  justicia.
- **LGRA, art. 69.** Responsabilidad de particulares por proporcionar información falsa. Es una
  determinación de la autoridad competente en un procedimiento, no una etiqueta de un sistema.
- **Constitución, art. 20, apartado B, fr. I.** Presunción de inocencia, que la jurisprudencia de
  la SCJN extiende con matices al derecho administrativo sancionador.
- **Convención de las Naciones Unidas contra la Corrupción, arts. 13 y 33.** Participación de la
  sociedad y protección de quienes denuncian de buena fe.

## Decisión

| Regla                                                | Decisión                                                                                                                                                                                                                                                                                                                             | Nivel |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Una persona, una corroboración                       | Para la prioridad, un grupo de denuncias con la misma etiqueta cuenta las fuentes independientes, no las denuncias. Las denuncias que parecen de la misma fuente se agrupan y cuentan una vez.                                                                                                                                       | A     |
| Señales de independencia                             | Calculadas del lado de la autoridad sobre los hechos: similitud del texto, pruebas con el mismo digesto, mismo día de envío, misma secuencia de campos opcionales. Cada señal es explicable y reduce el peso; ninguna descarta.                                                                                                      | A     |
| Detección de campañas                                | Ráfagas de denuncias con la misma etiqueta en poco tiempo y alta similitud se marcan como «posible campaña»: cuentan como una fuente y se informan a la autoridad, que decide.                                                                                                                                                       | A     |
| Contradenuncias                                      | Una denuncia contra la persona servidora pública que tramita otra denuncia, poco después de una actuación suya en ella, se marca como «posible contradenuncia» y se turna a la autoridad supervisora (ADR 0007), no a la persona señalada.                                                                                           | A     |
| Presunción de buena fe                               | Ninguna denuncia se etiqueta como «falsa». Lo más que dice el sistema es «inconsistente con registros públicos», con la verificación que lo sustenta (ADR 0008).                                                                                                                                                                     | A     |
| Presunción de inocencia en los datos públicos        | Los datos abiertos, el observatorio y la ficha de contexto nunca nombran a personas denunciadas ni publican conteos por persona; solo agregados por ente con supresión de celdas pequeñas. Las coincidencias son internas de la autoridad.                                                                                           | A     |
| Orden judicial solo para investigar a quien denuncia | Ninguna señal de integridad abre ni ayuda a abrir una identidad sellada. Abrirla para investigar a quien denuncia (por ejemplo, por información falsa, art. 69) exige una orden judicial registrada como fundamento. La apertura para el trámite no requiere orden: sigue la ruta registrada con apertura 2 de 3 (SEC-05, ADR 0002). | A     |
| Fichas anónimas de unicidad                          | Diseño al estilo de Privacy Pass (RFC 9576, arquitectura; RFC 9577, esquema HTTP; RFC 9578, emisión). Ver abajo.                                                                                                                                                                                                                     | C     |

### Señales en el índice de coincidencias

Las denuncias de una misma etiqueta pueden estar en nodos distintos, que no comparten hechos. Para
contarlas entre nodos, el índice del ADR 0006 calcula las señales que no requieren el contenido:
hora redondeada a 10 minutos, nodo, entrada a la red (ventanilla única o entrada propia) y un
**resumen difuso del relato** que calcula el navegador (MinHash de un bit sobre fragmentos de 5
caracteres, 64 bytes, con una llave derivada de la salida VOPRF que el índice no conoce). No se
recolecta huella de dispositivo. Las reglas y su análisis de privacidad están en
`docs/criptografia.md` («Corroboración ciega»); el código, en `@sigilo/corroboracion`
(`assessIndependence`). Un grupo de denuncias unidas por las señales cuenta como una fuente y lleva
la marca «posible mismo origen» y, con tres o más en 24 horas, «posible campaña». Las señales sobre
los hechos completos siguen del lado de la autoridad.

### Fichas anónimas de unicidad (nivel C)

Un emisor comprueba una sola vez que la persona es única (por ejemplo, en un quiosco o con firma
electrónica) y le entrega, por periodo, un número fijo de fichas cegadas que no puede ligar a ella.
Al denunciar, la persona canjea una ficha ligada a la etiqueta de corroboración: dos canjes para la
misma etiqueta y el mismo periodo se detectan como la misma fuente sin saber quién es. RFC 9578
define la emisión con VOPRF sobre P-384 (verificación privada) y con firmas RSA ciegas
(verificación pública); un perfil sobre `ristretto255` reutilizaría el VOPRF del ADR 0006, pero no
sería un tipo de ficha registrado.

Riesgos del diseño: el emisor sabe quién pidió fichas (por eso pedirlas no debe implicar denunciar
y deben ofrecerse a todas las personas), excluye a quien no puede comprobar su unicidad (las fichas
nunca son requisito para denunciar, solo suman peso) y requiere un emisor independiente de las
autoridades.

## Alternativas consideradas

| Alternativa                                 | Por qué no                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Exigir identidad verificada para corroborar | Rompe el anonimato que la LGRA reconoce (art. 91) y desalienta a quien más arriesga.              |
| Descartar denuncias similares               | Castiga a denunciantes de buena fe que vieron lo mismo; la similitud es una señal, no una prueba. |
| Etiquetar denuncias como «falsas»           | Anticipa una determinación que corresponde a la autoridad (art. 69) y expone a quien denuncia.    |
| Contar denuncias sin agrupar                | La prioridad se fabrica enviando muchas.                                                          |
| Fichas de unicidad en esta entrega          | Requieren un emisor real e independiente; se documentan como diseño.                              |

## Consecuencias

### Positivas

- Fabricar prioridad cuesta más que enviar muchas denuncias.
- Quien denuncia de buena fe nunca es etiquetado ni descartado por el sistema.
- La persona denunciada no aparece en ningún dato público.

### Negativas

- Sin fichas de unicidad, una persona cuidadosa que varía texto, pruebas y día puede pasar por
  varias fuentes; las señales solo lo encarecen.
- Las señales de independencia producen falsos positivos (personas distintas que describen lo mismo
  con palabras parecidas) que bajan el peso de una corroboración real.

### Riesgos

- Las señales operan sobre hechos que la autoridad ya ve; no amplían lo que puede saber de quien
  denuncia, pero una autoridad podría usar «posible campaña» como pretexto para no investigar. El
  auditor (ADR 0009) y el escalamiento (ADR 0007) vigilan los cierres de denuncias marcadas.
- La marca de contradenuncia puede proteger a una persona servidora pública que sí cometió una
  falta; por eso la denuncia no se descarta, se turna a la supervisora.
- La regla de orden judicial es una política del estándar: técnicamente, quien tenga la llave de la
  autoridad y una copia de la base puede descifrar (`docs/arquitectura.md`, «Apertura de
  identidad»); la apertura 2 de 3 y la bitácora la hacen visible.
