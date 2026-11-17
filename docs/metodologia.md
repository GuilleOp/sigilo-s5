# Metodología y tecnologías de SIGILO

Este documento explica cómo desarrollé SIGILO y cómo se puede replicar. Responde al tercer producto
entregable de las bases del Datatón Anticorrupción 2026 («archivos que describen la metodología y
las tecnologías empleadas») y al criterio 8 de la rúbrica. Es un mapa: cada sección resume y enlaza
al documento que tiene el detalle.

| Dato          | Valor                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Proyecto      | SIGILO, propuesta para el Sistema de denuncias públicas (S5) de la Plataforma Digital Nacional |
| Autor         | Guillermo Adrián Gutiérrez Olvera, único integrante del equipo «Sigilo»                        |
| Versión       | SIGILO 1.2.1 y Estándar S5 0.4.0                                                               |
| Licencia      | [CC BY-NC 4.0](../LICENSE): código público para uso no comercial con atribución                |
| Datos         | Personas y casos siempre sintéticos; catálogos de entes (PDN) y municipios (INEGI) reales      |
| Versión breve | [Presentación ejecutiva](presentacion-ejecutiva.md) y su video                                 |

## Contenido

1. [Enfoque](#1-enfoque)
2. [Fases y cronología](#2-fases-y-cronología)
3. [Tecnologías](#3-tecnologías)
4. [Datos](#4-datos)
5. [Uso de inteligencia artificial](#5-uso-de-inteligencia-artificial)
6. [Calidad y verificación](#6-calidad-y-verificación)
7. [Cómo replicarlo](#7-cómo-replicarlo)
8. [Limitaciones y trabajo futuro](#8-limitaciones-y-trabajo-futuro)

## 1. Enfoque

Seguí cuatro pasos, en este orden:

1. **Problema.** Quien denuncia corrupción desde dentro de una institución puede ser identificada
   aunque el sistema no le pida su nombre: por un detalle del relato, por los metadatos de una foto,
   por la hora de envío o por quien opera el servidor. Además, una denuncia puede quedarse sin
   atender sin que nadie lo note.
2. **Hipótesis.** Si todo lo que identifica a la persona se procesa en su navegador, si nadie en
   medio puede leer la denuncia y si cada paso de la autoridad queda en un registro público
   verificable, la persona puede denunciar sin exponerse y comprobar qué pasa con su caso.
3. **Diseño con privacidad por defecto.** Antes de escribir código definí qué ve cada actor
   ([arquitectura](arquitectura.md#qué-ve-cada-actor)), qué amenazas hay que atender
   ([modelo de amenazas](modelo-de-amenazas.md)) y qué decisiones lo sostienen
   ([ADR 0001 a 0012](adr/)). La regla de alcance quedó en el
   [ADR 0001](adr/0001-alcance-y-principios.md).
4. **Prototipo verificable.** Cada función se clasifica en un nivel: **A**, funciona, tiene pruebas y
   aparece en la demostración; **B**, prototipo con datos sintéticos; **C**, diseño documentado. Si
   el tiempo no alcanzaba, una función bajaba de B a C, nunca de A ([plan de trabajo](plan.md)).
   La [matriz de requisitos](requisitos.md) liga cada requisito de las bases, de la rúbrica y de lo
   que expuso la SESNA con su nivel y su evidencia.

## 2. Fases y cronología

Las fechas de la tabla son las del historial de git (`git log --reverse --date=short`). El historial
agrupa parte del trabajo en commits grandes: por ejemplo, la versión 1.0.0 entró en un solo commit
el 5 de noviembre. Los periodos planeados de cada etapa están en el [plan de trabajo](plan.md).

| Fase                          | Fechas en git              | Qué hice                                                                                                                                                                                                                                            | Dónde está                                                                                                                                     |
| ----------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Análisis                      | Octubre y 5 nov            | Leí las bases y el reto S5; revisé la versión de pruebas del S5 con un validador propio; tomé lo que expuso la SESNA en la conferencia «Denuncia ciudadana» (21 oct) y en el taller del S5 (27 oct); revisé LGRA, LGSNA, CNPP y las Bases de la PDN | [Matriz de requisitos](requisitos.md), [reportes del validador](../estandar/reportes/), [fuentes legales](fuentes-legales.md)                  |
| Fundación y capa de anonimato | 6 y 7 oct                  | Monorepo, criptografía (`core`), Huella Cero (`huella`), servidor de referencia y aplicación web; cinco rondas de revisión de seguridad                                                                                                             | [ADR 0002 a 0004](adr/), [criptografía](criptografia.md), [historial de seguridad](historial-de-seguridad.md)                                  |
| Diseño de la red y estándar   | 5 nov (1.0.0)              | Modelo de amenazas con LINDDUN (privacidad) y STRIDE (seguridad); ADR 0005 a 0010; Estándar S5 con OpenAPI, diccionario y catálogos; red federada y datos de la PDN                                                                                 | [Modelo de amenazas](modelo-de-amenazas.md), [ADR 0005](adr/0005-estandar-s5-federado.md), [estándar](../estandar/README.md)                   |
| Datos                         | 5 y 11 nov                 | Proceso reproducible en Python sobre las descargas masivas de la PDN; 7,213 entes reales, municipios del INEGI y equivalencias con el catálogo de faltas del S5                                                                                     | [datos/](../datos/README.md), [ADR 0008](adr/0008-datos-pdn-y-cobertura.md)                                                                    |
| Construcción                  | 5 al 12 nov                | Ventanilla única en la SESNA, enrutador ciego, un nodo por estado, tabla de funciones firmada, OAuth 2.0, pruebas cifradas, segundo factor, instalación con el CLI `sigilo` e imágenes firmadas (versión 1.1.0 el 12 nov)                           | [Arquitectura](arquitectura.md#red-federada), [instalación del nodo](instalacion-nodo.md), [CHANGELOG](../CHANGELOG.md)                        |
| Legal                         | 12 y 16 nov                | Medidas de protección (CNPP art. 109); ciclo de vida legal de la LGRA con Tribunal, recursos y vía penal; competencia por dependencia; Estándar S5 0.4.0                                                                                            | [Proceso legal](proceso-legal-de-la-denuncia.md), [ciclo de vida legal](ciclo-de-vida-legal.md), [competencia](competencia-por-dependencia.md) |
| Seguridad                     | 7 oct al 16 nov            | Seis rondas de revisión interna, endurecimiento de producción (H01 a H25) y la revisión de la versión de entrega (1.2.1)                                                                                                                            | [Historial](historial-de-seguridad.md), [pruebas de seguridad](pruebas-de-seguridad.md), [seguridad en producción](seguridad-produccion.md)    |
| Validación                    | Continua; cierre el 16 nov | Pruebas de extremo a extremo, revisión con axe, recorrido completo de la demostración y versión 1.2.0 de entrega                                                                                                                                    | [Demostración](demo.md), [accesibilidad](accesibilidad.md)                                                                                     |

### Cómo trabajé cada tarea

1. Una rama por tarea, con un alcance y un conjunto de archivos acotados.
2. Controles automáticos: formato, lint, tipos, pruebas unitarias, de extremo a extremo y axe.
3. Revisión de código; además, de seguridad si la tarea toca criptografía o datos, y de
   accesibilidad si toca la interfaz.
4. Corrección, integración y, al cierre de cada etapa, revisión contra la matriz de requisitos.

Las decisiones que cambian la arquitectura se registran como ADR con la
[plantilla](adr/0000-plantilla.md); las convenciones de código y de redacción están en
[convenciones.md](convenciones.md).

### Cómo analicé el S5 oficial

Partí de la versión de pruebas del S5 y conservé lo que funciona: el flujo de cinco pasos, el
vocabulario de la bandeja (aceptar, reasignar, devolver), el semáforo de turnado y el tope de
reasignaciones. El validador (`npm run validate -- <url> --modo pasivo`) revisa la privacidad de un
sitio de denuncias sin enviar nada; sus reportes del 5 de noviembre están en
[`estandar/reportes/`](../estandar/reportes/). Las áreas de oportunidad que encontré (servicios de
terceros, identificadores previsibles, cabeceras de seguridad, metadatos de las pruebas, permisos)
y lo que propongo para cada una están en la [matriz de requisitos](requisitos.md).

## 3. Tecnologías

Todas son libres y sin costo. Las versiones son las de los `package.json` de la versión 1.2.1 (rango
mínimo declarado). El motivo de cada elección está en el [ADR 0003](adr/0003-stack.md).

| Componente                 | Tecnología                                                                                                            | Por qué                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Lenguaje y entorno         | TypeScript 6.0 estricto sobre Node.js 22.18 o posterior                                                               | Node 22.18 ejecuta TypeScript sin compilar: los paquetes no necesitan paso de construcción                  |
| Monorepo                   | npm workspaces (14 paquetes)                                                                                          | Sin herramientas adicionales                                                                                |
| Contratos y validación     | zod 4.6 en `packages/contracts`                                                                                       | Una sola fuente de verdad para cliente, servidor y estándar                                                 |
| Servidor y nodo            | Hono 4.13, `@hono/node-server` 2.1 y `node:sqlite`                                                                    | Ligero y sin dependencias nativas                                                                           |
| Aplicación web             | React 19.3, React Router 8.4 y Vite 8.3                                                                               | Paquete pequeño que admite una CSP estricta                                                                 |
| Criptografía               | HPKE (RFC 9180) con `@hpke/core` 1.9; X25519, Ed25519 y VOPRF (RFC 9497) con `@noble/curves` 2.4; `@noble/hashes` 2.4 | Primitivas estándar y bibliotecas auditables; nada de criptografía propia ([criptografía](criptografia.md)) |
| Recibo de seguimiento      | Lista de palabras en español de `@scure/bip39` 2.4                                                                    | Ocho palabras fáciles de anotar, sin cuenta ni correo                                                       |
| Limpieza de pruebas        | `exifr` 7.1 y `pdfjs-dist` 6.4, más recodificación en canvas del navegador                                            | Leer y quitar metadatos sin enviar el archivo a nadie ([ADR 0004](adr/0004-huella-cero.md))                 |
| Proceso de datos de la PDN | Python 3.10 o posterior, solo biblioteca estándar                                                                     | Lee los ZIP de la PDN en streaming, sin dependencias ([datos/](../datos/README.md))                         |
| Estándar S5                | OpenAPI 3.0.3 y 3.1, Swagger UI 5.34 servido sin CDN, `ajv` 8.20 en el validador                                      | El formato de las especificaciones de la PDN ([estándar](../estandar/README.md))                            |
| Pruebas                    | Vitest 5.0, Playwright 1.63 y `@axe-core/playwright` 4.13; `unittest` de Python                                       | Unitarias, de extremo a extremo y accesibilidad automática                                                  |
| Calidad de código          | ESLint 10.12 y Prettier 3.9                                                                                           | Formato y reglas iguales para todo el repositorio                                                           |
| Contenedores y despliegue  | Docker con Compose 2.17 o posterior; Caddy 2.10 para HTTPS en producción                                              | Demostración con un comando e instalación en un servidor Linux                                              |
| Cadena de suministro       | GitHub Actions, imágenes en GHCR firmadas con cosign, SBOM CycloneDX, procedencia SLSA, Dependabot                    | Que un estado pueda verificar qué instala ([seguridad en producción](seguridad-produccion.md))              |

La [estructura del repositorio](../README.md#estructura-del-repositorio) y las
[interfaces entre paquetes](interfaces.md) describen qué hace cada paquete.

## 4. Datos

| Tipo                                                     | Origen                                                                                                       | Uso en SIGILO                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Descargas masivas de S1, S2, S3 y S6                     | PDN, descargadas el 5 de noviembre de 2026 y verificadas con SHA-256 ([fuentes.json](../datos/fuentes.json)) | Solo productos agregados: grupos de anonimato, matriz de cobertura, equivalencias de instituciones y datos abiertos |
| Directorio de entes                                      | PDN (7,213 entes)                                                                                            | Elegir la institución denunciada y encontrar a la autoridad competente                                              |
| Municipios                                               | INEGI (2,478 municipios y alcaldías)                                                                         | Elegir el lugar sin mapas de terceros                                                                               |
| Catálogo de faltas del S5                                | Catálogo público del S5 (3,559 entradas de las 32 entidades y la federación)                                 | El 95 % se traduce a 38 conductas en lenguaje llano ([integración con el S5](integracion-s5.md))                    |
| Personas, casos, folios y autoridades de la demostración | Sintéticos                                                                                                   | Demostración y pruebas ([datos sintéticos](datos-sinteticos.md), [escenario](demo-escenario.md))                    |

**Qué es real y qué es sintético.** Los datos públicos de instituciones son reales. Las personas son
siempre sintéticas, y los entes que aparecen denunciados en la demostración van rotulados
«(ficticio)» o «(ficticia)». El conflicto de interés con S1 y S2 funciona solo con datos sintéticos:
las fuentes reales de S1 y S2 no están conectadas a esa función.

**Cómo se generan los datos abiertos.** `python3 datos/proceso/ejecutar.py` lee los cuatro ZIP de la
PDN, quita todo campo que identifique a una persona, normaliza instituciones y escribe tres conjuntos
en [`datos/abiertos/`](../datos/abiertos/): grupos de anonimato, matriz de cobertura e indicadores de
contratación federal. Cada uno trae `diccionario.csv` y `metodologia.md`. Los conteos se redondean a
10 y las celdas de 1 a 4 se suprimen, con supresión complementaria para que no se puedan
reconstruir. Con las mismas descargas, el proceso produce los mismos bytes.

**La PDN como escudo.** Con S1 calculé el tamaño del grupo de anonimato de cada área: el 38.0 % de
quienes declaran en el S1 trabaja en áreas con k < 10. El navegador estima ese grupo con fragmentos
estáticos descargados del mismo sitio, sin consultar a la PDN. Las reglas de privacidad, las cifras,
las decisiones y las limitaciones del proceso están en [`datos/README.md`](../datos/README.md).

## 5. Uso de inteligencia artificial

Desarrollé SIGILO con **Claude Code** (Anthropic) como asistente, con varios agentes en paralelo,
cada uno con una tarea y archivos acotados, bajo mi dirección y revisión. Lo usé para analizar
las bases, proponer diseño, generar y revisar código, redactar documentación y hacer revisiones de
seguridad, de calidad y de accesibilidad. El boceto del logotipo se hizo con **Gemini** (Google) y lo
redibujé como SVG propio. Ninguna herramienta recibió datos personales ni datos de denuncias.

**La aplicación no usa IA** ni envía datos a terceros. El auditor de la autoridad funciona con
reglas deterministas y públicas (AUD-01 a AUD-08); el adaptador para un modelo local opcional está
desactivado y no está conectado al servidor. Las revisiones de seguridad hechas con asistentes son
internas, no una evaluación de terceros. Detalle en la
[declaración de uso de IA](uso-de-ia.md) y en el [ADR 0009](adr/0009-ia-local.md).

## 6. Calidad y verificación

| Qué se verifica               | Cómo                                                                                                                                            | Comando                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Formato, lint y tipos         | Prettier, ESLint y TypeScript estricto                                                                                                          | `npm run check`                                 |
| Lógica de cada paquete        | 1,766 pruebas unitarias en 199 archivos (Vitest), incluidos los vectores de prueba de las RFC                                                   | `npm test`                                      |
| Proceso de datos de la PDN    | 34 pruebas en Python con ZIP sintéticos, incluida la ausencia de nombres, CURP y RFC en las salidas                                             | `npm run data:test`                             |
| Recorridos completos          | 114 pruebas de extremo a extremo (Playwright): denuncia, seguimiento, panel, ciclo legal, cero terceros                                         | `npm run test:e2e`                              |
| Accesibilidad automática      | axe-core contra WCAG 2.0 A y AA en cada pantalla, en tres temas y dos anchos                                                                    | Incluida en `test:e2e`                          |
| Estándar al día con el código | Regenera `estandar/` desde los esquemas zod y compara                                                                                           | `npm run standard:build -- --check`             |
| Dependencias                  | `npm audit` y verificación de firmas del registro                                                                                               | En la CI                                        |
| Seguridad                     | Seis rondas internas y la revisión de la entrega: caja negra sobre la demostración local, revisión de las 90 rutas y de la cadena de suministro | [Pruebas de seguridad](pruebas-de-seguridad.md) |

La [integración continua](../.github/workflows/ci.yml) corre en cada push, con Node 22.18 y la
versión más reciente, la auditoría de dependencias, el formato, el lint, los tipos, las pruebas
unitarias, las del proceso de datos y las de extremo a extremo; la comprobación del estándar se
corre a mano. Cada corrección de seguridad se cerró con una prueba que falla sin
ella ([historial de seguridad](historial-de-seguridad.md#cómo-se-trabajó)).

## 7. Cómo replicarlo

### 7.1 La red completa en tu equipo (para revisar)

Requisitos: Docker en marcha (Compose 2.17 o posterior) y Node.js 22.18 o posterior, con un usuario
normal.

```sh
git clone https://github.com/GuilleOp/sigilo-s5 && cd sigilo-s5
npm ci
npm run demo:todo     # llaves y cuentas sintéticas, construcción, arranque y semilla
```

Abre la ventanilla en <http://127.0.0.1:8790/> y los paneles en `:8781`, `:8782` y `:8783`. Las
cuentas, el código del segundo factor y los problemas comunes están en el
[guion de la demostración](demo.md#red-federada-con-el-escenario-completo-docker-un-comando). Para
apagar y borrar todo: `npm run demo:apagar`.

### 7.2 Un solo nodo sin Docker

```sh
npm ci
npm run keys:generate
npm run accounts:generate
npm run dev:server    # API en http://127.0.0.1:8787
npm run dev:web       # en otra terminal: http://127.0.0.1:5173
```

Detalle en el [inicio rápido](../README.md#un-solo-nodo-sin-docker).

### 7.3 Las pruebas

```sh
npm run keys:generate               # una vez
npm run check                       # formato, lint, tipos, unitarias y proceso de datos
npx playwright install chromium     # una vez
npm run test:e2e
```

### 7.4 Instalación de producción en un estado

Un servidor Linux con Docker y un dominio. No hace falta el código fuente: el CLI corre dentro de la
imagen firmada `ghcr.io/guilleop/sigilo-nodo`.

```sh
./sigilo instalar       # deja una solicitud de alta y una huella
./sigilo iniciar        # cuando la SESNA aprueba el alta
./sigilo diagnostico
```

Requiere que la SESNA acepte el alta (`./sigilo-sesna aceptar` y `publicar`), así que no sirve para
probar a solas. Guías: [nodo del estado](instalacion-nodo.md), [SESNA](instalacion-sesna.md) y
[seguridad en producción](seguridad-produccion.md).

### 7.5 Regenerar el estándar y los datos

```sh
npm run standard:build                         # estandar/ desde packages/contracts
python3 datos/proceso/ejecutar.py --entrada ~/datos-pdn --salida datos/ \
  --privado ~/datos-pdn/salidas --fecha-referencia 2026-11-05
```

El segundo comando necesita las cuatro descargas de la PDN (unos 3.4 GB) en una carpeta fuera del
repositorio; las URL y los SHA-256 están en [`datos/README.md`](../datos/README.md#fuentes). No hace
falta para usar ni para probar SIGILO: los productos agregados ya están en el repositorio.

## 8. Limitaciones y trabajo futuro

Lo que SIGILO no resuelve o no ha probado:

- **Los hechos quedan en claro en el nodo de destino.** La autoridad necesita leerlos para
  investigar; el nombre y las pruebas sí van cifrados hacia ella.
- **La correlación por tiempo** entre la ventanilla y un nodo sigue siendo posible para quien
  observe ambos.
- **Las dos aprobaciones** para abrir la identidad son una regla del servidor, no una garantía
  criptográfica.
- **El segundo factor TOTP** no resiste un phishing en tiempo real; WebAuthn es el siguiente paso.
- **Conflicto de interés** solo con datos sintéticos: S1 y S2 reales no están conectados a esa
  función.
- **Accesibilidad:** revisada con axe y teclado; faltan lectores de pantalla reales, otros
  navegadores y pruebas con personas ([accesibilidad](accesibilidad.md#lo-que-no-se-ha-probado)).
- **Seguridad:** las revisiones son internas; antes de recibir denuncias reales hace falta una
  evaluación independiente ([SECURITY.md](../SECURITY.md)).
- **Datos de la PDN:** fuera de lo federal, solo del 31 al 40 % de las instituciones de S2 y S3
  encuentra su ente en S1, y varios estados no tienen S1 en la descarga, Querétaro entre ellos
  ([limitaciones del proceso](../datos/README.md#limitaciones)).
- **Marco legal:** el análisis marca con «[verificar]» lo que no pude confirmar en una fuente
  primaria ([proceso legal](proceso-legal-de-la-denuncia.md)); no es asesoría legal.

Los riesgos residuales completos están en el
[modelo de amenazas](modelo-de-amenazas.md#riesgos-residuales-principales) y en
[seguridad en producción](seguridad-produccion.md#4-riesgos-que-quedan).
