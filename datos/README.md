# Datos de la PDN: proceso reproducible y productos agregados

Esta carpeta convierte las descargas masivas de la Plataforma Digital Nacional (PDN) en productos
**agregados y seguros** para SIGILO (tareas 3.1, 3.2, 3.3 y 3.6 del plan). Todo se regenera con un
solo comando, en Python 3 con la biblioteca estándar (sin pandas ni dependencias), leyendo los ZIP
en streaming y sin descomprimirlos a disco.

## Reglas de privacidad

1. Al repositorio solo entran código, documentación y salidas **agregadas**. Ningún archivo de esta
   carpeta contiene nombres de personas, CURP, RFC de personas físicas, teléfonos, correos ni
   hashes de personas.
2. De S1 solo se leen nombre y apellidos para contar personas distintas con un hash efímero (sal
   aleatoria por ejecución, solo en memoria). Nunca se extraen `curp`, `rfc`, `telefono`,
   `correoElectronico` ni el estado civil.
3. De S3 nunca se ingieren `origenProcedimiento.valor` (puede traer nombres), `descripcionHechos`,
   `observaciones` ni domicilios. De S6 se descartan los puntos de contacto (`parties[].contactPoint`).
4. Los registros individuales (S3 normalizado y el subconjunto APF de S6) solo se escriben en la
   carpeta privada que indica `--privado`, que el proceso rechaza si está dentro del repositorio.
   La demostración usa datos sintéticos (`docs/datos-sinteticos.md`).
5. El navegador de quien denuncia nunca consulta la PDN: descarga del mismo origen el fragmento
   estático de **su** entidad, que ya declara en la denuncia.
6. Los nombres de ente o área que parecen de persona o traen datos de contacto no se publican: se
   generalizan al nivel superior (área → ente → «otros entes»). La auditoría de la corrida real
   encontró «entes» de S1 capturados con el nombre completo de quien declara (a veces con «Ma.» o
   con un apellido poco frecuente) y otros con un número telefónico. El filtro
   (`NameFilter` en `pdn/normalize.py`, el mismo para fragmentos, equivalencias y compradores)
   rechaza:
   - tratamientos que anteceden a un nombre («Lic.», «Magistrado», «Ponencia», «Regidor»…);
   - teléfonos (7 o más dígitos, sin contar periodos como «2024-2027») y correos (`usuario@dominio`);
   - claves formadas solo por nombres de pila y apellidos;
   - claves de 2 a 5 palabras que empiezan con un nombre de pila (incluidas abreviaturas como «Ma.»),
     traen un apellido y no tienen ninguna palabra institucional (municipio, escuela, instituto,
     secretaría…), con un léxico amplio (nombres vistos al menos 3 veces);
   - el patrón nombre de pila + apellido (léxico de nombres vistos al menos 20 veces): en las áreas
     siempre; en los entes solo si no hay palabra institucional. Aplicarlo sin excepción a los entes
     sacaba del catálogo al IMSS, a municipios como Benito Juárez y a hospitales con nombre de
     personaje (256 000 personas, todas instituciones); con la excepción, los nombres reales siguen
     fuera.

   Los léxicos se construyen en memoria desde S1 y nunca se guardan. «@prende.mx» (programa
   federal) es una marca sin usuario, no un correo, y se conserva.

7. **Diferenciación.** En los datos abiertos de grupos, los conteos de personas se redondean a 10;
   una celda de cubetas se suprime si tiene de 1 a 4 personas o menos de 3 grupos (con 1 o 2
   grupos, el conteo y las cubetas del fragmento darían el tamaño exacto de un ente o área); los
   porcentajes llevan un decimal y se suprimen si el numerador es de 1 a 4, con supresión
   complementaria entre los porcentajes de protección (suman 100). En la matriz de cobertura, si un
   par entidad-sistema tiene periodos suprimidos, su fila «total» publica un rango en lugar del
   total exacto, y sus fechas salen solo de los periodos publicados.

## Fuentes

Descargadas el 2026-11-05 (inventario de la Etapa 0, sección 1). El inventario (`INVENTARIO.md`)
vive en la carpeta de descargas y no está versionado; sus sha256 sí lo están, en
[`fuentes.json`](fuentes.json) (`sha256Inventario`) y en `SOURCES` de `proceso/pdn/pipeline.py`. El
proceso recalcula el sha256 de cada ZIP, lo compara con el esperado y escribe el resultado en
`fuentes.json` (`sha256Calculado` y `coincide`).

