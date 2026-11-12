# Datos sintéticos

## Política

El repositorio no contiene datos personales reales ni información reservada o confidencial, como
exigen las bases del Datatón. Esto aplica a código, pruebas, semillas, capturas, videos, issues y
documentación.

## Convenciones

| Tipo                   | Convención                                                                                                                                   | Ejemplo                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Entes públicos         | En casos, semillas y pruebas, nombres ficticios rotulados «(ficticia)»; el catálogo para elegir trae además los 7,213 entes reales de la PDN | Secretaría de Obras de Villa Ejemplo           |
| Personas               | Nombres evidentemente ficticios                                                                                                              | Persona Denunciante Uno, Servidor Ficticio Dos |
| CURP y RFC             | Solo en pruebas del revisor, con formato válido y prefijo `XEXX` o `XAXX`                                                                    | `XEXX010101HNEXXXA4`                           |
| Correos                | Dominio reservado `example.org`                                                                                                              | `nadie@example.org`                            |
| Teléfonos              | Serie `55 0000 0000`                                                                                                                         | `55 0000 0001`                                 |
| Imágenes de prueba     | Generadas por código con metadatos sintéticos                                                                                                | GPS 20.5, -100.25; marca «Marca Ficticia»      |
| Entidades y municipios | Claves INEGI reales (son públicas); los casos sembrados usan entes ficticios                                                                 | `22` Querétaro                                 |
| Conductas              | Catálogo de la LGRA y del Código Penal Federal (público)                                                                                     | Pedir o aceptar dinero o regalos (cohecho)     |

## Generación

- Las pruebas E2E siembran denuncias con la misma criptografía de la web (`e2e/support/api.ts`) y
  generan sus archivos al vuelo (`e2e/support/synthetic-files.ts`): un JPEG con EXIF sintético, un
  PDF de una página escrito a mano, un `.docx` falso y un texto con caracteres invisibles.
- El JPEG con metadatos sintéticos se construye byte a byte en
  `packages/huella/test-fixtures/synthetic-exif-jpeg.ts`; no se descarga ninguna foto.
- Para la demostración en vivo, `docs/demo.md` indica cómo agregar metadatos ficticios con `exiftool`
  a una imagen sin personas ni lugares identificables.
- Los catálogos públicos (entidades, municipios del INEGI, entes sintéticos y conductas) viven como
  archivos estáticos en `packages/contracts/src/catalogs/`; los entes reales de la PDN, en
  `packages/contracts/src/entes/`. Quien denuncia también puede elegir municipios
  del INEGI y entes reales del directorio de la PDN (`packages/contracts/src/entes/README.md`), pero
  la siembra, la red de demostración y las pruebas solo usan entes ficticios (`VE-…`, que la
  interfaz marca «(ficticia)»): ningún caso de ejemplo acusa a una institución real.

## Instancia de demostración

La web muestra el aviso «Demostración: no envíes denuncias reales» (se apaga con
`VITE_DEMO_NOTICE=false`). Si se publica una instancia en línea, debe conservar ese aviso y borrar
sus datos con regularidad (`npm run demo:reset`); el borrado automático no está implementado.

## Escenario de la demostración

El escenario completo de la demostración final (red, autoridades, personas, casos, datos PDN
sintéticos, línea de tiempo y observatorio) se especifica en [demo-escenario.md](demo-escenario.md).
Es la fuente única para las semillas, las pruebas E2E del recorrido y el guion. Sigue estas
convenciones y agrega dos precisiones: las fechas se expresan en días relativos al día 0 del reloj
de demostración, y los RFC sintéticos con prefijo `XAXX` también se usan como clave en los
archivos de semillas de las fuentes ficticias (nunca en narraciones).
