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

Por omisión, SIGILO **no usa modelos de inteligencia artificial** en su funcionamiento y **nunca**
envía datos a servicios de inteligencia artificial de terceros. El auditor de la autoridad
(`packages/auditor`, [ADR 0009](adr/0009-ia-local.md)) funciona con reglas deterministas y públicas,
y admite un modelo abierto local opcional, desactivado por omisión.

| Aspecto            | Declaración                                                                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalidad          | Ayudar a vigilar que las denuncias no se entierren: señalar acuerdos de cierre con texto de plantilla, archivos que no consideran pruebas o datos públicos confirmados, calificaciones degradadas, plazos y patrones por autoridad; y orientar sobre la conducta. |
| Alcance            | Corre en el nodo de la autoridad. Las reglas AUD-01 a AUD-08 no son IA: son cálculos que cualquiera puede leer y recalcular con los umbrales de `packages/auditor/config/umbrales.json`.                                                                          |
| Modelo opcional    | Un modelo de pesos abiertos, pequeño, que corre en CPU en la misma máquina (Ollama o llama.cpp server en 127.0.0.1), sin costo y sin terceros. Está desactivado por omisión; si no está instalado o falla, el auditor sigue solo con reglas.                      |
| Qué hace el modelo | Dos tareas orientativas: sugerir claves del catálogo de conductas con el fragmento del relato que las apoya, y explicar con motivos de una lista cerrada por qué un acuerdo parece genérico.                                                                      |
| No ve identidades  | Recibe solo los hechos que la autoridad ya ve, después de Huella Cero, y con correos, teléfonos y claves tipo RFC/CURP quitados. Nunca recibe la identidad sellada, los mensajes del buzón ni datos de contacto.                                                  |
| No decide          | Toda salida es una señal con evidencia y la nota «Esta señal no decide nada: la decisión es de las reglas públicas o de una persona». No cambia estados, no cierra, no turna, no prioriza y no oculta señales de las reglas.                                      |
| Lenguaje           | Nunca llama «falsa» a una denuncia ni «culpable» a una persona.                                                                                                                                                                                                   |
| Seguridad          | El texto va como dato delimitado; la salida se valida con zod contra un esquema estricto y contra el propio texto; cualquier salida fuera del esquema se descarta; el modelo no tiene herramientas, red ni memoria.                                               |
| Registro           | Cada señal, sugerencia o descarte deja un registro de bitácora con la versión de las reglas o el digesto del modelo y los digestos de la entrada y la salida, nunca el texto.                                                                                     |
| Evaluación         | Publicada en `packages/auditor/EVALUACION.md` (`npm run auditor:eval`). El modelo real no se ha evaluado porque no hay uno instalado en la máquina de desarrollo; las defensas se prueban con un doble que simula respuestas, incluidas maliciosas.               |

Si una autoridad activa el modelo, debe registrar su nombre, licencia y digesto en la
configuración y publicar su evaluación con el mismo conjunto. La declaración de uso de IA en el
desarrollo del proyecto (secciones anteriores) sigue vigente: el auditor, sus pruebas y su
evaluación también se escribieron con asistentes de IA bajo la dirección y revisión del autor.
