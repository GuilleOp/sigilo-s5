# Escenario de la demostración

Especificación del escenario sintético de la demostración final. Es la **fuente única de verdad**
para tres cosas que deben coincidir entre sí:

1. Las semillas de datos (red, autoridades, casos y datos PDN sintéticos).
2. Las pruebas E2E del recorrido completo.
3. El guion de la presentación (`docs/demo.md`, que se actualizará a partir de este documento).

Si una semilla, una prueba o el guion necesita un dato que no está aquí, primero se agrega aquí.
Todo es ficticio y sigue `docs/datos-sinteticos.md`. Nada de este escenario usa logotipos ni
nombres de la PDN o de SESNA como si fueran del prototipo: «S1», «S2», «S3» y «S6» se refieren
solo a la **estructura** de esos sistemas, imitada con datos inventados.

## 1. Reglas del escenario

| Regla                    | Detalle                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identificadores          | Claves estables en inglés, en minúsculas con prefijo y punto (`authority.oic-iffe`, `case.marta`). Las semillas y las pruebas usan solo estas claves. Las descripciones se escriben en español.                                                                                             |
| Folios                   | Los folios son aleatorios (`FolioSchema`). La semilla genera un mapa `clave del caso → folio` que leen las pruebas; ningún folio se escribe a mano.                                                                                                                                         |
| Días relativos           | Cada fecha se expresa como **día N** del escenario (`dayOffset`). La semilla convierte el día N en fecha al sembrar, a partir del día 0 real. Los registros históricos usan días negativos.                                                                                                 |
| Reloj simulado           | El servidor suma al reloj real los milisegundos del archivo de reloj (`docs/demo.md`). Avanzar al día N es escribir `N × 86 400 000`. El desfase admitido es de 0 a 400 días, así que todo el escenario cabe (el último evento opcional es el día 181).                                     |
| Días hábiles             | De lunes a viernes, sin los días inhábiles de un calendario configurable. Las pruebas calculan los plazos con la misma función del sistema y **nunca** fijan fechas ni días de la semana, porque el día 0 depende del día en que corre la prueba.                                           |
| Calendario de referencia | Solo para leer este documento: día 0 = lunes 9 de noviembre de 2026, con inhábiles el 16 de noviembre y el 25 de diciembre de 2026 y el 1 de enero, 1 de febrero y 15 de marzo de 2027. No incluye periodos vacacionales; si el calendario configurado los incluye, las fechas se recorren. |
| Publicación diaria       | Los eventos se encadenan en la bitácora al cerrar el día (UTC). Lo que ocurre el día N aparece en la bitácora pública el día N+1.                                                                                                                                                           |
| Plazos de la demo        | Los plazos legales (notificación, inconformidad, 30 días naturales, requerimientos) son los reales del brief. Los tiempos de investigación y resolución están **comprimidos** para la demostración y no pretenden ser realistas.                                                            |
| Archivos de imagen       | El EXIF sintético solo admite ASCII (`packages/huella/test-fixtures/synthetic-exif-jpeg.ts`), por eso sus textos van sin acentos.                                                                                                                                                           |

## 2. Red

Modelo acordado con la SESNA: **una sola ventanilla nacional** para ciudadanos y personas
servidoras públicas, que monta la SESNA junto con el enrutador ciego. La SESNA no tiene llaves y no
lee denuncias. **Cada estado monta su propio nodo** (lo opera su SESEA o su secretaría de buen
gobierno o contraloría) y declara qué institución cumple cada función en su entidad. **No hay nodo
común**: ningún estado vive en el nodo de otro. Los nodos no tienen ventanilla pública: solo el
panel de autoridades y las rutas de API que necesita el enrutador. El nodo federal aloja solo
autoridades federales y lo opera el lado federal que investiga, no la SESNA.

### 2.1 Servidores

| Clave             | Quién lo opera                                                  | Dirección en la demo    | Papel                                                                                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router.national` | SESNA                                                           | `http://127.0.0.1:8790` | Sirve la **ventanilla única** (la web pública: inicio, denunciar, Mi denuncia, registro público, observatorio, datos abiertos, cómo te cuidamos, solicitar alta y «¿Quién atiende?»), el directorio firmado, el enrutador ciego y la bitácora nacional. Es ciego: de cada envío solo ve el nodo de destino. |
| `node.queretaro`  | SESEA de Querétaro                                              | `http://127.0.0.1:8781` | Nodo estatal de Querétaro (clave INEGI `22`). Solo panel. Es uno de los testigos de la bitácora nacional.                                                                                                                                                                                                   |
| `node.federal`    | Secretaría Anticorrupción y Buen Gobierno (ficticia en la demo) | `http://127.0.0.1:8782` | Nodo federal: aloja solo autoridades federales y atiende los entes federales de cualquier entidad. Solo panel.                                                                                                                                                                                              |
| `node.oaxaca`     | Contraloría Ficticia de Oaxaca (la entidad no tiene SESEA)      | `http://127.0.0.1:8783` | Nodo estatal de Oaxaca (clave INEGI `20`; escenario sintético), con su buzón, su operación y su contraloría. Solo panel.                                                                                                                                                                                    |

Una entidad sin nodo no recibe por la ventanilla denuncias sobre sus entes estatales o
municipales: la ventanilla lo dice claramente y no envía nada (decisión 5 de la sección 10). Las
denuncias sobre entes federales sí se envían, porque las atiende el nodo federal.

### 2.2 Autoridades