| Sistema | Archivo        | URL de descarga                                                     | Bytes         | SHA-256 (inventario = calculado)                                   |
| ------- | -------------- | ------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| S1      | `PDN_S1.zip`   | <https://drive.google.com/file/d/1RSYOwWabsWqtxt7VNHIjf-yt1P5bPSbE> | 2 329 008 840 | `105d8711f2f3487c17aa355b0d6146f3b8c59b55418ee333b6402a0184506181` |
| S2      | `PDN_S2.zip`   | <https://drive.google.com/file/d/1KWcst_YLI5YVlKnzmd3Xm5prAP4NVhAD> | 19 508 703    | `3f100b9ec27e0572cb27d2ed8dd8736eeba6e101eee92c9d32d74b5268cd1562` |
| S3      | `PDN_S3v2.zip` | <https://drive.google.com/file/d/1i-HjNju04xdKThHgGDAzHb97GdF_cqS8> | 2 746 326     | `2f65931a81389fb7a776deea4b1be6e41ba5983b58ab33ee8b164f1be86ef0e8` |
| S6      | `PDN_S6.zip`   | <https://drive.google.com/file/d/1OM-P1JAp7PKeGL_InRYOQ1UO5Vpcs9Oi> | 1 068 032 180 | `fc7fc9c6340aefb0141294e3f70d65940443d0dfc653fe51aed62b678ce62b7a` |

Para descargar sin navegador: `curl -L -o PDN_S1.zip
"https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"`.
Esquemas: <https://github.com/PDNMX/api_docs>.

Las cuatro descargas suman unos 3.4 GB (S1 y S6 son casi todo), y `--privado` escribe unos 400 MB
más. **No hacen falta para usar ni para probar SIGILO**: los productos agregados de esta carpeta
están versionados y `npm run data:test` usa ZIP sintéticos generados al vuelo. Solo se necesitan
para regenerar los productos. Si falta alguno de los cuatro ZIP en `--entrada`, el proceso termina
con `Error: Faltan descargas: <rutas>` y código de salida 1, antes de escribir nada.

## Cómo replicarlo

```sh
# 1. Descarga los cuatro ZIP en una carpeta fuera del repositorio, por ejemplo ~/datos-pdn
# 2. Desde la raíz del repositorio:
python3 datos/proceso/ejecutar.py --entrada ~/datos-pdn --salida datos/ --privado ~/datos-pdn/salidas \
  --fecha-referencia 2026-11-05
# 3. Pruebas del proceso (segundos, con fixtures sintéticos; no necesitan los ZIP):
npm run data:test
```

Opciones: `--privado` es opcional (sin ella no se escriben registros individuales); `--procesos N`
(8 por omisión); `--fecha-referencia AAAA-MM-DD`; `--sin-sha`. La fecha de referencia decide qué
fechas son implausibles (futuras) y dónde termina la ventana de cada proveedor, así que debe ser la
de la descarga publicada: por omisión se toma de `fechaReferencia` en `<salida>/fuentes.json`
(2026-11-05) y, si no existe, de la fecha de modificación de los ZIP. El comando imprime en la
salida estándar un reporte JSON con cifras y tiempos. El proceso es idempotente: con las mismas
descargas y la misma fecha de referencia produce los mismos bytes (la sal efímera no cambia
conteos); solo `fechaDescarga` de `fuentes.json` refleja la fecha de los ZIP de cada quien.

Requisitos: Python 3.10 o más reciente y 400 MB libres para la carpeta privada. Con poca memoria,
usa `--procesos 2` (cada proceso de S1 guarda en memoria las personas de un proveedor).
Tiempo medido en una laptop de 10 núcleos (Apple Silicon, 16 GB) con 8 procesos: **77 s de reloj**
(411 s de CPU). S1 por proveedor tarda de 0.2 s (Veracruz) a 61 s (Jalisco); S6 APF, 74 s; S2, 4 s;
S3, 1 s; escritura de productos, 3 s.

## Productos

