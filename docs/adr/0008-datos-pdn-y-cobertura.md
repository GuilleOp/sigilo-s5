# 0008. Datos de la PDN y cobertura

- Estado: aceptada
- Fecha: 2026-11-05

## Contexto

El reto pide explotar los datos de la PDN para valor público. SIGILO los usa para proteger a quien
denuncia (grupo de anonimato), para vigilar a la autoridad (conflicto de interés, verificación de
sanciones) y para dar contexto (contrataciones). Tres restricciones:

1. **Datos reales.** El repositorio, las pruebas y la demo usan solo datos sintéticos
   (`docs/datos-sinteticos.md`). Los sistemas de la PDN contienen datos personales de personas
   servidoras públicas y particulares, sujetos a la LGPDPPSO (publicada el 20-03-2025).
2. **Cobertura desigual.** Verificado el 2026-11-05 en los reportes de cobertura y la API de la PDN,
   y contado registro por registro en las descargas masivas (inventario de la Etapa 0 y
   `datos/README.md`). Donde difieren, manda la descarga:

   | Sistema                         | Reportes y API                                            | Descarga masiva (conteo completo)                                                                                                                                                   |
   | ------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | S1 Declaraciones                | 30 proveedores                                            | 5 930 745 declaraciones de 24 proveedores (~1.97 millones de personas). Faltan INAI, INE, Guanajuato, Colima, Querétaro y Yucatán. Participación en empresas en el 0.46 %.          |
   | S2 Servidores en contrataciones | 778 instituciones de 15 proveedores (la SFP y 14 estados) | 233 428 registros; 88 % es SABG federal con esquema propio (persona por ejercicio, 2015-2025) y 27 proveedores estatales y autónomos. Oaxaca está en el reporte, no en la descarga. |
   | S3 Servidores sancionados       | 678 instituciones, de las que 40 % están conectadas       | 19 928 expedientes de 18 estados, **sin federales**. Sinaloa incompleto (852 de 1 052 no graves).                                                                                   |
   | S3 Particulares sancionados     | 3 instituciones                                           | 34 expedientes de 10 estados.                                                                                                                                                       |
   | S6 Contrataciones               | Solo federal, ciclos 2015 a 2021                          | 1 060 983 releases de la APF = 568 963 procedimientos (última release por `ocid`), con inicio de 2015 a enero de 2023; 12 estados casi vacíos (6 378 releases).                     |

   La búsqueda de S2 requiere indicar proveedor. Que una persona no aparezca en S3 puede significar
   que no tiene sanciones o que su institución no está conectada. Los datos personales que no
   deberían ser públicos (CURP, RFC o teléfono en ~5 % de S1; nombres en `origenProcedimiento.valor`
   de S3) nunca se ingieren.

3. **Consultas que delatan.** Si el navegador de quien denuncia consultara la PDN por el nombre de
   la persona denunciada, la consulta misma (quién busca a quién y cuándo) revelaría la intención
   de denunciar a la PDN y a cualquiera que observe la red.

## Decisión

