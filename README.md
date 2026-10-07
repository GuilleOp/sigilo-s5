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

Requisitos: Node.js 22.18 o superior (ver `.nvmrc`; desde 22.18 Node ejecuta TypeScript sin
compilar).

```sh
npm install
npm run keys:generate   # llaves de demostración, llaves fijadas de la web y apps/server/.env
npm run dev:server      # API en http://127.0.0.1:8787
npm run dev:web         # en otra terminal: http://127.0.0.1:5173
```

Abre `http://127.0.0.1:5173`. La web y la API comparten origen a través del proxy de Vite, así
que CORS queda desactivado.

Panel de la autoridad (`http://127.0.0.1:5173/autoridad`):

- Token: el valor de `SIGILO_AUTHORITY_TOKEN` en `apps/server/.env`, que `keys:generate` crea
  con un valor aleatorio si no existe.
- Llave: importa el archivo `apps/server/data/authority-demo-key.json`.

Otros comandos:

| Comando                            | Uso                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run demo:reset`               | Borra la base y las pruebas de la demostración y conserva las llaves.                      |
| `npm run ledger:anchor`            | Escribe `anchors/AAAA-MM-DD.json` con la cabeza pública firmada (ver `SIGILO_ANCHOR_URL`). |
| `npm run keys:generate -- --force` | Reemplaza las llaves; después reconstruye la web para fijar las nuevas.                    |

Un solo origen sin Vite: `npm run build -w @sigilo/web` y después
`SIGILO_WEB_DIST=../web/dist npm run start -w @sigilo/server`; la web queda en
`http://127.0.0.1:8787` con su CSP como cabecera.

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