| Ruta                                                                             | Contenido                                                 | Tamaño        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------- |
| [`grupos-anonimato/indice.json`](grupos-anonimato/indice.json)                   | Índice de fragmentos y resumen nacional                   | 12 KB         |
| `grupos-anonimato/<clave INEGI>.json`                                            | Un fragmento compacto por entidad con S1 (22 de 33)       | 2 KB a 290 KB |
| [`cobertura/matriz.json`](cobertura/matriz.json), `matriz.csv`                   | Matriz de cobertura: entidad x sistema x año              | 223 KB, 40 KB |
| [`normalizacion/equivalencias.csv`](normalizacion/equivalencias.csv)             | Equivalencias de instituciones S2, S3 y S6 hacia S1       | 458 KB        |
| [`normalizacion/tasas.json`](normalizacion/tasas.json)                           | Tasas de coincidencia por sistema y entidad               | 13 KB         |
| [`abiertos/grupos-anonimato/`](abiertos/grupos-anonimato/metodologia.md)         | Dato abierto: cubetas y resumen, nacional y por entidad   | 8 KB          |
| [`abiertos/cobertura/`](abiertos/cobertura/metodologia.md)                       | Dato abierto: matriz de cobertura                         | 40 KB         |
| [`abiertos/contratacion-federal/`](abiertos/contratacion-federal/metodologia.md) | Dato abierto: indicadores por comprador federal y por año | 45 KB, 206 KB |
| [`fuentes.json`](fuentes.json)                                                   | Manifiesto de fuentes con sha256                          | 2 KB          |

Cada conjunto de `abiertos/` trae `diccionario.csv` (archivo, campo, tipo, descripción) y
`metodologia.md`.

Salidas privadas (fuera del repositorio, no versionadas), en la carpeta de `--privado`:

| Archivo         | Contenido                                                                                          | Tamaño                     |
| --------------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| `s3.sqlite`     | Tablas `s3_servidores` (19 928) y `s3_particulares` (34), normalizadas, con `ente_clave`           | 7 MB                       |
| `s6_apf.sqlite` | Tabla `releases`: última release por `ocid` canónico de la APF con inicio de 2018 a 2022 (546 455) | 371 609 600 bytes (372 MB) |

Se cargan desde Node con `node:sqlite` (`new DatabaseSync(ruta, { readOnly: true })`), el mismo
módulo que usa el servidor.

## Cifras clave (corrida del 2026-11-05)

- **S1:** 5 930 745 declaraciones de 24 proveedores, 0 errores de JSON. 1 974 622 personas distintas;
  unos 1.54 millones (1 544 310 redondeado a 10) con declaración vigente en su ventana de 24 meses
  (se excluyen 94 384 cuya última declaración es de conclusión).
- **Grupo de anonimato (nacional):** el **38.0 %** de las personas está en un grupo (ente, área) con
  k < 10, y el **0.5 %** en un ente con k < 10. Este 38.0 % usa la definición publicada: personas
  con declaración en los últimos 24 meses de su proveedor, adscripción de su declaración más
  reciente, sin conclusiones y con claves normalizadas que incluyen la entidad. No es la cifra del
  inventario (38.0 % histórico por proveedor, ente y área crudos; 32.0 % desde 2025): coincide por
  casualidad. Tras la generalización jerárquica, el grupo protector es el área para el 54.5 %, el
  ente para el 42.8 %, «otros entes del mismo orden de gobierno» para el 2.7 % y la entidad completa
  para menos del 0.05 %; nadie queda sin un grupo de al menos 10. Se publican
  6 665 entes y
  17 950 áreas;
  2 052 áreas y
  321 entes se suprimieron por nombre.
- **Por entidad**, el porcentaje de personas en áreas con k < 10 va de 2.3 % (Chihuahua) a 89.3 %
  (Veracruz, que solo trae 1 330 declaraciones); ver `abiertos/grupos-anonimato/resumen.csv`.
- **S2 marca contratación** en 699 entes de S1 y 89 áreas (el S2 no tiene área de adscripción; ver
  limitaciones).
- **Coincidencia de instituciones con S1** (tasa por instituciones / por registros): S2 federal
  89.2 % / 96.5 %; S6 federal 89.8 % / 97.7 %; S2 estatal 39.5 % / 39.4 % en entidades con S1;
  S3 servidores 32.2 % / 33.3 % en entidades con S1. Por entidad, S2 va de 1.5 % (EdoMex, cuyo S1
  no trae Ejecutivo ni municipios) a 94.5 % (Puebla).
- **S6 APF:** 1 060 983 releases; 568 963 procedimientos distintos tras canonizar el `ocid`;
  546 455 con inicio de 2018 a 2022, de 284 compradores. Adjudicación directa 84.2 %, licitación
  pública 9.5 %, invitación restringida 6.3 %; 1.71 billones de pesos adjudicados.

