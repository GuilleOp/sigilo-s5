# Declaración de uso de inteligencia artificial

Conforme a las bases del Datatón Anticorrupción 2026, se declara el uso de herramientas de
inteligencia artificial en este proyecto.

## Herramienta

Claude Code, de Anthropic, usado como asistente. Durante el desarrollo se usaron varias instancias
(agentes) en paralelo, cada una con una tarea y un conjunto de archivos acotados.

## Uso

| Actividad     | Uso de la herramienta                                            |
| ------------- | ---------------------------------------------------------------- |
| Análisis      | Revisión de las bases, del reto y de riesgos de reidentificación |
| Diseño        | Propuestas de arquitectura, modelo de amenazas y alcance         |
| Código        | Generación y revisión de código bajo especificaciones del autor  |
| Documentación | Redacción y edición de documentos técnicos                       |
| Revisión      | Revisiones de seguridad, de calidad de código y de accesibilidad |

## Control humano

- El autor dirigió cada tarea, definió el alcance y tomó las decisiones de diseño.
- Los hallazgos de las revisiones se corrigieron y quedaron registrados en el
  [modelo de amenazas](modelo-de-amenazas.md) y en el [registro de cambios](../CHANGELOG.md).
- Las pruebas automatizadas (unitarias y E2E) validan el comportamiento del código, sin importar
  quién lo escribió.
- El autor es responsable de revisar el código y la documentación antes de la entrega.

## Datos

No se compartieron con la herramienta datos personales reales ni información reservada o
confidencial. El proyecto usa exclusivamente [datos sintéticos](datos-sinteticos.md).

## Responsabilidad

La responsabilidad sobre el contenido, el funcionamiento y la originalidad del proyecto es
exclusivamente del autor.

## La aplicación

SIGILO no usa modelos de inteligencia artificial en su funcionamiento ni envía datos a servicios de
inteligencia artificial.
