# Competencia por dependencia

Quién investiga a **cada** dependencia de un estado (o de la federación) y cómo lo declara su nodo.
Es parte del estándar nacional: funciona igual para los 32 estados y para el nodo federal. Querétaro
y Oaxaca solo son los datos de la demostración, con instituciones marcadas «(ficticia)».

## 1. El problema

La tabla de funciones (`packages/red/src/function-table.ts`) dice qué institución cumple cada función
en un estado. Hasta la versión 1.1.0 se escribía casi siempre con reglas amplias, por orden de
gobierno. Una de ellas, «municipales sin OIC → Contraloría», era contraria a la ley:

- todo municipio tiene su propio órgano interno de control (OIC), con facultades para investigar y
  sancionar (CPEUM, art. 109, fr. III, último párrafo);
- la contraloría del Poder Ejecutivo estatal no tiene competencia sobre los servidores municipales;
  hacerlo invadiría la autonomía municipal (CPEUM, art. 115).

Lo mismo pasa con los poderes y organismos autónomos (Legislatura, Poder Judicial, fiscalía,
órganos electorales, de transparencia, de derechos humanos y de fiscalización, universidad
autónoma): cada uno tiene su OIC y la contraloría del Ejecutivo no los investiga.

Por eso la competencia ya no se declara por orden de gobierno sino **por dependencia**.

## 2. Fundamento legal

| Qué                                                                                          | Fundamento                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Cada ente público tiene su OIC; todo municipio, el suyo                                      | CPEUM, art. 109, fr. III, último párrafo; Constitución de Querétaro, art. 38 |
| El OIC es autoridad investigadora, substanciadora y, en no graves, resolutora                | LGRA, arts. 3, fr. II a IV y XXI, 9 y 10                                     |
| La substanciadora es distinta de la investigadora                                            | LGRA, art. 115                                                               |
| La falta grave y la de particulares las resuelve el Tribunal de Justicia Administrativa      | LGRA, arts. 3, fr. IV, 12 y 209                                              |
| Apelación y revisión, en la alzada del Tribunal                                              | LGRA, arts. 215 a 221                                                        |
| Quien recibe una denuncia que no le toca la turna a la autoridad competente                  | LGRA, art. 14; Bases de la PDN, arts. 56 y 58                                |
| Querétaro: la Secretaría de la Contraloría del Poder Ejecutivo y los OIC municipales         | LRAEQ, arts. 2, fr. XXII, 6, 7, 22 y 25                                      |
| Querétaro: turno a la autoridad competente                                                   | LRAEQ, art. 11                                                               |
| Querétaro: la SESEA es apoyo técnico del Comité Coordinador; no recibe ni turna denuncias    | LSEAQ, arts. 24 y 34, fr. X                                                  |
| Querétaro: la ESFE desecha las denuncias sin nombre y firma                                  | LFSRCQ, arts. 50 y 51                                                        |
| Querétaro: Sala Especializada en Responsabilidades Administrativas y Cuarta Sección (alzada) | LOTJAEQ, arts. 15 y 23                                                       |
| Federación: la ASF sí admite denuncias sin nombre                                            | LFRCF, art. 60                                                               |

Las referencias de Querétaro siguen el análisis de `docs/proceso-legal-de-la-denuncia.md`; lo que
ahí está marcado **[verificar]** sigue pendiente (por ejemplo, el reglamento interior de la
Contraloría).

## 3. El modelo: tabla de funciones, formato 2

`FunctionTableSchema` acepta los formatos 1 y 2. Una tabla de formato 1 se firma, se verifica y se
lee igual que antes (parsearla no le agrega campos, así que su digesto no cambia). El formato 2
agrega:

| Campo                        | Qué es                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `functions.court`            | El Tribunal de Justicia Administrativa: resuelve faltas graves y de particulares (`instance: 'first'`) y la alzada de apelación y revisión (`instance: 'appeal'`). |
| `entities[]`                 | **Competencia por dependencia**: una fila por ente, con `entityId`, `status`, `holder` y `legalBasis`.                                                             |
| `entities[].status`          | `assigned` (su OIC), `without_oic` («sin OIC designado → lo atiende `holder`», con `legalBasis` obligatorio) o `pending` (nadie todavía).                          |
| `entities[].holder`          | Una autoridad del directorio (con llaves) o una institución nombrada que aún no tiene alta.                                                                        |
| `requiresIdentifiedReporter` | En una regla o en un ente: quien lo atiende solo admite denuncias con nombre y firma.                                                                              |
| `settings.operatorReceives`  | Quien opera el nodo también recibe y turna (solo si la ley del estado lo faculta).                                                                                 |

Una tabla de formato 1 que usa cualquiera de esos campos no es válida: se sube al formato 2.

### 3.1 Reglas de coherencia (las revisa el nodo al firmar y la SESNA al aceptar)

`functionTableProblems` agrega, para el formato 2:

1. Cada ente de `entities` es de la entidad de la tabla (`PDN-<entidad>-…`) y aparece una sola vez.
2. Su OIC, si es autoridad, es una investigadora del mismo nodo y de la misma entidad.
3. **Ninguna regla general de investigación manda a los entes municipales a una autoridad que no es
   municipal** (CPEUM, art. 109, fr. III). Las reglas solo de faltas graves quedan fuera: son de la
   fiscalización superior, que sí revisa municipios.
4. La misma área no investiga y substancia (LGRA, art. 115).
5. Quien opera el nodo no es la autoridad receptora, salvo que la tabla declare
   `settings.operatorReceives` con la ley del estado que lo faculta.

### 3.2 A quién va la denuncia (`proposeCompetentAuthority`)

Para una falta administrativa (LGRA), en orden:

1. **Competencia por dependencia del ente.** Si su OIC (o quien lo atiende «sin OIC designado») es
   una autoridad con llaves vigentes, la denuncia se cifra para ella.
2. Si el ente está **pendiente**, si su OIC está **nombrado pero sin alta** o si sus llaves **no
   están vigentes**, la denuncia va al buzón de la **autoridad receptora** del estado, con la nota
   «turnar al OIC de …» (`turnTo`). Nunca se busca otra autoridad por una regla general ni se
   desvía a la fiscalía por una conducta equivalente.
3. Sin competencia por dependencia: la regla que nombra al ente y después la de su orden de
   gobierno, salvo una regla general que mande un ente municipal a una autoridad estatal (no
   aplica: va a la receptora con la nota de turnarla al OIC del municipio).
4. Si nada aplica, a la autoridad receptora, con la misma nota.

Una denuncia anónima o con identidad sellada nunca se propone ni se ofrece como alternativa a una
autoridad marcada `requiresIdentifiedReporter` (por ejemplo, la ESFE de Querétaro). La ventanilla no
pide nombre y firma, así que esa marca siempre la excluye.

Los delitos (CPF) siguen yendo a la función `prosecution` de la tabla.

### 3.3 Fondos federales

Cuando un ente estatal o municipal ejerce aportaciones (Ramo 33) o convenios federales, también
intervienen la ASF y la FGR (LCF, art. 49; LFRCF, arts. 47 y 66 Bis; CPF, art. 212). Esa regla la
implementa el trámite (`packages/contracts`, por el equipo del procedimiento), no esta pantalla: la
competencia por dependencia dice quién es el OIC del ente; la concurrencia federal se agrega encima.

## 4. La pantalla «Competencia por dependencia»

La ve solo la cuenta de **operación** del nodo (`/autoridad`, pestaña «Competencia por dependencia»).
Esa cuenta nunca ve denuncias.

1. **Lista de dependencias**, precargada del catálogo de entes de la PDN que ya trae el repositorio
   (`packages/contracts/src/entes/`, 7,213 entes): los estatales y municipales de la entidad del
   nodo, o los federales (fragmento `00`) en el nodo federal. Se agrupan en administración
   centralizada, paraestatal, poderes y organismos autónomos, y cada municipio. El catálogo de la
   PDN no trae el sector: la división es aproximada, por el nombre (`entityGroupOf`).
2. **Pistas** de cada ente, calculadas sin conexión al construir la web
   (`/datos/competencia/<clave>.json`):
   - «aparece en S1 con N personas (rango)», del fragmento de `datos/grupos-anonimato`;
   - «tiene áreas de contratación (S2)», la marca del mismo fragmento;
   - «sin datos» si el ente no aparece. El S3 no está por ente en el repositorio
     (`datos/cobertura` solo tiene conteos por estado): la pantalla lo dice. Querétaro y Oaxaca no
     tienen fragmento del S1, así que todas sus pistas dicen «sin datos».
3. **Distintivos:** «OIC con llaves ✓», «OIC nombrado, falta alta» y «pendiente», con texto y forma
   (nunca solo el color).
4. **Acciones:** asignar su OIC (una autoridad registrada o una institución pendiente de alta),
   marcar «sin OIC designado → lo atiende…» con su fundamento, dejarla pendiente, asignar en bloque
   un grupo entero (por ejemplo, todas las paraestatales) e importar o descargar el borrador en
   CSV.
5. **Firmar:** «Revisar los cambios» muestra el resumen (`functionTableDiff`) y los problemas de
   coherencia; «Firmar la versión N» firma la versión siguiente con la llave del nodo y la guarda.
   Se descarga el archivo para la SESNA (el mismo de `sigilo tabla firmar`), que entra por
   `sigilo-sesna aceptar`; la versión vale cuando los testigos cofirman el directorio. Hasta
   entonces, la ventanilla sigue usando la versión vigente.

La API está en el estándar: `GET` y `POST /api/v1/operation/competence` (`getCompetence` y
`saveCompetence`).

### Accesibilidad (WCAG 2.0 AA)