### Tamaño de los fragmentos

Ninguno pasa de 2 MB (el más grande, el federal, pesa 290 KB), así que no hizo falta una forma más
compacta. El formato ya es compacto: arreglos posicionales en lugar de objetos.

| Clave | Entidad             | Bytes   | Entes | Áreas | Ventana de 24 meses                                       |
| ----- | ------------------- | ------- | ----- | ----- | --------------------------------------------------------- |
| 00    | Federación          | 290 015 | 295   | 7 076 | BANXICO a 2026-09-11; CNDH a 2026-09-29; SFP a 2022-12-31 |
| 01    | Aguascalientes      | 42 609  | 115   | 717   | a 2026-08-20                                              |
| 02    | Baja California     | 10 976  | 65    | 195   | a 2026-07-03                                              |
| 03    | Baja California Sur | 25 229  | 71    | 537   | a 2026-09-28                                              |
| 04    | Campeche            | 2 790   | 27    | 17    | a 2025-12-03                                              |
| 07    | Chiapas             | 70 764  | 862   | 544   | a 2025-03-24                                              |
| 08    | Chihuahua           | 2 762   | 18    | 32    | a 2026-08-03                                              |
| 12    | Guerrero            | 43 659  | 613   | 183   | a 2026-09-22                                              |
| 13    | Hidalgo             | 39 778  | 92    | 816   | a 2025-11-07                                              |
| 14    | Jalisco             | 106 187 | 677   | 1 618 | a 2026-09-27                                              |
| 15    | México              | 25 098  | 7     | 403   | a 2026-09-29                                              |
| 16    | Michoacán           | 19 509  | 281   | 280   | a 2024-02-23                                              |
| 17    | Morelos             | 3 881   | 30    | 38    | a 2026-07-07                                              |
| 18    | Nayarit             | 2 135   | 5     | 36    | a 2026-06-21                                              |
| 21    | Puebla              | 233 254 | 2 807 | 2 110 | a 2026-10-07                                              |
| 23    | Quintana Roo        | 58 134  | 97    | 1 153 | a 2026-07-04                                              |
| 24    | San Luis Potosí     | 19 738  | 88    | 473   | a 2026-09-30                                              |
| 25    | Sinaloa             | 7 121   | 96    | 47    | a 2026-09-14                                              |
| 27    | Tabasco             | 31 462  | 70    | 598   | a 2026-06-09                                              |
| 29    | Tlaxcala            | 14 381  | 71    | 325   | a 2026-10-01                                              |
| 30    | Veracruz            | 3 925   | 51    | 4     | a 2022-04-01                                              |
| 32    | Zacatecas           | 38 669  | 227   | 748   | a 2026-09-01                                              |

Total: 1.1 MB para las 22 entidades. Las otras 11 aparecen en el índice con `hayDatos: false`.

## Formato del fragmento para el navegador

```json
{
  "version": 1,
  "entidad": { "clave": "14", "nombre": "Jalisco" },
  "k": 10,
  "cubetas": ["1-4", "5-9", "10-49", "50+"],
  "ventanas": [{ "proveedor": "Jalisco", "desde": "2024-09-27", "hasta": "2026-09-27" }],
  "cubetaEntidad": 3,
  "formato": { "ente": ["nombre", "cubeta", "ordenGobierno", "contratacion", "grupo", "areas"] },
  "grupos": [["M", "Otros entes municipales de Jalisco", 3, 1]],
  "entes": [
    ["Secretaría de Obras de Villa Ejemplo", 2, "E", 1, -1, [["Dirección de Compras", 2, 1]]]
  ]
}
```

(Ejemplo con nombres sintéticos.) `cubeta` es el índice en `cubetas`. En cada ente, `grupo` es -1
si el ente protege por sí mismo (k de al menos 10) o el índice en `grupos` del grupo de «otros
entes» al que se generaliza. `areas` solo lista áreas con k de al menos 10 y nombre publicable.
Regla para la interfaz: si el área de la persona aparece, su grupo es el área; si no, el ente (si
`grupo` es -1); si no, el grupo de otros entes (si `protege` es 1); si no, la entidad.
`contratacion` es 1 si el ente o el área aparece en S2.

## Normalización de instituciones (3.3)

