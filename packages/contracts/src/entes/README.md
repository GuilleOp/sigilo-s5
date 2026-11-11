# Catálogos reales: municipios del INEGI y entes públicos de la PDN

Quien denuncia elige municipios e instituciones reales, como en el S5 oficial. Las personas, las
autoridades del directorio de la red y los casos sembrados de la demostración siguen siendo
ficticios (`docs/datos-sinteticos.md`): ningún caso de ejemplo acusa a una institución real.

## Municipios

| Dato      | Valor                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Fuente    | INEGI, Catálogo Único de Claves de Áreas Geoestadísticas Estatales, Municipales y Localidades (servicio web `wscatgeo/v2/mgem`) |
| Licencia  | Términos de Libre Uso de la Información del INEGI. Crédito: «Fuente: INEGI».                                                    |
| Consulta  | 2026-11-11, una petición por entidad (`https://gaia.inegi.org.mx/wscatgeo/v2/mgem/<clave>`)                                     |
| Resultado | 2,478 municipios y alcaldías de las 32 entidades, con su clave de 3 dígitos                                                     |
| Archivo   | `packages/contracts/src/catalogs/municipalities-data.ts` (generado; `MUNICIPALITY_SOURCE` trae fuente, fecha y sha256)          |
| Script    | `node scripts/catalogos/municipios-inegi.ts [URL base \| carpeta con <clave>.json]`                                             |

Las claves son las del INEGI: Querétaro conserva sus 18 claves; la Ciudad de México empieza en
`002` (Azcapotzalco). **Van en el bundle de la web**: son unos 68 KB sin comprimir (unos 20 KB con
gzip), el asistente los necesita al instante al elegir el estado, y el detalle de la autoridad y la
vista previa muestran el nombre sin pedir nada al servidor. Un fragmento por entidad ahorraría poco
y agregaría una petición más que revela la entidad antes de tiempo.

## Entes públicos

| Dato      | Valor                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Fuente    | Directorio de entes de la cobertura de la Plataforma Digital Nacional, el mismo catálogo que usa el S5 oficial      |
| URL       | `https://cobertura.plataformadigitalnacional.org/directus/items/entes` (público, una sola petición con `?limit=-1`) |
| Descarga  | 2026-11-11: 10,144 registros (535 federales, 3,872 estatales, 5,737 municipales)                                    |
| Resultado | 7,213 entes tras unir duplicados (357 federales, 2,996 estatales, 3,860 municipales); 1 excluido por la lista local |
| Archivo   | `packages/contracts/src/entes/entes-pdn.json` (generado; `fuente` trae URL, fecha y sha256 de la descarga)          |
| Script    | `node scripts/catalogos/entes-pdn.ts [archivo.json \| URL] --fecha AAAA-MM-DD`                                      |

Crédito: «Fuente: Plataforma Digital Nacional, directorio de entes públicos (cobertura)».

### Método

1. **Campos que se usan:** `id`, `nombre`, `ambitoGobierno`, `entidad` y `municipio`. El orden de
   gobierno lo trae el directorio (Federal, Estatal, Municipal → `F`, `E`, `M`): no se infiere. Se
   descarta un registro si su orden no es uno de esos tres, si es federal fuera de la clave `00` (o
   no federal en ella), si la entidad no existe o si el nombre trae un correo o un número de 7 o más
   dígitos (no ocurrió ninguno). Además se excluye el ente cuyo nombre toque un término de la lista
   local que el gancho de commit no deja versionar (`.forbidden-terms.local`, no versionada; ver
   `scripts/check-forbidden-terms.mjs`): en la descarga del 2026-11-11, un fideicomiso estatal de Baja
   California. Sin esa lista, el script lo incluye y el archivo cambia.
2. **Municipio:** `municipio` llega como `22_014`; se valida contra el catálogo del INEGI. 5,701
   entes municipales lo traen; 36 municipales no lo traen y se ofrecen para toda la entidad.
