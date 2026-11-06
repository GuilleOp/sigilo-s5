# 0009. IA local: auditor y clasificación orientativa

- Estado: aceptada
- Fecha: 2026-11-05
- Complementa: 0001 (alcance; la IA clasificadora estaba fuera de alcance)

## Contexto

SESNA describió la clasificación por reglas y catálogo del demo y mencionó la IA como «oportunidad de
innovación». El reto exige declarar el uso de IA. Hay dos usos con valor:

- **Auditor:** revisar las actuaciones de la autoridad (cierres con texto de plantilla, cierres
  inconsistentes con la PDN, eventos vacíos para evitar la caducidad, plazos vencidos).
- **Clasificación orientativa:** sugerir conducta y autoridad competente a partir de los hechos.

Restricciones: SESNA y las SESEA deben poder replicarlo gratis y en local; no puede haber peticiones a
terceros; los hechos de una denuncia son información reservada y pueden identificar a quien
denuncia; y un modelo que lee texto escrito por cualquiera es vulnerable a la inyección de
instrucciones. Las decisiones sobre responsabilidades corresponden a la autoridad, no a un modelo.

## Decisión

1. **Reglas deterministas primero.** Cada señal tiene una regla versionada con identificador
   (`AUD-NN`): por ejemplo, similitud alta del texto de cierre con otros cierres de la misma
   autoridad, cierre «sin sanción» con resultado «contradicho» en S3, evento sin contenido tras 4
   meses de inactividad. Las reglas cubren todo lo que puede expresarse sin un modelo.
2. **Modelo abierto local, opcional.** Un modelo de pesos abiertos, pequeño y cuantizado, que corre
   en CPU sin GPU, en la infraestructura de la autoridad, sin servicios de terceros y sin costo. El
   sistema funciona igual sin él. Se fija el digesto del archivo del modelo.
3. **Nunca ve identidades.** Recibe solo los hechos que la autoridad ya ve, después de Huella Cero;
   nunca la identidad sellada, los mensajes del buzón ni los datos de contacto.
4. **Señala con evidencia, nunca decide.** Cada salida es una señal con la regla o el modelo que la
   produjo, el fragmento citado y un nivel de confianza. Una señal no cambia estados, no cierra, no
   turna, no prioriza por sí sola y no puede ocultar una señal de las reglas.
5. **Resistente a inyección de instrucciones.** El texto de la denuncia se trata como dato entre
   delimitadores; la salida se restringe a un esquema JSON con claves del catálogo y se valida con
   zod; el modelo no tiene herramientas, red ni memoria entre denuncias; una salida inválida se
   descarta y se registra. El conjunto de evaluación incluye denuncias con instrucciones
   incrustadas.
6. **Evaluación publicada.** Conjunto sintético, métricas de precisión y exhaustividad por señal y
   por conducta, versión de las reglas y digesto del modelo, publicados con cada versión.
7. **Registro en bitácora.** Cada señal registra un evento con la regla o el digesto del modelo y
   los digestos de la entrada y la salida, nunca el texto.

| Parte                                | Nivel                                       |
| ------------------------------------ | ------------------------------------------- |
| Reglas deterministas del auditor     | B                                           |
| Clasificación orientativa por reglas | B                                           |
| Modelo local opcional                | B si se integra con su evaluación; si no, C |
| Evaluación publicada                 | B                                           |
| Registro en bitácora                 | B                                           |

### Relación con `docs/uso-de-ia.md`

Ese documento declara el uso de IA en el desarrollo y afirma que la aplicación no usa modelos de IA.
La afirmación sigue siendo cierta mientras el modelo local no se integre. Cuando se integre, se
agrega a ese documento una sección sobre la IA en la aplicación, con el modelo, su licencia, su
digesto, la evaluación y estas reglas.

Implementación (`packages/auditor`): reglas AUD-01 a AUD-08, adaptador opcional AUD-M1 y AUD-M2
(desactivado por omisión), registro `AuditLedgerRecordSchema` en `@sigilo/contracts` y evaluación en
`packages/auditor/EVALUACION.md`. `docs/uso-de-ia.md` ya declara el modelo opcional; como no se ha
integrado un modelo concreto, el modelo, su licencia y su digesto se registran cuando una autoridad
lo active. El modelo local queda en nivel C hasta evaluarse con un modelo real.

## Alternativas consideradas

| Alternativa                        | Por qué no                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| API de un modelo comercial         | Envía hechos reservados a un tercero, tiene costo y no se replica en local.                   |
| Modelo grande con GPU              | Excluye a las SESEA sin GPU y no mejora lo que las reglas ya cubren.                          |
| Clasificación automática decisoria | Una decisión sobre responsabilidades sin persona responsable; además, vulnerable a inyección. |
| Sin IA                             | Válido; por eso el modelo es opcional y las reglas funcionan solas.                           |

## Consecuencias

### Positivas

- El auditor vigila a la autoridad con reglas que cualquiera puede leer y recalcular.
- Cero costo, cero terceros y replicable en un equipo común.
- La bitácora permite auditar al propio auditor.

### Negativas

- Un modelo pequeño en CPU es lento y menos preciso; se usa solo como segunda opinión.
- Las reglas de similitud requieren afinar umbrales con datos reales que el repositorio no tiene.

### Riesgos

- **Sesgo de automatización:** la autoridad puede seguir la sugerencia sin revisar. La interfaz
  muestra siempre la evidencia y la palabra «orientativa».
- **Inyección residual:** el esquema limita el daño a una señal equivocada, nunca a una acción.
- **Reidentificación:** aunque no vea identidades, el modelo procesa hechos; corre solo en la
  infraestructura de la autoridad y sin registros del texto.
