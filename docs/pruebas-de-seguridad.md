# Pruebas de seguridad

Resultado de la revisión de seguridad de la versión de entrega de SIGILO al Datatón Anticorrupción
2026: prueba de penetración de caja negra, revisión del código de todas las rutas, cadena de
suministro de las imágenes y documentación. Las rondas anteriores están en el
[historial de seguridad](historial-de-seguridad.md); los controles, en
[seguridad en producción](seguridad-produccion.md) y en el
[perfil de seguridad](../estandar/perfil-seguridad.md).

> [!IMPORTANT]
> Es una **revisión interna** del autor, hecha con asistentes de IA bajo su dirección y revisión
> ([uso de IA](uso-de-ia.md)). **No es un pentest de terceros** ni sustituye una evaluación de
> seguridad independiente antes de recibir denuncias reales.

## 1. Alcance

| Qué                     | Detalle                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versión                 | 1.2.0 (`main` 8b3f156); las correcciones salieron en la 1.2.1                                                                                                                                                             |
| Fecha                   | 17 de noviembre de 2026                                                                                                                                                                                                   |
| Superficies (dinámicas) | Ventanilla única y enrutador ciego (`127.0.0.1:8790`), nodos Querétaro, Federal y Oaxaca (`:8781`–`:8783`: API, panel y OAuth); evaluador e índice (solo red interna)                                                     |
| Código                  | `apps/server`, `apps/enrutador`, `apps/corroboracion` (unas 90 rutas), `packages/contracts`, el generador del estándar                                                                                                    |
| Cadena de suministro    | Las 5 imágenes publicadas `ghcr.io/guilleop/sigilo-{nodo,enrutador,testigo,evaluador,indice}:1.2.0`, `docker/Dockerfile`, los compose de demostración y de producción, el Caddyfile del instalador y `.github/workflows/` |
| Fuera de alcance        | DoS volumétrico, ingeniería social, la infraestructura de un estado o de la SESNA, el S5 oficial y la fuerza bruta contra cuentas reales de la demostración                                                               |

## 2. Metodología

- **Caja negra, no destructiva**, contra la red de demostración en local (datos sintéticos): sin
  enviar denuncias válidas, sin cambiar estados, login solo con usuarios inexistentes (15
  intentos), a lo más unas 30 peticiones por prueba de límites y un cuerpo grande por ruta.
- **Caja blanca**: inventario de las rutas desde el registro real de Hono y revisión de validación,
  autorización, límites, cabeceras y manejo de errores de cada una; coherencia con el OpenAPI.
- **Cadena de suministro**: firma, SBOM y procedencia de las imágenes, contenido de la imagen,
  análisis de vulnerabilidades del sistema base y configuración de los compose y de la CI.
- Cada corrección se cierra con una prueba que falla sin ella, y `npm run check` y los E2E en verde.
- Referencias: OWASP ASVS 4.0.3 y OWASP API Security Top 10 2023, como en el perfil de seguridad.

**Herramientas:** `curl`; Vitest y Playwright con axe; `tools/validador`; `npm audit` y
`npm audit signatures`; `cosign verify`; `docker buildx imagetools inspect`; Trivy; `gh api`.
**No se usaron** escáneres dinámicos comerciales (ZAP, Burp) ni análisis estático de terceros.

**Escala de severidad:** **Crítica**, compromete identidades o denuncias sin condiciones; **Alta**,
lo mismo con una condición razonable; **Media**, viola el mínimo privilegio o un control documentado
sin exponer identidades; **Baja**, endurecimiento o higiene; **Info**, sin riesgo, solo observación.

## 3. Resultados

**Ningún hallazgo crítico ni alto.** Uno medio, corregido en la 1.2.1.

### Prueba de penetración de caja negra

| Severidad | Superficie                 | Hallazgo                                                                                                                         | Estado                                                       |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Baja      | Ventanilla `:8790`         | Rutas ocultas (`/.git/config`, `/.env`) y `/v1/*` respondían la web con 200 en vez de 404 (sin fuga: solo el HTML de la web)     | Corregida en 1.2.1: 404, y en JSON para `/oauth/*` y `/v1/*` |
| Info      | Nodo, `/api/v1/auth/login` | El primer paso responde igual con un usuario inexistente (anti-enumeración); el bloqueo por fuerza bruta vive en el segundo paso | Por diseño                                                   |
| Info      | Todas                      | Un método no permitido responde 404 y no 405                                                                                     | Aceptado (sin fuga)                                          |

