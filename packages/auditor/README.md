# @sigilo/auditor

Auditor de las actuaciones de la autoridad (ADR 0009, nivel B). **Reglas deterministas primero**:
cada regla tiene un identificador estable, umbrales publicados y una señal con evidencia lado a lado.
Un **modelo abierto local** es opcional, está desactivado por omisión y solo orienta.

> Esta señal no decide nada: la decisión es de las reglas públicas o de una persona.

El paquete es puro (sin red, salvo el adaptador opcional hacia 127.0.0.1) y corre en el nodo de la
autoridad. Nunca recibe la identidad sellada, los mensajes del buzón ni datos de contacto. Nunca
llama «falsa» a una denuncia ni «culpable» a una persona (`assertNeutralWording` lo comprueba en
cada señal).

## Reglas

| Id     | Clave                                            | Qué señala                                                                                                                                                                                                                                             | Fundamento de la señal           |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| AUD-01 | `signal.template-closure`                        | Acuerdo de cierre o de calificación casi igual a muchos otros de la misma autoridad (shingles de 3 palabras, Jaccard)                                                                                                                                  | LGRA art. 100; Bases PDN art. 58 |
| AUD-02 | `signal.archive-against-evidence`                | Archivo «por falta de elementos» con pruebas, corroboración o datos confirmados en la PDN que no menciona                                                                                                                                              | LGRA art. 100                    |
| AUD-03 | `signal.downgraded-qualification`                | Conducta que el catálogo asocia a falta grave y que la autoridad califica como no grave, en un acuerdo de calificación o de cierre (no afirma obstrucción)                                                                                             | LGRA art. 64, fr. I              |
| AUD-04 | `signal.deadline`, `signal.prolonged-inactivity` | Plazo vencido o por vencer: no iniciar el procedimiento correspondiente en 30 días naturales ante una posible falta grave, notificación del archivo; inactividad prolongada en la investigación y, solo admitido el informe, caducidad de la instancia | LGRA arts. 64-II, 100 y 74       |
| AUD-05 | `signal.empty-activity`                          | Actuación sin contenido tras 4 meses o más sin actuaciones con contenido (cita la caducidad solo si ya se admitió el informe)                                                                                                                          | LGRA art. 74; ADR 0007           |
| AUD-06 | `signal.corroborated-archive-rate`               | Tasa de archivo alta en casos con pruebas o corroboración (por autoridad)                                                                                                                                                                              | LGRA art. 100                    |
| AUD-07 | `signal.archive-concentration`                   | Archivos concentrados en una misma persona denunciada (clave seudónima) o proveedor                                                                                                                                                                    | LGRA art. 100                    |
| AUD-08 | `signal.pre-prescription-activity`               | Actuación en los 60 días previos a la prescripción tras 4 meses o más sin actuaciones                                                                                                                                                                  | LGRA art. 74                     |

**Etapa e inactividad.** La caducidad de la instancia (LGRA, art. 74: seis meses sin actuar, se
decreta a solicitud del presunto infractor) solo aplica al procedimiento de responsabilidad ya
admitido el Informe de Presunta Responsabilidad Administrativa. Por eso AUD-04 la cita solo si el
caso tiene la actuación `report_admitted`; antes, en la investigación, la señal es «inactividad
prolongada» (`signal.prolonged-inactivity`) y recuerda que corre la prescripción. Para el art. 64,
fr. II, la actuación `investigation_started` representa el inicio del procedimiento correspondiente
que registra la autoridad.

**Acuerdos de calificación.** `ClosureAct` admite `kind: 'qualification'` (o se deduce: sin motivo
de cierre y con texto que califica la falta). AUD-01 y AUD-03 se aplican a calificaciones y cierres;
AUD-02 solo a archivos. En el escenario, la calificación de Marta como no grave (día 30) dispara
AUD-01, AUD-03 y AUD-04; su texto es `templateQualificationText` de `@sigilo/auditor/eval`.

AUD-04 y AUD-08 **no duplican** la lógica de plazos: usan `DEADLINE_RULES` de `@sigilo/contracts` y
`evaluateDeadline`, `computeDueDate` y `addCalendarMonths` de `@sigilo/core`. AUD-02 y AUD-03 usan
las verificaciones y `classifyOffense` de `@sigilo/contexto-pdn`. Las inconsistencias de la denuncia
con S6 (`signal.public-record-inconsistency` del escenario) las produce `verifyCitedContract` de
`@sigilo/contexto-pdn`; el auditor las consume en AUD-02 para el archivo.

### Umbrales publicados (`config/umbrales.json`, versión 1.1.0)

| Regla  | Umbral                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| AUD-01 | Shingles de 3 palabras; similitud ≥ 0.75; ≥ 5 acuerdos coincidentes; ventana de ±365 días; no compara «acumulado» ni «canalizado» |
| AUD-02 | Corroboración desde 2 personas independientes; cualquier prueba adjunta o verificación `confirmed`                                |
| AUD-04 | Inactividad prolongada en la investigación: 6 meses sin actuaciones con contenido, aviso 30 días antes                            |
| AUD-05 | 4 meses sin actuaciones con contenido                                                                                             |
| AUD-06 | Ventana de 365 días, ≥ 5 casos corroborados, tasa ≥ 50 %                                                                          |
| AUD-07 | Ventana de 365 días, ≥ 3 archivos de la misma clave y ≥ 80 % de sus denuncias archivadas                                          |
| AUD-08 | 60 días antes de la prescripción, tras 4 meses o más sin actuaciones                                                              |

