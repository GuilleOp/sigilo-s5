# Plan de trabajo

Metodología: entregas incrementales por etapas, decisiones registradas en ADR, integración continua,
definición de terminado común (ver `convenciones.md`) y revisión de cada etapa contra la
[matriz de requisitos](requisitos.md).

## Fase 1: capa de anonimato (concluida, v0.9)

| Hito              | Periodo         | Objetivo                                          |
| ----------------- | --------------- | ------------------------------------------------- |
| S0 Fundación      | 05-11 oct       | Repositorio, convenciones, contratos, CI          |
| S1 Núcleo         | 12-18 oct       | `core` y `huella` con pruebas                     |
| S2 Servidor       | 19-25 oct       | API, bitácora, buzón y datos abiertos             |
| S3 Interfaz       | 26 oct - 01 nov | Denuncia, seguimiento y panel de autoridad        |
| S4 Endurecimiento | 02-04 nov       | Pruebas E2E, accesibilidad, revisión de seguridad |

## Fase 2: Estándar S5 y red de producción (concluida, v1.0.0 a v1.1.0)

| Etapa                       | Periodo   | Objetivo                                                                                                                              |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Preparación               | 05 nov    | Matriz de requisitos, ADR 0005 a 0010, inventario de datos de la PDN, escenario sintético                                             |
| 1 Estándar y validador      | 05-07 nov | OpenAPI, diccionario de datos, catálogo de estados y plazos, perfiles de seguridad y privacidad, validador                            |
| 2 Red federada y ventanilla | 06-09 nov | Directorio, enrutador ciego, nodos, turnado, plazos y escalamiento, diseño visual, `docker compose`                                   |
| 3 Datos de la PDN           | 06-09 nov | Grupos de anonimato, matriz de cobertura, contexto y verificaciones, datos abiertos nuevos                                            |
| 4 Diferenciadores           | 08-10 nov | Corroboración ciega, integridad, auditor, observatorio, componentes para Next.js                                                      |
| 5 Endurecimiento            | 10-11 nov | E2E del recorrido completo, accesibilidad, seguridad, replicación en entorno limpio. Congelamiento de funciones el 11 nov a las 18:00 |
| 6 Entregables               | 11-13 nov | Presentación ejecutiva, documentación, guion y video; versión 1.1.0 con instalación de producción y Estándar S5 0.3.0                 |

Fecha límite oficial: 13 de noviembre de 2026, 23:59 (hora del centro de México). Presentación: 17 y
18 de noviembre.

## Niveles de entrega

- **A, funcionando:** se demuestra en vivo y tiene pruebas.
- **B, prototipo:** funciona con datos sintéticos y alcance acotado.
- **C, diseño documentado:** especificación y hoja de ruta.

Si el tiempo no alcanza, se recorta de B a C, nunca de A. El nivel de cada función está en la matriz
de requisitos y en los ADR 0005 a 0010.

## Proceso por tarea

1. Implementación en una rama propia.
2. Controles automáticos: formato, lint, tipos, pruebas unitarias, E2E y axe.
3. Revisión de código, de seguridad (si hay criptografía o datos) y de accesibilidad (si hay interfaz).
4. Corrección e integración a `dataton-v1`; al cierre de cada etapa, revisión contra la matriz e
   integración a `main`.
