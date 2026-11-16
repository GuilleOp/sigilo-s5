# Contexto PDN de la dependencia

El panel de la autoridad muestra la ficha «Contexto PDN de la dependencia» cuando la denuncia trata
de un ente real del catálogo (`PDN-EE-N`). La ficha trae datos **públicos e institucionales** de la
Plataforma Digital Nacional. Nunca trae datos de personas, y el nodo no envía nada de la denuncia.

## Qué consulta el nodo

Endpoints verificados el 16 de noviembre de 2026; todos son públicos y no piden credenciales.

| Fuente                        | Endpoint                                                                        | Qué se usa                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Directorio de entes de la PDN | `GET https://cobertura.plataformadigitalnacional.org/directus/items/entes/{id}` | Nombre, ámbito, poder, entidad, municipio, si el directorio marca control de OIC o de tribunal, y a qué sistemas reporta (S1, S2, S3 y S6) |
| S6, resumen nacional          | `GET https://api.plataformadigitalnacional.org/s6/api/v1/summary`               | Número de procedimientos y monto total del S6                                                                                              |
| S6, principales compradores   | `GET https://api.plataformadigitalnacional.org/s6/api/v1/top/10/buyers`         | Si la institución está entre los 10 compradores con más monto, y su monto                                                                  |

El `id` del directorio es el número final del identificador del catálogo de SIGILO: `PDN-00-196`
corresponde a `entes/196`. Con el mismo directorio se puede revisar que la tabla de
[competencia por dependencia](competencia-por-dependencia.md) asigne un OIC a cada ente.

Otros endpoints revisados ese día:

- `GET /s2/api/v0/getTotalRows`: responde el total del S2 (180,794 registros). No se usa en la ficha.
- La búsqueda del S6 (`POST /s6/api/v1/search`): no filtra por institución con los parámetros
  probados. Por eso la ficha no muestra contratos de una institución que no esté entre los 10 primeros.

## Lo que nunca hace

- **No consulta ni guarda personas.** Del directorio solo se copian los campos institucionales que
  nombra `readDirectoryRecord`; cualquier otro campo de la respuesta se descarta. Una prueba lo
  verifica.
- **No envía nada de la denuncia.** La consulta sale del nodo, nunca del navegador, y solo lleva el
  número público del ente: ni folio, ni hechos, ni la autoridad.
- **No acusa a nadie.** La ficha describe a la institución; los casos sembrados de la demostración
  siguen con entes ficticios ([datos sintéticos](datos-sinteticos.md)).

## Caché y sin conexión

- Cada ficha se guarda en memoria del nodo 24 horas.
- Si la PDN no responde, el panel muestra la última copia con la leyenda «copia guardada». Si no hay
  copia, dice «Sin conexión con la PDN».
- Cada consulta tiene un tiempo límite de 8 segundos y no sigue redirecciones.

## Configuración

| Variable              | Efecto                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| `SIGILO_PDN_PUBLIC=1` | El nodo consulta la PDN pública. Sin ella, la ficha dice que el nodo no consulta la PDN |

La demostración (`npm run red:demo`) la activa en los nodos, que tienen salida a internet por la red
`publica` de compose. Las pruebas no la activan: usan un `fetch` falso.

## API

`GET /api/v1/authority/pdn/institutions/{entityId}`, con sesión de autoridad. Responde
`PdnInstitutionContext`, descrito en el [estándar](../estandar/README.md).
