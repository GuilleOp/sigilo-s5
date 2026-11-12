# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# Imágenes de la red de SIGILO, en varias etapas sobre la imagen oficial de Node 22:
#   enrutador  enrutador ciego y bitácora nacional (apps/enrutador), con la ventanilla única: la web
#              en perfil «ventanilla» en el mismo origen (la sirve la SESNA)
#   testigo    proceso de un testigo que cofirma la bitácora nacional
#   nodo       servidor de referencia (apps/server, tal cual) con la web en perfil «panel» (solo
#              el panel de autoridades) en el mismo origen
#   evaluador  evaluador OPRF de la corroboración ciega (apps/corroboracion)
#   indice     índice de coincidencias de la corroboración ciega (apps/corroboracion)
# Sin secretos: las llaves privadas y el token llegan en tiempo de ejecución por volumen y env_file.
# Imagen genérica (la que se publica en GHCR, ADR 0011): sin llaves de ningún nodo; la web lee las
# llaves públicas del nodo y la raíz de la red de `/config/sigilo.json` al arrancar. La demostración
# (compose.yaml) todavía fija las suyas en el bundle con el contexto adicional `node-keys`, que
# sustituye la etapa `node-keys` de abajo. El perfil de la web llega con SIGILO_WEB_PROFILE.
# Las imágenes `nodo` y `enrutador` traen también el CLI `sigilo` (tools/sigilo) y las plantillas
# de instalación (instalacion/).

# Imagen base fijada por digest (H10): la etiqueta sola puede cambiar de contenido sin aviso. Para
# actualizarla (Dependabot la propone), comprobar el índice multiarquitectura con:
#   docker buildx imagetools inspect node:22-bookworm-slim
# y copiar el «Digest:» del índice (no el de una sola arquitectura). El frontend de la primera
# línea se fija igual (docker buildx imagetools inspect docker/dockerfile:1). Ambos, el 2026-11-12.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

# Llaves fijadas por omisión: ninguna (`null`). Compose las sustituye en la demostración con
# `additional_contexts: node-keys: …`; la imagen genérica las lee en tiempo de ejecución.
FROM scratch AS node-keys
COPY docker/sin-llaves/ /

# Manifiestos de todos los workspaces, para que npm ci resuelva el lockfile completo.
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    DO_NOT_TRACK=1 \
    SCARF_ANALYTICS=false
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/huella/package.json packages/huella/
COPY packages/red/package.json packages/red/
COPY packages/anonimato/package.json packages/anonimato/
COPY packages/contexto-pdn/package.json packages/contexto-pdn/
COPY packages/auditor/package.json packages/auditor/
COPY packages/corroboracion/package.json packages/corroboracion/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/enrutador/package.json apps/enrutador/
COPY apps/corroboracion/package.json apps/corroboracion/
COPY tools/validador/package.json tools/validador/
COPY tools/sigilo/package.json tools/sigilo/

# Dependencias completas (para construir la web). Sin scripts de instalación.
FROM manifests AS deps
RUN npm ci --ignore-scripts

# Solo dependencias de producción para las imágenes finales.
FROM manifests AS prod-deps
RUN npm ci --omit=dev --ignore-scripts

# Web construida con las llaves públicas fijadas del nodo y su perfil: `panel` en los nodos,
# `ventanilla` en el enrutador, `completo` (un solo nodo) por omisión.
FROM deps AS web-build
ARG SIGILO_WEB_PROFILE=completo
ARG SIGILO_VENTANILLA_URL=
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web
# Datos agregados que la web publica en su mismo origen bajo /datos/ (apps/web/static-data.ts):
# la matriz de cobertura y los datos abiertos (las equivalencias del S5 y el catálogo de entes de la
# PDN, que se parte en /datos/entes/<clave>.json, vienen en packages/contracts).
# Nada de datos/proceso ni de datos/grupos-anonimato.
COPY datos/cobertura datos/cobertura
COPY datos/abiertos datos/abiertos
COPY --from=node-keys pinned-keys.json apps/web/src/config/pinned-keys.json
# Raíz de confianza de la red: con ella la web verifica el directorio y envía por el enrutador.
COPY --from=node-keys network-trust.json apps/web/src/config/network-trust.json
RUN VITE_SIGILO_PERFIL="$SIGILO_WEB_PROFILE" VITE_SIGILO_VENTANILLA_URL="$SIGILO_VENTANILLA_URL" \
    npm run build -w @sigilo/web