| Clave                                 | Descripción                                                                       | Nodo             | Papel en el escenario                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authority.oic-iffe`                  | Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento        | `node.federal`   | Autoridad investigadora del caso de Marta. Tiene conflicto de interés, califica como no grave con su plantilla y declara sanciones que no se pueden comprobar.                      |
| `authority.oversight-federal`         | Unidad Ficticia de Supervisión de Órganos Internos de Control                     | `node.federal`   | Autoridad supervisora (superior del OIC). Recibe el escalamiento y abre el expediente con su segunda llave.                                                                         |
| `authority.oic-dfps`                  | Órgano Interno de Control en la Delegación Federal Ficticia de Programas Sociales | `node.federal`   | Recibe las tres denuncias del atacante contra el director honesto.                                                                                                                  |
| `authority.prosecutor-anticorruption` | Fiscalía Ficticia Especializada en Hechos de Corrupción                           | `node.federal`   | Recibe la vista por posibles delitos del Código Penal Federal.                                                                                                                      |
| `authority.comptroller-queretaro`     | Contraloría Estatal Ficticia de Querétaro                                         | `node.queretaro` | Autoridad estatal de referencia: archiva poco, motiva sus acuerdos y sus sanciones aparecen en el S3 ficticio.                                                                      |
| `authority.comptroller-oaxaca`        | Contraloría Ficticia de Oaxaca                                                    | `node.oaxaca`    | Autoridad de una entidad sin CPC y sin S3 conectado: sus sanciones quedan «sin cobertura».                                                                                          |
| `authority.buzon-federal`             | Buzón general ficticio del nodo Federal                                           | `node.federal`   | Buzón general (papel `inbox`) de los entes federales: recibe lo que la tabla federal no asigna (un ente federal sin OIC en el directorio) y lo turna. Su supervisora es la federal. |
| `authority.buzon-queretaro`           | Buzón general ficticio del nodo Querétaro                                         | `node.queretaro` | Buzón general (papel `inbox`) de la entidad `22`: recibe lo que la tabla de Querétaro no asigna y lo turna.                                                                         |
| `authority.buzon-oaxaca`              | Buzón general ficticio del nodo Oaxaca                                            | `node.oaxaca`    | Buzón general (papel `inbox`) de Oaxaca.                                                                                                                                            |

Los tres buzones generales están en el directorio con la llave de `keys.json` de su nodo. La
ventanilla única nunca los propone por competencia: si la tabla de funciones de la entidad (sección
2.5) no nombra a quién investiga al ente, propone el buzón de esa tabla con el motivo «La tabla de
funciones de … no nombra quién investiga a ese ente. La enviamos al buzón general…, donde una
persona la turna a quien corresponda.» Así funciona el canal único con turno (Bases de la PDN, arts.
56 y 58), igual que la bandeja general del S5. Las autoridades también pueden devolver una denuncia
al buzón (`returned_to_inbox`).

Relaciones de supervisión (para el escalamiento):

| Autoridad                         | Supervisora                   |
| --------------------------------- | ----------------------------- |
| `authority.oic-iffe`              | `authority.oversight-federal` |
| `authority.oic-dfps`              | `authority.oversight-federal` |
| `authority.comptroller-queretaro` | ninguna en la demo            |
| `authority.comptroller-oaxaca`    | ninguna en la demo            |
| `authority.buzon-federal`         | `authority.oversight-federal` |
| `authority.buzon-queretaro`       | ninguna en la demo            |
| `authority.buzon-oaxaca`          | ninguna en la demo            |

Cuentas del panel (una por persona; `npm run accounts:generate` o `npm run red:demo` les da
contraseña). La LGRA no obliga a separar la recepción de la investigación: en los OIC y las
contralorías es una sola área de quejas, denuncias e investigación, así que esas cuentas tienen las
dos funciones. Sí obliga a separar la investigación de la substanciación y la resolución (LGRA,
art. 3, fr. II a IV, y art. 115): la cuenta de substanciación del OIC IFFE es otra persona, que
avanza las etapas desde que se presenta el Informe de Presunta Responsabilidad Administrativa
(`report_filed`) y nunca turna ni abre identidades. El buzón general solo recibe y turna, y nunca
abre identidades.

| Usuario                           | Nodo             | Autoridad                             | Funciones                   |
| --------------------------------- | ---------------- | ------------------------------------- | --------------------------- |
| `buzon.federal`                   | `node.federal`   | Buzón general del nodo Federal        | Recepción y turnado         |
| `oic-equipamiento.persona1`       | `node.federal`   | `authority.oic-iffe`                  | Recepción e investigación   |
| `oic-equipamiento.persona2`       | `node.federal`   | `authority.oic-iffe`                  | Recepción e investigación   |
| `oic-equipamiento.titular`        | `node.federal`   | `authority.oic-iffe`                  | Supervisión                 |
| `oic-equipamiento.substanciacion` | `node.federal`   | `authority.oic-iffe`                  | Substanciación y resolución |
| `oic-programas`                   | `node.federal`   | `authority.oic-dfps`                  | Recepción e investigación   |
| `supervision-oic`                 | `node.federal`   | `authority.oversight-federal`         | Supervisión                 |
| `fiscalia`                        | `node.federal`   | `authority.prosecutor-anticorruption` | Investigación               |
| `operacion.federal`               | `node.federal`   | Operación del nodo Federal            | Operación del nodo          |
| `buzon.queretaro`                 | `node.queretaro` | Buzón general del nodo Querétaro      | Recepción y turnado         |
| `contraloria.queretaro`           | `node.queretaro` | `authority.comptroller-queretaro`     | Recepción e investigación   |
| `operacion.queretaro`             | `node.queretaro` | Operación del nodo Querétaro          | Operación del nodo          |
| `buzon.oaxaca`                    | `node.oaxaca`    | Buzón general del nodo Oaxaca         | Recepción y turnado         |
| `contraloria.oaxaca`              | `node.oaxaca`    | `authority.comptroller-oaxaca`        | Recepción e investigación   |
| `operacion.oaxaca`                | `node.oaxaca`    | Operación del nodo Oaxaca             | Operación del nodo          |

Las dos personas del OIC IFFE permiten la apertura de identidad de 2 de N. Las cuentas de operación
solo revisan las solicitudes de alta de autoridades (entran sin llave y no ven denuncias). Cada
solicitud de alta va al nodo de la entidad de la institución, por los pasos de la ventanilla
única. La siembra deja pendiente en el nodo de Oaxaca la del «Órgano Interno de Control
Ficticio de la Secretaría de Salud Ficticia de Oaxaca» y rechazada en el nodo Federal la del
«Órgano Interno de Control Ficticio en la Oficina Federal de Aduanas». La huella de la pendiente sale
en la salida de `demo:seed` y en `.red-demo/semilla.json` (`solicitudes`), y su llave privada en
`.red-demo/solicitudes/`. Una institución de una entidad sin nodo (en la demo, cualquiera salvo Querétaro y Oaxaca) no puede
pedir el alta: primero su estado monta su nodo.

### 2.3 Observadores y testigos

| Clave                         | Descripción                                             | Tipo     | Papel                                                                                               |
| ----------------------------- | ------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `observer.cpc-queretaro`      | Comité de Participación Ciudadana Ficticio de Querétaro | CPC      | Ve indicadores agregados y eventos de escalamiento (sin contenido). Firma la cabeza de la bitácora. |
| `observer.university-ejemplo` | Universidad Ficticia Ejemplo                            | Academia | Replica el observatorio con los datos abiertos y firma la cabeza de la bitácora.                    |

Testigos de la bitácora nacional: `observer.cpc-queretaro`, `observer.university-ejemplo` y
`node.queretaro`, con umbral **2 de 3**. En la demo se apaga un testigo para mostrar que la cabeza
sigue firmada con los otros dos.

### 2.4 Entidad sin cobertura

| Clave | Descripción | CPC | S1  | S2  | S3  | S6  | Nodo propio                                 |
| ----- | ----------- | --- | --- | --- | --- | --- | ------------------------------------------- |
| `20`  | Oaxaca      | No  | No  | No  | No  | No  | Sí (`node.oaxaca`, lo opera su contraloría) |

Oaxaca es una entidad real (clave INEGI `20`, en el catálogo `STATES`), pero su papel en la demo es
un **escenario sintético**: que no tenga CPC ni S3 conectado en las fuentes sintéticas
(`packages/contexto-pdn`) y que su nodo lo opere su contraloría **no describe la situación real de
Oaxaca**. Sus instituciones y personas son ficticias y se rotulan así («Contraloría Ficticia de
Oaxaca», «Buzón general ficticio del nodo Oaxaca»); ningún nombre es de una dependencia real. El
observatorio muestra la fila de Oaxaca con los datos reales de la matriz de cobertura
(`datos/cobertura`), sin fila sintética aparte. Oaxaca aparece en el directorio (su nodo, sus
autoridades y su tabla de funciones), en «¿Quién atiende tu denuncia en tu estado?», en una denuncia
sembrada (`case.oaxaca-routing`, día 1) que la ventanilla única propone a
`authority.comptroller-oaxaca` y que la contraloría acepta, y en la solicitud de alta pendiente de su
nodo.

### 2.5 Tabla de funciones de cada nodo

Cada nodo declara, para su entidad, qué institución cumple cada función. La tabla
(`FunctionTable`, formato 1) la firma el nodo con su llave de firma del directorio y viaja dentro del
directorio, que firma la operación y cofirman los testigos. Así la SESNA no puede cambiar la tabla
de un estado sin la firma de ese estado, y los testigos ven cada versión. Cada regla dice a qué
órdenes de gobierno aplica y, si hace falta, a qué entes específicos («ente X → su OIC») y a qué
gravedad (la resolución de faltas graves es del tribunal). Gana la regla que nombra al ente sobre la
de todo su orden. La ventanilla propone con la tabla de la entidad de los hechos (la federal, si el
ente es federal); si la tabla no nombra a nadie, propone su buzón general. El panel muestra en el
detalle quién sigue (substanciación, resolución, supervisión, vía penal y observador) y la página
pública «¿Quién atiende tu denuncia en tu estado?» (`/quien-atiende`) muestra cada tabla.

| Función                      | Querétaro (`node.queretaro`)                                                               | Federal (`node.federal`)                                                                        | Oaxaca (`node.oaxaca`)                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Buzón general                | `authority.buzon-queretaro`                                                                | `authority.buzon-federal`                                                                       | `authority.buzon-oaxaca`                                                      |
| Operación del nodo           | SESEA Ficticia de Querétaro                                                                | Secretaría Anticorrupción y Buen Gobierno Ficticia                                              | Secretaría de la Contraloría Ficticia de Oaxaca                               |
| Investigación y calificación | Entes estatales y municipales (los municipales sin OIC): `authority.comptroller-queretaro` | `VE-INSTITUTO`: `authority.oic-iffe`; `VE-PROGRAMAS`: `authority.oic-dfps`; los demás, al buzón | Entes estatales y municipales: `authority.comptroller-oaxaca`                 |
| Substanciación               | Dirección Ficticia de Responsabilidades de la Contraloría                                  | El área de responsabilidades de cada OIC                                                        | Dirección Ficticia de Responsabilidades de la Contraloría                     |
| Resolución                   | No grave: la Contraloría; grave: Tribunal de Justicia Administrativa Ficticio              | No grave: cada OIC; grave: Tribunal Federal Ficticio de Justicia Administrativa                 | No grave: la Contraloría; grave: Tribunal de Justicia Administrativa Ficticio |
| Supervisión                  | Titular de la Contraloría                                                                  | `authority.oversight-federal`                                                                   | Sin asignar                                                                   |
| Vía penal                    | Fiscalía Anticorrupción Ficticia de Querétaro                                              | `authority.prosecutor-anticorruption`                                                           | Fiscalía Ficticia de Oaxaca                                                   |
| Observador                   | `observer.cpc-queretaro`                                                                   | CPC Ficticio del Sistema Nacional                                                               | Sin asignar (no tiene CPC)                                                    |

Reglas de coherencia que revisa el directorio (`functionTableProblems`): una tabla por nodo y por
entidad; firma válida del nodo; una tabla estatal no cubre entes federales y la federal solo cubre
federales; solo nombra autoridades de su propio nodo y de su entidad; el buzón y la investigación
deben ser autoridades del directorio con el papel `inbox` e `investigating` (reciben sobres
cifrados); las demás funciones pueden ser una institución sin llaves.

## 3. Entes y personas

### 3.1 Entes del catálogo

| Clave del catálogo | Descripción                                       | Orden   | Estado en el catálogo                                            |
| ------------------ | ------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| `VE-INSTITUTO`     | Instituto Federal Ficticio de Equipamiento (IFFE) | federal | **Nuevo**: lo agrega la tarea de semillas a `public-entities.ts` |
| `VE-PROGRAMAS`     | Delegación Federal Ficticia de Programas Sociales | federal | Ya existe                                                        |
| `VE-FINANZAS`      | Secretaría de Finanzas Estatal Ficticia           | estatal | Ya existe                                                        |

Quien denuncia elige además entre los 7,213 entes reales del directorio de la PDN y los 2,478
municipios del INEGI (`packages/contracts/src/entes/README.md`). Los entes ficticios (`VE-…`) se
muestran con «(ficticia)», y ninguna denuncia sembrada acusa a una institución real: todos los
casos usan entes `VE-…`.

### 3.2 Personas (todas ficticias)

| Clave                         | Nombre                          | Cargo ficticio                                                     | Ente           |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------ | -------------- |
| `reporter.marta`              | Marta Ejemplo                   | Auxiliar del Departamento de Compras (área de 5 personas)          | `VE-INSTITUTO` |
| `reporter.luis`               | Luis Ejemplo                    | Persona externa al IFFE que conoce la entrega del equipo           | ninguno        |
| `accused.purchasing-head`     | Servidor Ficticio Uno           | Jefe del Departamento de Compras (persona denunciada)              | `VE-INSTITUTO` |
| `official.oic-head`           | Servidora Ficticia Dos          | Titular del OIC en el IFFE                                         | `VE-INSTITUTO` |
| `accused.honest-director`     | Servidor Ficticio Tres          | Director de la Delegación (el «director honesto»)                  | `VE-PROGRAMAS` |
| `official.purchasing-staff-2` | Persona Ficticia Compras Dos    | Analista de compras                                                | `VE-INSTITUTO` |
| `official.purchasing-staff-3` | Persona Ficticia Compras Tres   | Analista de compras                                                | `VE-INSTITUTO` |
| `official.purchasing-staff-4` | Persona Ficticia Compras Cuatro | Capturista de compras                                              | `VE-INSTITUTO` |
| `official.admin-director`     | Servidor Ficticio Cinco         | Director de Administración, superior inmediato del jefe de compras | `VE-INSTITUTO` |
| `official.sanctioned-6`       | Servidor Ficticio Seis          | Persona con sanción declarada por el OIC (contradicha)             | `VE-INSTITUTO` |
| `official.sanctioned-7`       | Servidor Ficticio Siete         | Persona con sanción declarada por el OIC (sin registro)            | `VE-INSTITUTO` |
| `attacker`                    | Persona Atacante Ficticia       | Quien envía las tres denuncias coordinadas                         | ninguno        |

Empresas ficticias: `supplier.comercializadora` (Comercializadora Ficticia Ejemplo, S.A. de C.V.,
proveedor de la adjudicación de Marta, en la lista ficticia tipo 69-B), `supplier.servicios-dos`
(Servicios Ficticios Ejemplo Dos, S.A. de C.V., ganador de la licitación de la Delegación) y
`company.inmobiliaria` (Inmobiliaria Ficticia Ejemplo, S.A. de C.V., interés en común del conflicto).
Asociación ficticia: `association.egresados` (Asociación Ficticia de Egresados Ejemplo, A.C.).

## 4. Casos

### 4.1 `case.marta`: adjudicación directa a un proveedor en la lista tipo 69-B

**Quién y por dónde.** Marta presenta la denuncia el día 0 desde Querétaro por la ventanilla única
del enrutador nacional. Elige un ente federal, así que el sobre va dirigido a `node.federal`; el
enrutador solo ve ese destino y el nodo Querétaro no ve nada.

**Modo.** Identidad sellada (`sealed`), porque la inconformidad del día 31 la necesita (la ley pide
nombre, domicilio y firma). Identidad sellada sintética: Marta Ejemplo, `marta@example.org`,
`55 0000 0001`, domicilio «Calle Ficticia 1, Villa Ejemplo».

**Hechos (`ComplaintFacts`).**

| Campo              | Valor                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `stateCode`        | `22` (Querétaro)                                                                                                                                |
| `municipalityCode` | sin municipio: Marta acepta la sugerencia de bajar la precisión                                                                                 |
| `entityId`         | `VE-INSTITUTO`                                                                                                                                  |
| `offenseCode`      | `LGRA-59`, «Contratar a personas o empresas que tienen prohibido contratar (contratación indebida)». Falta grave: prescribe en 7 años (art. 74) |
| `occurredPeriod`   | `2026-03`                                                                                                                                       |
| `accused`          | «Servidor Ficticio Uno, Jefe del Departamento de Compras»                                                                                       |

**Contrato ficticio (OCDS).** `ocid` = `ocds-fict00-IFFE-AD-2026-0042`; identificador del contrato
`IFFE-AD-2026-0042`. El prefijo `fict00` es inventado y no corresponde a ningún publicador.

**Narración original** (lo que Marta escribe):

> En marzo de 2026 el Departamento de Compras del Instituto Federal Ficticio de Equipamiento
> adjudicó de forma directa el contrato IFFE-AD-2026-0042 (ocds-fict00-IFFE-AD-2026-0042) a
> Comercializadora Ficticia Ejemplo, S.A. de C.V., por 1,480,000 pesos, para comprar equipo de
> cómputo.
>
> La adjudicación se justificó como urgente, pero la compra estaba en el programa anual desde enero
> y había tiempo para licitar. La empresa aparece en la lista pública de contribuyentes con
> operaciones presuntamente inexistentes.
>
> Lo sé porque soy la única que captura las requisiciones del área.
>
> El 9 de marzo de 2026, a las 5 de la tarde, mi jefe me pidió cambiar la fecha de la requisición
> para que pareciera urgente.
>
> Adjunto la foto de la cotización que se usó para justificar el precio.

**Las dos frases identificables y su versión sugerida.**

| Clave           | Frase original                                                                                                                | Hallazgos esperados del revisor (`reviewText`)                                                                                | Versión que Marta acepta                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `phrase.unique` | «Lo sé porque soy la única que captura las requisiciones del área.»                                                           | `uniqueness` (alta) en «soy la única»                                                                                         | «Lo sé porque varias personas del área revisan las requisiciones.»                                                                              |
| `phrase.moment` | «El 9 de marzo de 2026, a las 5 de la tarde, mi jefe me pidió cambiar la fecha de la requisición para que pareciera urgente.» | `exact_date` (media) en «9 de marzo de 2026», `exact_time` (media) en «a las 5 de la tarde» y `self_role` (alta) en «mi jefe» | «A principios de marzo de 2026, por la tarde, la persona titular del área pidió cambiar la fecha de la requisición para que pareciera urgente.» |

Ambas versiones sugeridas dan cero hallazgos. Además, el revisor marca con severidad baja
(`proper_name`) «Compras del Instituto Federal Ficticio de Equipamiento» y «Comercializadora
Ficticia Ejemplo»: son nombres de ente y de empresa, pueden quedarse y la prueba E2E no exige
quitarlos. Estos resultados se comprobaron con el revisor actual el 2026-11-05; si cambian sus
reglas, se actualiza esta tabla.

**Foto sintética** (`evidence.marta-quote`). Imagen generada por código: un rectángulo con el texto
«Cotizacion ficticia - Comercializadora Ficticia Ejemplo», sin personas ni lugares. EXIF ficticio,
construido con el generador de `packages/huella/test-fixtures/` y estos valores:

| Campo EXIF         | Valor                  | Qué demuestra                                       |
| ------------------ | ---------------------- | --------------------------------------------------- |
| `Make`             | `Marca Ficticia`       | La foto revela el dispositivo                       |
| `Model`            | `Modelo X1`            | La foto revela el dispositivo                       |
| `Software`         | `Editor Sintetico 1.0` | Rastro de edición                                   |
| `Artist`           | `Marta Ejemplo`        | La foto revela a la autora por su nombre            |
| `DateTimeOriginal` | `2026:03:09 17:05:00`  | La foto repite el momento exacto de `phrase.moment` |
| GPS                | 20.5, -100.25          | Coordenadas ficticias de la convención              |

La limpieza debe dejar la copia sin ninguno de estos campos («Revisado: la copia limpia ya no
tiene datos escondidos»).

**Grupo de anonimato.** El S2 sintético registra 5 personas en el Departamento de Compras del IFFE
(sección 5.2). Antes de enviar, la web avisa que el área es pequeña y que el relato puede
identificarla; con las dos frases corregidas, el semáforo baja de riesgo alto.

**Ficha de contexto esperada** (la ve la autoridad, se explica cada factor):

| Factor                                   | Fuente sintética      | Efecto en la prioridad                                        |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------- |
| Falta grave (`LGRA-59`)                  | Catálogo de conductas | Sube                                                          |
| Adjudicación directa por 1,480,000       | S6 ficticio           | Sube                                                          |
| Proveedor en la lista ficticia tipo 69-B | Lista ficticia 69-B   | Sube                                                          |
| Corroboración independiente (Luis)       | Corroboración ciega   | Sube (desde el día 3)                                         |
| Conflicto de interés en la autoridad     | S1 ficticio           | No cambia la prioridad; genera alerta y regla de escalamiento |

Resultado esperado: prioridad **alta**, mayor que la de cualquier denuncia de `case.attack-*`.

### 4.2 `case.luis`: corroboración desde el nodo Federal

Luis entra el día 3 por la ventanilla única, en modo anónimo, sin pruebas adjuntas. En lugar de la
autoridad que le propone la tabla federal (el OIC del IFFE), elige él mismo el buzón general del
nodo Federal; el buzón la turna al OIC, que la acepta. Los nodos ya no tienen entrada propia: todo
llega por la ventanilla.

| Campo            | Valor                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `stateCode`      | `22`                                                                                                 |
| `entityId`       | `VE-INSTITUTO`                                                                                       |
| `offenseCode`    | `LGRA-59`                                                                                            |
| `occurredPeriod` | `2026-03`                                                                                            |
| Corroboración    | `ocds-fict00-IFFE-AD-2026-0042` (normalizado), evaluado con OPRF; el servidor no ve el identificador |

Narración:

> El contrato ocds-fict00-IFFE-AD-2026-0042 del Instituto Federal Ficticio de Equipamiento se pagó
> completo aunque el equipo de cómputo llegó incompleto. La empresa proveedora no tenía bodega en el
> domicilio que registró.

Hallazgo esperado del revisor: solo `proper_name` (baja) en «Ficticio de Equipamiento».

Señales de independencia frente a Marta: otro destino en la red (el buzón y no la autoridad), otro
día, texto distinto, sin pruebas compartidas. Resultado: el contrato cuenta con **2 personas independientes**. Son señales,
no pruebas de identidad, y así se explica en la interfaz.

### 4.3 `case.attack-1`, `case.attack-2`, `case.attack-3`: campaña contra el director honesto

El atacante envía el día 2, en un lapso de 40 minutos, tres denuncias anónimas desde tres
dispositivos distintos contra `accused.honest-director` (`VE-PROGRAMAS`, `offenseCode` `LGRA-52`,
`occurredPeriod` `2026-04`). Ninguna presenta ficha de unicidad y ninguna adjunta pruebas.

| Clave           | Narración                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case.attack-1` | «El director de la Delegación Federal Ficticia de Programas Sociales cobra comisiones a los proveedores y reparte los apoyos entre sus conocidos. Todos en la delegación lo saben y nadie hace nada.»                  |
| `case.attack-2` | «El director de la Delegación Federal Ficticia de Programas Sociales cobra comisiones a proveedores y reparte apoyos entre conocidos suyos. En la delegación todos lo saben y nadie hace nada.»                        |
| `case.attack-3` | «El director de la Delegación Federal Ficticia de Programas Sociales adjudicó directamente el contrato ocds-fict00-DFPS-LP-2026-0007 a una empresa de su cuñado y cobra comisiones a los proveedores. Todos lo saben.» |

