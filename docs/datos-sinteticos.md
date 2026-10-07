# Datos sintéticos

## Política

El repositorio no contiene datos personales reales ni información reservada o confidencial, como
exigen las bases del Datatón. Esto aplica a código, pruebas, semillas, capturas, videos, issues y
documentación.

## Convenciones

| Tipo                   | Convención                                                                | Ejemplo                                        |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Entes públicos         | Nombres ficticios con el municipio "Villa Ejemplo"                        | Secretaría de Obras de Villa Ejemplo           |
| Personas               | Nombres evidentemente ficticios                                           | Persona Denunciante Uno, Servidor Ficticio Dos |
| CURP y RFC             | Solo en pruebas del revisor, con formato válido y prefijo `XEXX` o `XAXX` | `XEXX010101HNEXXXA4`                           |
| Correos                | Dominio reservado `example.org`                                           | `nadie@example.org`                            |
| Teléfonos              | Serie `55 0000 0000`                                                      | `55 0000 0001`                                 |
| Imágenes de prueba     | Generadas por código con metadatos sintéticos                             | GPS 0.0, 0.0; cámara "Ficticia"                |
| Entidades y municipios | Claves INEGI reales (son públicas), asociadas solo a entes ficticios      | `22` Querétaro                                 |
| Conductas              | Catálogo de la LGRA y del Código Penal Federal (público)                  | Cohecho                                        |

## Generación

- Las semillas de la demostración se generan con un script del repositorio a partir de plantillas
  fijas; no hay datos aleatorios que imiten personas reales.
- Las imágenes con metadatos de prueba se crean dentro de las pruebas, no se descargan.
- Los catálogos públicos (entidades, municipios, conductas) se incluyen como archivos estáticos.

## Instancia de demostración

Si se publica una instancia en línea, debe mostrar el aviso "Demostración: no envíes denuncias
reales" y borrar sus datos cada 24 horas.
