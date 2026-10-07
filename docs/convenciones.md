# Convenciones

Reglas obligatorias para todo el código y la documentación del repositorio.

## Idioma

| Ámbito                                                                        | Idioma  |
| ----------------------------------------------------------------------------- | ------- |
| Identificadores (variables, funciones, tipos, archivos de código)             | Inglés  |
| Comentarios en código, documentación, mensajes de commit, interfaz de usuario | Español |

Los términos del dominio se traducen según el [glosario](glosario.md) y se usan de forma consistente.
El español se escribe con ortografía completa (acentos, diéresis y eñe) en codificación UTF-8.

## Nomenclatura de archivos

| Tipo                     | Formato                         | Ejemplo                        |
| ------------------------ | ------------------------------- | ------------------------------ |
| Módulo TypeScript        | kebab-case                      | `sealed-envelope.ts`           |
| Componente React         | PascalCase                      | `RiskMeter.tsx`                |
| Prueba unitaria          | junto al módulo, sufijo `.test` | `sealed-envelope.test.ts`      |
| Prueba E2E               | `e2e/<flujo>.spec.ts`           | `e2e/submit-complaint.spec.ts` |
| Documento                | kebab-case en `docs/`           | `docs/modelo-de-amenazas.md`   |
| Archivo estándar de raíz | MAYÚSCULAS                      | `README.md`, `SECURITY.md`     |
| Decisión de arquitectura | `docs/adr/NNNN-título.md`       | `docs/adr/0002-hpke.md`        |

## Nomenclatura en código

- Tipos, interfaces y componentes: `PascalCase`. Funciones y variables: `camelCase`. Constantes de módulo: `UPPER_SNAKE_CASE`.
- Funciones con verbo: `sealIdentity`, `deriveReceiptKeys`. Booleanos con prefijo `is`, `has`, `should`.
- Sin abreviaturas ambiguas. Se permiten las del dominio criptográfico: `enc`, `ct`, `aad`, `kdf`.
- Esquemas zod con sufijo `Schema`; el tipo inferido lleva el mismo nombre sin sufijo.

## Estilo de código

- TypeScript estricto (`tsconfig.base.json`). Prohibido `any` y `// @ts-ignore`.
- Solo sintaxis borrable (`erasableSyntaxOnly`): sin `enum`, `namespace` ni propiedades de parámetro. Usar uniones de literales.
- Importaciones relativas con extensión `.ts`. Importaciones de tipos con `import type`.
- Funciones pequeñas y puras cuando sea posible. Efectos (red, almacenamiento, DOM) en los bordes.
- Errores: lanzar `Error` con mensaje claro en español; nunca incluir datos sensibles en mensajes ni registros.
- Aleatoriedad: solo `crypto.getRandomValues`. `Math.random` está prohibido por lint.
- Sin `console.log` en código de producción.
- Formato con Prettier; lint con ESLint. `npm run check` debe pasar antes de integrar.

## Comentarios

- Concisos, en español, sin emojis. Explican el porqué, no el qué.
- Cada archivo inicia con un comentario de una o dos líneas que describe su responsabilidad.
- Funciones exportadas con TSDoc breve (`/** ... */`): propósito, invariantes y errores relevantes.
- Las decisiones de seguridad se marcan con `Seguridad:` al inicio del comentario.

## Pruebas

- Toda función exportada de `packages/*` tiene pruebas unitarias.
- La criptografía incluye vectores de prueba fijos y pruebas de manipulación (bit cambiado, llave equivocada).
- Las pruebas no usan datos reales. Ver `docs/datos-sinteticos.md`.

## Git y versionado

- Rama principal `main`, siempre desplegable. Ramas cortas: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) en español: `feat(core): agrega sobre HPKE`.
- Ámbitos válidos: `contracts`, `core`, `huella`, `server`, `web`, `e2e`, `docs`, `ci`, `infra`.
- Versionado [SemVer](https://semver.org/lang/es/). Cambios registrados en `CHANGELOG.md` (formato Keep a Changelog).

## Definición de terminado

Una tarea está terminada cuando:

1. Cumple su criterio de aceptación en el issue.
2. Tiene pruebas y `npm run check` pasa.
3. El código está documentado según estas convenciones.
4. La documentación afectada esta actualizada.
5. No introduce peticiones a terceros ni datos reales.