`case.attack-3` es inconsistente con el S6 ficticio: el contrato `ocds-fict00-DFPS-LP-2026-0007`
se registró como licitación pública (`open`) con 4 participantes y lo ganó
`supplier.servicios-dos`, que no tiene relación declarada con el director.

Resultado esperado en el panel de `authority.oic-dfps`:

- Las tres se agrupan como **posible campaña coordinada** (textos muy parecidos, misma ventana de
  tiempo, sin fichas, sin pruebas) y cuentan como **una** para la prioridad.
- `case.attack-3` muestra «Inconsistente con registros públicos: el S6 registra este contrato como
  licitación pública con 4 participantes».
- Ninguna se etiqueta como «falsa» (presunción de buena fe). La persona denunciada no recibe
  ningún aviso ni aparece en datos abiertos.

### 4.4 `case.template-archive-01` a `case.template-archive-31`: archivos con plantilla

Treinta y un acuerdos de archivo **importados** de `authority.oic-iffe` (registrados por la
obligación de las Bases de la PDN, art. 58, de registrar lo recibido por otros medios). La
importación es un solo evento de bitácora el día 0 con el digesto del lote.

- Acuerdo `i` (de 1 a 31): expediente `OIC-IFFE-INV-` seguido de `i` con cuatro dígitos
  (`OIC-IFFE-INV-0001` a `OIC-IFFE-INV-0031`), fecha día
  `-330 + 10 × (i − 1)`, recorrida al día hábil anterior si cae en inhábil. Conducta repartida en
  el catálogo de `contratos-y-tramites`.