3. **Duplicados:** el directorio repite entes (mismo nombre y entidad con otro `id`, por ejemplo
   un registro por órgano de control). Se unen por (entidad, municipio, nombre sin acentos ni
   signos) y se conservan **todos** los ids de la PDN (`idsPdn`), que sirven para integrarse con el
   S5. Se unieron 2,930 registros.
4. **Id estable:** `PDN-<entidad>-<id menor de la PDN>`, por ejemplo `PDN-22-7074`. Lleva la entidad
   para validar, sin el catálogo, que un ente estatal o municipal sea de la entidad de los hechos.
5. **Nombre para mostrar:** de cada grupo se toma el nombre mejor escrito (más acentos; en empate,
   el de id menor). Si viene todo en mayúsculas se pasa a tipo título en español: palabras vacías en
   minúscula; siglas conservadas (lista explícita, palabras sin vocales como «CV» o «SNC», números
   romanos, siglas entre paréntesis o después de un guion, letras con punto como «S.A.»); acentos
   desde un vocabulario corto, los nombres oficiales de entidades y municipios del INEGI y la regla
   de las agudas en -ción, -sión y -gión. El nombre original de la PDN se guarda en `nombrePdn`
   para buscar.

### Uso en SIGILO

- **Servidor:** importa `@sigilo/contracts/entes` (lo hace `apps/server/src/app.ts` y también
  `@sigilo/contracts/s5`), que registra el catálogo completo: la validación de los hechos es
  estricta y `findEntity` da nombre y orden de gobierno a cualquier ente real (equivalencias del S5,
  ficha de contexto PDN).
- **Web:** no carga el catálogo en el bundle. `apps/web/static-data.ts` lo parte en un fragmento
  por entidad (`/datos/entes/<clave>.json`, del mismo origen; el más grande pesa unos 100 KB) y el
  asistente descarga solo el de la entidad elegida y el federal (`00`). Sin el catálogo completo, la
  web acepta cualquier id real con formato y entidad válidos (para no rechazar respuestas del
  servidor) y el servidor hace la validación final.
- **Ruteo:** un ente real se rutea por orden de gobierno y entidad a las autoridades ficticias del
  directorio de la red; si ninguna es competente, al buzón general. Las competencias por ente
  específico (`entityIds`) siguen siendo de entes ficticios.
- **Entes ficticios:** `PUBLIC_ENTITIES` (`VE-…`) se conservan para la siembra, la red de
  demostración y las pruebas, y se muestran con «(ficticia)».

### Siguiente paso: grupos de anonimato

El aviso del grupo de anonimato busca el ente por nombre normalizado en el fragmento de
`datos/grupos-anonimato` (S1). Con entes de la PDN, el nombre a veces coincide con el de S1 y a
veces no; falta una tabla de equivalencias PDN → S1 (como `datos/normalizacion/equivalencias.csv`)
para usar siempre el grupo real. Mientras tanto, si el ente no aparece, el aviso dice que no
sabemos el tamaño del grupo y pide escribir como si fuera pequeño (nunca supone un grupo grande).
En la demostración se publica el catálogo sintético, que solo tiene entes ficticios.

### Actualizar

```sh
curl -s 'https://cobertura.plataformadigitalnacional.org/directus/items/entes?limit=-1' -o entes-pdn.json
node scripts/catalogos/entes-pdn.ts entes-pdn.json --fecha AAAA-MM-DD
node scripts/catalogos/municipios-inegi.ts
```

Un cambio de nombre en la PDN no cambia el id (sale del id menor de la PDN); un ente nuevo recibe
uno nuevo. Si la PDN borra el registro de id menor de un grupo, el id cambia, y el servidor valida
también los hechos de las denuncias guardadas al leerlas: antes de publicar una regeneración hay que
revisar que no desaparezca ningún id de los que ya se usaron.