`datos/proceso/pdn/normalize.py`, función `institution_key(nombre, entidad)`:

1. La clave **siempre lleva la entidad**: `14|SECRETARIA TURISMO` y `21|SECRETARIA TURISMO` son
   distintas.
2. Quitar sufijos de sistema (« - ecatepec», « S1»), acentos, signos, `*` y palabras vacías.
3. Expandir abreviaturas (`INST`, `SERVS`, `SRIA`, `DIR`, `DEPTO`, `COORD`, `GRAL`…).
4. Quitar «H.» y «Honorable»; unificar «Ayuntamiento», «Gobierno Municipal», «Presidencia
   Municipal» y «Municipio Libre» como `MUNICIPIO <nombre>`.
5. Quitar el nombre de la propia entidad al final («… del Estado de Puebla», «… Gobierno del
   Estado de Aguascalientes», «Gro.»), salvo en el municipio homónimo de la capital.

Equivalencias (`normalizacion/equivalencias.csv`): cada institución de S2, S3 servidores, S3
particulares y S6 se liga a un ente de S1 de la misma entidad con una cascada determinista:
coincidencia exacta; prefijo municipal (S3 escribe «Toluca» y S1 «H. Ayuntamiento de Toluca»);
similitud de texto de al menos 0.9 entre candidatos que comparten la palabra menos frecuente.
`normalizacion/tasas.json` da las tasas por entidad, federal, estatal, estatal con S1 y total.

## Decisiones

| Decisión                                                             | Por qué                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1 como fuente principal del grupo de anonimato y S2 solo como marca | S1 cubre a todo el personal obligado; S2 solo a quien interviene en contrataciones (mediana de 6 registros por institución estatal).                                                                                                 |
| Ventana de 24 meses por proveedor, desde su última declaración       | Los proveedores publican con cortes distintos (SFP solo 2022, Veracruz 2022, Michoacán 2024).                                                                                                                                        |
| Adscripción de la declaración más reciente; conclusión excluye       | Cada persona cuenta una vez y en su área actual; quien concluyó ya no comparte el grupo.                                                                                                                                             |
| No unir áreas parecidas                                              | Unirlas infla k: una falsa sensación de protección es peor que una advertencia de más.                                                                                                                                               |
| K = 10 y cubetas 1-4, 5-9, 10-49, 50+                                | Umbral recomendado en el inventario (5 como mínimo defendible); las cubetas evitan publicar conteos exactos.                                                                                                                         |
| Fragmento por entidad                                                | Descargar el fragmento solo revela la entidad que la persona ya declara en su denuncia.                                                                                                                                              |
| Áreas con k < 10 no se listan por nombre                             | Son las más identificables y las más propensas a traer nombres propios; la interfaz las trata como «generaliza al ente».                                                                                                             |
| Filtro de nombres propios conservador                                | Mejor generalizar una escuela con nombre de personaje histórico que publicar el nombre de una persona.                                                                                                                               |
| `ocid` canonizado en S6                                              | 111 014 releases sin prefijo duplican un procedimiento con prefijo (mismo comprador, fecha y método).                                                                                                                                |
| SQLite para las salidas privadas                                     | Un solo archivo, sin dependencias, legible desde Node con `node:sqlite`.                                                                                                                                                             |
| Supresión de 1 a 4 en datos abiertos                                 | Cuando la unidad es una persona (S1, S3, grupos), un conteo muy chico podría ayudar a identificarla.                                                                                                                                 |
| Redondeo a 10, un decimal y supresión complementaria                 | Con totales exactos, restar las celdas publicadas reconstruía las suprimidas; con dos decimales sobre totales chicos, el porcentaje daba el conteo. Verificado con la revisión independiente: ninguna celda de 1 a 4 se reconstruye. |
| Rango en el total de la matriz si hay periodos suprimidos            | El total exacto menos los periodos publicados reconstruía 19 celdas suprimidas; el rango solo dice lo que ya se deduce (de 1 a 4 por periodo).                                                                                       |
| Excepción institucional en el filtro de entes                        | Sin ella, la regla nombre + apellido suprimía al IMSS y a 256 000 personas en instituciones con nombre de personaje; con ella, los nombres de persona siguen fuera.                                                                  |
| Fecha de referencia fija (`fuentes.json`)                            | Con la fecha de los ZIP, una descarga posterior cambiaría qué fechas son implausibles y las ventanas.                                                                                                                                |