- Texto base:

  > Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se
  > determina la conclusión y archivo del expediente {expediente}, toda vez que {variante} para
  > acreditar la existencia de la infracción y la presunta responsabilidad. Notifíquese.

- `{variante}` según `((i − 1) mod 3) + 1`:
  1. «no se cuenta con elementos suficientes»
  2. «no se advierten elementos suficientes»
  3. «no existen elementos suficientes»

La calificación de Marta (día 30) usa la misma plantilla con el expediente `OIC-IFFE-INV-0032`:
solo cambia «conclusión y archivo» por «calificación como no grave»
(`templateQualificationText` de `@sigilo/auditor/eval`). Su similitud con la variante 1 es de 0.77,
sobre el umbral de 0.75: es el acuerdo número 32 que coincide con la plantilla.

**Control negativo:** `case.queretaro-control-01` a `-05`, cinco acuerdos de
`authority.comptroller-queretaro` con motivación propia. El detector **no** debe señalarlos.

| Clave                       | Texto (resumen sembrado tal cual)                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `case.queretaro-control-01` | «Se archiva porque el contrato señalado fue revisado en la auditoría ficticia AF-01 y se comprobó la entrega completa de los bienes.» |
| `case.queretaro-control-02` | «Se canaliza a la autoridad municipal de Villa Ejemplo, competente para el trámite de licencias descrito.»                            |
| `case.queretaro-control-03` | «Se acumula al expediente CEF-INV-0012, que investiga los mismos hechos del pago de viáticos.»                                        |
| `case.queretaro-control-04` | «Se concluye con informe de presunta responsabilidad por falta no grave; se turna a la autoridad substanciadora ficticia.»            |
| `case.queretaro-control-05` | «Se archiva tras requerir información en dos ocasiones sin respuesta del buzón; se reabrirá si llegan nuevos indicios (art. 100).»    |

### 4.5 Casos auxiliares

| Clave                        | Descripción                                                                                                                                                          | Uso                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `case.queretaro-routing`     | Denuncia anónima de «Persona Denunciante Uno», día 1, `stateCode` `22`, `entityId` `VE-FINANZAS`, `offenseCode` `LGRA-54`. El enrutador la envía a `node.queretaro`. | Prueba de turnado estatal                   |
| `case.oaxaca-routing`        | Denuncia anónima, día 1, `stateCode` `20`, `entityId` `VE-SALUD`, `offenseCode` `LGRA-52`. La ventanilla la propone a `authority.comptroller-oaxaca`, que la acepta. | Prueba de turnado al nodo de Oaxaca         |
| `case.sanction-contradicted` | Cierre histórico (día -60) de `authority.oic-iffe` que declara «suspensión de 30 días» a `official.sanctioned-6`, expediente `OIC-IFFE-RES-0007`.                    | Verificación S3: contradicho                |
| `case.sanction-not-found`    | Cierre histórico (día -50) de `authority.oic-iffe` que declara «amonestación pública» a `official.sanctioned-7`, expediente `OIC-IFFE-RES-0009`.                     | Verificación S3: sin cobertura (no aparece) |
| `case.sanction-uncovered`    | Cierre histórico (día -45) de `authority.comptroller-oaxaca` que declara una inhabilitación de 1 año, expediente `CFE-RES-0003`.                                     | Verificación S3: sin cobertura (sin S3)     |
| `case.sanction-queretaro`    | Cierre histórico (día -90) de `authority.comptroller-queretaro` con amonestación privada, expediente `CEF-RES-0004`, presente en el S3 ficticio de Querétaro.        | Verificación S3: confirmado (histórico)     |
| `case.queretaro-dormant`     | Denuncia aceptada por `authority.comptroller-queretaro` el día 0 sin actuaciones posteriores.                                                                        | Alerta opcional de inactividad (día 181)    |

### 4.6 `case.ventanilla-1` y `case.ventanilla-2`: dos personas ciudadanas en la misma ventanilla

Dos personas que no trabajan en la oficina denuncian por separado, por la ventanilla única, en modo
anónimo y sin pruebas, ante `authority.comptroller-queretaro` (`node.queretaro`), que acepta cada
una. Responden «No» a «¿Trabajas o trabajaste en esa oficina?», así que la revisión les muestra el
aviso para personas ciudadanas ([personas-ciudadanas.md](personas-ciudadanas.md)) en lugar del
grupo de anonimato.

| Campo            | Valor                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Días             | 4 (`case.ventanilla-1`) y 6 (`case.ventanilla-2`)                           |
| `stateCode`      | `22`                                                                        |
| `entityId`       | `VE-MOVILIDAD`                                                              |
| `offenseCode`    | `LGRA-52` (cohecho)                                                         |
| `occurredPeriod` | `2026-09`                                                                   |
| Corroboración    | `servidor`: «Servidor Ficticio Cuatro» en `VE-MOVILIDAD`, evaluado con OPRF |

Narraciones:

> En el módulo de licencias del Instituto de Movilidad Estatal Ficticio, la persona que atiende la
> ventanilla de renovación pidió 800 pesos en efectivo para entregar la licencia el mismo día. Sin
> ese pago, dijo, el trámite tardaría un mes. No dio ningún recibo. Pasó en septiembre de 2026, por
> la mañana.

> Fui a renovar una licencia de conducir al Instituto de Movilidad Estatal Ficticio y en la
> ventanilla me dijeron que mis documentos tenían errores, pero que se podían arreglar con una
> cooperación. Comentaron que así se hace con quien tiene prisa. Ocurrió a finales de septiembre de 2026.

Hallazgos esperados del revisor: ninguno. Para mostrar el revisor en vivo, escribir «con mi trámite
número A-2026-0042» o «las placas ABC-123-D»: los marca como `case_number` y `plate`.

