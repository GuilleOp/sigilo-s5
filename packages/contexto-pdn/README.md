# @sigilo/contexto-pdn

Contexto de la PDN para el **nodo y el panel de la autoridad** (nunca para el navegador de quien
denuncia): verificaciones con tres resultados, conflicto de interés antes de turnar, contratos
citados, lista tipo 69-B, sanciones y ficha de contexto con prioridad explicable (ADR 0007, 0008
y 0010). Funciones puras y síncronas; los textos para la autoridad están en español y citan la
fuente y la fecha de cada dato («S6 federal, datos a enero de 2023»).

## Tres resultados

`confirmed`, `contradicted` y `no_coverage`. Antes de opinar, `assessCoverage` consulta la matriz
de cobertura (`datos/cobertura/matriz.json`, con `parseCoverageMatrix`) y el alcance de la fuente.
Motivos de `no_coverage`:

| Motivo                      | Cuándo                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `state-without-system`      | La matriz no tiene datos del sistema en la entidad, o la fuente no cubre la entidad                |
| `institution-not-connected` | La institución no está entre las conectadas a la fuente                                            |
| `period-out-of-range`       | La fecha está fuera del periodo de la fuente                                                       |
| `record-not-found`          | La fuente cubre todo, pero el registro no está                                                     |
| `ambiguous-record`          | Hay varios registros con el mismo expediente en la institución y ninguno es de la persona señalada |

**La ausencia nunca es evidencia:** un registro que no aparece es `no_coverage` con
`record-not-found`, nunca `contradicted`. Los números de expediente se repiten entre entidades y
entes (en la descarga real hay 37 repetidos entre entidades), así que `findByFileNumber` recibe la
entidad y `verifySanction` solo compara registros de la misma entidad y, si el registro trae
`institutionKey`, de la misma institución; nunca toma el primero a ciegas. Cada `no_coverage` trae fuentes alternativas que la
autoridad puede consultar por su cuenta; el sistema no las consulta.

## Reglas

| Función                                  | Qué hace                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkConflictOfInterest`                | Organizaciones declaradas en común en S1 entre la persona titular de la autoridad destino y la denunciada (muestra nombres, no porcentajes) y cadena de mando de S2 (hasta 5 niveles). `blocksRouting` es siempre `false`; exige excusa o justificación (LGRA, art. 58). |
| `verifyCitedContract`                    | Existe, comprador, proveedor y tipo de procedimiento contra S6. Con diferencias: «Inconsistente con registros públicos». Nunca «falsa». El monto se muestra, no se compara (IVA y modificaciones lo cambian).                                                            |
| `extractContractClaims`                  | Ayuda conservadora: extrae del relato el `ocid`, el tipo de procedimiento y el monto.                                                                                                                                                                                    |
| `checkTaxList`, `checkContractSuppliers` | Proveedor en la lista tipo 69-B por RFC (no por nombre, por homónimos).                                                                                                                                                                                                  |
| `verifySanction`                         | Sanción declarada contra S3: persona y tipo de sanción.                                                                                                                                                                                                                  |
| `checkUnverifiableSanction`              | «Sanción no verificable» SOLO si la autoridad declaró una sanción, la fuente cubre a esa institución (resultado `record-not-found`) y pasó el plazo de publicación (`publicationDeadlineDays`, 30 por omisión).                                                          |
| `buildContextSheet`                      | Ficha de contexto con prioridad explicable: puntaje entero, factores con sus puntos, su razón y su fuente.                                                                                                                                                               |

## Prioridad explicable

La configuración es declarativa (`PRIORITY_CONFIG`) y se publica en
[`config/prioridad.json`](config/prioridad.json); una prueba exige que sean idénticas.

| Factor                        | Peso                                | Fuente                                                   |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `offense-grave`               | 30                                  | Catálogo de conductas                                    |
| `contract-direct-award`       | 15                                  | S6                                                       |
| `contract-large-amount`       | 10 (desde $1,000,000 MXN)           | S6                                                       |
| `supplier-tax-list-69b`       | 20                                  | Lista tipo 69-B                                          |
| `independent-corroboration`   | 10 por persona adicional, tope 30   | Externa (corroboración ciega y señales de independencia) |
| `possible-campaign`           | 0 (el grupo cuenta como una fuente) | Externa                                                  |
| `public-record-inconsistency` | 0 (la autoridad lo revisa)          | S6                                                       |
| `conflict-of-interest`        | 0 (alerta y escalamiento)           | S1 y S2                                                  |

Umbrales: alta desde 60, media desde 30. En el escenario, Marta suma 85 (alta) y cada denuncia del
atacante 30 (media).

## Fuentes

- `@sigilo/contexto-pdn/synthetic`: `createSyntheticSources({ today })` con los datos de
  `docs/demo-escenario.md`, sección 5 (S1, S2, `s3.federal`, `s3.queretaro`, S6 y lista tipo
  69-B), `SYNTHETIC_COVERAGE_MATRIX` y el Estado Ejemplo con la clave sintética `EJ`. Cada S3 solo
  expone las resoluciones con fecha igual o anterior a `today`.
- `@sigilo/contexto-pdn/sqlite` (solo Node): `openSqliteSources({ s3Path, s6Path })` abre en solo
  lectura las salidas privadas de `datos/proceso` (`s3.sqlite`, `s6_apf.sqlite`). Una ruta que no
  existe desactiva esa fuente (`disabled`); nunca se crea una base. El alcance (entidades,
  instituciones y periodo) se deduce de la base. S6 cita «datos a enero de 2023» por omisión
  (`s6DataAsOf`).
- `pickSource(sources, stateCode)` elige la fuente que cubre la entidad.

## Pruebas

Solo con datos sintéticos: el escenario completo (`scenario.test.ts`), unidades y la matriz real del
repositorio para verificar el formato (`units.test.ts`), y SQLite con bases temporales creadas en la
prueba (`sqlite-sources.test.ts`).
