# Manuales de usuario de SIGILO, por perfil

SIGILO es el prototipo de **red federada de denuncias** para el reto S5 (Sistema de denuncias
públicas de faltas administrativas y hechos de corrupción) del Datatón Anticorrupción 2026 de la
SESNA. Estos manuales explican, a cada persona que lo usa, qué hace su perfil, en qué etapas del
ciclo legal interviene, con qué fundamento y cómo usar cada pantalla.

> **Prototipo, no sistema oficial.** Todo lo que aparece aquí es sintético: personas, casos,
> folios, llaves y contraseñas. Las instituciones del escenario de demostración llevan la marca
> «(ficticia)». Los catálogos de entes de la PDN y de municipios del INEGI son reales, pero ningún
> caso acusa a una institución real.

**Versión revisada:** software SIGILO 1.1.0, Estándar S5 0.4.0, rama `main` (`355ae75`), 16 de
noviembre de 2026. Los textos entre comillas («…») son los que aparecen en pantalla.

## Cómo leer estos manuales

- Cada manual sigue el mismo orden: quién eres y tu papel en la ley; qué ves y qué no ves; cómo
  entras; tu bandeja; cada etapa que te toca, en orden; qué hacer si algo falla; limitaciones
  conocidas; glosario; y un diagrama de tu flujo.
- Las cuentas de la demostración (`contraloria.queretaro`, `tja.queretaro`…) solo son ejemplos.
  **Las contraseñas no están en estos manuales:** se generan cada vez que se arma la red y están en
  `.red-demo/nodos/<nodo>/credenciales.json`. Las llaves de autoridad están en
  `.red-demo/autoridades/<authorityId>.json`.
- Los avisos **«Limitación conocida del prototipo»** vienen del recorrido en vivo del 16 de
  noviembre de 2026 y de la revisión del código. Dicen lo que hoy no funciona como pide la ley, para
  que nadie lo descubra en una presentación.
- Abreviaturas: LGRA (Ley General de Responsabilidades Administrativas), LGSNA (Ley General del
  Sistema Nacional Anticorrupción), BPDN (Bases para el funcionamiento de la Plataforma Digital
  Nacional), CNPP (Código Nacional de Procedimientos Penales), CPF (Código Penal Federal), LCF (Ley
  de Coordinación Fiscal), LFRCF (Ley de Fiscalización y Rendición de Cuentas de la Federación),
  IPRA (Informe de Presunta Responsabilidad Administrativa), OIC (órgano interno de control), «dh»
  (días hábiles), «dn» (días naturales).

## Los manuales

| N.º | Perfil                                                   | Dónde trabaja                                                            | Archivo                                                                                    |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 01  | Persona denunciante (servidora pública o ciudadana)      | Ventanilla única: `/denunciar` y `/seguimiento`                          | [01-persona-denunciante.md](01-persona-denunciante.md)                                     |
| 02  | Unidad receptora (buzón general)                         | Panel del nodo, función «recepción y turnado»                            | [02-unidad-receptora-buzon-general.md](02-unidad-receptora-buzon-general.md)               |
| 03  | Autoridad investigadora (OIC o Contraloría)              | Panel del nodo, funciones «recepción» e «investigación»                  | [03-autoridad-investigadora.md](03-autoridad-investigadora.md)                             |
| 04  | Autoridad substanciadora y resolutora                    | Panel del nodo, función «substanciación»                                 | [04-autoridad-substanciadora-y-resolutora.md](04-autoridad-substanciadora-y-resolutora.md) |
| 05  | Titular o supervisión                                    | Panel del nodo, función «supervisión»                                    | [05-titular-y-supervision.md](05-titular-y-supervision.md)                                 |
| 06  | Tribunal de Justicia Administrativa                      | Panel del nodo, función «Tribunal»                                       | [06-tribunal-de-justicia-administrativa.md](06-tribunal-de-justicia-administrativa.md)     |
| 07  | Fiscalía especializada (vía penal)                       | Panel del nodo                                                           | [07-fiscalia-especializada.md](07-fiscalia-especializada.md)                               |
| 08  | Operación del nodo estatal (SESEA)                       | Panel del nodo, función «operación», y CLI `sigilo`                      | [08-operacion-del-nodo-sesea.md](08-operacion-del-nodo-sesea.md)                           |
| 09  | SESNA: ventanilla, enrutador y red                       | Ventanilla, salud, Swagger, CLI `sigilo-sesna`                           | [09-sesna-ventanilla-y-red.md](09-sesna-ventanilla-y-red.md)                               |
| 10  | Secretaría Anticorrupción y Buen Gobierno (nodo Federal) | Panel del nodo Federal                                                   | [10-nodo-federal-sabg.md](10-nodo-federal-sabg.md)                                         |
| 11  | Institución que solicita su alta                         | Ventanilla: `/solicitar-alta`                                            | [11-institucion-que-solicita-su-alta.md](11-institucion-que-solicita-su-alta.md)           |
| 12  | Testigos y CPC                                           | CLI `sigilo testigo` y proceso testigo                                   | [12-testigos-y-cpc.md](12-testigos-y-cpc.md)                                               |
| 13  | Ciudadanía y academia                                    | Ventanilla: observatorio, datos abiertos, `/verificar`, `/quien-atiende` | [13-ciudadania-y-academia.md](13-ciudadania-y-academia.md)                                 |