Señales de independencia: otro día, texto distinto, sin pruebas compartidas. Resultado: la persona
denunciada cuenta con **2 personas independientes**, sin que la Contraloría sepa quiénes son.

## 5. Datos PDN sintéticos

Imitan un subconjunto de la estructura pública de cada sistema (ver los esquemas en
`github.com/PDNMX/api_docs`) y existen **solo** para los entes del escenario. Los nombres de campo
siguen esos esquemas; los valores son inventados. La tarea de semillas decide la ruta de los
archivos; se propone un archivo por sistema (`s1.json`, `s2.json`, `s3.json`, `s6.json`,
`list-69b.json`) en una carpeta de semillas de la demo. Las fechas se guardan como `dayOffset` y la
semilla las convierte.

### 5.1 S1 ficticio: intereses declarados en común (conflicto de interés)

La titular del OIC y el jefe de compras declaran participación en las mismas dos organizaciones.
Fragmento (solo los campos que usa la regla de conflicto):

```json
[
  {
    "id": "s1.oic-head",
    "declaracion": {
      "situacionPatrimonial": {
        "datosGenerales": {
          "nombre": "Servidora",
          "primerApellido": "Ficticia",
          "segundoApellido": "Dos"
        },
        "datosEmpleoCargoComision": {
          "nombreEntePublico": "Instituto Federal Ficticio de Equipamiento",
          "areaAdscripcion": "Órgano Interno de Control",
          "empleoCargoComision": "Titular del Órgano Interno de Control",
          "nivelEmpleoCargoComision": "Titular"
        }
      },
      "interes": {
        "participacion": {
          "participacion": [
            {
              "tipoRelacion": "DECLARANTE",
              "nombreEmpresaSociedadAsociacion": "Inmobiliaria Ficticia Ejemplo, S.A. de C.V.",
              "porcentajeParticipacion": 15,
              "tipoParticipacion": { "clave": "SOCIO", "valor": "Socio" }
            },
            {
              "tipoRelacion": "DECLARANTE",
              "nombreEmpresaSociedadAsociacion": "Asociación Ficticia de Egresados Ejemplo, A.C.",
              "porcentajeParticipacion": 0,
              "tipoParticipacion": { "clave": "ASOCIADO", "valor": "Asociado" }
            }
          ]
        }
      }
    }
  },
  {
    "id": "s1.purchasing-head",
    "declaracion": {
      "situacionPatrimonial": {
        "datosGenerales": {
          "nombre": "Servidor",
          "primerApellido": "Ficticio",
          "segundoApellido": "Uno"
        },
        "datosEmpleoCargoComision": {
          "nombreEntePublico": "Instituto Federal Ficticio de Equipamiento",
          "areaAdscripcion": "Departamento de Compras",
          "empleoCargoComision": "Jefe del Departamento de Compras",
          "nivelEmpleoCargoComision": "Jefatura de departamento"
        }
      },
      "interes": {
        "participacion": {
          "participacion": [
            {
              "tipoRelacion": "DECLARANTE",
              "nombreEmpresaSociedadAsociacion": "Inmobiliaria Ficticia Ejemplo, S.A. de C.V.",
              "porcentajeParticipacion": 20,
              "tipoParticipacion": { "clave": "SOCIO", "valor": "Socio" }
            },
            {
              "tipoRelacion": "DECLARANTE",
              "nombreEmpresaSociedadAsociacion": "Asociación Ficticia de Egresados Ejemplo, A.C.",
              "porcentajeParticipacion": 0,
              "tipoParticipacion": { "clave": "ASOCIADO", "valor": "Asociado" }
            }
          ]
        }
      }
    }
  }
]
```

Al sembrar se verifican las rutas de campo contra el esquema S1 publicado. Las demás personas del área tienen declaraciones sin intereses en común con nadie del OIC (control
negativo de la regla).

### 5.2 S2 ficticio: área de compras de 5 personas y superior inmediato

Cinco registros del IFFE con `tipoArea` de contrataciones; ejercicio fiscal 2026. La clave `C` es
sintética: al sembrar se ajusta al catálogo de `tipoArea` del esquema S2.

| `id`         | Persona                         | `puesto.nombre`                  | `tipoArea`        | `superiorInmediato`                                     |
| ------------ | ------------------------------- | -------------------------------- | ----------------- | ------------------------------------------------------- |
| `s2.marta`   | Marta Ejemplo                   | Auxiliar de compras              | `C` (contratante) | Servidor Ficticio Uno, Jefe del Departamento de Compras |
| `s2.staff-2` | Persona Ficticia Compras Dos    | Analista de compras              | `C`               | Servidor Ficticio Uno                                   |
| `s2.staff-3` | Persona Ficticia Compras Tres   | Analista de compras              | `C`               | Servidor Ficticio Uno                                   |
| `s2.staff-4` | Persona Ficticia Compras Cuatro | Capturista de compras            | `C`               | Servidor Ficticio Uno                                   |
| `s2.head`    | Servidor Ficticio Uno           | Jefe del Departamento de Compras | `C`               | Servidor Ficticio Cinco, Director de Administración     |

En todos: `institucionDependencia` = `{ "nombre": "Instituto Federal Ficticio de Equipamiento",
"siglas": "IFFE", "clave": "IFFE-0001" }`. Usos: el tamaño del grupo de anonimato (5) y la cadena
de mando (el superior inmediato del denunciado no es la autoridad que investiga, así que no hay
conflicto por jerarquía; el conflicto viene del S1).

### 5.3 S3 ficticio: sanciones

Cobertura de las fuentes ficticias:

| Fuente S3 ficticia | Cubre                                                    | Fecha de corte     |
| ------------------ | -------------------------------------------------------- | ------------------ |
| `s3.federal`       | IFFE y Delegación Federal Ficticia de Programas Sociales | día de la consulta |
| `s3.queretaro`     | Entes estatales de Querétaro del catálogo                | día -1             |
| Oaxaca             | Sin fuente conectada (escenario sintético)               | no aplica          |

Registros:

| `id`                | Fuente         | Persona                | Expediente          | `tipoSancion`           | `fechaResolucion` | Para                                                                                |
| ------------------- | -------------- | ---------------------- | ------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `s3.marta-outcome`  | `s3.federal`   | Servidor Ficticio Uno  | `TFF-SALA-0001`     | Inhabilitación de 1 año | día 95            | `case.marta`: **confirmado**                                                        |
| `s3.oic-0007`       | `s3.federal`   | Servidor Ficticio Seis | `OIC-IFFE-RES-0007` | Amonestación privada    | día -60           | `case.sanction-contradicted`: el OIC declaró suspensión de 30 días: **contradicho** |
| `s3.queretaro-0004` | `s3.queretaro` | Servidor Ficticio Ocho | `CEF-RES-0004`      | Amonestación privada    | día -90           | `case.sanction-queretaro`: **confirmado**                                           |

Cada fuente solo expone los registros con `fechaResolucion` igual o anterior al día actual del
reloj, así que `s3.marta-outcome` aparece a partir del día 95. No hay registro para `OIC-IFFE-RES-0009` (`case.sanction-not-found`) ni fuente para Oaxaca en el
escenario sintético (`case.sanction-uncovered`). Ambos dan **sin cobertura**, nunca «contradicho»: la ausencia
no es evidencia (sección 6.5). En `s3.marta-outcome` la autoridad sancionadora es «Sala Ficticia
Especializada en Responsabilidades Administrativas», porque una falta grave la resuelve el
tribunal y no el OIC.

### 5.4 S6 ficticio: contrataciones en formato OCDS

```json
[
  {
    "ocid": "ocds-fict00-IFFE-AD-2026-0042",
    "buyer": { "id": "IFFE-0001", "name": "Instituto Federal Ficticio de Equipamiento" },
    "tender": {
      "procurementMethod": "direct",
      "procurementMethodDetails": "Adjudicación directa",
      "procurementMethodRationale": "Urgencia",
      "numberOfTenderers": 1
    },
    "awards": [
      {
        "id": "IFFE-AD-2026-0042-A1",
        "suppliers": [
          { "id": "XAXX260101EJ1", "name": "Comercializadora Ficticia Ejemplo, S.A. de C.V." }
        ],
        "value": { "amount": 1480000, "currency": "MXN" }
      }
    ],
    "contracts": [
      { "id": "IFFE-AD-2026-0042", "awardID": "IFFE-AD-2026-0042-A1", "dayOffsetSigned": -240 }
    ]
  },
  {
    "ocid": "ocds-fict00-DFPS-LP-2026-0007",
    "buyer": { "id": "DFPS-0001", "name": "Delegación Federal Ficticia de Programas Sociales" },
    "tender": {
      "procurementMethod": "open",
      "procurementMethodDetails": "Licitación pública",
      "numberOfTenderers": 4
    },
    "awards": [
      {
        "id": "DFPS-LP-2026-0007-A1",
        "suppliers": [
          { "id": "XAXX260101SE2", "name": "Servicios Ficticios Ejemplo Dos, S.A. de C.V." }
        ],
        "value": { "amount": 820000, "currency": "MXN" }
      }
    ],
    "contracts": [
      { "id": "DFPS-LP-2026-0007", "awardID": "DFPS-LP-2026-0007-A1", "dayOffsetSigned": -200 }
    ]
  }
]
```