Una prueba exige que `config/umbrales.json` sea idéntico a `AUDITOR_CONFIG`. Una campaña coordinada
(`campaignGroupId`) cuenta como una denuncia en AUD-06 y AUD-07.

## Uso

```ts
import { runAudit } from '@sigilo/auditor';

const report = runAudit({ acts, cases, today: '2026-12-10' });
for (const { signal, record } of report.findings) {
  // signal: ruleId, key, name, explanation, evidence[{ label, actText, counterpart, counterpartSource }],
  //         basis, note, metrics, rulesVersion
  // record: AuditLedgerRecord (contracts/audit.ts) para la bitácora del nodo
}
```

Cada señal produce un `AuditLedgerRecord` (`@sigilo/contracts`, `audit.ts`) con la versión de las
reglas o el digesto del modelo, el digesto del sujeto (`"sigilo/audit/subject:" + clave`), el
digesto canónico de la entrada y de la salida, el resultado y el día. El servidor de referencia lo
publica en su bitácora como `audit.signal` con `payloadDigest = sha256(canonicalize(record))`
(`apps/server/src/services/audit-service.ts`). El registro nunca lleva texto.

El servidor de referencia corre solo las reglas: todavía no conecta el adaptador del modelo local
(`@sigilo/auditor/model`), que hoy se usa en las pruebas y en la evaluación. Conectarlo es un
siguiente paso.

## Modelo local opcional (`@sigilo/auditor/model`)

- **Desactivado por omisión** (`DEFAULT_LOCAL_MODEL_CONFIG.enabled = false`). `connectLocalModel`
  falla cerrado y nunca lanza: desactivado, URL que no es local, sin digesto, servidor apagado o
  digesto distinto devuelven un resultado sin cliente, y el auditor sigue solo con reglas.
- **Solo en la misma máquina**: Ollama (`/api/generate`) o llama.cpp server (`/completion`) en
  `http://127.0.0.1`, `[::1]` o `localhost`, sin credenciales ni ruta, sin redirecciones. Nunca se
  envía el relato a terceros.
- **Digesto fijado**: con Ollama se compara contra el digesto de `/api/tags` (digesto del
  manifiesto); con llama.cpp se confía en el SHA-256 calculado al instalar el archivo GGUF.
- **Tareas** (siempre orientativas, nunca deciden ni turnan):
  - `suggestOffenses` (AUD-M1): hasta 3 claves del catálogo de conductas, cada una con el fragmento
    literal del relato que la apoya.
  - `explainGenericClosure` (AUD-M2): motivos de una lista cerrada (`GENERIC_CLOSURE_REASONS`) con
    fragmentos literales del acuerdo; el resumen lo compone el sistema, no el modelo.
- **Defensas contra inyección**: el texto va como dato entre delimitadores con un valor aleatorio y
  codificado como cadena JSON; se quitan correos, teléfonos y claves tipo RFC/CURP; la salida se
  restringe con el esquema JSON del servidor local y se valida con zod en modo estricto; las claves
  deben existir en el catálogo y los fragmentos deben estar en el texto; si un solo elemento falla se
  descarta toda la salida y se registra `discarded`; respuestas mayores de 64 KB se descartan; el
  modelo no tiene herramientas, red ni memoria y su salida no puede cambiar estados.
- **Doble de pruebas** (`@sigilo/auditor/testing`): `createScriptedModel` responde con guiones,
  incluidas respuestas maliciosas.

Ejemplo para probarlo en local (no hay modelo en el repositorio):

```sh
ollama pull qwen2.5:1.5b          # modelo abierto pequeño, corre en CPU
ollama list                       # copiar el digesto completo con: curl -s 127.0.0.1:11434/api/tags
```

### Mejora futura (nivel C): en el navegador

La clasificación orientativa podría correr en el navegador de quien denuncia con un modelo pequeño
cuantizado (por ejemplo, con WebAssembly o WebGPU), con los pesos servidos desde el mismo origen y su
SHA-256 comprobado antes de usarlos. Así el relato no saldría del dispositivo. Requiere medir el
tamaño de descarga y el rendimiento en teléfonos modestos y en conexiones limitadas; no está
implementado.

## Clasificación orientativa por reglas

`suggestOffensesByRules` sugiere conductas con palabras clave públicas (`OFFENSE_KEYWORDS`) y el
fragmento que las apoya. Es la línea base sin modelo; la persona siempre elige.

## Evaluación

`npm run auditor:eval` escribe [`EVALUACION.md`](EVALUACION.md) con precisión, exhaustividad y
falsos positivos por regla sobre un conjunto sintético etiquetado (escenario de la demostración y
casos difíciles), el barrido de umbrales de AUD-01, la clasificación por reglas y las defensas del
modelo. `npm run auditor:eval -- --check` y una prueba exigen que esté al día.
