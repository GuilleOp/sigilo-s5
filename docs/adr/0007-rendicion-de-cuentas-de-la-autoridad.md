# 0007. Rendición de cuentas de la autoridad

- Estado: aceptada
- Fecha: 2026-11-05
- Complementa: 0005 (red federada)

## Contexto

Proteger a quien denuncia no basta si la denuncia se entierra: si nadie la investiga, si la
investiga alguien con conflicto de interés o si se cierra con una plantilla. SESNA señaló que la
ciudadanía necesita certeza sobre el estatus. Marco legal (LGRA con la reforma publicada en el DOF
el 15-12-2025, salvo que se indique otra ley):

- **LGRA, art. 58.** Conflicto de interés y obligación de excusarse.
- **LGRA, art. 64.** Obstrucción de la justicia: simular faltas no graves en la investigación de
  graves (fr. I), no iniciar el procedimiento correspondiente en 30 días naturales ante una posible falta grave (fr. II) y
  revelar la identidad de un denunciante anónimo (fr. III).
- **LGRA, art. 74.** Prescripción de 3 años (no graves) o 7 (graves), interrumpida por la
  calificación; caducidad de la instancia por 6 meses de inactividad solo en el procedimiento de
  responsabilidad ya admitido el informe, decretada a solicitud del presunto infractor.
- **LGRA, art. 96.** Requerimientos de información con plazos de 5 a 15 días hábiles.
- **LGRA, art. 100.** Archivo notificado en 10 días hábiles a quien sea identificable; reapertura
  con nuevos indicios.
- **LGRA, arts. 101 a 110.** Inconformidad contra la calificación de no grave y contra la
  abstención del art. 101 (no contra un archivo): 5 días hábiles desde la notificación para
  promoverla ante la autoridad investigadora y 30 para que la Sala resuelva. El art. 109 exige
  nombre, domicilio y firma autógrafa.
- **LGRA, art. 58.** Quien tiene un conflicto de interés informa a su superior inmediato y pide la
  excusa; el superior responde a más tardar 48 horas antes del plazo para atender el asunto.
- **LGSNA, art. 21.** El Comité de Participación Ciudadana accede a la información necesaria
  (fr. V), propone mejoras al sistema electrónico de denuncia (fr. VII, inciso d) y lleva un
  registro voluntario de organizaciones de la sociedad civil (fr. IX).

## Decisión

| Mecanismo                            | Decisión                                                                                                                                                                                                                                                                                                                                                          | Nivel |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Conflicto de interés antes de turnar | Antes de turnar, el panel compara a la persona denunciada con quien recibiría la denuncia usando S1 (ente, área de adscripción, empleo) y S2 (institución, superior inmediato). Un posible conflicto exige registrar la excusa (art. 58) o una justificación antes de aceptar, y queda en la bitácora. Ver ADR 0008 para los datos.                               | A     |
| Plazos legales por etapa             | Cada estado del catálogo (ADR 0005) lleva su plazo legal, calculado en días naturales o hábiles según la norma. El panel y el seguimiento muestran el plazo y lo que falta.                                                                                                                                                                                       | A     |
| Alerta de prescripción               | Desde la fecha de los hechos y la gravedad calificada (3 años si no hay calificación), la denuncia muestra la fecha de prescripción y alerta a 12, 6 y 3 meses. Durante la investigación, la inactividad de 5 y 6 meses se alerta como inactividad, sin citar la caducidad; la caducidad de la instancia (art. 74) solo se alerta después de admitido el informe. | A     |
| Verificación de sanciones contra S3  | Cuando un cierre o un informe afirma que hubo o no sanción, se consulta S3 y se registra uno de tres resultados: confirmado, contradicho o sin cobertura (ADR 0008). La ausencia de registro nunca es evidencia.                                                                                                                                                  | A     |
| Cierre con fundamento                | Ningún cierre sin motivo del catálogo de SESNA, artículo que lo funda y explicación pública en lenguaje claro. El auditor (ADR 0009) señala cierres con texto de plantilla.                                                                                                                                                                                       | A     |
| Escalamiento por reglas públicas     | Reglas publicadas y versionadas (por ejemplo: 30 días naturales sin iniciar ante una falta que la persona marcó como grave; requerimiento vencido; alerta de prescripción sin actuación; conflicto sin excusa). Se evalúan solo con eventos de la bitácora, así que cualquiera puede recalcularlas.                                                               | A     |
| Segunda llave                        | Al enviar, el navegador cifra además un **sobre de escalamiento** (hechos, pruebas limpias y llaves del buzón; nunca la identidad sellada) hacia la autoridad supervisora que indica el directorio. El nodo lo guarda sin poder leerlo y lo entrega solo cuando una regla se cumple; el evento lo cofirman los testigos.                                          | A     |
| Observadores intercambiables         | CPC, entidad de fiscalización superior, organizaciones registradas y academia, definidos en el directorio. Cofirman con m de n la bitácora nacional, el directorio y los escalamientos; ven solo la bitácora pública y estadística agregada. Un observador se sustituye con una versión del directorio cofirmada por m actuales.                                  | A     |
| Inconformidad                        | El seguimiento avisa cuando se notifica una calificación, cuenta los 5 días hábiles y prepara el escrito con folio y datos del expediente para imprimir y firmar.                                                                                                                                                                                                 | A     |
| Identidad sellada para el recurso    | Quien denunció de forma anónima puede, por decisión propia, cifrar su identidad hacia la autoridad solo para el recurso. Se registra como revelación voluntaria, distinta de una apertura.                                                                                                                                                                        | B     |