El código no tiene más funciones de cuenta que las seis del estándar: `intake` (recepción y
turnado), `investigation` (investigación), `substantiation` (substanciación y resolución),
`supervision` (supervisión), `court` (Tribunal) y `operation` (operación del nodo). Solo
`intake` e `investigation` se pueden juntar en una cuenta; las demás nunca se combinan (LGRA, art.
115). La fiscalía usa en la demostración `intake` + `investigation`. La entidad de fiscalización
superior (ASF o ESFE) es autoridad, pero en la demostración no tiene cuentas (la ESFE ficticia de
Querétaro solo admite denuncias con nombre y firma); por eso no tiene manual propio.

## Matriz perfil × etapa (quién hace qué)

**H** = lo hace (es su acto). **A** = aprueba o participa. **V** = solo ve o recibe aviso. Vacío =
no interviene. Persona = persona denunciante; Rec. = unidad receptora (buzón); Inv. =
investigadora; Sub. = substanciadora y resolutora; Sup. = titular o supervisión; TJA = Tribunal;
Fisc. = fiscalía; Op. = operación del nodo (SESEA); SESNA; Test. = testigos y CPC; Ciud. =
ciudadanía y academia.

| Etapa o acto                                        | Fundamento                        | Persona                                   | Rec. | Inv.                    | Sub.                    | Sup.                    | TJA                        | Fisc.                 | Op. | SESNA                   | Test.        | Ciud.                   |
| --------------------------------------------------- | --------------------------------- | ----------------------------------------- | ---- | ----------------------- | ----------------------- | ----------------------- | -------------------------- | --------------------- | --- | ----------------------- | ------------ | ----------------------- |
| Presentar la denuncia (anónima o sellada)           | LGRA 91, 93; BPDN 56 a 58         | H                                         |      |                         |                         |                         |                            |                       |     | V (transporta a ciegas) |              |                         |
| Turnar desde el buzón general («Motivo del turno»)  | LGRA 14; BPDN 58                  | V (lee el motivo)                         | H    |                         |                         |                         |                            |                       |     |                         |              |                         |
| Aceptar, reasignar o devolver                       | LGRA 14, 94                       | V                                         | H    | H                       |                         |                         |                            | H                     |     |                         |              |                         |
| Semáforo de turnado (meta del S5, no plazo legal)   | BPDN 58                           |                                           | V    | V                       |                         | V (aviso si vence)      |                            |                       |     |                         |              |                         |
| Iniciar la investigación                            | LGRA 91, 94, 96                   | V                                         |      | H                       |                         |                         |                            |                       |     |                         |              |                         |
| Mensajes cifrados y medidas de protección           | LGRA 64, 91; CNPP 109             | H                                         |      | H                       |                         |                         |                            | H                     |     |                         |              |                         |
| Excusa o justificación por conflicto de interés     | LGRA 58                           | V                                         |      | H                       |                         | V (si no se excusa)     |                            |                       |     |                         |              |                         |
| Archivo y reapertura                                | LGRA 100, 74                      | V                                         |      | H                       |                         | V                       |                            |                       |     |                         |              |                         |
| Calificar la falta (grave o no grave)               | LGRA 100                          | V                                         |      | H                       |                         | V (señales del auditor) |                            |                       |     |                         |              |                         |
| Presentar el IPRA                                   | LGRA 100, 194                     | V                                         |      | H                       |                         |                         |                            |                       |     |                         |              |                         |
| Prevención del IPRA y corrección                    | LGRA 195                          |                                           |      | H (corrige)             | H (previene)            |                         |                            |                       |     |                         |              |                         |
| Abstención                                          | LGRA 101                          | V                                         |      |                         | H                       |                         |                            |                       |     |                         |              |                         |
| Inconformidad (aviso, escrito firmado, resolución)  | LGRA 102 a 110                    | H (aviso y escrito)                       |      | H (registra el escrito) |                         | A (2.ª aprobación)      | H (resuelve)               |                       |     |                         |              |                         |
| Admitir, emplazar, audiencia inicial                | LGRA 112, 193, 208 I a VII        | V (tercera)                               |      |                         | H                       |                         |                            |                       |     |                         |              |                         |
| Vía no grave: pruebas, alegatos, cierre, resolución | LGRA 208 VIII a XI                | V                                         |      |                         | H                       |                         |                            |                       |     |                         |              |                         |
| Revocación                                          | LGRA 210 a 212                    |                                           |      |                         | H (registra y resuelve) |                         |                            |                       |     |                         |              |                         |
| Enviar el expediente al Tribunal (grave)            | LGRA 209 I                        | V                                         |      |                         | H                       |                         |                            |                       |     |                         |              |                         |
| Vía grave en el Tribunal hasta la sentencia         | LGRA 209 II a V                   | V                                         |      |                         |                         |                         | H                          |                       |     |                         |              |                         |
| Reclasificación ordenada por el Tribunal            | LGRA 209 II                       |                                           |      |                         |                         |                         | H                          |                       |     |                         |              |                         |
| Apelación y revisión                                | LGRA 215 a 221                    | H (apela como tercera, fuera del sistema) |      | H (puede registrar)     |                         |                         | H (registra y resuelve)    |                       |     |                         |              |                         |
| Medidas cautelares                                  | LGRA 123 a 129                    | V (sin detalle)                           |      | H (pide)                | H (resuelve)            |                         | H (resuelve en sus etapas) |                       |     |                         |              |                         |
| Firmeza                                             | LGRA 206                          | V                                         |      |                         | H (no grave)            |                         | H (grave)                  |                       |     |                         |              |                         |
| Ejecución, inscripción en el S3 y cierre            | LGRA 222, 225, 27                 | V                                         |      |                         | H                       | V                       |                            |                       |     |                         |              |                         |
| Vista al Ministerio Público                         | LGRA 10 III, 98; CNPP 222         | V                                         |      | H                       | H                       |                         |                            | V (fuera del sistema) |     |                         |              |                         |
| Vía penal (investigación, determinación, juicio)    | CNPP 211, 253 a 258               | V                                         |      |                         |                         |                         |                            | H                     |     |                         |              |                         |
| Recursos federales: marca y aviso                   | LCF 49; LFRCF 47, 66 Bis; CPF 212 |                                           | H    | H                       |                         |                         |                            |                       |     |                         |              |                         |
| Turnar a otro nodo (solo anónimas)                  | LGRA 14, 196 II                   | V (folio nuevo)                           | H    | H                       |                         |                         |                            | H                     |     | V (transporta)          |              |                         |
| Abrir la identidad sellada (2 personas)             | LGRA 64, 91; CNPP 109 XXVI        | V (lo ve en su seguimiento)               |      | H / A                   |                         | A                       |                            | H / A                 |     |                         |              |                         |
| Escalamiento por inacción (segunda llave)           | LGRA 64 II, 58, 100               |                                           |      |                         |                         | H (abre la copia)       |                            |                       |     |                         |              |                         |
| Alta de instituciones con huella                    | BPDN 57                           |                                           |      |                         |                         |                         |                            |                       | H   | H (directorio)          | A (cofirman) |                         |
| Competencia por dependencia (firma de la tabla)     | CPEUM 109 III; LGRA 10            |                                           |      |                         |                         |                         |                            |                       | H   | V (acepta)              | A (cofirman) | V (`/quien-atiende`)    |
| Directorio firmado y bitácora nacional              | BPDN 59 a 61; LGSNA 21            |                                           |      |                         |                         |                         |                            |                       |     | H                       | A (cofirman) | V (verifica)            |
| Estadística para la PDN (OAuth)                     | BPDN 60, 61                       |                                           |      |                         |                         |                         |                            |                       |     | H                       |              | V (datos abiertos)      |
| Observatorio, datos abiertos y registro público     | BPDN 61; LGSNA 21                 | V                                         |      |                         |                         |                         |                            |                       |     | H (publica)             | V            | H (consulta y verifica) |

