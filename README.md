# SIGILO

Capa de anonimato verificable para el Sistema de denuncias públicas de faltas administrativas y
hechos de corrupción (S5) de la Plataforma Digital Nacional.

Proyecto presentado al Datatón Anticorrupción 2026. Estado: en desarrollo.

## Qué resuelve

Protege la identidad de la persona denunciante en las tres etapas del proceso:

| Etapa       | Mecanismo                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Recepción   | Huella Cero: limpieza de pruebas en el navegador, detección de marcas invisibles, revisión del texto y vista previa de lo que verá la autoridad. |
| Trámite     | Identidad sellada: los datos personales se cifran en el navegador hacia la autoridad competente; cada apertura queda registrada.                 |
| Seguimiento | Recibo de ocho palabras, buzón cifrado bidireccional y bitácora verificable.                                                                     |

## Inicio rápido

Requisitos: Node.js 22.13 o superior.

```sh
npm install
npm run keys:generate
npm run dev:server
npm run dev:web
```

## Estructura

```
packages/contracts  Esquemas y rutas de la API (fuente única de verdad)
packages/core       Criptografía: HPKE, Ed25519, recibo, bitácora
packages/huella     Limpieza de pruebas y revisión de riesgo
apps/server         Servidor de referencia (Hono + SQLite)
apps/web            Aplicación de referencia (Vite + React)
docs/               Arquitectura, decisiones, modelo de amenazas
```

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Modelo de amenazas](docs/modelo-de-amenazas.md)
- [Criptografía: especificación del formato v1](docs/criptografia.md)
- [Integración con el S5](docs/integracion-s5.md)
- [Accesibilidad](docs/accesibilidad.md)
- [Datos sintéticos](docs/datos-sinteticos.md)
- [Declaración de uso de IA](docs/uso-de-ia.md)
- [Guion de la demostración](docs/demo.md)
- [Convenciones](docs/convenciones.md)
- [Glosario](docs/glosario.md)
- [Plan de trabajo](docs/plan.md)
- [Interfaces entre paquetes](docs/interfaces.md)
- [Decisiones de arquitectura](docs/adr/)

## Licencia

[Creative Commons Atribución-NoComercial 4.0 Internacional](LICENSE), conforme a las bases del
Datatón Anticorrupción 2026. Uso libre con fines no comerciales.
