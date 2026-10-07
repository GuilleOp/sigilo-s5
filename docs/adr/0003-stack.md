# 0003. Stack tecnológico

- Estado: aceptada
- Fecha: 2026-10-06

## Decisión

| Capa      | Elección                                                                        | Motivo                                  |
| --------- | ------------------------------------------------------------------------------- | --------------------------------------- |
| Monorepo  | npm workspaces                                                                  | Sin herramientas adicionales            |
| Lenguaje  | TypeScript estricto, ejecutado sin compilar (type stripping de Node 22+ y Vite) | Sin paso de build en paquetes           |
| Contratos | zod en `@sigilo/contracts`                                                      | Fuente única de verdad cliente-servidor |
| Servidor  | Hono + `node:sqlite`                                                            | Ligero, sin dependencias nativas        |
| Web       | Vite + React 19 + React Router                                                  | Bundle pequeño, CSP estricta posible    |
| Pruebas   | Vitest y Playwright                                                             | Estándar del ecosistema                 |

## Consecuencias

- La integración con Next.js y Directus del S5 se resuelve con los paquetes `core` y `huella`,
  que no dependen del framework.