## Diagrama general del ciclo legal con las funciones

Las dos vías corren en paralelo y son autónomas (CPEUM, art. 109; LGRA, art. 14). Cada caja dice
qué función da el paso.

```mermaid
flowchart TD
  P["Persona denunciante<br/>presenta en la ventanilla (LGRA 91, 93)"] --> ENR["SESNA: enrutador ciego<br/>transporta el sobre cerrado"]
  ENR --> DEC{"¿La tabla de competencia<br/>asigna autoridad?"}
  DEC -- "Sí" --> INV0["Investigadora (OIC o Contraloría)<br/>Aceptar la denuncia"]
  DEC -- "No o sin clasificar" --> BUZ["Recepción: buzón general<br/>Turnar con motivo (LGRA 14; BPDN 58)"]
  BUZ --> INV0
  INV0 --> INV1["Investigadora: Iniciar la investigación<br/>(LGRA 94; 30 dn si es grave, art. 64 II)"]
  INV1 --> CAL["Investigadora: Calificar la falta (LGRA 100)"]
  INV1 -. "sin elementos" .-> ARCH["Archivo (LGRA 100)<br/>se puede reabrir"]
  CAL --> IPRA["Investigadora: Presentar el IPRA (LGRA 194)"]
  CAL -. "no grave" .-> INC["Persona: inconformidad 5 dh<br/>Tribunal resuelve (LGRA 102 a 110)"]
  IPRA --> SUB0{"Substanciadora"}
  SUB0 -- "Prevenir (LGRA 195)" --> IPRA
  SUB0 -- "Abstenerse (LGRA 101)" --> ABS["Abstención<br/>inconformidad posible"]
  SUB0 -- "Admitir (LGRA 208 I)" --> EMP["Substanciadora: emplazar<br/>y audiencia inicial (LGRA 208 II a VII)"]
  EMP --> RAMA{"¿Grave o no grave?"}
  RAMA -- "No grave" --> NG["Substanciadora: pruebas, alegatos,<br/>cierre y resolución (LGRA 208 VIII a XI)"]
  RAMA -- "Grave o de particulares" --> TJA["Tribunal: recibir, pruebas, alegatos,<br/>cierre y sentencia (LGRA 209)"]
  NG -. "revocación 15 dh" .-> NG
  TJA -. "apelación 15 dh / revisión 10 dh" .-> TJA
  NG --> FIRME["Firmeza (LGRA 206)"]
  TJA --> FIRME
  FIRME --> EJE["Substanciadora: ejecución,<br/>inscripción en el S3 y cierre (LGRA 222, 225, 27)"]
  INV1 -. "Dar vista al Ministerio Público" .-> PEN["Fiscalía: vía penal en paralelo<br/>(CNPP 211, 222, 253 a 258)"]
  SUPV["Supervisión: escalamientos<br/>y segunda llave"] -. "vigila reglas públicas" .-> INV1
  OBS["Testigos y CPC: cofirman bitácora<br/>y directorio, sin ver casos"] -. "vigilan el sistema" .-> ENR
```

