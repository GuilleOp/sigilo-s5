# @sigilo/anonimato

Grupo de anonimato en el navegador de quien denuncia: cuántas personas comparten su ente y su
área, en cubetas, a partir del catálogo estático de `datos/grupos-anonimato/` (ADR 0008).

## Garantías

- **Un solo fragmento por denuncia.** `createAnonymityLoader` pide `indice.json` y, como máximo, el
  fragmento de la entidad que la persona declara. Si se le pide otra entidad, lanza un error en
  lugar de descargarla. Para otra denuncia se crea otro cargador.
- **Mismo origen.** La ruta base debe empezar con `/` (no acepta `//`, esquemas ni `:`). El `fetch`
  se inyecta, así que la web lo sirve desde su propio origen; el paquete nunca consulta la PDN ni
  servicios externos.
- **Integridad.** Si el índice trae el SHA-256 del fragmento, se comprueba antes de usarlo.
- **Honestidad.** Sin datos de la entidad, o sin el ente en el fragmento, el riesgo es `unknown` y
  el texto lo dice («No tenemos datos…; por precaución…»). Nunca se supone un grupo grande.
- **Misma normalización que `datos/proceso`.** `institutionNameKey` y `areaKey` replican
  `pdn/normalize.py`; `normalize.test.ts` ejecuta el propio Python y compara las cadenas.

## Uso

```ts
import {
  assessAnonymityGroup,
  createAnonymityLoader,
  fragmentKeyFor,
  withAnonymityFactor,
} from '@sigilo/anonimato';
import { assessRisk } from '@sigilo/huella';

const loader = createAnonymityLoader({ fetch: (url) => fetch(url) }); // uno por denuncia
const data = await loader.loadState(fragmentKeyFor(stateCode, entity.level === 'federal'));
const group = assessAnonymityGroup(data, { ente: entity.name, area }); // área opcional
const risk = withAnonymityFactor(assessRisk(signals), group); // mismo tipo que assessRisk
```

Los entes federales están en el fragmento `00`: descargarlo solo revela que el ente es federal,
lo mismo que ya revela el destino del sobre.

## Regla de evaluación

| Caso                                                     | Nivel              | Riesgo                                        |
| -------------------------------------------------------- | ------------------ | --------------------------------------------- |
| El área aparece (k de al menos 10)                       | `area`             | 50+ bajo; 10-49 medio                         |
| Sin área; el ente protege por sí mismo                   | `ente`             | 50+ bajo; 10-49 medio                         |
| Área indicada que no aparece (k < 10 o escrita distinto) | `ente`             | ente 50+ medio; ente 10-49 alto               |
| El ente tiene menos de 10 personas                       | `government-order` | alto (aunque el grupo de otros entes proteja) |
| Entidad sin datos o ente que no está                     | `none`             | desconocido                                   |

`isContracting` usa la marca de S2 del área encontrada o, si no, la del ente. Las acciones
sugeridas son generalizar el relato (siempre), diferir el envío (medio, alto y desconocido) y
considerar la custodia (alto y desconocido). Los textos evitan el alarmismo.

## Integración con el semáforo de Huella Cero

`withAnonymityFactor(assessRisk(...), group)` agrega una razón y vuelve a clasificar con
`THRESHOLD_MEDIUM` y `THRESHOLD_HIGH` de `@sigilo/huella/risk`, sin cambiar su API. Pesos:
`WEIGHT_ANONYMITY_HIGH` = 35 (solo llega a medio; con un dato identificable en el texto, a alto),
`WEIGHT_ANONYMITY_MEDIUM` = 15, `WEIGHT_ANONYMITY_UNKNOWN` = 25 (llega a medio: sin datos no se
muestra riesgo bajo) y `WEIGHT_ANONYMITY_LOW` = 0.

## Datos sintéticos

`@sigilo/anonimato/demo` exporta `DEMO_INDEX`, `DEMO_FEDERAL_FRAGMENT`, `DEMO_STATE_FRAGMENT` y
`DEMO_FILES` con el formato real y nombres ficticios: en el IFFE, el Departamento de Compras (5
personas, `docs/demo-escenario.md`) no aparece, así que Marta ve «Tu grupo es pequeño».
