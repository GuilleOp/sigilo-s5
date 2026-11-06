# Metodología: indicadores de contratación por comprador federal

Conjunto nuevo de datos abiertos con indicadores agregados por institución compradora de la
Administración Pública Federal, derivados del S6 (contrataciones abiertas, OCDS) de la PDN. Da
contexto a la ficha de una denuncia («esta institución adjudica de forma directa el 99 % de sus
procedimientos») sin señalar a ninguna persona.

## Archivos

| Archivo                          | Contenido                                 |
| -------------------------------- | ----------------------------------------- |
| `indicadores-comprador.csv`      | Una fila por comprador, 2018 a 2022       |
| `indicadores-comprador-anio.csv` | Una fila por comprador y año de inicio    |
| `diccionario.csv`                | Campo, tipo y descripción de cada columna |

## Construcción

1. Solo `apf_releases.json` (los archivos estatales son ejemplos casi vacíos).
2. El S6 trae releases, no registros compilados: un procedimiento (`ocid`) aparece varias veces.
   Se conserva la **última release por `ocid`** según `date`.
3. Antes de deduplicar, el `ocid` se canoniza: 144 864 releases traen el `ocid` sin prefijo
   (`-2559792`); 111 014 de ellas tienen un gemelo `ocds-07smqs-2559792` con el mismo comprador,
   fecha de inicio y método, así que son el mismo procedimiento. Sin este paso, 2021 y 2022 se
   contarían casi dos veces.
4. Se conservan los procedimientos cuya fecha de inicio (`tender.tenderPeriod.startDate` de su
   última release) cae entre 2018 y 2022, los cinco años completos de la descarga.
5. Por comprador (`buyer.id`, con su nombre más frecuente): número de procedimientos, porcentaje por
   `tender.procurementMethod` (`open` licitación pública, `selective` invitación restringida,
   `direct` adjudicación directa) y suma de `awards[].value.amount` en MXN.
6. El comprador se liga a S1 y S2 con la misma normalización de instituciones (`en_s1`, `en_s2`).

## Privacidad

Solo agregados por institución. No incluye proveedores adjudicados, RFC, nombres de personas ni
datos de contacto. Como la unidad es la institución y no una persona, no hace falta suprimir celdas.
El nombre del comprador pasa por el mismo filtro de datos de contacto que los fragmentos (teléfonos
y correos `usuario@dominio`); «Coordinación General @prende.mx» es la marca de un programa federal,
sin usuario, y se conserva.

## Limitaciones

- La descarga del S6 termina en enero de 2023; no hay datos posteriores de la APF.
- El monto excluye adjudicaciones en otras monedas (columna `adjudicaciones_otra_moneda`).
- `tender.procurementMethodDetails` nunca viene; el fundamento legal está en
  `procurementMethodRationale`, que no se agrega aquí.
