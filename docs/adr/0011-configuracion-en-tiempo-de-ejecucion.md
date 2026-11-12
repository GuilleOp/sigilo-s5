# 0011. Configuración de la web en tiempo de ejecución e instalación con imágenes genéricas

- Estado: aceptada
- Fecha: 2026-11-12
- Complementa: 0002 (criptografía), 0005 (estándar S5 federado)

## Contexto

Hasta la versión 1.1.0 la web fijaba **al construir** las llaves públicas de su nodo
(`apps/web/src/config/pinned-keys.json`), la raíz de confianza de la red (`network-trust.json`) y el
origen de la ventanilla (`VITE_SIGILO_VENTANILLA_URL`). `docker/Dockerfile` copiaba esos archivos con
el contexto adicional `node-keys`, así que cada estado necesitaba **su propia imagen**, construida en
su equipo con el código fuente, Node y acceso a npm. No se podía publicar una sola imagen firmada para
los 32 estados, y la instalación de un nodo real exigía más de una docena de pasos manuales
(`docs/instalacion-nodo.md` los reemplaza).

## Decisión

1. **La web lee su configuración al arrancar.** Antes de montar React, `apps/web/src/main.tsx`
   descarga `/config/sigilo.json` de su **mismo origen**
   (`apps/web/src/config/runtime-config.ts`). El archivo trae `pinnedKeys` (el `PublicKeySet` de
   `keys.json` del nodo), `networkTrust` (la raíz de la red, con `minDirectorySerial`) y
   `ventanillaUrl` (`WebRuntimeConfigSchema`, `packages/contracts/src/web-config.ts`).
   - Con **404**, la web usa lo que trae su bundle. Así la demostración (`compose.yaml`, que sigue
     construyendo una imagen por nodo con `node-keys`), las pruebas E2E y el perfil `completo` no
     cambian.
   - Con un archivo **inválido**, la web no se monta y muestra un aviso. No cae al bundle: un
     archivo alterado no debe pasar inadvertido.
   - Una imagen **genérica** sin archivo (bundle con `null`) tampoco se monta: nunca cifra hacia
     una llave inventada.
2. **El nodo y la ventanilla lo sirven.** `apps/server` lee `SIGILO_WEB_CONFIG_FILE` (por omisión
   `<datos>/web-config.json`) y el enrutador `SIGILO_ROUTER_WEB_CONFIG_FILE`. Los dos lo validan al
   arrancar y no arrancan con uno inválido. La ruta va con `Cache-Control: no-store` y la CSP de la
   API (`default-src 'none'`), y en el nodo pertenece al frente «panel» (`http/exposure.ts`): el
   puerto de la red de la SESNA no la sirve.
3. **Imágenes genéricas publicadas.** La etapa `node-keys` del Dockerfile trae `null` por omisión
   (`docker/sin-llaves/`). `.github/workflows/imagenes.yml` publica `ghcr.io/guilleop/sigilo-nodo`,
   `-enrutador`, `-testigo`, `-evaluador` e `-indice` para amd64 y arm64, con SBOM, procedencia y
   firma sin llave de cosign. Los compose de producción (`instalacion/`) las fijan por etiqueta o por
   digesto.
4. **`sigilo iniciar` escribe el archivo** desde lo que ya verificó: las llaves de `datos/keys.json` y
   la raíz de `red.json`, con el serial del directorio que acaba de verificar.

## Por qué la confianza no cambia

- **La misma fuente sirve el código y la configuración.** El bundle y `/config/sigilo.json` salen del
  mismo servidor y del mismo origen. Quien puede cambiar uno puede cambiar el otro: con las llaves en
  el bundle, un operador malicioso del nodo también podía servir un bundle con otras llaves. La
  defensa contra un servidor que miente nunca fue el bundle, sino lo que la web comprueba **después**:
  - el directorio firmado por la operación y cofirmado por m de n testigos, contra la raíz fijada;
  - las llaves que el servidor publica en `/api/v1/keys` contra las fijadas (`assertServedKeysMatch`);
  - la bitácora pública firmada, que cualquier testigo descarga y compara.
- **Mismo origen, sin terceros.** La CSP de la web sigue en `connect-src 'self'`; no se agrega ningún
  origen. El archivo no lleva secretos.
- **Sin caché.** `no-store` en el servidor y `cache: 'no-store'` en la web: una copia vieja no
  sobrevive a una rotación.

## Lo que se pierde y cómo se compensa

- **«El digesto de la imagen atestigua la raíz.»** Con la raíz en el bundle, el digesto de la imagen
  de un nodo identificaba también su raíz. Ahora la imagen es la misma para todos y la raíz es un
  archivo de datos. Se compensa así: la raíz es pública en `/config/sigilo.json` y en `red.json`;
  `sigilo diagnostico` compara la que sirve la web con la de `red.json` (huella de 128 bits); y la
  huella de la red se publica en el oficio de la SESNA y en su sitio.
- **Una petición más al cargar.** Es pequeña, del mismo origen y sin caché.

## Alternativas descartadas

- **Construir una imagen por estado en su equipo** (lo de antes). Exige el código, Node y npm en el
  servidor de producción y deja 32 imágenes sin firma común.
- **Inyectar la configuración en `index.html` al arrancar** (reemplazo de texto). Mezcla datos con
  el documento, complica la CSP y el hash de los recursos, y no mejora la confianza.
- **Leer la configuración de otro origen (la SESNA).** Agrega un tercero a la carga de la web de
  cada nodo y otro punto de falla.

## Consecuencias

- `compose.yaml` y `npm run demo:todo` siguen igual; la imagen genérica la usan `instalacion/` y
  GHCR.
- Los secretos compartidos con la SESNA (HMAC del buzón y OAuth) ya no viajan: se derivan con X25519
  y HKDF (`docs/criptografia.md`, «Secretos de enlace derivados»).
- Datos que ya se configuran sin cambiar código: las autoridades y la tabla de funciones (en el
  directorio firmado; `sigilo tabla revisar|firmar` desde un CSV) y los días inhábiles locales de
  cada nodo (`dias-inhabiles.json`, que el nodo publica en `/datos/dias-inhabiles.json`).
- Trabajo futuro:
  - **Paquete de catálogos firmado** (`SIGILO_CATALOG_DIR`): entes de la PDN, municipios,
    equivalencias del S5 y días inhábiles federales en un paquete firmado por la operación
    (`sigilo/red/catalogos/v1:`), que la ventanilla sirve y cada nodo carga al arrancar en lugar de
    los catálogos de la imagen, con su versión en la salud del nodo para que el enrutador avise de
    un catálogo distinto. Las conductas y las leyes se quedan en el código: son parte del Estándar.
  - Recarga del directorio sin reiniciar el nodo.
  - `versiones.json` firmado por la operación para aprobar qué digestos se instalan.
  - Rotación de la llave de firma del nodo con herramienta (toca el directorio y la bitácora).
  - Enhebrar el calendario local también en la web (hoy el semáforo del panel lo calcula el
    servidor con el calendario local, pero los días restantes que pinta la web usan el oficial) y en
    la estadística para la PDN.
