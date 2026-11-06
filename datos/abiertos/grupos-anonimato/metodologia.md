# Metodología: grupos de anonimato

Conjunto nuevo de datos abiertos que mide, por entidad federativa, qué tan grande es el grupo de
personas servidoras públicas con el que se confunde quien denuncia desde dentro de su institución.
Se deriva del S1 (declaraciones patrimoniales y de intereses) de la Plataforma Digital Nacional.

## Archivos

| Archivo           | Contenido                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `cubetas.csv`     | Por ámbito (nacional o entidad) y nivel (área o ente): grupos y personas en cada cubeta de tamaño |
| `resumen.csv`     | Por ámbito: personas, entes, porcentajes de personas en grupos con k < 10 y nivel protector       |
| `diccionario.csv` | Campo, tipo y descripción de cada columna                                                         |

## Unidad y ventana

- **Unidad:** persona distinta. Se identifica con un hash efímero del nombre y los apellidos
  normalizados, con una sal aleatoria nueva en cada ejecución, dentro de cada proveedor. El hash
  solo vive en memoria y nunca se guarda. De `datosGenerales` no se extrae ningún otro campo.
- **Ventana:** los últimos 24 meses de declaraciones disponibles de cada proveedor, contados desde
  su fecha de declaración más reciente (`metadata.actualizacion`). La SFP solo trae 2022, así que su
  ventana termina en diciembre de 2022.
- **Adscripción:** la de la declaración más reciente de cada persona. Si esa declaración es de
  conclusión, la persona ya dejó el cargo y no se cuenta.

## Grupos y generalización jerárquica

1. Clave del ente: nombre normalizado dentro de su entidad (ver `datos/README.md`, «Normalización»).
   Clave del área: área de adscripción normalizada (sin códigos de plaza, abreviaturas expandidas).
   Las áreas parecidas **no** se unen: unirlas inflaría k y daría una falsa sensación de protección.
2. Se cuenta k (personas distintas) por (entidad, ente, área) y por (entidad, ente).
3. El grupo protector de cada persona es el nivel más fino con k de al menos 10:
   el **área** si tiene k de al menos 10 y su nombre es publicable; si no, el **ente**; si el ente
   tiene menos de 10, el grupo de **otros entes del mismo orden de gobierno** de la entidad; si
   tampoco llega, la **entidad**.
4. Un nombre de área o de ente no se publica si contiene un tratamiento que suele preceder a un
   nombre propio (Lic., Magistrado, Ponencia, Regidor…) o si parece un nombre de persona según un
   léxico de nombres y apellidos construido en memoria a partir del S1 y nunca guardado (solo
   nombres y apellidos; o una clave corta que empieza con un nombre de pila, incluida la abreviatura
   «Ma.», sin ninguna palabra institucional; o nombre de pila seguido de apellido, que en los entes
   solo cuenta si no hay palabra institucional, para conservar «Municipio de Benito Juárez»), o si
   contiene un teléfono o un correo. Esas áreas y entes se generalizan al nivel superior. Detalle en
   `datos/README.md`, «Reglas de privacidad».

## Privacidad

- Los fragmentos para el navegador (`datos/grupos-anonimato/`) publican cubetas (1-4, 5-9, 10-49,
  50+), nunca conteos exactos.
- Los conteos de personas se publican redondeados a 10 (en `cubetas.csv` y en `resumen.csv`), para
  que el total menos las celdas publicadas no reconstruya una celda suprimida.
- En `cubetas.csv` se suprime `personas` (`personas_suprimido = 1`) si la celda tiene de 1 a 4
  personas o menos de 3 grupos: con 1 o 2 grupos, el conteo y las cubetas de cada ente o área del
  fragmento darían el tamaño exacto de un grupo nombrado.
- Los porcentajes llevan un decimal y se dejan vacíos si su numerador es de 1 a 4. Como los cinco
  porcentajes de protección suman 100, si uno se suprime también se suprime el menor de los demás
  distintos de cero (supresión complementaria).
- Se verificó con la revisión independiente de la Etapa 3 que ninguna celda o porcentaje permite
  reconstruir un conteo de 1 a 4.
- No contiene nombres, hashes ni identificadores de personas.

## Limitaciones

- Homónimos dentro de un proveedor se cuentan como una persona; una persona que cambia la escritura
  de su nombre se cuenta dos veces. Ambos efectos son pequeños frente a los tamaños de grupo.
- Faltan proveedores en la descarga masiva (INAI, INE, Guanajuato, Colima, Querétaro y Yucatán) y
  las entidades sin S1 no tienen fragmento. EdoMex solo trae 7 entes.
- En Puebla, Jalisco y Chiapas el «ente» suele ser un plantel o un código; se usa tal como viene.
- El filtro de nombres propios es conservador: suprime también áreas con nombres de personajes
  históricos (escuelas, hospitales), que solo se generalizan al ente.
