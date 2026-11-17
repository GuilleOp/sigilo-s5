# Guía para una auditoría externa

Para quien audite SIGILO, la propuesta de Estándar S5 para el Sistema de denuncias públicas de la
Plataforma Digital Nacional: el código, las funciones, la seguridad, el apego legal y la
documentación. Corresponde a la rama `main` con el software 1.2.1 ([registro de cambios](../CHANGELOG.md))
y el **Estándar S5 0.4.0**. La revisión de seguridad de esta versión, con su evidencia, está en
[pruebas de seguridad](pruebas-de-seguridad.md). Todo es sintético: personas,
empresas, casos, folios y llaves. Los catálogos de entes (directorio de la PDN) y de municipios
(INEGI) son reales, y ningún caso acusa a una institución real.

## 1. SIGILO en una línea por pieza

| Pieza                                  | Dónde                                                           | Qué hace                                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ventanilla única de la SESNA           | `apps/enrutador` (puerto 8790)                                  | Sirve la web pública, enruta a ciegas sobres cifrados (sobre v2: solo nombra el nodo), cola de reenvío, salud de los nodos, corte nacional de datos abiertos y estadística, Swagger UI |
| Nodo de cada estado y de la federación | `apps/server`                                                   | Panel de autoridades, trámite LGRA, bitácora firmada, OAuth 2.0 como S2 y S3 y estadística para la PDN                                                                                 |
| Tabla de funciones firmada por nodo    | `packages/red/src/function-table.ts`                            | Etapas nacionales; cada estado asigna quién cumple cada función y, en el formato 2, el OIC de cada dependencia                                                                         |
| Propuesta de la autoridad competente   | `packages/red/src/competent-authority.ts`                       | Función pura que corre en el navegador con el directorio verificado                                                                                                                    |
| Web                                    | `apps/web`                                                      | Denuncia en 5 pasos con Huella Cero, folio y 8 palabras, seguimiento, panel de autoridad, observatorio, «¿Quién atiende?»; WCAG 2.0 AA                                                 |
| Criptografía                           | `packages/core`                                                 | HPKE, Ed25519, identidad sellada con AAD, pruebas cifradas (contenedor con compromiso salado), recibo de 8 palabras, buzón y bitácora                                                  |
| Ciclo de vida legal                    | `packages/contracts/src/catalogs/lifecycle.ts` y `procedure.ts` | Etapas, transiciones, recursos, plazos, motivos legales de cierre, vía penal y regla de recursos federales                                                                             |
| Estándar                               | `estandar/`                                                     | OpenAPI 3.1 y 3.0.3 por grupo, diccionarios en formato PDN, catálogos CSV y JSON, perfiles de seguridad y privacidad                                                                   |
| Validador                              | `tools/validador`                                               | `npm run validate -- <url>` y `npm run validate:pdn`                                                                                                                                   |
| Instalación                            | `tools/sigilo`, `instalacion/`                                  | `./sigilo instalar`, `iniciar`, `diagnostico`, `tabla …` y `./sigilo-sesna aceptar` / `publicar`                                                                                       |