`dayOffsetSigned` no es campo OCDS: lo convierte la semilla en `dateSigned`.

### 5.5 Lista ficticia tipo 69-B

Imita la lista pública de contribuyentes con operaciones presuntamente inexistentes. No es un dato
de la PDN; se consulta igual que una fuente pública más.

| RFC sintético   | Nombre                                          | Situación  | Publicación |
| --------------- | ----------------------------------------------- | ---------- | ----------- |
| `XAXX260101EJ1` | Comercializadora Ficticia Ejemplo, S.A. de C.V. | Definitivo | día -400    |

Los RFC sintéticos llevan el prefijo `XAXX` de la convención y solo viven en estos archivos de
semillas; no aparecen en ninguna narración (el revisor los marcaría).

## 6. Reglas que ejercita el escenario

Las reglas son públicas y deterministas. El auditor solo **señala con evidencia**; las decisiones
las toman las reglas de escalamiento publicadas o las personas, y todo queda en bitácora.

### 6.1 Conflicto de interés antes de turnar (`rule.conflict-of-interest`)

Antes de turnar, el nodo compara las organizaciones declaradas en el S1 por la persona titular de
la autoridad destino y por la persona denunciada. Con al menos una coincidencia se genera la alerta
`conflict.shared-interest` con la evidencia (nombres de las organizaciones, no los porcentajes). El
turnado no se bloquea: la autoridad debe excusarse o justificar (LGRA, art. 58). En `case.marta`
hay dos coincidencias.

### 6.2 Acuerdo con plantilla (`signal.template-closure`)

Regla AUD-01 de `@sigilo/auditor`. Normaliza el texto del acuerdo (quita expedientes, números,
fechas, mayúsculas y acentos) y lo compara con los acuerdos de la misma autoridad emitidos con no
más de 12 meses de diferencia, con shingles de 3 palabras y similitud de Jaccard. Señala cuando hay
al menos 5 acuerdos con similitud ≥ 0.75 (umbrales publicados en
`packages/auditor/config/umbrales.json`). Se aplica igual a los acuerdos de archivo y a los de
calificación. Debe señalar los 31 acuerdos importados y la calificación de `case.marta` (coincide
con los 31 acuerdos previos de las tres variantes) y no señalar ninguno de
`case.queretaro-control-*`. Con shingles de 3 palabras las tres variantes tienen similitud de 0.82 a
0.84 entre sí; la propuesta anterior (0.9 y 20) no detectaba ninguno. El escenario se comprueba en
`packages/auditor/src/scenario.test.ts` y la evaluación está en `packages/auditor/EVALUACION.md`.

### 6.3 Campaña coordinada (`signal.coordinated-campaign`)

Agrupa denuncias contra la misma persona con textos muy parecidos, recibidas en una ventana corta,
sin fichas de unicidad. Debe agrupar `case.attack-1..3` y no agrupar `case.marta` con `case.luis`.

### 6.4 Inconsistencia con registros públicos (`signal.public-record-inconsistency`)

Compara lo afirmado con S6 y la lista 69-B. En `case.attack-3` el contrato no fue adjudicación
directa: lo produce `verifyCitedContract` de `@sigilo/contexto-pdn`. La regla AUD-02
(`signal.archive-against-evidence`) de `@sigilo/auditor` señala los **archivos** por falta de
elementos que no se ocupan de las pruebas, la corroboración o los datos públicos confirmados; en
este escenario, `case.marta` no se archiva, así que AUD-02 no la señala.

### 6.4 bis Calificación degradada (`signal.downgraded-qualification`)

Regla AUD-03 de `@sigilo/auditor`: la conducta denunciada está en el catálogo como falta grave
(`LGRA-59`, contratación indebida) y la autoridad la califica como no grave. Fundamento de la
señal: simular conductas no graves durante la investigación de faltas graves es obstrucción de la
justicia (LGRA, art. 64, fr. I). La señal no afirma que haya ocurrido; pide revisar que el acuerdo
explique la calificación, y recuerda que la persona denunciante puede inconformarse (arts. 102 y
103). Si además vence el inicio del procedimiento ante una posible falta grave o la notificación,
AUD-04 suma una señal.

### 6.5 Verificación de sanciones contra el S3 (`check.s3-sanction`)

| Resultado     | Clave          | Cuándo                                                                                                                                                                                                                                                                                                                           | Texto en la interfaz                                                             |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Confirmado    | `confirmed`    | El S3 tiene el expediente y coincide la persona y el tipo de sanción                                                                                                                                                                                                                                                             | «Confirmada en el registro público de sanciones»                                 |
| Contradicho   | `contradicted` | El S3 tiene el expediente, pero dice otra cosa (otra sanción u otra persona)                                                                                                                                                                                                                                                     | «El registro público de sanciones dice otra cosa»                                |
| Sin cobertura | `no_coverage`  | La entidad no tiene el sistema (`reason: state-without-system`), la institución no está conectada (`institution-not-connected`), la fecha está fuera del periodo (`period-out-of-range`) no está el registro (`record-not-found`) o hay varios registros con el mismo expediente y ninguno es de la persona (`ambiguous-record`) | «No podemos comprobarlo. Que no aparezca no significa que la sanción no exista.» |

Solo `confirmed` cuenta como «sanción verificada» en el observatorio. Implementación:
`verifySanction` y `checkUnverifiableSanction` de `@sigilo/contexto-pdn` (plazo de publicación de
30 días naturales, configurable).

### 6.6 Escalamiento automático (`rule.escalation`)

Se escala a la autoridad supervisora cuando se cumple **cualquiera** de estas reglas:

| Clave                          | Regla                                                                                                                                            | Fundamento              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `escalation.conflict`          | La autoridad emite un acto resolutivo (calificación, archivo o cierre) con una alerta de conflicto sin excusa ni justificación                   | LGRA, art. 58           |
| `escalation.grave-stalled`     | Posible falta grave sin iniciar el procedimiento correspondiente dentro de los 30 días naturales siguientes a conocerla                          | LGRA, art. 64, II       |
| `escalation.archive-signals`   | Archivo con dos o más señales del auditor (AUD-01 y AUD-02)                                                                                      | LGRA, art. 100          |
| `escalation.downgrade-signals` | Calificación de no grave de una conducta grave con dos o más señales del auditor (6.2, 6.4 bis y plazos; en el auditor, AUD-01, AUD-03 y AUD-04) | LGRA, arts. 64, I y 102 |

`case.marta` cumple `escalation.conflict` y `escalation.downgrade-signals` el día 31; el OIC inicia
el procedimiento el día 30, así que `escalation.grave-stalled` no se cumple. La alerta de conflicto
explica el procedimiento del art. 58: quien tiene el conflicto informa a su superior inmediato y
pide que lo excuse; el superior le responde a más tardar 48 horas antes del plazo para atender el
asunto. La supervisora abre el expediente con su **segunda llave**, sin depender de la autoridad
escalada.

Las alertas de inactividad (5 y 6 meses sin actuar) durante la investigación son alertas del
prototipo y no citan la caducidad: la caducidad de la instancia (LGRA, art. 74) solo aplica al
procedimiento de responsabilidad ya admitido el informe y se decreta a solicitud del presunto
infractor. Para esas etapas hay alertas propias (`alert.expiry-warning` y `alert.expiry-reached`).

## 7. Línea de tiempo

Fechas del calendario de referencia (día 0 = lunes 9 de noviembre de 2026). Las pruebas usan la
columna «Regla del plazo», no las fechas.

