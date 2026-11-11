# syntax=docker/dockerfile:1
# Imágenes de la red de SIGILO, en varias etapas sobre la imagen oficial de Node 22:
#   enrutador  enrutador ciego y bitácora nacional (apps/enrutador)
#   testigo    proceso de un testigo que cofirma la bitácora nacional
#   nodo       servidor de referencia (apps/server, tal cual) con la web en el mismo origen
#   evaluador  evaluador OPRF de la corroboración ciega (apps/corroboracion)
#   indice     índice de coincidencias de la corroboración ciega (apps/corroboracion)
# Sin secretos: las llaves privadas y el token llegan en tiempo de ejecución por volumen y env_file.
# La web fija las llaves públicas de su nodo, que entran por el contexto adicional `node-keys`.

ARG NODE_IMAGE=node:22-bookworm-slim

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

# Dependencias completas (para construir la web). Sin scripts de instalación.
FROM manifests AS deps
RUN npm ci --ignore-scripts

# Solo dependencias de producción para las imágenes finales.
FROM manifests AS prod-deps
RUN npm ci --omit=dev --ignore-scripts

# Web construida con las llaves públicas fijadas del nodo.
FROM deps AS web-build
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
RUN npm run build -w @sigilo/web

# Base de ejecución común: paquetes compartidos y dependencias de producción.
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    DO_NOT_TRACK=1
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
# Paquetes compartidos: el nodo usa también el contexto PDN, el auditor y la corroboración.
COPY packages packages

FROM runtime AS enrutador
COPY apps/enrutador apps/enrutador
ENV SIGILO_ROUTER_DATA_DIR=/data \
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