## Fuentes

- Código de este repositorio (rama `main`), en especial
  `packages/contracts/src/authority-access.ts` (funciones de cuenta),
  `packages/contracts/src/catalogs/lifecycle.ts` (etapas, recursos, cierres),
  `apps/web/src/pages/authority/` (panel) y `apps/web/src/pages/` (ventanilla).
- Documentos: `docs/ciclo-de-vida-legal.md`, `docs/proceso-legal-de-la-denuncia.md`,
  `docs/competencia-por-dependencia.md`, `docs/proteccion-de-quien-denuncia.md`,
  `docs/instalacion-nodo.md`, `docs/instalacion-sesna.md`, `docs/guia-conecta-tu-estado.md`,
  `docs/criptografia.md`, `docs/contexto-pdn.md`, `docs/auditoria-guia.md`.
- Recorrido completo de la demostración con todos los perfiles y su revisión en vivo del
  16 de noviembre de 2026 (las limitaciones encontradas se marcan en cada manual).

## Contradicciones encontradas entre código, guía y ley

| Tema                                                    | Qué dice cada fuente                                                                                                                                                  | Qué se usó en los manuales                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Firmeza de la sentencia o resolución                    | La ley da 15 dh para apelar (LGRA 210, 215) antes de la firmeza (art. 206). El código solo bloquea la firmeza si hay un recurso **registrado**; no espera el plazo    | Se describe el botón y se avisa que hay que esperar el plazo a mano |
| «Marcar recursos federales» en «Trámite → Acción»       | La guía y `ciclo-de-vida-legal.md` dicen que está en «Acción». El código tiene el texto, pero el panel nunca lo ofrece ahí; solo en la tarjeta «Recursos federales»   | Se usa la tarjeta                                                   |
| «Cambiar a quién va» con «Buzón general»                | La guía lo menciona. El código solo ofrece el buzón cuando el propio sistema lo propone                                                                               | Se describe lo que hace el código                                   |
| Vista al Ministerio Público                             | La guía y la ley suponen que la fiscalía la recibe (LGRA 10 fr. III). En el sistema solo se registra el acto; no llega a la bandeja de la fiscalía                    | Limitación conocida                                                 |
| Fiscalía con funciones administrativas                  | La fiscalía es el MP. Su cuenta de demostración tiene «recepción» e «investigación», así que ve plazos y acciones administrativas («Dar vista al Ministerio Público») | Limitación conocida                                                 |
| Contraloría con etapas penales                          | La vía penal la registra la fiscalía (o el OIC como coadyuvante, LGRA 42). El código deja a cualquier cuenta de investigación registrar etapas penales                | Limitación conocida                                                 |
| Buzón turna al Tribunal                                 | El Tribunal no recibe denuncias (LGRA 209). La lista «Autoridad» del buzón lo incluye                                                                                 | Limitación conocida                                                 |
| Tribunal y «Descartar pruebas»                          | El Tribunal no debe disponer de las pruebas. El panel le muestra el botón                                                                                             | Limitación conocida                                                 |
| Cierre sin inscripción en el S3 y con recurso pendiente | LGRA 27 y 206. El código permite «Cerrar con fundamento» en ambos casos                                                                                               | Limitación conocida                                                 |
| Alta estatal con delitos del CPF                        | Un OIC estatal conoce delitos del código penal local. El formulario de alta ofrece el «Código Penal Federal»                                                          | Limitación conocida                                                 |
| Seguimiento «Lo que sigue» tras la sentencia grave      | Dice que notifica la Contraloría; en la vía grave notifica el Tribunal (LGRA 209 fr. V)                                                                               | Limitación conocida                                                 |
