# Evaluación del auditor

<!-- Archivo generado por `npm run auditor:eval`; no se edita a mano. Una prueba exige que esté al día. -->

Reglas versión **1.1.0** (`config/umbrales.json`), adaptador del modelo versión **1.0.0**.
Conjunto 100 % sintético, etiquetado por el equipo según lo que una persona revisora esperaría, no según lo que hace
la regla. Incluye el escenario de la demostración y casos difíciles hechos para que las reglas fallen.

## Advertencias

- El conjunto es pequeño y lo escribió el mismo equipo que escribió las reglas: las cifras son **optimistas** y no
  sustituyen una evaluación con acuerdos reales, que el repositorio no tiene. Los umbrales son del prototipo.
- No hay un conjunto apartado para validar: los umbrales se eligieron viendo estos mismos datos (ver el barrido).
- Ninguna cifra de esta página mide un modelo de lenguaje real: en la máquina de desarrollo no hay Ollama ni
  llama.cpp instalados. Las defensas se miden con un doble que simula respuestas, incluidas maliciosas.
- Una señal no decide nada: la decisión es de las reglas públicas o de una persona.

## Subconjuntos

| Subconjunto               | Acuerdos | Casos | Descripción                                                                                                                                                                                                                                                          |
| ------------------------- | -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escenario-dia-31`        | 37       | 2     | Escenario de la demostración el día 31: 31 acuerdos importados con plantilla, la calificación como no grave de case.marta con la misma plantilla y los 5 acuerdos de control de Querétaro.                                                                           |
| `escenario-dia-151`       | 0        | 1     | case.queretaro-dormant el día 151: preaviso de caducidad por inactividad.                                                                                                                                                                                            |
| `motivados-parecidos`     | 12       | 0     | Doce acuerdos de archivo con el mismo encabezado legal y una motivación propia de cada caso. No son plantilla.                                                                                                                                                       |
| `plantilla-con-sinonimos` | 15       | 0     | Quince acuerdos de una misma plantilla con cinco partes intercambiadas por sinónimos. Son plantilla aunque el texto varíe.                                                                                                                                           |
| `autoridad-pequena`       | 6        | 0     | Seis acuerdos idénticos de una autoridad pequeña. Son plantilla; cada uno coincide con 5, justo el mínimo publicado.                                                                                                                                                 |
| `canalizaciones`          | 12       | 0     | Doce canalizaciones idénticas: un trámite de forma, no un archivo; el motivo «canalizado» se excluye.                                                                                                                                                                |
| `archivo-y-calificacion`  | 10       | 10    | Diez casos con su acuerdo: archivos con y sin pruebas, archivos que analizan la evidencia, uno que la menciona de forma genérica y calificaciones de faltas graves y no graves.                                                                                      |
| `plazos`                  | 0        | 11    | Once casos con plazos: falta grave sin iniciar el procedimiento o con inicio vacío, inactividad prolongada en la investigación, caducidad después de admitido el informe, actuaciones vacías en ambas etapas, notificación tardía y movimientos antes de prescribir. |
| `patrones-por-autoridad`  | 12       | 20    | Cuatro autoridades: tasa alta y baja de archivo en casos corroborados, una campaña contra la misma persona y archivos concentrados en un proveedor.                                                                                                                  |

## Resultados por regla

Unidades: AUD-01 cuenta acuerdos; AUD-02 y AUD-03, acuerdos ligados a un caso; AUD-04, AUD-05 y AUD-08, casos;
AUD-06 y AUD-07, autoridades. «n/a» significa que no hubo unidades para calcularlo.

| Regla  | Nombre                                        | VP  | FP  | FN  | VN  | Precisión | Exhaustividad | Tasa de FP |
| ------ | --------------------------------------------- | --- | --- | --- | --- | --------- | ------------- | ---------- |
| AUD-01 | Acuerdo con plantilla (cierre o calificación) | 38  | 0   | 15  | 51  | 100.0 %   | 71.7 %        | 0.0 %      |
| AUD-02 | Archivo contra evidencia                      | 6   | 0   | 1   | 16  | 100.0 %   | 85.7 %        | 0.0 %      |
| AUD-03 | Calificación degradada                        | 3   | 0   | 0   | 20  | 100.0 %   | 100.0 %       | 0.0 %      |
| AUD-04 | Plazos vencidos o por vencer                  | 8   | 0   | 0   | 36  | 100.0 %   | 100.0 %       | 0.0 %      |
| AUD-05 | Actuación vacía tras inactividad              | 2   | 0   | 0   | 42  | 100.0 %   | 100.0 %       | 0.0 %      |
| AUD-06 | Tasa de archivo en casos corroborados         | 1   | 0   | 0   | 8   | 100.0 %   | 100.0 %       | 0.0 %      |
| AUD-07 | Concentración de archivos                     | 1   | 0   | 0   | 8   | 100.0 %   | 100.0 %       | 0.0 %      |
| AUD-08 | Movimiento justo antes de prescribir          | 1   | 0   | 0   | 43  | 100.0 %   | 100.0 %       | 0.0 %      |

### Errores

- **AUD-01**
  - Falsos negativos: `plantilla-con-sinonimos/synonym-01`, `plantilla-con-sinonimos/synonym-02`, `plantilla-con-sinonimos/synonym-03`, `plantilla-con-sinonimos/synonym-04`, `plantilla-con-sinonimos/synonym-05`, `plantilla-con-sinonimos/synonym-06`, `plantilla-con-sinonimos/synonym-07`, `plantilla-con-sinonimos/synonym-08`, `plantilla-con-sinonimos/synonym-09`, `plantilla-con-sinonimos/synonym-10`, `plantilla-con-sinonimos/synonym-11`, `plantilla-con-sinonimos/synonym-12`, `plantilla-con-sinonimos/synonym-13`, `plantilla-con-sinonimos/synonym-14`, `plantilla-con-sinonimos/synonym-15`
- **AUD-02**
  - Falsos negativos: `archivo-y-calificacion/closure.m5`

Lectura honesta de los errores:

- **AUD-01 no detecta plantillas con sinónimos.** Cambiar cinco partes del texto por sinónimos baja la similitud
  de shingles de 3 palabras por debajo de cualquier umbral razonable. Quien quiera evadir la regla puede hacerlo;
  por eso es una señal más y no una prueba. Una lista pública de sinónimos jurídicos o una medida por bolsa de
  palabras ayudaría, a costa de acercarse a los acuerdos bien motivados (ver el margen abajo).
- **AUD-01 y las autoridades pequeñas.** Con el mínimo de 5 coincidencias, una autoridad con menos de
  6 acuerdos iguales en la ventana nunca se señala. El mínimo se bajó de 10 a 5 por el subconjunto
  `autoridad-pequena`; un mínimo menor aumenta el riesgo de señalar fórmulas legítimas repetidas pocas veces.
- **AUD-02 se evade con una mención genérica.** Un acuerdo que solo dice «las pruebas aportadas no son suficientes»
  cuenta como que se ocupó de las pruebas. La regla compara menciones, no la calidad del análisis.
- **AUD-03 depende de la conducta que eligió quien denunció.** Si la persona eligió mal la clave, la señal puede
  ser injusta con la autoridad; por eso explica que puede haber razones y pide revisar la motivación.
- **La calificación de Marta pasa AUD-01 por poco.** El día 30 el OIC califica la falta grave como no grave con
  la misma plantilla de sus archivos, cambiando solo «conclusión y archivo» por «calificación como no grave».
  Su similitud con la variante 1 es de 0.77 (umbral 0.75): con un par de palabras más
  cambiadas, AUD-01 ya no la detectaría. AUD-03 sí la detecta siempre, porque compara la calificación con el catálogo.
- **AUD-04 distingue la etapa.** Antes de admitido el Informe de Presunta Responsabilidad Administrativa, la
  señal es «inactividad prolongada» y no cita la caducidad: el art. 74 solo la prevé en el procedimiento de
  responsabilidad ya admitido el informe, y se decreta a solicitud del presunto infractor. Si el nodo no
  registra la admisión del informe (`report_admitted`), el auditor nunca habla de caducidad.

## Barrido de umbrales de AUD-01

Configuración publicada: shingles de **3** palabras, similitud **0.75**, al menos **5** coincidencias,
ventana de 365 días. El escenario de `docs/demo-escenario.md` proponía 0.9 y 20: con shingles de 3
palabras, las tres variantes de la plantilla tienen similitud de 0.82 a 0.84 entre sí y esa combinación no detecta
ninguno de los 31 acuerdos importados; por eso se fijó 0.75.

| Shingle | Similitud | Mínimo | VP  | FP  | FN  |
| ------- | --------- | ------ | --- | --- | --- |
| 1       | 0.50      | 5      | 53  | 0   | 0   |
| 1       | 0.50      | 10     | 45  | 0   | 8   |
| 1       | 0.50      | 20     | 32  | 0   | 21  |
| 1       | 0.60      | 5      | 52  | 0   | 1   |
| 1       | 0.60      | 10     | 32  | 0   | 21  |
| 1       | 0.60      | 20     | 32  | 0   | 21  |
| 1       | 0.75      | 5      | 38  | 0   | 15  |
| 1       | 0.75      | 10     | 32  | 0   | 21  |
| 1       | 0.75      | 20     | 32  | 0   | 21  |
| 1       | 0.90      | 5      | 37  | 0   | 16  |
| 1       | 0.90      | 10     | 31  | 0   | 22  |
| 1       | 0.90      | 20     | 31  | 0   | 22  |
| 2       | 0.50      | 5      | 40  | 0   | 13  |
| 2       | 0.50      | 10     | 32  | 0   | 21  |
| 2       | 0.50      | 20     | 32  | 0   | 21  |
| 2       | 0.60      | 5      | 38  | 0   | 15  |
| 2       | 0.60      | 10     | 32  | 0   | 21  |
| 2       | 0.60      | 20     | 32  | 0   | 21  |
| 2       | 0.75      | 5      | 38  | 0   | 15  |
| 2       | 0.75      | 10     | 32  | 0   | 21  |
| 2       | 0.75      | 20     | 31  | 0   | 22  |
| 2       | 0.90      | 5      | 37  | 0   | 16  |
| 2       | 0.90      | 10     | 11  | 0   | 42  |
| 2       | 0.90      | 20     | 0   | 0   | 53  |
| 3       | 0.50      | 5      | 38  | 0   | 15  |
| 3       | 0.50      | 10     | 32  | 0   | 21  |
| 3       | 0.50      | 20     | 32  | 0   | 21  |
| 3       | 0.60      | 5      | 38  | 0   | 15  |
| 3       | 0.60      | 10     | 32  | 0   | 21  |
| 3       | 0.60      | 20     | 32  | 0   | 21  |
| 3       | 0.75      | 5      | 38  | 0   | 15  |
| 3       | 0.75      | 10     | 32  | 0   | 21  |
| 3       | 0.75      | 20     | 31  | 0   | 22  |
| 3       | 0.90      | 5      | 37  | 0   | 16  |
| 3       | 0.90      | 10     | 11  | 0   | 42  |
| 3       | 0.90      | 20     | 0   | 0   | 53  |

Margen entre acuerdos bien motivados y plantillas (similitud de Jaccard entre pares de la misma autoridad):

| Shingle | Bien motivados: máxima | Plantilla del escenario: mínima | Plantilla con sinónimos: mínima |
| ------- | ---------------------- | ------------------------------- | ------------------------------- |
| 1       | 0.57                   | 0.81                            | 0.39                            |
| 2       | 0.41                   | 0.69                            | 0.19                            |
| 3       | 0.37                   | 0.62                            | 0.11                            |

Con bolsa de palabras (shingle 1) y similitud 0.50 el barrido detecta también las plantillas con sinónimos sin
falsos positivos en este conjunto, pero solo por suerte: dos acuerdos bien motivados ya se parecen más (0.57) que
ese umbral, y no se señalan únicamente porque no llegan a 5 coincidencias. Con encabezados jurídicos reales eso
fallaría. Se prefirió el margen amplio de los shingles de 3 palabras (0.37 frente a 0.82).

## Clasificación orientativa por reglas (sin modelo)

Palabras clave públicas (`OFFENSE_KEYWORDS`) sobre 18 relatos sintéticos, de los que varios son ambiguos (aceptan más de una conducta) y uno no debe recibir sugerencia.

| Medida                                      | Resultado         |
| ------------------------------------------- | ----------------- |
| Primera sugerencia aceptable                | 13 de 17 (76.5 %) |
| Alguna sugerencia aceptable (exhaustividad) | 14 de 17 (82.4 %) |
| Sugerencias aceptables (precisión)          | 14 de 15 (93.3 %) |
| Se abstuvo cuando no debía sugerir          | 1 de 1            |

Sin sugerencia aceptable: `n08`, `n14`, `n18`. Primera sugerencia equivocada: `n03 (CPF-218)`.
Las palabras clave no entienden plurales ni sinónimos (por ejemplo, «facturas apócrifas» frente a «factura
apocrifa») y una palabra suelta como «cuotas» puede desviar la sugerencia. Es una ayuda para la persona, que
siempre elige la conducta.

## Modelo local opcional

- **Modelo real: no evaluado.** En la máquina de desarrollo no hay Ollama ni llama.cpp server; no se descargó
  ningún modelo. No hay cifras de precisión del modelo y no se publican cifras inventadas.
- **Defensas del adaptador** (doble de pruebas, relato con instrucciones incrustadas): 12 de 12 salidas
  maliciosas o inválidas descartadas y 3 de 3 salidas válidas aceptadas.
- **Riesgo residual:** una salida que cumple el esquema y cita un fragmento literal del relato se acepta aunque la
  sugerencia sea mala, incluso si el fragmento es la propia instrucción incrustada. El daño queda limitado a una
  sugerencia orientativa equivocada que la persona ve junto a su fragmento; nunca a una acción.

Para evaluar un modelo real, instala Ollama, descarga un modelo pequeño (por ejemplo `qwen2.5:1.5b`), fija su
digesto en la configuración y ejecuta las tareas sobre `LABELED_NARRATIVES`; publica el resultado aquí con el
digesto del modelo.
