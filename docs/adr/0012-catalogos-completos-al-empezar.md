# 0012. Catálogos completos al empezar la denuncia

- Estado: aceptada (precisa el ADR 0008 en la descarga del grupo de anonimato)
- Fecha: 2026-11-16

## Contexto

El paso 1 promete «Compruébalo tú: pon tu teléfono en modo avión». En el recorrido en vivo la promesa
no se cumplía: con la red cortada después de abrir la página, el paso 2 decía «No pudimos cargar
las instituciones de Querétaro…», porque el fragmento de entes de la entidad
(`/datos/entes/<clave>.json`) se pedía al elegir el estado, y el grupo de anonimato
(`/datos/grupos-anonimato/indice.json` y `<clave>.json`) al llegar a la revisión.

El ADR 0008 justificaba la descarga por entidad con que «solo revela la entidad que la persona ya
declara». Es cierto para el contenido, pero el patrón de peticiones sí dice algo: quien observe el
servidor (o la red, por el tamaño de la respuesta) ve qué fragmento pidió cada visita y cuándo, antes
de que exista denuncia alguna. Por eso el cargador del grupo de anonimato se negaba a descargar un
segundo fragmento («otra entidad»): dos peticiones acotaban aún más dónde estaba la persona.

## Decisión

| Parte                       | Decisión                                                                                                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuándo                      | Al entrar a «Denunciar» (paso 1, todavía con conexión) la web descarga, sin bloquear la pantalla, los 33 fragmentos de entes (federal y 32 entidades, unos 110 KB comprimidos) y el índice con todos los fragmentos del grupo de anonimato (unos 200 KB comprimidos con datos reales). |
| Dónde                       | Solo en memoria (`createMemoryStore`): nada en localStorage, IndexedDB ni la caché del navegador (`cache: 'no-store'`). La salida rápida lo borra con todo lo demás.                                                                                                                   |
| Privacidad                  | Todas las visitas piden los mismos archivos, sin importar la entidad: el servidor ya no puede inferirla del patrón de peticiones. Con todo en memoria, consultar otra entidad no hace ninguna petición, así que la restricción de «otra entidad» ya no hace falta en ese caso.         |
| Integridad                  | El cargador del grupo de anonimato lee los archivos en memoria con la misma validación (esquema y SHA-256 contra el índice). `allowsSeveralStates` solo se activa con ese `fetch` en memoria.                                                                                          |
| Si la descarga falla        | Queda el camino del ADR 0008: el fragmento de entes de la entidad elegida bajo demanda y un cargador prudente por denuncia que pide como máximo un fragmento de anonimato, con sus mensajes de hoy. El paso 1 lo dice y la siguiente visita a «Denunciar» reintenta.                   |
| Poca conexión               | También se descarga (unos 300 KB) y el paso 1 avisa que puede tardar; se puede seguir llenando mientras tanto.                                                                                                                                                                         |
| Lo que sí necesita conexión | El paso 5 (prueba de trabajo, envío al nodo o al enrutador y corroboración). Sin conexión el paso dice «Para enviar necesitas conexión» y no envía.                                                                                                                                    |

El directorio de la red, del que sale «Tu denuncia llega a», ya se descargaba al abrir el asistente
(`useNetworkState`, una vez por pestaña), y la tabla de competencia y los catálogos de conductas y
municipios van en el bundle: los pasos 1 a 4 quedan completos sin red.

## Consecuencias

- La promesa del paso 1 es exacta: «abre el formulario con internet; al empezar descargamos los
  catálogos de todo el país (unos 300 KB). Después pon tu teléfono en modo avión». Lo prueban
  `e2e/offline-report.spec.ts` y `e2e/trust.spec.ts`.
- Unos 300 KB por visita a «Denunciar» en lugar de unos 10 a 100 KB. Es poco frente al bundle, pero
  se paga también si la persona no termina.
- Los fragmentos crecen con los datos reales; si el catálogo completo pasara de ~1 MB comprimido
  habría que revisar esta decisión (por ejemplo, rellenar las peticiones a tamaño fijo).
