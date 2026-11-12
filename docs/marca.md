# Marca de SIGILO

El símbolo es un **candado cuyo cuerpo es un sello de lacre** (orilla ondulada). Dentro, un anillo
con la **red**: un nodo central, seis radios y los nodos de la orilla unidos entre sí. Sobre el
anillo, a la derecha, va el **nodo cempasúchil: «tu denuncia»**, que entra a la red sin dejar de ser
tuya. El nombre «SIGILO» va en Mulish Black.

La forma está dibujada a mano con círculos, líneas y curvas en una cuadrícula de 64 (16–32 px: 32).
Su única fuente es `apps/web/src/components/brand/geometria.ts`; de ahí salen el componente
`SigiloMark` del encabezado y todos los archivos de `apps/web/public/marca/`.

## Archivos

Todos en `apps/web/public/marca/` (la web los sirve desde su origen en `/marca/…`).

| Archivo                            | Uso                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `sigilo-simbolo.svg`               | Símbolo a color, sobre fondo claro.                                                  |
| `sigilo-simbolo-claro.svg`         | Símbolo sobre fondo oscuro: lacre blanco, disco verde, red menta.                    |
| `sigilo-simbolo-mono.svg`          | Una tinta (`currentColor`); el disco queda hueco y deja ver el fondo.                |
| `sigilo-sello.svg`                 | Solo el sello, sin candado (avatares, sellos de documentos).                         |
| `favicon.svg`                      | Versión simplificada para 16–32 px: sello, rombo de tres nodos y tú.                 |
| `favicon-16.png`, `favicon-32.png` | Respaldo PNG del favicon.                                                            |
| `apple-touch-icon.png` (180)       | Ícono de iOS: candado claro sobre verde profundo.                                    |
| `icon-192.png`, `icon-512.png`     | Íconos de aplicación (mismo diseño, margen seguro del 14 %).                         |
| `sigilo-horizontal.svg`            | Logotipo horizontal (símbolo y nombre) sobre fondo claro.                            |
| `sigilo-horizontal-oscuro.svg`     | Logotipo horizontal sobre fondo oscuro.                                              |
| `sigilo-horizontal@2x.png`         | PNG transparente del logotipo claro (≈1 000 px de ancho).                            |
| `sigilo-horizontal-oscuro@2x.png`  | PNG transparente del logotipo oscuro.                                                |
| `og-image.png` (1200×630)          | Imagen para compartir: logotipo y «Denuncia sin miedo. Tu nombre se queda contigo.». |

El nombre de los logotipos está **en trazos** (contornos de Mulish Black, OFL): se ve igual sin la
fuente instalada, en presentaciones y en editores de video. `estandar/swagger/` lleva una copia de
`sigilo-simbolo-claro.svg` para el encabezado de Swagger UI.

## Regenerar

```sh
npm run marca:render   # node scripts/marca/render.ts
```

Usa el Chromium de Playwright (ya instalado) y pdf.js: imprime «SIGILO» en Mulish Black a PDF y lee
los contornos de las letras, arma los SVG desde `geometria.ts` y toma las capturas PNG. No agrega
dependencias. Si cambias la forma, cambia `geometria.ts` y vuelve a ejecutar el script: la web y los
archivos quedan iguales.

## Colores

| Token               | Hex       | Papel                                                     |
| ------------------- | --------- | --------------------------------------------------------- |
| Verde profundo      | `#04463F` | Lacre y candado; nombre sobre claro; fondo de los íconos. |
| Petróleo (primario) | `#03615A` | Acentos de la web.                                        |
| Turquesa            | `#0E7565` | Anillo y red sobre el disco blanco.                       |
| Menta               | `#34CBB4` | Anillo y red sobre fondo oscuro.                          |
| Cempasúchil         | `#F2B441` | Solo el nodo «tu denuncia».                               |
| Blanco              | `#FFFFFF` | Disco sobre claro; lacre y nombre sobre oscuro.           |

En la web, el símbolo toma sus colores de los tokens `--color-brand-*` de
`apps/web/src/styles/tokens.css`: claro (como arriba), oscuro (lacre blanco, disco `#04463F`, red
menta) y alto contraste (lacre y red blancos, disco negro). El cempasúchil no cambia en ningún tema;
con colores forzados de Windows el símbolo usa las tintas del sistema.

Contraste (WCAG 2.x):

- Verde profundo sobre blanco 10.75:1; sobre el fondo de la web (`#EEF5F3`) 9.72:1.
- Turquesa sobre blanco 5.6:1; menta sobre verde profundo 5.3:1 (ambos pasan el 3:1 de objetos
  gráficos y el 4.5:1 de texto).
- Cempasúchil sobre verde profundo 5.83:1 y sobre negro 11.38:1, pero **1.85:1 sobre blanco**: por eso
  siempre se apoya en el anillo y el radio de la red, nunca va suelto sobre un fondo claro.

## Espacio libre y tamaño mínimo

- **Espacio libre:** alrededor del símbolo o del logotipo, al menos la altura del arco del candado
  (≈ ¼ de la altura del símbolo). Nada de texto, bordes ni otros logotipos en esa zona.
- **Tamaño mínimo:** candado completo, 24 px (o 6 mm impreso). Por debajo, usa `favicon.svg`
  (hasta 16 px). Logotipo horizontal, 96 px de ancho.
- En la web el símbolo es decorativo (`aria-hidden`) junto al texto «SIGILO», que da el nombre
  accesible al enlace del encabezado.

## Sí

- Usa el archivo que corresponde al fondo: color sobre claro, `-claro`/`-oscuro` sobre oscuro,
  `-mono` cuando solo hay una tinta.
- Escala siempre en proporción y desde los SVG.
- Deja respirar el símbolo: espacio libre completo.

## No

- **Nunca junto al escudo nacional** ni a logotipos de dependencias como si SIGILO fuera un sistema
  oficial: es un prototipo para el Datatón 2026.
- **Nunca cambies el color del nodo cempasúchil** ni lo quites: es «tu denuncia». En una tinta va del
  mismo color que el resto, nunca de otro.
- No redibujes la red, no agregues ni quites nodos, no rotes el símbolo ni le pongas sombras,
  degradados o contornos.
- No cambies la tipografía del nombre ni lo escribas en minúsculas.
- No pongas el símbolo a color sobre fondos medios o con imágenes que bajen el contraste.