## Limitaciones

- **Coincidencias bajas fuera de lo federal.** Lo federal liga bien (89 % de instituciones, 96-98 %
  de registros), pero en los estados solo el 31-40 % de las instituciones de S2 y S3 encuentra su
  ente en S1. Causas: S1 de EdoMex sin Ejecutivo ni municipios, nombres de municipio sin prefijo,
  «entes» que son planteles o códigos (Puebla, Jalisco, Chiapas) y estados sin S1 (Durango,
  Guanajuato, Querétaro, Coahuila…). Sin coincidencia, la verificación debe responder «sin
  cobertura», nunca «contradicho».
- **Homónimos.** El conteo de personas usa el nombre completo dentro de cada proveedor: junta
  homónimos y separa a quien cambia la escritura de su nombre. La verificación de sanciones (S3)
  compara nombres: un homónimo puede dar un falso «confirmado»; por eso la autoridad debe revisar
  el expediente.
- **Proveedores faltantes.** La descarga de S1 no trae INAI, INE, Guanajuato, Colima, Querétaro ni
  Yucatán; S3 no trae nada federal y Sinaloa está incompleto (852 de 1 052 no graves); S6 estatal es
  simbólico (6 378 releases de 12 estados); Oaxaca aparece en el reporte de S2 pero no en la descarga.
- **S2 sin área.** El S2 no tiene área de adscripción; las áreas se marcan solo cuando el puesto de
  S2 nombra la unidad y coincide (o es prefijo) con el área de S1. Por eso solo 89 áreas quedan
  marcadas, aunque 699 entes tienen personas en S2.
- **Fechas.** Las implausibles (BCS en S6 usa 1900) se cuentan en `sin_fecha`. El S6 de la APF
  termina en enero de 2023.
- **Corte.** Todo describe la descarga del 2026-11-05; hay que volver a correr el proceso con cada
  descarga nueva.

## Código y pruebas

| Módulo (`datos/proceso/`)              | Responsabilidad                                                    |
| -------------------------------------- | ------------------------------------------------------------------ |
| `ejecutar.py`                          | Comando único                                                      |
| `pdn/pipeline.py`                      | Orquestación en paralelo, manifiesto de fuentes, carpeta privada   |
| `pdn/json_stream.py`                   | Lectura incremental de arreglos JSON gigantes dentro del ZIP       |
| `pdn/entities.py`                      | Claves INEGI y resolución de carpetas de proveedor                 |
| `pdn/normalize.py`                     | Normalización de instituciones y áreas; filtros de nombres propios |
| `pdn/s1.py`, `s2.py`, `s3.py`, `s6.py` | Un adaptador por sistema                                           |
| `pdn/anonymity.py`                     | Generalización jerárquica y fragmentos                             |
| `pdn/coverage.py`                      | Matriz de cobertura y notas de calidad                             |
| `pdn/matching.py`                      | Cascada de equivalencias                                           |
| `pdn/products.py`                      | Escritura de productos y datos abiertos                            |
| `tests/`                               | `unittest` con ZIP sintéticos generados al vuelo (`fixtures.py`)   |

Las pruebas (`npm run data:test`, incluidas en `npm run check` y en CI) verifican normalización,
fechas, cubetas, lectura en streaming, equivalencias, la generalización, la supresión, la última
release por `ocid`, que ninguna salida pública contenga nombres, CURP, RFC, teléfonos ni el texto de
`origenProcedimiento.valor`, que las bases privadas tampoco lo contengan, el filtro de nombres con
casos sintéticos equivalentes a los encontrados en la corrida real («Ma.» más apellidos, apellidos
poco frecuentes, solo nombres), el redondeo y la supresión complementaria, el rango del total de la
matriz, la idempotencia, la fecha de referencia tomada de `fuentes.json` y que la carpeta privada no
pueda estar dentro del repositorio. La normalización tiene una prueba cruzada con
`packages/anonimato` (TypeScript), que incluye los caracteres que `strip()` y `trim()` tratan
distinto (U+FEFF, U+001C a U+001F y U+0085).

Los scripts de perfilado de la Etapa 0 (`INVENTARIO.md` y `scripts/` en la carpeta de descargas,
no versionados; los sha256 del inventario están en [`fuentes.json`](fuentes.json)) dieron las rutas de campo y las recomendaciones; `json_stream.py` y la normalización básica
provienen de ellos.