Lo que se comprobó que está bien, con su evidencia:

- **Cabeceras** en HTML, API, estáticos y errores: CSP sin `unsafe-inline` ni `unsafe-eval`, con
  `frame-ancestors 'none'`; `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  COOP, COEP, CORP, `Permissions-Policy`, `Cache-Control: no-store`; sin `Server` ni
  `X-Powered-By` ([cabeceras web](evidencia/2026-11-17/pentest/headers-web.txt),
  [cabeceras API](evidencia/2026-11-17/pentest/headers-api.txt)).
- **CORS**: no refleja orígenes ajenos ([cors](evidencia/2026-11-17/pentest/cors.txt)).
- **Autorización**: toda ruta de autoridad y de operación sin token responde 401 en JSON con
  `WWW-Authenticate: Bearer` ([auth](evidencia/2026-11-17/pentest/auth.txt)).
- **Validación**: JSON roto, tipos erróneos, campos extra y Unicode raro responden 400; cuerpos de
  2 y 20 MB se rechazan sin colgarse ([validación](evidencia/2026-11-17/pentest/validation.txt),
  [tamaño](evidencia/2026-11-17/pentest/bodysize.txt)).
- **Sin traversal, sin IDOR y sin fugas**: `..%2f` y `..%5c` responden 404; un folio ajeno sin
  recibo, 404 genérico; ningún error trae trazas ni rutas internas; `/api/v1/keys` solo trae
  llaves públicas ([traversal](evidencia/2026-11-17/pentest/traversal.txt),
  [IDOR](evidencia/2026-11-17/pentest/idor.txt), [fugas](evidencia/2026-11-17/pentest/leaks.txt),
  [errores](evidencia/2026-11-17/pentest/errores.txt)).
- **Segmentación**: el evaluador y el índice no responden desde el equipo
  ([internos](evidencia/2026-11-17/pentest/internos.txt)).
- **Sin cookies**: la sesión va en un token Bearer ([cookies](evidencia/2026-11-17/pentest/cookies.txt)).

### Revisión del código

Toda entrada JSON pasa por esquemas estrictos y toda ruta tiene límite de cuerpo y errores con
mensaje fijo. El enrutador no lee la IP, el User-Agent ni `X-Forwarded-For`. Los secretos se
comparan en tiempo constante.

| Severidad | Dónde                                 | Hallazgo                                                                                                                                             | Estado                                                 |
| --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Media     | `apps/server/src/routes/authority.ts` | La cuenta que solo substancia no veía en su bandeja las denuncias en investigación, pero sí podía abrir su detalle y sus pruebas conociendo el folio | Corregida en 1.2.1, con prueba en `lifecycle.test.ts`  |
| Baja      | `apps/enrutador/src/web.ts`           | `GET /oauth/token` y `/v1/*` respondían la web en HTML                                                                                               | Corregida en 1.2.1                                     |
| Baja      | `apps/server/src/config.ts`           | `SIGILO_ALLOWED_ORIGIN` aceptaba `*`                                                                                                                 | Corregida en 1.2.1: un solo origen http(s) exacto      |
| Baja      | OpenAPI                               | Respuestas reales sin documentar (403 de la cuenta de operación, 413, 503), rutas de paso de la ventanilla y `nullable` del perfil 3.0               | Corregida en 1.2.1                                     |
| Baja      | `apps/enrutador/src/app.ts`           | El middleware global de cabeceras va después de la vista del estándar y de la ventanilla, que aplican las suyas                                      | Aceptado: el orden es necesario para su CSP propia     |
| Baja      | `apps/server/src/routes/authority.ts` | El resumen del auditor lo ve cualquier función de la autoridad                                                                                       | Aceptado: son conteos agregados de su propia autoridad |

### Cadena de suministro

Las 5 imágenes **verifican su firma** con cosign, con la identidad exacta del flujo
`imagenes.yml@refs/tags/v1.2.0`, y traen SBOM SPDX, procedencia SLSA y las arquitecturas
`linux/amd64` y `linux/arm64` ([verificación](evidencia/2026-11-17/cadena-de-suministro/cosign-verify-estricto-nodo.txt),
[inventario](evidencia/2026-11-17/cadena-de-suministro/imagetools-nodo.txt)). Corren como `node`
(uid 1000), sin npm ni secretos dentro
([contenido](evidencia/2026-11-17/cadena-de-suministro/contenido-nodo.txt),
[secretos](evidencia/2026-11-17/cadena-de-suministro/secretos-nodo.txt)).

| Severidad | Dónde                              | Hallazgo                                                                              | Estado                                                                                                                           |
| --------- | ---------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Media     | Compose de producción e instalador | La imagen va por versión, no por digesto, y nada verifica la firma antes de descargar | Documentado: [verificar la imagen](seguridad-produccion.md#verificar-la-imagen-antes-de-instalar); siguiente paso, automatizarlo |
| Media     | Caddyfile del nodo                 | El filtro por IP del panel depende de que Docker conserve la IP de origen             | Documentado en los [riesgos que quedan](seguridad-produccion.md#4-riesgos-que-quedan)                                            |
| Media     | `imagenes.yml`                     | Publica desde la etiqueta sin volver a correr las pruebas ni analizar la imagen       | Documentado; siguiente paso                                                                                                      |
| Baja      | Imagen base Debian 12              | Trivy: 38 avisos del sistema base, ninguno con corrección publicada; ninguno en npm   | Aceptado y mitigado ([trivy](evidencia/2026-11-17/cadena-de-suministro/trivy-nodo.txt))                                          |
| Baja      | Imagen                             | Binarios setuid del sistema                                                           | Corregida en 1.2.1                                                                                                               |
| Baja      | Compose de producción              | Registros de Docker sin límite                                                        | Corregida en 1.2.1 (10 MB × 3)                                                                                                   |
| Baja      | `.github/dependabot.yml`           | La imagen de Caddy de los compose no se actualizaba                                   | Corregida en 1.2.1                                                                                                               |

## 4. Cómo reproducirlo

Con la demostración levantada (`npm run demo:todo`), cada archivo de
[`evidencia/2026-11-17/pentest/`](evidencia/2026-11-17/pentest/) trae los comandos y las respuestas.
Por ejemplo:

```sh
curl -sI http://127.0.0.1:8790/                                   # cabeceras de la web
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8781/api/v1/authority/complaints   # 401
curl -s -H 'Origin: https://ajeno.example' -I http://127.0.0.1:8781/api/v1/keys               # sin ACAO
cosign verify ghcr.io/guilleop/sigilo-nodo:1.2.0 \
  --certificate-identity https://github.com/GuilleOp/sigilo-s5/.github/workflows/imagenes.yml@refs/tags/v1.2.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Las pruebas automáticas que protegen estos controles: `apps/server/src/security-regressions.test.ts`,
`apps/server/src/routes/lifecycle.test.ts`, `apps/enrutador/src/web.test.ts`,
`e2e/no-third-party.spec.ts`, `e2e/key-pinning.spec.ts`, `e2e/transplant.spec.ts` y
`e2e/mfa.spec.ts`.

## 5. Lo que no se ha hecho

- Una evaluación de seguridad independiente (pentest de terceros) y una auditoría de la criptografía.
- Pruebas con escáneres dinámicos comerciales y análisis estático de terceros.
- Pruebas con lectores de pantalla reales.
- Trusted Types y un segundo factor resistente al phishing (WebAuthn) en el panel.
- La verificación automática de la firma de la imagen en `./sigilo instalar` y `actualizar`.

Los riesgos residuales y los que quedan abiertos están en
[seguridad en producción](seguridad-produccion.md#4-riesgos-que-quedan), en las brechas del
[perfil de seguridad](../estandar/perfil-seguridad.md) y en el
[modelo de amenazas](modelo-de-amenazas.md).