Resumen del flujo en el [README](../README.md#cómo-funciona-sigilo-en-10-líneas).

## 2. Mapa del repositorio

```
packages/contracts     Esquemas Zod, catálogos, rutas y el estándar (fuente única de verdad)
packages/core          Criptografía, plazos, reglas de escalamiento y bitácora
packages/huella        Limpieza de pruebas, marcas invisibles y revisión de riesgo
packages/red           Directorio firmado, tabla de funciones, competencia, sobres, bitácora nacional
packages/anonimato     Grupo de anonimato en el navegador
packages/contexto-pdn  Verificaciones contra la PDN, conflicto de interés y prioridad
packages/auditor       Señales AUD-01 a AUD-08
packages/corroboracion Cliente VOPRF de la corroboración ciega
apps/server            Nodo (Hono + node:sqlite, migraciones 1 a 19)
apps/web               Web (Vite + React), perfiles ventanilla, panel y completo
apps/enrutador         Ventanilla, enrutador ciego, directorio, bitácora nacional y testigo
apps/corroboracion     Evaluador OPRF e índice de coincidencias
tools/validador        Validador del Estándar S5
tools/sigilo           CLI de nodos, SESNA y testigos
scripts/               Llaves, cuentas, red y semilla de la demostración
e2e/                   Pruebas de extremo a extremo (Playwright + axe)
datos/                 Proceso reproducible de la PDN (Python) y productos agregados
estandar/              Especificación generada desde packages/contracts
docs/                  Arquitectura, ADR, modelo de amenazas, proceso legal y guías
```

## 3. Cómo correrlo

```sh
npm ci
npm run check                       # formato, lint, tipos, Vitest y pruebas de datos (Python)
npm run standard:build -- --check   # el estándar generado está al día
npm run test:coverage               # cobertura
npm run demo:todo                   # red completa en Docker: ventanilla 8790, nodos 8781-8783
npm run demo:apagar
```

Pruebas de extremo a extremo: la web necesita las llaves del servidor de pruebas. Copia
`publicKeys` de `apps/server/data/keys.json` a `apps/web/src/config/pinned-keys.json`, corre
`npm run pretest:e2e && npx playwright test` y después `git checkout` del archivo de llaves.

El CI usa Node 22.18; el desarrollo, Node 26. Conviene revisar cualquier API o SQL que solo funcione
en versiones nuevas.

## 4. Dónde está cada función

| Función                                           | Código                                                                                          | Pruebas                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sobre de red v2, enrutador ciego, cola            | `packages/red/src/relay-envelope.ts`, `apps/enrutador/src/relay-*.ts`                           | `packages/red`, `apps/enrutador`                                          |
| Identidad sellada y apertura con dos aprobaciones | `packages/core`, `apps/server/src/services/identity-service.ts`                                 | `apps/server/src/routes/identity.test.ts`                                 |
| Pruebas cifradas y cadena de custodia             | `packages/core/src/evidence.ts`, `apps/server/src/services/evidence-service.ts`                 | `e2e/evidence-custody.spec.ts`                                            |
| Ciclo de vida legal                               | `packages/contracts/src/catalogs/lifecycle.ts`, `apps/server/src/services/procedure-service.ts` | `apps/server/src/routes/lifecycle.test.ts`, `e2e/legal-lifecycle.spec.ts` |
| Competencia por dependencia                       | `packages/red/src/competence.ts`, panel de operación                                            | `e2e/competence.spec.ts`                                                  |
| Grupo de anonimato (S1 y S2)                      | `packages/anonimato`, `datos/`                                                                  | `packages/anonimato`                                                      |
| MFA TOTP                                          | `apps/server/src/services/auth-service.ts`, `apps/web/src/pages/authority/MfaSteps.tsx`         | `e2e/mfa.spec.ts`                                                         |
| OAuth y estadística para la PDN                   | `apps/server/src/network/oauth-server.ts`, `apps/server/src/services/pdn-statistics.ts`         | `tools/validador` (perfil PDN)                                            |
| Exposición por perfil y endurecimiento            | `apps/server/src/http/exposure.ts`, `docs/seguridad-produccion.md`                              | `apps/server`                                                             |

## 5. Límites conocidos (decirlos con honestidad)

- Los hechos de la denuncia llegan en claro al nodo; la identidad y las pruebas sí van cifradas hacia
  la autoridad. Cifrar los hechos es el siguiente paso.
- Las dos aprobaciones para abrir una identidad son una regla del nodo, no un umbral criptográfico.
- La accesibilidad está revisada con axe y teclado; falta probarla con lectores de pantalla y con
  personas.
- Se puede correlacionar el tiempo entre el enrutador y el nodo (no hay retardo mínimo ni tráfico de
  cobertura).
- Los datos de S1 no cubren todos los proveedores; donde faltan, el grupo de anonimato dice
  «desconocido».
- Pendiente después del Datatón: recusación, acumulación con folio destino, calificación de
  particulares por separado y recursos de la vía penal tipados (ver
  [ciclo de vida legal](ciclo-de-vida-legal.md)).

## 6. Documentos clave

[Proceso legal](proceso-legal-de-la-denuncia.md) · [Ciclo de vida legal](ciclo-de-vida-legal.md) ·
[Competencia por dependencia](competencia-por-dependencia.md) ·
[Protección de quien denuncia](proteccion-de-quien-denuncia.md) · [Criptografía](criptografia.md) ·
[Modelo de amenazas](modelo-de-amenazas.md) · [Seguridad en producción](seguridad-produccion.md) ·
[Requisitos y criterios](requisitos.md) · [Fuentes legales](fuentes-legales.md) ·
[Uso de IA](uso-de-ia.md)

## 7. Qué entregar

Hallazgos por gravedad (crítica, alta, media, baja), cada uno con archivo y línea, escenario de
falla, corrección propuesta y si es rápida (menos de 1 hora).