| Día | Fecha de referencia | Desfase del reloj (ms) | Quién                         | Qué ocurre                                                                                                                                                                                                                                                | Regla del plazo y fundamento                                                                      |
| --- | ------------------- | ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0   | lun 2026-11-09      | 0                      | Semilla                       | Red, directorio, datos PDN sintéticos, importación de los 31 acuerdos y cierres históricos.                                                                                                                                                               |                                                                                                   |
| 0   | lun 2026-11-09      | 0                      | Marta                         | Envía `case.marta` con Huella Cero (dos frases corregidas, foto limpia). Recibe folio y recibo.                                                                                                                                                           | Inicia el plazo de 30 días naturales (falta grave)                                                |
| 0   | lun 2026-11-09      | 0                      | `node.federal`                | Ficha de contexto y **alerta de conflicto** antes de turnar. **Turnado** a `authority.oic-iffe` con la alerta visible.                                                                                                                                    | LGRA, art. 58                                                                                     |
| 1   | mar 2026-11-10      | 86 400 000             | `authority.oic-iffe`          | Acepta el turnado sin excusarse. Queda registrado; `escalation.conflict` se evalúa en su primer acto resolutivo.                                                                                                                                          |                                                                                                   |
| 1   | mar 2026-11-10      | 86 400 000             | Marta                         | En «Dar seguimiento» ve «Turnada: tu denuncia ya está con la autoridad que puede investigarla» y la explicación de qué significa.                                                                                                                         |                                                                                                   |
| 1   | mar 2026-11-10      | 86 400 000             | Persona Denunciante Uno       | `case.queretaro-routing` llega a `node.queretaro`.                                                                                                                                                                                                        |                                                                                                   |
| 1   | mar 2026-11-10      | 86 400 000             | Persona denunciante de Oaxaca | `case.oaxaca-routing` llega a `node.oaxaca` y la contraloría la acepta.                                                                                                                                                                                   |                                                                                                   |
| 2   | mié 2026-11-11      | 172 800 000            | Atacante                      | Envía `case.attack-1..3` en 40 minutos. El panel de `authority.oic-dfps` las agrupa como posible campaña; `case.attack-3` sale inconsistente con el S6.                                                                                                   |                                                                                                   |
| 3   | jue 2026-11-12      | 259 200 000            | Luis                          | Envía `case.luis` por la ventanilla al buzón del nodo Federal; el buzón la turna al OIC y el OIC la acepta, y el nodo la confirma ante el índice. Solo entonces el contrato pasa a «2 o más» personas independientes y sube la prioridad de `case.marta`. |                                                                                                   |
| 30  | mié 2026-12-09      | 2 592 000 000          | `authority.oic-iffe`          | Inicia el procedimiento y el mismo día **califica** la falta grave (`LGRA-59`) como **no grave** con un acuerdo de plantilla (expediente `OIC-IFFE-INV-0032`).                                                                                            | Último de los 30 días naturales (LGRA, art. 64, II); calificación (art. 100)                      |
| 30  | mié 2026-12-09      | 2 592 000 000          | `authority.oic-iffe`          | **Notifica la calificación a Marta** por el buzón, con la forma de consultar el expediente. Desde aquí corren 5 días hábiles para inconformarse.                                                                                                          | LGRA, arts. 102 y 103: límite día 37 (2026-12-16)                                                 |
| 31  | jue 2026-12-10      | 2 678 400 000          | Auditor                       | **Señales**: `signal.template-closure` (AUD-01, coincide con los 31 acuerdos previos) y `signal.downgraded-qualification` (AUD-03), con evidencia.                                                                                                        | LGRA, art. 64, I                                                                                  |
| 31  | jue 2026-12-10      | 2 678 400 000          | Reglas                        | **Escalamiento** automático a `authority.oversight-federal` por `escalation.conflict` y `escalation.downgrade-signals`. Los observadores ven el evento sin contenido.                                                                                     | LGRA, arts. 58, 64, I y 102                                                                       |
| 32  | vie 2026-12-11      | 2 764 800 000          | `authority.oversight-federal` | Acepta el escalamiento y abre el expediente con su segunda llave.                                                                                                                                                                                         |                                                                                                   |
| 35  | lun 2026-12-14      | 3 024 000 000          | Marta                         | Se **inconforma** en el 3.er día hábil de la ventana, ante la autoridad investigadora. Acepta abrir su identidad sellada **solo para el recurso**; la apertura queda en bitácora y ella la ve.                                                            | LGRA, arts. 103, 104 y 109: nombre, domicilio y firma autógrafa                                   |
| 36  | mar 2026-12-15      | 3 110 400 000          | `authority.oic-iffe`          | Corre traslado a la Sala Especializada con el expediente y un informe que justifique la calificación. Mientras se resuelve, no se inicia el procedimiento de responsabilidad.                                                                             | LGRA, arts. 102 y 104                                                                             |
| 36  | mar 2026-12-15      | 3 110 400 000          | `authority.oversight-federal` | Da vista a la fiscalía (re-cifrada en su navegador) por posibles delitos, como orientación: CPF, art. 217, fr. I, incisos B y D (adjudicaciones y adquisiciones ilícitas).                                                                                | CPF, art. 217; el art. 220, fr. I, solo si se acredita beneficio a socios o sociedades vinculadas |
| 79  | mié 2027-01-27      | 6 825 600 000          | Sala (fuera del sistema)      | Vence el plazo de la Sala para resolver la inconformidad. En la demo, la Sala la declara fundada: la conducta es grave.                                                                                                                                   | LGRA, art. 107: 30 días hábiles                                                                   |
| 95  | vie 2027-02-12      | 8 208 000 000          | `authority.oversight-federal` | Registra la resolución con fundamento: «resuelto con sanción», expediente `TFF-SALA-0001`. Plazos comprimidos para la demo.                                                                                                                               |                                                                                                   |
| 96  | sáb 2027-02-13      | 8 294 400 000          | Sistema                       | Verificación contra `s3.federal`: **confirmado**. Marta ve el resultado en su seguimiento; el observatorio suma una sanción verificada.                                                                                                                   |                                                                                                   |
| 151 | vie 2027-04-09      | 13 046 400 000         | Sistema (opcional)            | **Alerta de inactividad** a los 5 meses para `case.queretaro-dormant`, en investigación. No cita la caducidad.                                                                                                                                            | Regla publicada del prototipo                                                                     |
| 181 | dom 2027-05-09      | 15 638 400 000         | Sistema (opcional)            | **Alerta de inactividad** a los 6 meses para `case.queretaro-dormant`. Es una alerta, no una determinación legal: en la investigación no corre la caducidad de la instancia.                                                                              | La caducidad (LGRA, art. 74) solo aplica después de admitido el informe                           |

Además, la alerta de prescripción de `case.marta` muestra que la falta grave prescribe a los 7 años
contados desde marzo de 2026, y que la calificación interrumpe el plazo (LGRA, art. 74). Como el
periodo de los hechos es mensual, la fecha se muestra a nivel de mes.

**Textos clave que ve Marta** (las pruebas E2E buscan estas frases):

- Día 1: «Turnada: tu denuncia ya está con la autoridad que puede investigarla. Desde hoy corre su
  plazo.»
- Día 30: «La autoridad calificó la conducta como falta no grave. Si no estás de acuerdo, puedes
  inconformarte dentro de los 5 días hábiles siguientes a que te lo notifique por el buzón (LGRA,
  arts. 102 y 103), desde este seguimiento. Para hacerlo, la ley pide tu nombre, domicilio y firma
  (art. 109): solo entonces se abriría tu identidad sellada, y solo para el recurso.»
- Día 31: la regla «Calificación de no grave con dos o más señales del auditor» y «Acto
  resolutivo con conflicto de interés sin excusa» aparecen como cumplidas: la denuncia pasó a la
  autoridad supervisora.
- Día 35: «Abriste tu identidad para el recurso de inconformidad. Queda registrado quién la abrió,
  cuándo y para qué.»

## 8. Observatorio

### 8.1 Indicadores por autoridad (línea base al día 0)

Doce meses previos al escenario. Los conteos de denuncias son múltiplos de 5 para que el redondeo
de los datos abiertos los deje iguales y las pruebas puedan comparar exacto. Los conteos de actos de
autoridad (acuerdos, sanciones declaradas y su verificación) se muestran exactos.

| Autoridad                         | Recibidas | Archivadas | Tasa de archivo | Con plazo vencido | Acuerdos con plantilla | Sanciones declaradas | Confirmadas | Contradichas | Sin cobertura |
| --------------------------------- | --------- | ---------- | --------------- | ----------------- | ---------------------- | -------------------- | ----------- | ------------ | ------------- |
| `authority.oic-iffe`              | 60        | 45         | 75 %            | 15                | 31                     | 2                    | 0           | 1            | 1             |
| `authority.oic-dfps`              | 40        | 15         | 38 %            | 5                 | 0                      | 1                    | 1           | 0            | 0             |
| `authority.comptroller-queretaro` | 85        | 25         | 29 %            | 5                 | 0                      | 4                    | 4           | 0            | 0             |
| `authority.comptroller-oaxaca`    | 20        | 10         | 50 %            | 10                | 0                      | 3                    | 0           | 0            | 3             |
| `authority.oversight-federal`     | 5         | 0          | 0 %             | 0                 | 0                      | 0                    | 0           | 0            | 0             |

Cambios esperados al día 96: `authority.oic-iffe` suma una recibida, una calificación de no grave y
un acuerdo con plantilla (32); `authority.oversight-federal` suma un escalamiento y una sanción confirmada;
`authority.oic-dfps` suma tres recibidas agrupadas como una campaña. Las pruebas comparan la línea
base exacta y, después del recorrido, que cada indicador cambió en la dirección indicada (los
nuevos totales ya no son múltiplos de 5 y pasan por el redondeo).

### 8.2 Mapa de cobertura

**Cifras reales agregadas** (públicas, consultadas el 2026-11-05; fuentes: API pública y reportes
de cobertura de la PDN citados en el brief). Se muestran como contexto nacional, nunca como datos
del prototipo:

| Sistema                           | Cobertura real agregada                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| S1 (declaraciones)                | 30 proveedores de datos                                          |
| S2 (servidores en contrataciones) | 778 instituciones de 15 proveedores (SFP y 14 estados)           |
| S3 servidores (sanciones)         | 678 instituciones, 39 % conectadas                               |
| S3 particulares                   | 3 proveedores                                                    |
| S6 (contrataciones)               | Solo federal, ciclos 2015-2021 (1.06 millones de procedimientos) |

**Matriz sintética del escenario** (la que usan las pruebas):

| Entidad          | CPC                           | S1  | S2  | S3  | S6                   | Nodo             |
| ---------------- | ----------------------------- | --- | --- | --- | -------------------- | ---------------- |
| Federal          | no aplica                     | Sí  | Sí  | Sí  | Sí                   | `node.federal`   |
| Querétaro (`22`) | Sí (`observer.cpc-queretaro`) | Sí  | Sí  | Sí  | No (S6 solo federal) | `node.queretaro` |
| Oaxaca (`20`)    | **No**                        | No  | No  | No  | No                   | `node.oaxaca`    |

