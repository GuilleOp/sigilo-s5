# ¿Quién protege a quien denuncia?

Le preguntamos al equipo del Datatón de la SESNA quién protege a la persona ciudadana que denuncia.
La respuesta señaló el **artículo 109 del Código Nacional de Procedimientos Penales (CNPP)**,
«Derechos de la víctima u ofendido», como orientación fundamental para proteger la identidad de
quien denuncia en el S5. Este documento contesta la pregunta con el texto vigente de las leyes
(CNPP, última reforma DOF 28-11-2025; LGRA, DOF 15-12-2025; LGPDPPSO, DOF 14-11-2025) y dice qué
hace SIGILO, qué no hace y quién decide cada cosa. Es información general, no asesoría legal.

## Respuesta corta

| Quién denuncia                                           | Qué ley la protege                                                                                                 | Quién decide las medidas                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Persona servidora pública, falta administrativa          | LGRA, art. 64: medidas de protección razonables si denuncia una falta grave o faltas de particulares, o es testigo | El ente público donde trabaja                                                |
| Cualquier persona, falta administrativa                  | LGRA, art. 91: denuncia anónima e identidad confidencial                                                           | La autoridad investigadora guarda la identidad                               |
| Víctima u ofendido de un hecho de corrupción (vía penal) | CNPP, art. 109 (fr. XVI, XVIII, XIX y XXVI) y art. 137                                                             | El Ministerio Público y el Órgano jurisdiccional                             |
| Testigo en la vía penal                                  | CNPP, arts. 131 fr. XV, 367 y 370                                                                                  | El Ministerio Público y el Órgano jurisdiccional                             |
| Particular que no es víctima ni testigo                  | La LGRA no prevé medidas equivalentes ([hueco legal](personas-ciudadanas.md#hueco-legal))                          | Ninguna autoridad tiene una medida prevista; SIGILO reduce el riesgo técnico |

En todos los casos, los datos personales que tiene una autoridad se rigen por la LGPDPPSO
(principios del art. 10 y confidencialidad del art. 36).

## Dos vías, dos leyes

- **Vía administrativa (LGRA).** Faltas administrativas que investiga una autoridad investigadora,
  casi siempre un órgano interno de control (OIC). Las denuncias pueden ser anónimas y la
  identidad es confidencial (art. 91). Revelar la identidad de un denunciante anónimo es
  obstrucción de la justicia (art. 64 fr. III). Las personas servidoras públicas que denuncien una
  falta grave o faltas de particulares, o sean testigos, «podrán solicitar medidas de protección
  que resulten razonables», y las evalúa «el Ente público donde presta sus servicios el
  denunciante» (art. 64, último párrafo).
- **Vía penal (CNPP).** Hechos de corrupción que son delitos (Código Penal Federal, Título Décimo,
  y sus equivalentes estatales), que investiga la fiscalía anticorrupción. En SIGILO es la función
  «vía penal» (`prosecution`) de la [tabla de funciones](arquitectura.md#red-federada) y las
  etapas `criminal_investigation` a `sentence` del trámite. El Ministerio Público recibe denuncias
  «a través de medios digitales, incluso mediante denuncias anónimas» (art. 131 fr. II); ante
  «informaciones anónimas», la Policía constata los datos (art. 221), y la denuncia lleva la
  identificación de quien denuncia «salvo los casos de denuncia anónima o reserva de identidad»
  (art. 223).

## ¿El artículo 109 aplica a quien denuncia corrupción?

No siempre, y conviene decirlo con precisión. El art. 109 da derechos a la **víctima u ofendido**.
El art. 108 define a la víctima como «el sujeto pasivo que resiente directamente sobre su persona
la afectación» y al ofendido como «la persona física o moral titular del bien jurídico lesionado o
puesto en peligro». En muchos delitos por hechos de corrupción el bien jurídico es el correcto
ejercicio del servicio público: la víctima directa suele ser el Estado o la sociedad, y quien
denuncia es **denunciante** (arts. 221 a 223) o **testigo**.

Por eso:

1. El art. 109 aplica **directamente** solo cuando el Ministerio Público o el juez reconocen a quien
   denuncia como víctima u ofendido (por ejemplo, podría serlo quien resiente directamente un cobro
   indebido). Esa calidad la determina la autoridad en cada caso, no SIGILO.
2. Si quien denuncia es testigo, la protege el CNPP por otras vías: el Ministerio Público debe
   promover su seguridad cuando su vida o integridad estén en riesgo inminente (art. 131 fr. XV), y
   el Órgano jurisdiccional puede ordenar «medidas especiales destinadas a proteger la integridad
   física y psicológica del testigo y sus familiares» (art. 367).
3. En los demás casos, el art. 109 sirve como **orientación**, como dijo la SESNA: describe lo que
   un buen sistema de denuncias debe garantizar a quien se arriesga a denunciar.

## Las fracciones del artículo 109 y cómo se reflejan

| Fracción | Qué dice                                                                                                                                                                                                                                                                                                         | En SIGILO                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V        | Ser informada, cuando lo solicite, del desarrollo del procedimiento penal                                                                                                                                                                                                                                        | Seguimiento con folio y 8 palabras, con las etapas del proceso penal y el buzón cifrado                                                                                     |
| XI       | Intérprete o traductor gratuito si pertenece a un pueblo indígena o no comprende el español                                                                                                                                                                                                                      | Solo alineación: lenguaje claro y lectura fácil. Las lenguas indígenas son siguiente paso ([accesibilidad.md](accesibilidad.md#alineación-con-el-cnpp-art-109-fr-xi-y-xii)) |
| XII      | Ajustes al procedimiento por discapacidad; condiciones para personas adultas mayores                                                                                                                                                                                                                             | WCAG 2.0 AA, menú de accesibilidad y modos de uso ([accesibilidad.md](accesibilidad.md))                                                                                    |
| XVI      | Protección cuando exista riesgo para su vida o integridad personal                                                                                                                                                                                                                                               | «Solicitar medidas de protección» en el seguimiento; decide la autoridad                                                                                                    |
| XVIII    | Protección especial de su integridad física y psíquica cuando la solicite                                                                                                                                                                                                                                        | La misma solicitud                                                                                                                                                          |
| XIX      | Solicitar medidas de protección, providencias precautorias y medidas cautelares                                                                                                                                                                                                                                  | La misma solicitud; el catálogo de medidas del art. 137 lo aplica el Ministerio Público                                                                                     |
| XXI      | Impugnar las omisiones o negligencia del Ministerio Público                                                                                                                                                                                                                                                      | Plazos visibles en el seguimiento. La impugnación se presenta fuera del sistema; el aviso de cómo hacerlo es siguiente paso                                                 |
| XXII     | Acceso a los registros de la investigación, salvo reserva del Órgano jurisdiccional                                                                                                                                                                                                                              | Fuera del sistema: lo da el Ministerio Público                                                                                                                              |
| XXVI     | «Al resguardo de su identidad y demás datos personales cuando sean menores de edad, se trate de delitos de violación […], violencia familiar, secuestro, trata de personas o cuando a juicio del Órgano jurisdiccional sea necesario para su protección, salvaguardando en todo caso los derechos de la defensa» | Identidad sellada por omisión; en la vía penal solo se abre con fundamento de la lista y número de resolución (ver abajo)                                                   |

## Resguardo por omisión, sin estorbar a la defensa

En el CNPP el resguardo de la identidad es una **excepción**: menores, ciertos delitos o cuando el
juez lo decide (fr. XXVI). En SIGILO es la **regla por diseño**: el nombre va en un sobre sellado
hacia la autoridad competente que el nodo no puede leer, y en modo anónimo no hay nombre que abrir.

No hay contradicción. Proteger más de lo que exige la fracción XXVI es compatible con ella porque
SIGILO no le quita a la autoridad lo que la ley le da: guarda el nombre hasta que hay fundamento
para abrirlo y deja constancia cuando se abre. La propia fracción salvaguarda «en todo caso los
derechos de la defensa», y el CNPP ya prevé cuándo la reserva cede ante la defensa (arts. 218 a
220). Además, la LGRA hace de la confidencialidad la regla en la vía administrativa (art. 91), y el
CNPP prohíbe comunicar a terceros no legitimados los datos personales de cualquier persona
relacionada con el procedimiento (art. 106).

Cómo se abre la identidad en la vía penal:

1. Una persona de la autoridad competente (investigación o supervisión) solicita la apertura. Si
   la denuncia está en una etapa del proceso penal, el panel le pide **elegir el fundamento** de
   una lista y escribir el **número de la resolución o del requerimiento**:
   - CNPP art. 109 fr. XXVI / resolución del Órgano jurisdiccional;
   - CNPP arts. 218 a 220 / resolución del Juez de control sobre el acceso de la defensa;
   - CNPP art. 131 fr. IX / requerimiento fundado y motivado del Ministerio Público («requerir
     informes o documentación a otras autoridades»).
2. El nodo rechaza (`400`) una solicitud en la vía penal sin esa forma
   (`parseCriminalOpeningBasis`, `packages/contracts/src/catalogs/criminal-opening.ts`).
3. Siguen las mismas reglas de siempre: otra persona de la misma autoridad aprueba con su propio
   fundamento (2 de 3), la apertura queda en la bitácora pública (`identity.opened`) y la persona
   denunciante la ve en su seguimiento con el fundamento completo, número de resolución incluido.

Detalle técnico en [criptografia.md](criptografia.md#apertura-de-identidad-2-de-3) y
[arquitectura.md](arquitectura.md#apertura-de-identidad-2-de-3).

## Lo que hace SIGILO

- **Antes de enviar:** Huella Cero (nada sale del equipo hasta enviar), revisor de frases que
  delatan, limpieza de metadatos de las pruebas y aviso del tamaño del grupo de anonimato.
- **Al enviar:** enrutador ciego, identidad sellada hacia la autoridad competente, recibo de 8
  palabras y, en modo sellado, la casilla «Pido protección», que la autoridad ve al recibir la
  denuncia.
- **Durante el trámite:** apertura 2 de 3 con fundamento, en la vía penal con resolución citada;
  cada apertura en la bitácora pública y en el seguimiento.
- **Después:** «Solicitar medidas de protección» en el seguimiento. Envía por el buzón cifrado un
  mensaje con un encabezado fijo y, si la persona quiere, lo que le preocupa. No pide datos nuevos;
  el panel lo marca como «pide medidas de protección» (`apps/web/src/lib/protection-request.ts`).

## Límites

- **SIGILO no otorga medidas ni decide quién es víctima.** Hace llegar la solicitud y deja
  constancia; las medidas las decide la autoridad competente.
- **Algunas medidas requieren identificarse.** La vigilancia o la protección policial (art. 137) no
  se pueden dar a alguien anónimo. Si la autoridad pide datos por el buzón, la persona decide.
- **Particulares sin calidad de víctima ni de testigo** no tienen en la LGRA medidas equivalentes a
  las del art. 64 ([personas-ciudadanas.md](personas-ciudadanas.md#hueco-legal)).
- **Después de abrir, manda la carpeta.** Una vez abierta, la identidad entra a la carpeta de
  investigación y su reserva la rigen los arts. 106 y 218 a 220; SIGILO ya no la controla.
- **El umbral 2 de 3 es un control de política del nodo**, no criptográfico
  ([criptografia.md](criptografia.md#trabajo-futuro)).
- **En la red federada**, la persona puede escribir por el buzón cuando la autoridad le escribió
  por primera vez; antes de eso, la casilla «Pido protección» de la denuncia sellada es el aviso disponible.
- **Fuera del sistema:** el acceso a los registros (fr. XXII) y la impugnación de omisiones del
  Ministerio Público (fr. XXI). Si la vida corre peligro inmediato, el número es el 911.

## Quién hace qué

| Quién                                                | Qué hace                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fiscalía anticorrupción (Ministerio Público)         | Recibe denuncias, también anónimas y digitales (art. 131 fr. II); ordena medidas de protección (art. 137); protege a víctimas y testigos (arts. 131 fr. XV y 367); puede requerir el dato con fundamento (art. 131 fr. IX). En SIGILO: función `prosecution` |
| Órgano jurisdiccional (Juez de control, tribunal)    | Decide el resguardo de la identidad (art. 109 fr. XXVI), ratifica o cancela medidas (art. 137) y resuelve la reserva frente a la defensa (arts. 218 a 220)                                                                                                   |
| OIC o autoridad investigadora                        | Mantiene confidencial la identidad (LGRA, art. 91), no la revela (art. 64 fr. III) y recibe la solicitud de medidas por el buzón. En SIGILO: custodia de la apertura 2 de 3                                                                                  |
| Ente público donde trabaja quien denuncia            | Evalúa y atiende «de manera oportuna» la solicitud de medidas de una persona servidora pública (LGRA, art. 64)                                                                                                                                               |
| SESNA                                                | Opera la ventanilla única y el enrutador ciego. No tiene llaves ni lee denuncias, y no decide medidas                                                                                                                                                        |
| SESEA (o la secretaría que opere el nodo del estado) | Opera el nodo de su entidad y da de alta a sus autoridades. Ve los hechos, pero no la identidad sellada ni los mensajes del buzón; no decide medidas                                                                                                         |
