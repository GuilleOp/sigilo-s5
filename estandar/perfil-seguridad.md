# Perfil de seguridad del Estándar S5

Requisitos de seguridad que debe cumplir cualquier componente del Estándar S5: **nodo** (servidor
de las autoridades de una entidad o del orden federal; no hay nodo común), **enrutador** (reenvía sobres sin poder leerlos) y **ventanilla**
(la aplicación web donde la ciudadanía denuncia y da seguimiento). Los requisitos de privacidad de
la persona denunciante están en el [perfil de privacidad](perfil-privacidad.md); las verificaciones
automatizables de ambos perfiles, en [verificaciones.json](verificaciones.json).

## Convenciones

- Las palabras **DEBE**, **NO DEBE**, **DEBERÍA**, **NO DEBERÍA** y **PUEDE** se interpretan como
  MUST, MUST NOT, SHOULD, SHOULD NOT y MAY del RFC 2119.
- Referencias: [OWASP ASVS 4.0.3](https://github.com/OWASP/ASVS/tree/v4.0.3/4.0) en formato
  `V#.#.#`, con el nivel entre paréntesis cuando importa, y
  [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) como
  `API#:2023`. Cuando ASVS no tiene un requisito puntual se cita el capítulo (`V14.4`).
- Base: ASVS nivel 2. Nivel 3 para criptografía (V6), autenticación e identidades (V2, V3) y
  bitácora (V7), porque un error ahí identifica a una persona denunciante o permite negar una
  apertura.
- Aplica a: **N** nodo, **E** enrutador, **V** ventanilla.
- Verificación: **auto** (el validador la comprueba desde fuera; su identificador está en
  `verificaciones.json`), **prueba** (prueba automática en el repositorio del componente) o
  **manual** (revisión documental o de código).
- Estado en SIGILO (software 1.1.0): **cumple**, **parcial** o **brecha**. Las brechas se resumen al
  final.

## 1. Llaves y criptografía

### SEC-01 Ciclo de vida de las llaves de cada autoridad

- **Requisito.** Cada autoridad DEBE tener un procedimiento escrito de generación, custodia,
  rotación, revocación y destrucción de sus llaves, alineado con NIST SP 800-57. Cada llave DEBE
  tener un identificador (`keyId`) y fecha de vigencia. Una llave revocada NO DEBE aceptarse para
  cifrar nuevas denuncias. Aplica a N, V.
- **Referencia.** ASVS V1.6.1, V1.6.3.
- **Por qué.** Un cambio de administración sin procedimiento pierde las llaves (las denuncias
  selladas quedan ilegibles) o las deja en manos de quien ya no debe tenerlas.
- **Verificación.** Manual.
- **SIGILO.** **Brecha.** Existe `keyId` y `npm run keys:generate` (`scripts/generate-keys.ts`),
  pero no hay rotación, revocación ni procedimiento documentado (modelo de amenazas D06, planeado).

### SEC-02 Llave privada de la autoridad fuera del nodo

- **Requisito.** La llave privada de descifrado de una autoridad NO DEBE residir en el nodo ni en
  sus respaldos. DEBERÍA vivir en un módulo aislado que no permita extraerla (HSM, tarjeta,
  WebAuthn PRF). Aplica a N.
- **Referencia.** ASVS V1.6.2, V6.4.2 (L2).
- **Por qué.** Quien tenga la base y la llave privada abre cualquier identidad sin dejar rastro
  (LGRA art. 64, fracción III).
- **Verificación.** Manual.
- **SIGILO.** **Parcial.** La llave no vive en el servidor: el panel la importa en memoria y la
  borra al cerrar sesión. Pero se importa como archivo en una página que entrega el mismo servidor,
  así que un servidor comprometido puede exfiltrarla (modelo de amenazas D03).

### SEC-03 Llaves públicas fijadas o directorio firmado

- **Requisito.** La ventanilla DEBE obtener las llaves públicas de las autoridades de un directorio
  firmado o fijado en su código, y DEBE detenerse sin enviar nada si las que publica el nodo no
  coinciden. Aplica a V.
- **Referencia.** ASVS V6.4 (capítulo), V1.6 (capítulo); API8:2023.
- **Por qué.** Un nodo que sustituye la llave de la autoridad lee todas las identidades.
- **Verificación.** Prueba; auto parcial con PRV-14.
- **SIGILO.** **Parcial.** Llaves fijadas en el bundle y comparadas con `GET /api/v1/keys`
  (`e2e/key-pinning.spec.ts`). En la red, la web toma las llaves de un directorio firmado por la
  operación y cofirmado m de n contra la raíz fijada (`packages/red/src/directory.ts`). Una versión
  anterior del directorio con llaves revocadas seguía verificando (G10): ahora la raíz fijada en la
  web admite `minDirectorySerial` y `maxDirectoryAgeDays`, y el directorio `validUntil`. Residual:
  una web construida antes de una revocación acepta copias viejas hasta su `validUntil`.

### SEC-04 Llave de firma del nodo protegida

- **Requisito.** La llave con que el nodo firma comprobantes y la cabeza de la bitácora DEBE
  guardarse con permisos mínimos y DEBERÍA vivir en un almacén de secretos o módulo aislado. NO
  DEBE estar en el código ni en el repositorio. Aplica a N, E.
- **Referencia.** ASVS V2.10.4, V6.4.1 (L2), V6.4.2 (L2).
- **Por qué.** Con esa llave se puede rehacer la bitácora posterior a la última ancla.
- **Verificación.** Manual.
- **SIGILO.** **Brecha.** La llave está en claro en `keys.json` del directorio de datos
  (`apps/server/src/config.ts`, `loadServerKeys`), fuera del repositorio pero sin almacén de
  secretos.

### SEC-05 Apertura de identidad 2 de 3

- **Requisito.** Abrir una identidad sellada DEBE requerir la participación de al menos 2 de 3
  custodios distintos (por ejemplo, autoridad investigadora, órgano interno de control y
  observador), con fundamento escrito y un evento en la bitácora por cada participación. NINGUNA
  persona sola DEBE poder abrir. Aplica a N, V.
- **Referencia.** ASVS V1.4 (capítulo), V4.1.3; LGRA art. 64, fracción III.
- **Por qué.** «Los permisos no equivalen a garantía de privacidad» (SESNA, S-04): un solo
  destinatario siempre puede abrir.
- **Verificación.** Prueba y manual.
- **SIGILO.** **Parcial.** Abrir exige la aprobación de dos personas distintas de la autoridad
  competente (investigación o supervisión; nunca recepción y turnado), cada una con su fundamento
  y un evento `identity.approved`; la misma cuenta no cuenta dos veces (índice único) y la
  solicitud vence a los 7 días. Al alcanzar el umbral se registra `identity.opened` y la persona
  lo ve; el servidor entrega el sobre solo a quien aprobó y nunca descifra
  (`apps/server/src/services/identity-service.ts`, `apps/server/src/routes/identity.test.ts`).
  Pendiente: el umbral es de política del nodo, no criptográfico (la llave de descifrado sigue en
  un solo navegador), y el tercer custodio externo (observador) no participa todavía. La
  identidad para el recurso de inconformidad exige también dos aprobaciones, una de supervisión,
  dentro de la ventana del recurso (G07). Bloquear con intentos fallidos la cuenta de una persona
  custodia retrasa una aprobación hasta 15 minutos (G08, ver SEC-15).

### SEC-06 Separación de funciones

- **Requisito.** El nodo DEBE separar al menos estas funciones: recibir y turnar, investigar,
  custodiar la identidad y operar el sistema. La operación (administración, base de datos,
  respaldos) NO DEBE poder descifrar identidades ni mensajes. Una función NO DEBE heredar los
  permisos de otra. Aplica a N.
- **Referencia.** ASVS V4.1.3, V1.4.4; API5:2023.
- **Por qué.** El personal que turna no necesita ver la identidad; quien opera la base tampoco.
- **Verificación.** Prueba y manual.
- **SIGILO.** **Cumple** en el servidor de referencia. Cada cuenta tiene una sola función:
  recepción y turnado (turna, acepta, reasigna, devuelve, cierra lo improcedente del buzón),
  investigación (etapas, cierre, buzón, aprobaciones) y supervisión (aprobaciones, acuerdos,
  escalamientos). Quien turna no puede solicitar ni aprobar aperturas. La función se comprueba
  antes del folio y una negativa queda en el registro de seguridad
  (`apps/server/src/routes/procedure.test.ts`, `identity.test.ts`). La operación no tiene la llave
  de descifrado.

### SEC-07 Cifrado en el cliente con primitivas estándar

- **Requisito.** La identidad y los mensajes del buzón DEBEN cifrarse en el dispositivo de quien
  denuncia con cifrado autenticado a llave pública (HPKE, RFC 9180, o equivalente AEAD) y un AAD
  que vincule el sobre a su denuncia. NO DEBEN usarse primitivas propias ni obsoletas. Aplica a V.
- **Referencia.** ASVS V6.2.2, V6.2.5, V6.2.7 (L3), V8.3.7.
- **Por qué.** Lo que el nodo no puede leer, tampoco lo puede filtrar ni entregar.
- **Verificación.** Auto (PRV-14) y prueba.
- **SIGILO.** **Cumple.** HPKE X25519 / HKDF-SHA256 / ChaCha20-Poly1305 con AAD
  (`docs/criptografia.md`, `packages/core/src/identity.test.ts`, `packages/core/src/test-vectors.ts`).

### SEC-08 Aleatoriedad criptográfica

- **Requisito.** Folios, secretos, recibos, nonces y semillas DEBEN generarse con un generador
  criptográficamente seguro. Aplica a N, V.
- **Referencia.** ASVS V6.3.1 (L2), V6.3.2 (L2).
- **Por qué.** Un folio predecible permite enumerar denuncias.
- **Verificación.** Auto (PRV-09) y prueba.
- **SIGILO.** **Cumple.** Solo `crypto.getRandomValues`; ESLint prohíbe `Math.random`
  (`eslint.config.js`, `packages/core/src/folio.ts`).

### SEC-09 Comparaciones en tiempo constante

- **Requisito.** Toda comparación de secretos, verificadores o tokens DEBE hacerse en tiempo
  constante y sin atajos que dependan de si el folio existe. Aplica a N.
- **Referencia.** ASVS V6.2.8 (L3).
- **Por qué.** El tiempo de respuesta no debe confirmar que existe una denuncia.
- **Verificación.** Prueba; auto parcial con PRV-15.
- **SIGILO.** **Cumple.** `apps/server/src/security/constant-time.ts` y verificador ficticio en
  `apps/server/src/security/reporter-auth.ts`.

### SEC-10 Longitud fija de los textos cifrados

- **Requisito.** Los sobres de identidad y de mensajes DEBEN rellenarse a un tamaño fijo antes de
  cifrar, y el nodo DEBE rechazar sobres de otro tamaño. Aplica a N, V.
- **Referencia.** ASVS V8.3 (capítulo; ASVS no lo pide de forma explícita).
- **Por qué.** La longitud del nombre o del mensaje distingue a personas aunque esté cifrado.
- **Verificación.** Auto (PRV-14) y prueba.
- **SIGILO.** **Cumple.** Relleno a 4096 bytes (`docs/criptografia.md`, sección «Relleno»).

### SEC-11 Datos sensibles en reposo

- **Requisito.** Los hechos y las pruebas DEBERÍAN cifrarse hacia la autoridad competente igual que
  la identidad; si se guardan en claro, el nodo DEBE cifrar el almacenamiento y los respaldos y
  documentar quién puede leerlos. Aplica a N, E.
- **Referencia.** ASVS V6.1.1 (L2), V8.3.7 (L2).
- **Por qué.** Una orden sobre los respaldos o una copia filtrada de la base entrega los relatos,
  que muchas veces identifican.
- **Verificación.** Manual.
- **SIGILO.** **Parcial.** Las pruebas se cifran en el navegador hacia la autoridad competente y el
  nodo guarda solo el contenedor (`docs/criptografia.md`, «Pruebas cifradas de extremo a extremo»;
  modelo de amenazas G21). Los hechos quedan en claro en SQLite; `./sigilo respaldar` cifra los
  respaldos, y el disco del nodo debe ir cifrado (modelo de amenazas C01 y F01). Cifrar los hechos
  hacia la autoridad es un siguiente paso.

## 2. Identidades, autenticación y sesiones

### SEC-12 Cuentas individuales para el personal de la autoridad

- **Requisito.** Cada persona servidora pública DEBE autenticarse con una credencial propia. NO
  DEBEN usarse cuentas, contraseñas ni tokens compartidos. Aplica a N.
- **Referencia.** ASVS V3.5.2 (L2), V2.10.1 (L2); API2:2023.
- **Por qué.** Sin identidad individual no hay no repudio (Bases de la PDN, «Seguridad de la
  Información»): no se sabe quién abrió ni quién cerró.
- **Verificación.** Manual y prueba.
- **SIGILO.** **Cumple.** Cuentas por persona en `authority-accounts.json` (fuera del
  repositorio), con contraseña scrypt y un seudónimo estable (`acct-…`) que es el actor en la
  bitácora; `SIGILO_AUTHORITY_TOKEN` se retiró y el servidor no arranca si se define
  (`apps/server/src/security/authority-registry.ts`, `apps/server/src/routes/auth.test.ts`).
  `npm run accounts:generate` crea las cuentas sintéticas de la demostración.

### SEC-13 Autenticación multifactor resistente a suplantación

- **Requisito.** Los paneles de autoridad, de custodios y de administración DEBEN exigir un segundo
  factor; para abrir identidades DEBE usarse un autenticador resistente a phishing (WebAuthn o
  llave física). Aplica a N.
- **Referencia.** ASVS V4.3.1, V2.2.4 (L3).
- **Por qué.** El panel de autoridad es el objetivo de quien quiere saber quién denunció.
- **Verificación.** Manual.
- **SIGILO.** **Parcial.** Desde la 1.1.0 el panel exige un segundo factor TOTP (RFC 6238) con
  `SIGILO_MFA=requerido`, el valor por omisión en producción y en el perfil «nodo», para toda
  función, también la supervisión y la operación del nodo. La cuenta que no lo tiene lo inscribe en
  su primer acceso antes de ver nada. Cada código sirve una sola vez, hay 10 códigos de
  recuperación guardados con scrypt y el secreto se cifra en reposo con la llave del nodo
  (`apps/server/src/security/totp.ts`, `apps/server/src/routes/mfa.test.ts`, `e2e/mfa.spec.ts`).
  El primer paso no revela si la contraseña era correcta. Falta la parte resistente a phishing:
  TOTP se puede robar en tiempo real. WebAuthn (llaves de seguridad o passkeys), para el panel y
  para aprobar aperturas, es el siguiente paso. Mientras tanto, el panel solo se publica por VPN o
  lista de IP (`docs/seguridad-produccion.md`).

### SEC-14 Sesiones con vencimiento

- **Requisito.** Las sesiones de autoridad DEBEN usar tokens de sesión emitidos al autenticarse,
  DEBEN vencer por inactividad (30 minutos como máximo) y DEBEN invalidarse al cerrar sesión en el
  servidor. Aplica a N.
- **Referencia.** ASVS V3.2.1, V3.3.1, V3.3.2 (L2), V3.5.2 (L2).
- **Por qué.** Un token robado del equipo de una persona servidora pública no debe servir para
  siempre.
- **Verificación.** Prueba.
- **SIGILO.** **Cumple.** Token de sesión aleatorio emitido al iniciar sesión, guardado solo como
  digesto, que vence a los 15 minutos sin actividad o a las 8 horas y se invalida en el servidor
  al cerrar sesión; una sesión vencida queda en el registro de seguridad
  (`apps/server/src/security/sessions.ts`, `apps/server/src/security/security.test.ts`).

### SEC-15 Límites contra fuerza bruta en el acceso

- **Requisito.** El nodo DEBE limitar los intentos fallidos de acceso al seguimiento y a los paneles
  sin que un tercero pueda bloquear a la persona legítima, y NO DEBE indexar esos límites por IP
  (ver SEC-24). Aplica a N.
- **Referencia.** ASVS V2.2.1; API2:2023, API4:2023.
- **Por qué.** Un atacante que conoce un folio no debe poder adivinar el recibo ni bloquear a su
  dueña.
- **Verificación.** Prueba.
- **SIGILO.** **Parcial.** El seguimiento limita 10 fallos por digesto del folio, con freno global
  sin rechazo, y los accesos correctos no consumen el límite
  (`apps/server/src/routes/tracking.test.ts`). El panel limita 10 fallos por usuario en 15 minutos
  más un freno global; un usuario inexistente responde igual que una contraseña equivocada. El
  límite por usuario permite a quien conozca un usuario bloquearlo 15 minutos, y una persona de la
  misma autoridad sí conoce los usuarios: puede bloquear a una persona custodia justo cuando debe
  aprobar una apertura. Desde la 1.1.0 (H05) el usuario bloqueado se rechaza también con la
  contraseña correcta, y los códigos equivocados del segundo factor suman en el mismo límite
  (`apps/server/src/routes/mfa.test.ts`); se acepta solo con el panel detrás de VPN (G08, G28).

### SEC-16 Credenciales de seguimiento de alta entropía y respuesta uniforme

- **Requisito.** El folio DEBE tener al menos 60 bits aleatorios y el secreto de seguimiento al
  menos 80. Un folio inexistente y un secreto incorrecto DEBEN producir la misma respuesta (estatus,
  cuerpo y cabeceras). Aplica a N.
- **Referencia.** ASVS V2.2.1, V6.3.1 (L2), V6.2.8 (L3); API2:2023.
- **Por qué.** Distinguir los dos casos confirma que una denuncia existe.
- **Verificación.** Auto (PRV-09, PRV-15) y prueba.
- **SIGILO.** **Cumple.** Folio de 60 bits (`packages/core/src/folio.ts`), recibo de 88 bits y
  respuesta idéntica (`apps/server/src/routes/tracking.test.ts`, «responde exactamente igual a
  folio inexistente y a verificador incorrecto»).

## 3. Control de acceso

### SEC-17 Autorización por objeto y por función

- **Requisito.** Cada operación de autoridad DEBE comprobar en el servidor que quien la pide tiene
  competencia sobre ese folio (objeto) y permiso para esa acción (función). Un error de autorización
  DEBE responder igual que un folio inexistente. Aplica a N, E.
- **Referencia.** ASVS V4.1.1, V4.1.5, V4.2.1, V13.1.4; API1:2023, API5:2023.
- **Por qué.** En una red con muchas autoridades, una no debe leer las denuncias de otra.
- **Verificación.** Prueba.
- **SIGILO.** **Cumple** dentro del nodo. Cada denuncia la tiene una autoridad (el buzón
  general hasta que se turna); listado, detalle, trámite, buzón, pruebas y aperturas solo
  responden a cuentas de esa autoridad, y una denuncia de otra responde `404` igual que una
  inexistente; la supervisora solo ve las escaladas (`apps/server/src/routes/procedure.test.ts`).

### SEC-18 Exposición mínima de propiedades

- **Requisito.** Las respuestas DEBEN incluir solo las propiedades necesarias para la función: los
  listados NO DEBEN incluir sobres de identidad y las rutas públicas NO DEBEN incluir hechos ni
  folios. Las peticiones NO DEBEN aceptar propiedades no declaradas en el contrato. Aplica a N, E.
- **Referencia.** API3:2023; ASVS V8.3 (capítulo), V5.1.4.
- **Por qué.** Cada campo de más es una forma de cruzar datos.
- **Verificación.** Auto (API-01) y prueba.
- **SIGILO.** **Cumple.** Resúmenes sin sobre (`apps/server/src/routes/authority.test.ts`, «lista
  resúmenes sin el sobre de identidad»); las peticiones usan esquemas estrictos de
  `packages/contracts` y un campo no declarado responde `400`
  (`apps/server/src/standard-conformance.test.ts`).

### SEC-19 Enrutador ciego y turnado que vuelve a cifrar

- **Requisito.** El enrutador DEBE ver solo el destino y el sobre; NO DEBE poder leer hechos,
  identidad ni pruebas. El turnado entre autoridades DEBE volver a cifrar en el dispositivo de la
  autoridad que turna, nunca en un servidor. Aplica a E, N.
- **Referencia.** ASVS V1.8.2, V8.3.7 (L2); API3:2023.
- **Por qué.** «Un S5 que nadie en medio puede leer»: el punto central de la red es el blanco más
  valioso.
- **Verificación.** Prueba y manual.
- **SIGILO.** **Cumple.** Con el sobre v2 el enrutador ve solo el nodo destino (la autoridad va
  cifrada) y un sobre de tramo fijo; no guarda sobres, IP ni cabeceras y responde igual para
  cualquier destino (`apps/enrutador/src/relay.test.ts`). El turnado entre nodos vuelve a cifrar en
  el navegador de la autoridad y exige el comprobante del nodo destino ligado al folio (G01). El
  buzón de red acepta solo sobres del enrutador, con su token OAuth y la etiqueta HMAC v2 (G11).
  Residual: la hora y el tramo siguen visibles (modelo de amenazas G27).

## 4. Bitácora y registros

### SEC-20 Bitácora encadenada, firmada y anclada

- **Requisito.** Cada evento del trámite (recepción, turnado, cambio de estatus, apertura de
  identidad, descarte de pruebas, cierre) DEBE quedar en una bitácora de solo agregar,
  encadenada por hashes, con cabeza firmada y anclas publicadas fuera del nodo. DEBERÍA haber
  firma de testigos m de n. Las fechas DEBEN venir de un reloj sincronizado y no decrecer. Aplica a
  N, E.
- **Referencia.** ASVS V7.3.3 (L2), V7.3.4 (L2), V7.1.4; Bases de la PDN, «Seguridad de la
  Información» (integridad, trazabilidad, no repudio).
- **Por qué.** La persona denunciante puede comprobar que su denuncia no se borró ni se abrió a
  escondidas.
- **Verificación.** Prueba; manual (pendiente de automatizar con PRV-19).
- **SIGILO.** **Parcial.** Cadena con fechas no decrecientes, triggers de solo agregar, cabeza
  firmada y `npm run ledger:anchor` (`packages/core/src/ledger.test.ts`,
  `apps/server/src/ledger-service.test.ts`). En la red, la bitácora nacional encadena las cabezas
  de los nodos y su cabeza vale con 2 de 3 cofirmas de testigos. Hasta la sexta ronda solo se
  detectaba una bifurcación con la misma secuencia: una historia reescrita con secuencia mayor se
  registraba y se cofirmaba (G04). La corrección hace que el enrutador y cada testigo verifiquen el
  tramo de `ledgerEvents` entre la cabeza anterior y la nueva (`packages/red/src/node-history.ts`).
  El anclaje del nodo sigue siendo manual.

### SEC-21 Eventos de seguridad con actor individual

- **Requisito.** El nodo DEBE registrar, sin datos de la denuncia, quién (persona, no solo rol) y
  cuándo abrió una identidad, cambió un estatus, descartó pruebas o falló al autenticarse en un
  panel. Aplica a N.
- **Referencia.** ASVS V7.1.3, V7.2.1 (L2), V7.2.2 (L2), V8.3.5 (L2).
- **Por qué.** El art. 64, fracción III de la LGRA sanciona revelar la identidad: sin actor no hay a
  quién atribuirlo.
- **Verificación.** Prueba y manual.
- **SIGILO.** **Cumple.** Cada evento de la autoridad (trámite, aprobaciones, mensajes,
  descartes) lleva en sus datos el seudónimo de la cuenta; los datos son privados del nodo y su
  digesto es público, así que el actor queda comprometido sin publicarse. Inicios de sesión,
  fallos, cierres, sesiones vencidas, negativas por función, entregas de sobres y el segundo factor
  (inscripción, códigos fallidos, uso de un código de recuperación y reinicio) quedan en un
  registro de solo agregar, al minuto, sin IP, agente de usuario ni el usuario tecleado
  (`apps/server/src/db/security-log-repository.ts`, `apps/server/src/routes/auth.test.ts`).

### SEC-22 Registros sin IP ni datos de la persona denunciante

- **Requisito.** Ningún componente (incluidos proxy inverso, balanceador y CDN propios) DEBE
  registrar IP, agente de usuario, cuerpos, folios ni secretos en las rutas de denuncia y
  seguimiento. En producción, los registros de peticiones DEBEN ser agregados. Aplica a N, E, V.
- **Referencia.** ASVS V7.1.1, V7.1.2; LGRA art. 91.
- **Por qué.** La IP y la hora del envío bastan para identificar a una persona en su red de trabajo.
- **Verificación.** Prueba y manual (la configuración del proxy no se ve desde fuera).
- **SIGILO.** **Parcial.** La aplicación solo cuenta peticiones por hora, sin rutas de la persona
  denunciante, y rechaza el modo por petición en producción (`apps/server/src/http/request-log.ts`,
  `request-log.test.ts`, `config.ts`). No hay configuración de referencia del proxy inverso que
  termina TLS, que es donde suele registrarse la IP. Las rutas de red (buzón de red), de
  inconformidad y de la corroboración ya no entran al conteo (G09). Proxy: la instalación usa Caddy
  sin registro de accesos y `docs/seguridad-produccion.md` da las reglas para un proxy propio; un
  proxy que no las siga queda fuera del control del software.

### SEC-23 Registros sin inyección

- **Requisito.** Los registros DEBEN tener campos estructurados y rutas normalizadas; NO DEBEN
  incluir texto libre de la petición. Aplica a N, E.
- **Referencia.** ASVS V7.3.1 (L2).
- **Por qué.** Un registro manipulado oculta un acceso o inventa uno.
- **Verificación.** Prueba.
- **SIGILO.** **Cumple.** Líneas JSON con método, ruta normalizada (`routePath`), estatus y conteo.

## 5. Datos, retención y abuso

### SEC-24 Límites de abuso sin rastreo ni palancas globales

- **Requisito.** El nodo DEBE frenar el envío masivo con prueba de trabajo adaptativa u otro
  mecanismo que no identifique a la persona (NO DEBE usar IP, huella del navegador ni CAPTCHA de
  terceros). NO DEBERÍA tener topes globales que un atacante pueda agotar para dejar fuera a todas
  las personas. Aplica a N, V.
- **Referencia.** ASVS V11.1.4, V11.1.2; API4:2023, API6:2023.
- **Por qué.** El abuso es real, pero un CAPTCHA externo o un límite por IP rompen el anonimato.
- **Verificación.** Auto parcial (API-01 detecta la cabecera de prueba de trabajo) y prueba.
- **SIGILO.** **Parcial.** Hashcash con retos HMAC de un solo uso, 18 a 20 bits según la carga
  (`apps/server/src/security/proof-of-work.ts`, `proof-of-work.test.ts`), sin IP ni CAPTCHA. Pero hay
  dos topes globales que un atacante puede agotar para dejar fuera a todas las personas: 200 000
  eventos pendientes por día en la bitácora (`MAX_PENDING_EVENTS_PER_DAY` en
  `apps/server/src/ledger-service.ts`, error 503 `ledger_day_full`) y la cuota total de pruebas
  (error 507 `storage_full`). Residual: una GPU resuelve mucho más rápido que un celular (modelo de
  amenazas C09).

### SEC-25 Tamaños y cuotas

- **Requisito.** El nodo DEBE limitar el tamaño de cada cuerpo, de cada prueba y del total por
  denuncia, y DEBE responder con un error explícito sin borrar pruebas existentes cuando se llena la
  cuota. Aplica a N, E.
- **Referencia.** ASVS V12.1.1, V12.1.3; API4:2023.
- **Por qué.** Borrar pruebas para hacer sitio destruiría pruebas de corrupción.
- **Verificación.** Prueba.
- **SIGILO.** **Cumple.** JSON de 256 KiB (`apps/server/src/http/request.ts`), cuota total y por
  denuncia con `507 storage_full` (`apps/server/src/routes/evidence.test.ts`).

### SEC-26 Retención y borrado

- **Requisito.** El nodo DEBE publicar un plazo de retención por tipo de dato (identidad sellada,
  hechos, pruebas, mensajes, registros) y DEBE borrar automáticamente al vencer, con borrado seguro
  en la base. Los plazos DEBEN ser compatibles con la prescripción (LGRA art. 74). Aplica a N, E.
- **Referencia.** ASVS V8.3.8 (L2); LGPDPPSO 2025 (principios de finalidad y proporcionalidad).
- **Por qué.** Lo que ya no existe no se puede filtrar.
- **Verificación.** Prueba y manual.
- **SIGILO.** **Parcial.** Las pruebas de denuncias sin atender o archivadas se borran a los 30 días
  (`apps/server/src/services/evidence-service.ts`, `purgeUnattendedEvidence`) y la base usa
  `secure_delete`. No hay plazo para denuncias, sobres de identidad ni mensajes.

### SEC-27 Sin caché ni almacenamiento local de datos sensibles

- **Requisito.** Toda respuesta con datos de una denuncia DEBE llevar `Cache-Control: no-store`; la
  ventanilla NO DEBE guardar borradores, credenciales ni llaves en el almacenamiento del navegador;
  las credenciales NO DEBEN viajar en la URL. Aplica a N, V.
- **Referencia.** ASVS V8.1.1 (L2), V8.2.1, V8.2.2, V8.2.3, V8.3.1, V13.1.3.
- **Por qué.** Quien revisa el equipo de la persona (modelo de amenazas A6) no debe encontrar nada.
- **Verificación.** Auto (PRV-10) y prueba; PRV-17, manual (pendiente de automatizar).
- **SIGILO.** **Cumple.** `no-store` en toda respuesta (`apps/server/src/security/headers.ts`,
  `apps/server/src/app.test.ts`), estado solo en memoria (`apps/web/src/state/memory-store.ts`) y
  credenciales en el cuerpo de `POST`.

## 6. Entrada, archivos y errores

### SEC-28 Validación por esquema y tipo de contenido

- **Requisito.** Cada petición DEBE validarse contra el esquema del contrato con listas positivas;
  un tipo de contenido inesperado DEBE responder 415. Aplica a N, E.
- **Referencia.** ASVS V5.1.3, V5.1.4, V13.1.5, V13.2.2, V13.2.5; API8:2023.
- **Por qué.** El catálogo de entidades y conductas llega a los datos abiertos; texto libre ahí es
  una vía de marca o de inyección.
- **Verificación.** Auto (API-01, API-02) y prueba.
- **SIGILO.** **Cumple.** `readJson` con zod (`apps/server/src/http/request.ts`); catálogos
  validados en el servidor (modelo de amenazas C18).

### SEC-29 Pruebas (archivos) seguras

- **Requisito.** El nodo DEBE aceptar solo tipos de imagen permitidos, comprobados por contenido;
  DEBE servirlos como adjunto con `X-Content-Type-Options: nosniff`; DEBERÍA recodificarlos en el
  servidor y rechazar los que conserven metadatos (PRV-20). Aplica a N.
- **Referencia.** ASVS V12.2.1 (L2), V12.4.1, V12.5.2.
- **Por qué.** Un archivo malicioso ataca el equipo de la autoridad; uno con metadatos identifica a
  quien lo tomó.
- **Verificación.** Prueba; manual (pendiente de automatizar con PRV-20).
- **SIGILO.** **Parcial.** El navegador limpia y recodifica cada imagen y la cifra hacia la
  autoridad: el nodo recibe solo el contenedor cifrado (comprueba su formato y su tamaño) y lo
  entrega como `application/octet-stream` con `nosniff`. Los bytes mágicos los revisa el panel al
  descifrar, antes de mostrar. El servidor no puede recodificar ni rechazar metadatos porque no ve
  la imagen (modelo de amenazas C10, A08 y G21).

### SEC-30 Errores uniformes y sin detalles

- **Requisito.** Los errores DEBEN seguir un esquema común con código y mensaje fijos; NO DEBEN
  incluir trazas, rutas internas, consultas, versiones ni datos de la petición. Aplica a N, E.
- **Referencia.** ASVS V7.4.1, V14.3.2; API8:2023.
- **Por qué.** Un mensaje que repite el folio o la consulta filtra datos y ayuda a atacar.
- **Verificación.** Auto (API-02) y prueba.
- **SIGILO.** **Cumple.** `apps/server/src/http/errors.ts` y `app.onError` en
  `apps/server/src/app.ts`.

## 7. Configuración y transporte

### SEC-31 TLS y HSTS

- **Requisito.** Todo componente expuesto DEBE servir solo por TLS 1.2 o 1.3 con suites fuertes y
  DEBE enviar `Strict-Transport-Security` con `max-age` de al menos 31536000; DEBERÍA incluir
  `includeSubDomains` (mismo nivel que PRV-03). Aplica a N, E, V.
- **Referencia.** ASVS V9.1.1, V9.1.2, V9.1.3, V14.4.5.
- **Por qué.** Un observador de red (modelo de amenazas A5) no debe ver contenido ni forzar HTTP.
- **Verificación.** Manual (pendiente de automatizar); el HSTS ya lo comprueba PRV-03.
- **SIGILO.** **Parcial.** El servidor escucha en 127.0.0.1 y delega TLS a un proxy: la instalación
  trae Caddy (Let's Encrypt o certificado propio) y `docs/seguridad-produccion.md` documenta un
  proxy propio; la elección de suites queda en ese proxy. Con `SIGILO_HTTPS=1` envía
  `Strict-Transport-Security` con un año e `includeSubDomains`, y rechaza un `SIGILO_HSTS_MAX_AGE`
  menor que un año
  (`apps/server/src/config.ts`, `apps/server/src/config.test.ts`).

### SEC-32 Cabeceras de seguridad

- **Requisito.** Las respuestas DEBEN incluir CSP como cabecera, `X-Content-Type-Options: nosniff`,
  protección contra marcos, `Referrer-Policy: no-referrer`, `Permissions-Policy` restrictiva y
  `Content-Type` con juego de caracteres. Aplica a N, E, V.
- **Referencia.** ASVS V14.4.1, V14.4.3, V14.4.4, V14.4.6, V14.4.7; V14.4 (capítulo) para
  `Permissions-Policy`, que ASVS 4.0.3 no menciona.
- **Por qué.** Son la defensa más barata contra XSS, enmarcado y fugas por `Referer`.
- **Verificación.** Manual (pendiente de automatizar) para `nosniff` y `Content-Type`; CSP, marcos,
  `Referer` y permisos ya los comprueban PRV-02, PRV-04, PRV-05 y PRV-06.
- **SIGILO.** Cumple. Todas presentes en `apps/server/src/security/headers.ts`, incluida
  `Permissions-Policy` (`PERMISSIONS_POLICY`), y probadas en `apps/server/src/app.test.ts`.

### SEC-33 CORS cerrado

- **Requisito.** La API NO DEBE habilitar CORS salvo para una lista explícita de orígenes y NUNCA
  con `*` en rutas con credenciales. Aplica a N, E.
- **Referencia.** ASVS V14.5.3; API8:2023.
- **Por qué.** Un sitio de terceros no debe poder leer respuestas del seguimiento.
- **Verificación.** Manual (pendiente de automatizar) y prueba.
- **SIGILO.** **Cumple.** Desactivado por omisión (`apps/server/src/app.ts`; `app.test.ts`, «no
  habilita CORS por omisión»).

### SEC-34 Sin divulgación de versión ni depuración

- **Requisito.** Las respuestas NO DEBEN incluir `Server` con versión, `X-Powered-By` ni rutas de
  depuración. Aplica a N, E, V.
- **Referencia.** ASVS V14.3.2, V14.3.3.
- **Por qué.** Facilita elegir la vulnerabilidad correcta contra el nodo.
- **Verificación.** Manual (pendiente de automatizar); el validador ya informa `Server` y
  `X-Powered-By` como observaciones.
- **SIGILO.** **Cumple** en el código de la aplicación (no agrega esas cabeceras); el proxy de
  despliegue debe comprobarse con el validador.

## 8. Cadena de suministro e inventario

### SEC-35 Dependencias auditadas

- **Requisito.** Cada componente DEBE fijar sus dependencias con archivo de bloqueo, DEBE auditarlas
  contra vulnerabilidades conocidas en la integración continua y DEBERÍA publicar un SBOM por
  versión. Aplica a N, E, V.
- **Referencia.** ASVS V14.2.1, V14.2.4, V14.2.5.
- **Por qué.** Una dependencia comprometida en la ventanilla lee la denuncia antes de cifrarla.
- **Verificación.** Manual.
- **SIGILO.** **Parcial.** `package-lock.json`, `npm ci`, `npm audit --omit=dev`,
  `npm audit signatures` y SBOM CycloneDX en CI (`.github/workflows/ci.yml`), acciones fijadas por
  SHA y Dependabot; las imágenes publicadas llevan SBOM, procedencia y firma de cosign
  (`.github/workflows/imagenes.yml`). Falta la detección de secretos.

### SEC-36 Integridad del código servido

- **Requisito.** La ventanilla DEBERÍA construirse de forma reproducible y publicar los hashes de
  cada versión para que terceros verifiquen que el código servido es el publicado; si usa recursos
  de otro origen, DEBE usar SRI. Aplica a V.
- **Referencia.** ASVS V10.3.2, V14.2.3.
- **Por qué.** Un servidor obligado o comprometido puede servir código que filtre identidades a
  personas concretas.
- **Verificación.** Manual.
- **SIGILO.** **Brecha.** Sin hashes publicados ni verificador (modelo de amenazas C03 y F02).

### SEC-37 Inventario de la API

- **Requisito.** El nodo DEBE publicar su especificación OpenAPI versionada y NO DEBE exponer rutas
  fuera de ella. Aplica a N, E.
- **Referencia.** API9:2023; ASVS V1.1 (capítulo).
- **Por qué.** Una ruta olvidada (de depuración o de una versión anterior) suele ser la que no tiene
  controles.
- **Verificación.** Auto (API-01).
- **SIGILO.** **Parcial.** `estandar/openapi.yaml` se genera desde `packages/contracts` y API-01 no
  encuentra diferencias en la referencia; falta publicar la especificación desde el propio nodo
  (hoy vive en el repositorio).

### SEC-38 Consumo seguro de datos externos

- **Requisito.** Las consultas a la PDN (S1, S2, S3, S6) u otras fuentes NO DEBEN incluir datos de
  la denuncia ni de quien denuncia; DEBEN validar las respuestas, tener tiempo límite y usar una
  lista fija de destinos. Si es posible, DEBEN hacerse fuera de línea sobre descargas agregadas.
  Aplica a N.
- **Referencia.** API10:2023, API7:2023; ASVS V12.6.1.
- **Por qué.** Consultar a la PDN el nombre de una persona denunciada revela a un tercero que existe
  una denuncia.
- **Verificación.** Manual.
- **SIGILO.** **Cumple** hoy porque no consulta servicios externos en tiempo de ejecución; aplica a
  las funciones de la Etapa 3.

## Brechas de la implementación de referencia

Ordenadas por riesgo para la persona denunciante. Se atienden en las etapas indicadas o quedan como
residuales en el modelo de amenazas.

| Requisito        | Brecha                                                                                          | Riesgo |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------ |
| SEC-02           | La llave privada se importa en una página servida por el mismo servidor                         | Alto   |
| SEC-36           | Sin verificación de la integridad del código servido                                            | Alto   |
| SEC-05           | Apertura 2 de 3 de política, no criptográfica; sin custodio externo                             | Medio  |
| SEC-11           | Hechos en claro en la base del nodo (las pruebas ya van cifradas hacia la autoridad)            | Medio  |
| SEC-15, G08, G28 | Quien conozca un usuario del panel puede bloquearlo 15 minutos, también a una persona custodia  | Medio  |
| SEC-18, G03      | La corroboración conserva el oráculo inherente para quien adivina un identificador              | Medio  |
| SEC-19, G27      | Correlación por hora y tramo entre la entrada a la ventanilla y la entrega a un nodo            | Medio  |
| SEC-26           | Sin plazo de retención para denuncias, identidades y mensajes                                   | Medio  |
| SEC-29, PRV-20   | El servidor no puede recodificar ni rechazar metadatos: no ve la imagen (lo hace el navegador)  | Medio  |
| SEC-01, SEC-04   | Sin rotación de las llaves de autoridad ni de la de firma del nodo, que está en claro en disco  | Medio  |
| SEC-24           | Topes globales agotables: 200 000 eventos diarios en la bitácora (503) y cuota de pruebas (507) | Medio  |
| SEC-13           | Segundo factor TOTP, no resistente a phishing; sin WebAuthn para aprobar aperturas              | Bajo   |
| SEC-20, G06      | El aviso del archivo se compara por secuencia del buzón, sin marcarlo como aviso en el AAD      | Bajo   |
| G29              | El paso del relevo del frente «panel» no exige la sesión de la autoridad                        | Bajo   |
| SEC-35           | Sin detección de secretos en la integración continua                                            | Bajo   |
| SEC-20           | Anclaje manual de la bitácora del nodo (la nacional sí tiene testigos m de n)                   | Bajo   |

Corregidas en la versión 1.1.0: G01, G02, G04, G05, G07, G09, G10 y G11 de la sexta ronda; la
configuración de referencia del proxy sin registro de IP (SEC-22) y de TLS con HSTS (SEC-31); y
`npm audit`, SBOM y firma de imágenes en la integración continua (SEC-35, salvo los secretos).