El mapa del observatorio es un coroplético de las 32 entidades con el contorno del INEGI (Marco
Geoestadístico, diciembre de 2025; proyectado y simplificado por `scripts/mapa-entidades.ts`, ver
`datos/mapa-entidades/metodologia.md`), servido desde el mismo origen y sin servicios de terceros.
Nunca baja a nivel municipal ni muestra coordenadas. Es un mapa del S5, no de la PDN completa (la
cobertura de todos los sistemas la publica la SESNA en su página de cobertura, enlazada desde la
tabla): tres capas, **conexión al S5** (Querétaro y Oaxaca con nodo propio; las demás, sin nodo todavía),
**denuncias por 100 000 habitantes** (corte nacional: meses cerrados y celdas de 5 o más, con la
población del mismo Marco Geoestadístico) y **protección del anonimato** (porcentaje de personas
cuya área tiene k ≥ 10, de `datos/abiertos/grupos-anonimato/resumen.csv`). Lo federal no tiene lugar en el
mapa.

### 8.3 Casos resueltos agregados («¿Sirvió denunciar?»)

Toda la red, 12 meses previos al escenario (210 denuncias):

| Resultado                           | Clave                   | Denuncias |
| ----------------------------------- | ----------------------- | --------- |
| Con sanción verificada en el S3     | `sanctioned-verified`   | 5         |
| Con sanción declarada sin comprobar | `sanctioned-unverified` | 5         |
| Archivadas por falta de elementos   | `insufficient-evidence` | 95        |
| Archivadas y reabiertas             | `reopened`              | 5         |
| Canalizadas a otra autoridad        | `referred`              | 20        |
| Acumuladas a otro expediente        | `merged`                | 10        |
| Improcedentes                       | `inadmissible`          | 10        |
| En trámite                          | `in-progress`           | 60        |

Conteos redondeados a múltiplos de 5. «Con sanción declarada sin comprobar» agrupa las
contradichas y las sin cobertura. Al día 96, `case.marta` pasa por «calificada como no grave»,
«inconformidad fundada» y «con sanción verificada»; el observatorio cuenta solo su estado final.

## 9. Relación con el reto

| Elemento del escenario                                        | Criterio (bases)                  | Frase del reto o del taller que demuestra                                                   |
| ------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| Enrutador ciego y nodos (`router.national`, `node.*`)         | 1 confidencialidad, 6 innovación  | «Confidencialidad y anonimato en recepción, trámite y seguimiento»                          |
| Ventanilla única (Marta y Luis, que elige el buzón federal)   | 3 funcionalidad                   | Bases de la PDN, art. 57: ventanilla única                                                  |
| Frases `phrase.unique` y `phrase.moment`, grupo de 5 personas | 1 confidencialidad, 5 UX          | «El anonimato no se reduce a una casilla» (el relato identifica)                            |
| Foto con EXIF de `Marta Ejemplo` y su limpieza                | 1 confidencialidad                | «El anonimato no se reduce a una casilla» (las pruebas identifican)                         |
| Ubicación sin municipio ni coordenadas                        | 1 confidencialidad, 5 UX          | Ubicación por mapa imprecisa; «corregir ubicación sugerida»                                 |
| Alerta de conflicto (S1 ficticio)                             | 2 valor público, 4 datos PDN      | «Explotar datos de la PDN»; LGRA, art. 58                                                   |
| Ficha de contexto y prioridad (S6, 69-B, corroboración)       | 2 valor público (priorización), 4 | «Análisis, detección, priorización»                                                         |
| Corroboración ciega de Luis                                   | 1, 2, 6                           | Una persona = una corroboración, sin revelar quién corrobora                                |
| Campaña del atacante, sin etiqueta «falsa»                    | 2 valor público (detección)       | Presunción de buena fe: nunca «falsa», solo «inconsistente con registros públicos»          |
| Texto «Turnada: …» del día 1                                  | 5 UX                              | «Explicar qué significa "turnada"»; «certeza sobre el estatus»                              |
| 31 acuerdos con plantilla y el detector                       | 2 valor público (detección)       | «Identificar y atender áreas de oportunidad»; que la denuncia no se entierre                |
| Escalamiento con segunda llave de la supervisora              | 1, 3, 6                           | «Son dos experiencias conectadas: la ciudadana y la institucional»                          |
| Aviso a Marta y ventana de inconformidad                      | 3 funcionalidad, 5 UX             | Certeza sobre el estatus; LGRA, arts. 100-110                                               |
| Apertura de identidad solo para el recurso                    | 1 confidencialidad                | «Los permisos no equivalen a garantía absoluta de privacidad»: la apertura queda registrada |
| Verificación S3 con tres resultados                           | 4 datos PDN, 2                    | «La ausencia nunca es evidencia»; sanciones verificables                                    |
| Oaxaca sin CPC ni S3 (escenario sintético)                    | 4 datos PDN, 8 replicable         | Cobertura real desigual de la PDN; «qué información agregada aprovechar»                    |
| Observatorio por autoridad y casos resueltos                  | 4 datos abiertos, 2               | «Qué información agregada aprovechar sin revelar identidades»; Bases, arts. 60 y 61         |
| Testigos 2 de 3 y un testigo apagado                          | 1, 6                              | Integridad, trazabilidad y no repudio (Bases, «Seguridad de la Información»)                |
| Todo en local, con reloj simulado y semillas reproducibles    | 8 documentación replicable        | «Evaluarán replicando en local»                                                             |
| Recorrido completo del día 0 al 96 en el guion                | 7 presentación                    | «La calidad técnica no sustituye la claridad ni la utilidad para la ciudadanía»             |

## 10. Decisiones y pendientes

Decisiones tomadas en esta especificación:

1. **Ausencia en el S3 = «sin cobertura».** Una sanción declarada que no aparece en una fuente
   conectada se informa como `no_coverage` con `reason: record-not-found`, no como «contradicho»,
   para respetar que la ausencia nunca es evidencia. «Contradicho» exige un registro que dice otra
   cosa (`case.sanction-contradicted`). Solo lo confirmado cuenta como verificado, así que declarar
   sanciones que no existen no mejora los indicadores.
2. **El conflicto no bloquea el turnado.** Se alerta, se exige excusa o justificación y, si no la
   hay, se escala. Así se demuestra el escalamiento sin quitarle la decisión a la autoridad.
3. **Marta usa identidad sellada**, porque la inconformidad requiere nombre, domicilio y firma
   (LGRA, art. 109); Luis y el atacante son anónimos.
4. **Marta se califica como no grave, no se archiva**, porque contra un archivo no procede la
   inconformidad (LGRA, art. 102). «Posible nuevo indicio» (art. 100) se conserva para los
   archivos.
5. **No hay nodo común.** Cada estado monta su nodo y el federal aloja solo autoridades federales.
   Si una entidad no tiene nodo (no hay tabla de funciones que la cubra), la ventanilla no envía sus
   denuncias sobre entes estatales o municipales y lo dice: «… todavía no tiene nodo en la red…».
   No hay buzón nacional de respaldo: un buzón en otro nodo leería denuncias de un estado que no
   lo eligió. Las denuncias sobre entes federales sí se envían, al nodo federal. Por eso Oaxaca
   tiene su propio nodo en el `docker compose` (tres nodos y el enrutador).
6. **Fechas relativas al día 0** en todas las semillas, porque el reloj de demostración solo suma un
   desfase al reloj real.
7. **Los 31 acuerdos se importan** como registros históricos con un solo evento de bitácora, porque
   la bitácora no admite eventos con fecha pasada.

Pendientes y riesgos:

- Agregar `VE-INSTITUTO` a `packages/contracts/src/catalogs/public-entities.ts` (tarea de semillas).
- Resuelto con el texto vigente de la LGRA: la inconformidad (art. 102) procede contra la
  calificación de no grave y contra la abstención del art. 101, **no** contra un archivo; por eso
  `case.marta` se califica como no grave en lugar de archivarse. Se presenta ante la autoridad
  investigadora que calificó (art. 104), que corre traslado a la Sala. El prototipo no modela la
  Sala: registra la inconformidad, abre la identidad solo para el recurso y muestra el plazo de la
  Sala (art. 107). La firma autógrafa (art. 109, fr. IV) queda fuera del sistema.
- Pendiente: registrar en el nodo la resolución de la Sala y bloquear el informe mientras la
  inconformidad esté pendiente (art. 102, segundo párrafo); hoy solo se explica en el seguimiento.
- La vista a la fiscalía es orientativa: CPF, art. 217, fr. I, incisos B y D (uso ilícito de
  atribuciones en adjudicaciones y adquisiciones); el art. 220, fr. I (ejercicio abusivo de
  funciones), solo si se acredita que la adjudicación benefició a socios o sociedades vinculadas
  con la persona servidora; el interés en común del S1 es entre la titular del OIC y el jefe de
  compras, no con el proveedor.
- Los umbrales de 6.2 están publicados con el auditor (`packages/auditor/config/umbrales.json`); los de 6.3 se fijan y publican cuando se implemente la regla.
- La matriz de cobertura real por entidad requiere procesar los reportes de cobertura fuera del
  repositorio.
- Actualizar `docs/demo.md` con este recorrido cuando las funciones existan.