### Limitación legal de la inconformidad

El recurso exige nombre, domicilio y firma autógrafa (LGRA, art. 109). Por eso **quien denuncia de
forma anónima solo puede inconformarse si revela su identidad**, sellada y solo para el recurso. El
sistema lo dice antes de que la persona decida, no sustituye la firma autógrafa y no puede promover
el recurso por ella. Si no quiere revelarse, le queda la vía del escalamiento, que no requiere
identidad.

### Estado de la implementación (Etapa 2)

| Mecanismo                      | Estado en el nodo de referencia                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plazos legales por etapa       | Hecho: el seguimiento y el panel muestran cada plazo con su situación, en días legales de la hora del centro (`activeDeadlines`, `evaluateDeadline`).                                                                                                                                                                                                                                                  |
| Alerta de prescripción         | Hecho: a 12, 6 y 3 meses (3 años si la falta no es grave, 7 si lo es, desde el primer día del mes de los hechos); la calificación o el cierre la detienen. La inactividad en la investigación se alerta a los 5 y a los 6 meses sin citar la caducidad; la caducidad de la instancia solo después de admitido el informe (`alert.expiry-warning` y `alert.expiry-reached`).                            |
| Cierre con fundamento          | Hecho: motivo del catálogo, fundamento y acuerdo en versión pública, disponible para el auditor (`GET authorityClosures`).                                                                                                                                                                                                                                                                             |
| Escalamiento por reglas        | Hecho para `escalation.grave-stalled`, `escalation.archive-unnotified`, `escalation.conflict` (desde el primer acto resolutivo), `escalation.archive-signals` (AUD-01 y AUD-02 sobre un archivo) y `escalation.downgrade-signals` (AUD-01, AUD-03 y AUD-04 sobre una calificación de no grave) (`ESCALATION_RULES` 1.1.0). Pendiente: requerimiento vencido, porque el requerimiento aún no se modela. |
| Recalculable desde la bitácora | Parcial: las reglas son puras y públicas, pero el nodo las evalúa con los datos privados del trámite (los eventos públicos solo llevan digestos). Un tercero puede recalcularlas con los datos que el nodo le muestre, no solo con la bitácora pública.                                                                                                                                                |
| Segunda llave                  | Hecho: la web cifra el sobre de hechos y pruebas hacia la supervisora fijada; el nodo lo entrega solo tras una regla de escalamiento. Pendiente: una llave por autoridad supervisora tomada del directorio firmado (hoy una por nodo) y la cofirma del escalamiento por los testigos.                                                                                                                  |

## Alternativas consideradas

| Alternativa                                                          | Por qué no                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escalamiento discrecional por la operación central                   | Pondría a la operación por encima de las autoridades y la convertiría en lectora de denuncias.                                                    |
| Reenviar la denuncia a la supervisora en el momento del escalamiento | Exige que la autoridad que no actuó coopere, o que alguien en medio pueda leer; el sobre cifrado desde el envío no depende de ninguna de las dos. |
| Un solo observador (por ejemplo, el CPC)                             | Un solo punto de captura o de ausencia; con m de n, ninguno es indispensable y ninguno basta.                                                     |
| Inconformidad anónima                                                | No tiene fundamento: el art. 109 exige nombre y firma autógrafa; ofrecerla engañaría a la persona.                                                |

## Consecuencias

### Positivas

- Una denuncia que no se atiende se vuelve visible y llega a la autoridad supervisora sin depender
  de quien la tiene detenida.
- El conflicto de interés se revisa antes de turnar, no después de la queja.
- La ciudadanía ve plazos y fundamentos, no solo un estatus.

### Negativas

- Los plazos en días hábiles requieren un calendario de días inhábiles por autoridad; la entrega
  usa uno sintético y el calendario oficial queda en nivel C.
- Cada denuncia lleva un segundo sobre: más almacenamiento y una llave más que custodiar por
  autoridad supervisora.
- La verificación de conflicto depende de la cobertura de S1 y S2 (ADR 0008).

### Riesgos

- El nodo podría entregar el sobre de escalamiento antes de tiempo (la supervisora vería una
  denuncia que también le compete) o retenerlo (detectable: la regla es pública y los testigos la
  recalculan).
- Una autoridad puede registrar eventos vacíos para evitar la caducidad o el escalamiento; el
  auditor (ADR 0009) los señala, pero no los impide.
- La revelación para el recurso expone a la persona ante la autoridad que calificó; la decisión es
  suya y se explica antes.
- La alerta de conflicto puede tener falsos positivos (homónimos) y falsos negativos (entes sin
  cobertura); nunca bloquea el turno, exige una justificación.