Tablas con `caption` y encabezados de fila y columna, desplazables con el teclado; formularios con
etiquetas visibles, ayudas y errores asociados; el foco va al editor al abrirlo y regresa al botón
al cerrarlo; los cambios se anuncian en una región `status`; los distintivos tienen texto y forma.

## 5. Página pública

«¿Quién atiende tu denuncia en tu estado?» (`/quien-atiende`) agrega:

- **Busca tu dependencia:** elige el estado (o la federación), escribe el nombre y ve quién es su
  OIC, con su distintivo; si está pendiente, dice que la denuncia llega a la autoridad receptora;
- **Cobertura de órganos internos de control** por estado con nodo y de la federación;
- la vigilancia del sistema (CPC) aparte: «no ve tu caso».

## 6. Datos abiertos: cobertura de OIC por estado

El corte nacional de la SESNA (`GET /api/v1/red/national/open-data`) trae `oicCoverage`: por cada
tabla del directorio, el número y el porcentaje de dependencias con OIC asignado, con llaves y
pendientes (`oicCoverageRows`). Se calcula con las tablas firmadas y el catálogo de la PDN: no usa
ninguna denuncia.

## 7. Cómo lo usa cualquier estado y la federación

1. **Importa los entes.** Nada que hacer: el catálogo de la PDN ya viene en el software y la
   pantalla lista los de tu entidad (o los federales). Si la PDN publica entes nuevos, se regenera
   con `node scripts/catalogos/entes-pdn.ts`.
2. **Da de alta a los OIC que tengan llaves** con el alta de autoridades (pestaña «Solicitudes de
   alta», `docs/guia-conecta-tu-estado.md`).
3. **Asigna el OIC de cada dependencia** en la pantalla, o en `config/competencia-por-dependencia.csv`
   con `./sigilo tabla exportar`, una hoja de cálculo y `./sigilo tabla revisar`. Lo que aún no
   tenga llaves, nómbralo («OIC nombrado, falta alta») o déjalo pendiente: sus denuncias llegan a tu
   autoridad receptora con la nota de turnarlas.
4. **Firma** la versión nueva (pantalla o `./sigilo tabla firmar`) y entrégala a la SESNA.
5. **Los testigos cofirman** el directorio con la versión nueva (`sigilo testigo cofirmar`). Desde
   ese momento la ventanilla la usa.

### Ajustes de cada nodo y su regla nacional por omisión

| Ajuste                                                   | Dónde se declara                                       | Por omisión (regla nacional)                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Quién es la autoridad receptora                          | `functions.intake`                                     | La que designe el estado; no quien opera el nodo                                                                     |
| Quien opera el nodo también recibe y turna               | `settings.operatorReceives` con fundamento             | No: la SESEA es apoyo técnico (como en Querétaro); un estado cuya ley lo faculte (por ejemplo, Michoacán) lo declara |
| El OIC de cada dependencia                               | `entities[]`                                           | Pendiente: la receptora la turna a su OIC                                                                            |
| Una institución solo admite denuncias con nombre y firma | `requiresIdentifiedReporter` en la regla o el ente     | Se admiten anónimas (LGRA, art. 91); la ESFE de Querétaro sí lo declara; la ASF no                                   |
| Nombre del Tribunal y de su alzada                       | `functions.court` (`instance`)                         | Sin tribunal declarado, la tabla no lo muestra                                                                       |
| Nombre de la fiscalía anticorrupción                     | `functions.prosecution`                                | Sin fiscalía con llaves, el delito va a la receptora                                                                 |
| Áreas de investigación y de substanciación               | `functions.investigation` y `functions.substantiation` | Deben ser distintas (LGRA, art. 115)                                                                                 |

## 8. Demostración

- **Querétaro** (formato 2): la unidad receptora de quejas y denuncias de la Secretaría de la
  Contraloría (ficticia) recibe y turna; la SESEA (ficticia) solo opera el nodo. Las dependencias
  del Ejecutivo: «sin OIC designado → la Contraloría»; la Comisión Estatal de Aguas y los municipios
  de Querétaro y El Marqués, con su OIC ficticio con llaves; San Juan del Río, la Universidad
  Autónoma y la Legislatura, con su OIC nombrado sin alta; los demás autónomos, pendientes; los
  demás municipios no se listan y van a la receptora. Tribunal: Sala Especializada y Cuarta Sección
  (ficticias); fiscalía anticorrupción ficticia con llaves; la ESFE ficticia marcada «solo
  identificadas».
- **Federal** (formato 2): los OIC de los dos entes ficticios del escenario, dos OIC reales nombrados
  sin alta (IMSS y SAT, ficticios), la oficina ficticia de aduanas «sin OIC designado → la SABG»,
  la ASF (faltas graves), el TFJA (Sala Especializada y Tercera Sección) y la FGR.
- **Oaxaca** sigue en el formato 1: investiga solo sus entes estatales; los municipales van a su
  buzón, que los turna a su OIC.

Ningún caso de la demostración acusa a un ente real.
