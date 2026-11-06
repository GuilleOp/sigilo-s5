# @sigilo/corroboracion-servicio

Los dos servicios de la corroboración ciega
([ADR 0006](../../docs/adr/0006-corroboracion-ciega.md)), con Hono y `node:sqlite` como el resto
de SIGILO. **Deben operarlos partes distintas**: si una misma parte tiene la llave del evaluador y
las etiquetas del índice, puede calcular en silencio la etiqueta de cada nombre de las listas
públicas.

| Servicio                | Puerto | Lo llama  | Rutas                                                                                               |
| ----------------------- | ------ | --------- | --------------------------------------------------------------------------------------------------- |
| Evaluador OPRF          | 8791   | Navegador | `GET evaluador/llave`, `GET evaluador/reto`, `POST evaluador/evaluaciones`, `GET evaluador/conteos` |
| Índice de coincidencias | 8792   | Nodos     | `POST indice/registros`, `POST indice/avisos`                                                       |

Todas bajo `/api/v1/corroboracion/`. Esquemas en `packages/contracts/src/corroboration.ts` y en el
grupo «Corroboración» de `estandar/openapi.yaml`.

## Qué ve y qué guarda cada uno

- **Evaluador.** Ve elementos cegados (puntos uniformes de ristretto255) y la dirección de red de
  quien pregunta. Guarda solo el conteo de evaluaciones por día y época, y el nonce aleatorio de
  cada reto gastado hasta que vence (redondeado a 10 minutos). No hay tabla para elementos,
  etiquetas, identificadores ni denuncias, y no registra peticiones. Exige prueba de trabajo de un
  solo uso y puede tener un tope diario. Publica conteos firmados solo de días cerrados.
- **Índice.** Ve y guarda `(época, etiqueta, nodo, folio opaco, hora a 10 minutos, entrada,
resumen difuso)`. Acepta solo registros firmados por un nodo del directorio verificado. Cuenta
  fuentes independientes por etiqueta (ADR 0010), marca «posible mismo origen» y «posible
  campaña», y deja avisos por nodo sin decir qué otros nodos o folios forman el grupo.

`src/scenario.test.ts` inspecciona los bytes de ambas bases (y su WAL) sobre el escenario de Marta,
Luis y el atacante.

## Correr en local

```bash
# 1. Llave del evaluador (no sobrescribe una existente); imprime la llave pública para el directorio
npm run evaluador:llave -w @sigilo/corroboracion-servicio
# 2. Evaluador (lee apps/corroboracion/data/evaluador/evaluator-key.json)
npm run dev:evaluador
# 3. Índice: copia directory.json y trust.json (por ejemplo, de .red-demo/) a
#    apps/corroboracion/data/indice/ y arranca
npm run dev:indice
```

| Variable                                              | Por omisión                                  | Uso                                            |
| ----------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `SIGILO_EVALUATOR_HOST` / `SIGILO_INDEX_HOST`         | `127.0.0.1`                                  | `127.0.0.1`, `::1` o `0.0.0.0` (contenedor)    |
| `SIGILO_EVALUATOR_PORT` / `SIGILO_INDEX_PORT`         | `8791` / `8792`                              |                                                |
| `SIGILO_EVALUATOR_DATA_DIR` / `SIGILO_INDEX_DATA_DIR` | `apps/corroboracion/data/{evaluador,indice}` | Llave, directorio y base                       |
| `SIGILO_EVALUATOR_POW_BITS`                           | `18`                                         | Dificultad de la prueba de trabajo             |
| `SIGILO_EVALUATOR_MAX_DAILY`                          | sin tope                                     | Evaluaciones por día; al llegar responde `429` |
| `SIGILO_*_HSTS_MAX_AGE`                               | sin HSTS                                     | Solo detrás de HTTPS                           |

## Integración

El nodo de referencia y `compose.yaml` ya usan estos servicios; la web todavía no. La lista de lo que
falta y dónde está en [docs/criptografia.md](../../docs/criptografia.md#integración).
