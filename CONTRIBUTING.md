# Contribuir

Gracias por tu interés en SIGILO. Es un prototipo de referencia para el Datatón Anticorrupción 2026;
las propuestas, correcciones y revisiones son bienvenidas.

## Antes de empezar

- Lee las [convenciones](docs/convenciones.md), las [interfaces](docs/interfaces.md) y, si tu
  cambio toca criptografía o datos, el [modelo de amenazas](docs/modelo-de-amenazas.md).
- Para cambios grandes, abre primero un issue y explica el problema.
- Las vulnerabilidades no van en issues públicos: sigue [SECURITY.md](SECURITY.md).

## Flujo

1. Crea una rama corta desde `main` con el prefijo correspondiente (`feat/`, `fix/`, `docs/`...).
2. Ejecuta `npm ci` y, una vez, `npm run hooks:install` para activar las revisiones locales previas
   al commit.
3. Usa mensajes de commit convencionales en español (`feat(red): …`, `fix(web): …`, `docs: …`).
4. Si cambias los esquemas de `packages/contracts`, regenera el estándar con
   `npm run standard:build` y anota el cambio en `estandar/CHANGELOG.md`.
5. Antes de abrir el pull request, ejecuta `npm run check` y, si tocas la interfaz,
   `npm run test:e2e`.
6. Describe en el pull request qué cambia, por qué y cómo se probó. Vincula el issue.

## Reglas del proyecto

- **Datos sintéticos siempre.** Nunca incluyas datos personales reales en código, pruebas, capturas
  o issues, ni señales a personas o instituciones reales
  ([datos sintéticos](docs/datos-sinteticos.md)).
- **Cero terceros.** La web no hace peticiones a dominios de terceros; una prueba E2E lo comprueba.
- Este proyecto sigue un [código de conducta](CODE_OF_CONDUCT.md).

Al contribuir aceptas que tu aporte se publique bajo la [licencia del proyecto](LICENSE)
(CC BY-NC 4.0).