| Parte                                             | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Nivel |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Procesamiento fuera del repositorio               | Los scripts de descarga y agregación viven en el repositorio; los datos reales (descargas masivas y respuestas de la API) se guardan en un directorio local ignorado por git y nunca se versionan. En el repositorio solo entran agregados sin nombres (conteos por ente, entidad y periodo) con su fecha de corte.                                                                                                                                                                 | A     |
| Uso solo agregado                                 | S1 y S2 dan el tamaño del grupo de anonimato (cuántas personas comparten ente y área); S6 da la ficha de contexto del ente; S3 da conteos para la matriz de cobertura. Los registros individuales solo se consultan del lado de la autoridad, en su nodo, para conflicto de interés y verificación de sanciones.                                                                                                                                                                    | A     |
| Tres resultados                                   | Toda verificación contra la PDN devuelve **confirmado** (hay un registro que coincide), **contradicho** (hay un registro que contradice lo afirmado) o **sin cobertura** (la fuente no cubre el ente o el periodo, o no hay registro). El motivo de «sin cobertura» se muestra. La ausencia nunca es evidencia.                                                                                                                                                                     | A     |
| Matriz de cobertura                               | Para cada entidad, sistema (S1, S2, S3 servidores, S3 particulares, S6) y año: si hay datos, registros, proveedores, fechas mínima y máxima y notas de calidad (descargas incompletas, fechas fecha de relleno, proveedores faltantes), con fecha de corte (`datos/cobertura/`). Se publica como dato abierto y alimenta el resultado «sin cobertura».                                                                                                                              | A     |
| Fuentes alternativas                              | Cuando no hay cobertura, el panel sugiere fuentes que la autoridad puede consultar por su cuenta (portales de transparencia, registros estatales de sancionados, sistemas estatales de compras, DOF y periódicos oficiales). El sistema no las consulta automáticamente.                                                                                                                                                                                                            | A     |
| El navegador de quien denuncia no consulta la PDN | Lo que ese navegador necesita (por ejemplo, el tamaño del grupo de anonimato) llega como catálogo estático agregado, servido desde el mismo origen y fragmentado por entidad federativa (`datos/grupos-anonimato/<clave>.json`): descargar el fragmento solo revela la entidad que la persona ya declara en su denuncia, nunca el ente ni el área. La prueba E2E `no-third-party` lo garantiza.                                                                                     | A     |
| Grupo de anonimato                                | Personas distintas de S1 en los últimos 24 meses de cada proveedor, por (entidad, ente, área), con generalización jerárquica hasta k de al menos 10, publicadas en cubetas (1-4, 5-9, 10-49, 50+). Medido en la descarga: el 38.0 % de las personas está en áreas con k < 10 y el 0.5 % en entes con k < 10 (ventana de 24 meses por proveedor, claves normalizadas con entidad); tras generalizar, nadie queda en un grupo menor a 10. S2 marca los entes y áreas de contratación. | A     |
| Adaptadores de la API de la PDN                   | Clientes de S1, S2, S3 y S6 para el nodo de la autoridad, probados contra respuestas sintéticas con el esquema de `PDNMX/api_docs`.                                                                                                                                                                                                                                                                                                                                                 | B     |

## Alternativas consideradas

| Alternativa                                   | Por qué no                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Versionar extractos reales de la PDN          | Pondría nombres de personas reales en el repositorio y en cada copia, en contra de las reglas de datos sintéticos y de la LGPDPPSO.    |
| Consultar la PDN desde el navegador ciudadano | La consulta delata la intención de denunciar; además sería una petición a un tercero.                                                  |
| Dos resultados (sí o no)                      | Con 40 % de instituciones conectadas en S3 y sin datos federales en su descarga, un «no» sin cobertura acusaría o exoneraría sin base. |
| No usar la PDN                                | Se pierden el grupo de anonimato, el conflicto de interés y la verificación de sanciones.                                              |

## Consecuencias

### Positivas

- Los datos de la PDN protegen a quien denuncia y vigilan a la autoridad sin exponer a nadie.
- La matriz de cobertura es en sí misma un dato abierto nuevo sobre la PDN.
- Cualquiera puede replicar los agregados con los scripts y las descargas públicas.

### Negativas

- Los agregados envejecen; cada uno lleva fecha de corte y debe regenerarse.
- La demo muestra resultados con datos sintéticos; los agregados reales solo se ven donde se
  ejecuten los scripts.
- Los grupos de anonimato dependen de que S1 y S2 cubran el ente; sin cobertura, el semáforo de
  riesgo lo dice en lugar de estimar.

### Riesgos

- Un agregado con celdas pequeñas puede identificar (un área con una sola persona). Los agregados
  aplican la misma supresión que los datos abiertos (`docs/criptografia.md`, «Datos abiertos»).
- Los nombres en la PDN no tienen identificador único estable: homónimos y variantes afectan el
  conflicto de interés y las verificaciones. Las instituciones tampoco: con la clave normalizada que
  incluye la entidad, S2 y S6 federales coinciden con S1 en el 89 % de las instituciones, pero en los
  estados solo el 31-40 % de S2 y S3 encuentra su ente en S1 (`datos/normalizacion/tasas.json`).
- Algunos campos de texto de la PDN traen nombres de personas donde debería ir una institución
  (por ejemplo, «entes» de S1 capturados con el nombre de quien declara). Los productos filtran esos
  nombres antes de publicar.
- Los reportes de cobertura pueden no reflejar la completitud real de cada institución conectada;
  por eso «sin registro» se trata como «sin cobertura».