# Base de ejecución común: paquetes compartidos y dependencias de producción. Sin npm, npx,
# corepack ni yarn (H10): en ejecución solo corre `node`, así que se quitan las herramientas que
# un atacante dentro del contenedor podría usar para bajar o instalar código.
FROM ${NODE_IMAGE} AS runtime
# Versión publicada (la fija el flujo de imágenes con la etiqueta v*); la reporta el CLI.
ARG SIGILO_VERSION=0.0.0-local
LABEL org.opencontainers.image.source="https://github.com/GuilleOp/sigilo-s5" \
      org.opencontainers.image.licenses="CC-BY-NC-4.0" \
      org.opencontainers.image.version="${SIGILO_VERSION}" \
      org.opencontainers.image.vendor="SIGILO" \
      org.opencontainers.image.description="SIGILO: capa de anonimato verificable para el S5 de la PDN (imagen genérica, sin llaves)."
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    DO_NOT_TRACK=1 \
    SIGILO_VERSION=${SIGILO_VERSION}
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
# Paquetes compartidos: el nodo usa también el contexto PDN, el auditor y la corroboración.
COPY packages packages

FROM runtime AS enrutador
COPY apps/enrutador apps/enrutador
# CLI sigilo-sesna y plantillas de instalación (los comandos de la SESNA no usan apps/server).
COPY tools/sigilo tools/sigilo
COPY instalacion instalacion
COPY --from=web-build /app/apps/web/dist /app/ventanilla
ENV SIGILO_ROUTER_WEB_DIST=/app/ventanilla \
    SIGILO_ROUTER_DATA_DIR=/data \
    SIGILO_ROUTER_HOST=0.0.0.0 \
    SIGILO_ROUTER_PORT=8790
USER node
EXPOSE 8790
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8790/api/v1/red/directory').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/enrutador/src/main.ts"]

FROM runtime AS testigo
COPY apps/enrutador apps/enrutador
ENV SIGILO_WITNESS_DATA_DIR=/data
USER node
CMD ["node", "apps/enrutador/src/witness/main.ts"]

FROM runtime AS evaluador
COPY apps/corroboracion apps/corroboracion
ENV SIGILO_EVALUATOR_DATA_DIR=/data \
    SIGILO_EVALUATOR_HOST=0.0.0.0 \
    SIGILO_EVALUATOR_PORT=8791
USER node
EXPOSE 8791
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8791/api/v1/corroboracion/evaluador/llave').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/corroboracion/src/evaluator-main.ts"]

FROM runtime AS indice
COPY apps/corroboracion apps/corroboracion
ENV SIGILO_INDEX_DATA_DIR=/data \
    SIGILO_INDEX_HOST=0.0.0.0 \
    SIGILO_INDEX_PORT=8792
USER node
EXPOSE 8792
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8792/').then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/corroboracion/src/index-main.ts"]

FROM runtime AS nodo
COPY apps/server apps/server
# CLI sigilo (instalar, iniciar, diagnóstico, respaldos, testigos) y plantillas de instalación.
COPY tools/sigilo tools/sigilo
COPY instalacion instalacion
COPY apps/enrutador/src/container apps/enrutador/src/container
COPY --from=web-build /app/apps/web/dist /app/web
# El servidor escucha solo en 127.0.0.1:8787; el lanzador publica ese puerto en 0.0.0.0:8080.
ENV SIGILO_DATA_DIR=/data \
    SIGILO_WEB_DIST=/app/web \
    SIGILO_PORT=8787 \
    SIGILO_PUBLIC_PORT=8080 \
    SIGILO_LAUNCHER_CLEAR_LOCK=1
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/v1/keys').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/enrutador/src/container/node-launcher.ts", "apps/server/src/main.ts"]
