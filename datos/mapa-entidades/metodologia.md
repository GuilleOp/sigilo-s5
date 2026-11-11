# Metodología: mapa de las 32 entidades

Contorno de las entidades federativas que usa el mapa del observatorio
(`apps/web/src/pages/observatory/mapa-entidades.ts`). Solo entidades: el mapa nunca baja a nivel
municipal.

## Fuente y licencia

- **Fuente:** INEGI, Marco Geoestadístico, diciembre de 2025. Áreas geoestadísticas estatales
  (`https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/`, GeoJSON con `cve_ent`, `nomgeo`, `nom_abrev`
  y `pob_total`; la población es del Censo de Población y Vivienda 2020).
- **Licencia:** [Términos de Libre Uso de la Información del INEGI](https://www.inegi.org.mx/inegi/terminos.html).
  Se permite usar, transformar y redistribuir con el crédito «Fuente: INEGI, Marco Geoestadístico,
  diciembre de 2025», que la página muestra bajo el mapa, y declarando la transformación (abajo).
- El GeoJSON original (28.8 MB) **no** se versiona; solo el módulo derivado (unos 56 KB).

## Transformación

1. **Islas remotas fuera.** Se omiten los polígonos de las islas Revillagigedo (Colima) y Guadalupe
   (Baja California), que alargarían el lienzo sin ayudar a leer el mapa. Las Islas Marías, Cozumel
   y las islas del Golfo de California se conservan.
2. **Proyección.** Cónica conforme de Lambert del INEGI sobre el elipsoide GRS80: paralelos
   estándar 17.5° y 29.5° N, meridiano central −102°, latitud de origen 12° N (Snyder, 1987).
3. **Simplificación con topología.** Con `topojson-server` se arma una topología en la que cada
   límite compartido entre dos entidades es un solo arco; `topojson-simplify` aplica Visvalingam
   (área mínima del triángulo: 5 km², en metros proyectados). Como el arco común se simplifica una
   vez, no se abren huecos ni se enciman entidades vecinas.
4. **Lienzo.** Escala a 1000 unidades de ancho (alto 676), norte arriba, margen de 8. Coordenadas
   redondeadas a 0.1 unidades (unos 300 m) y rutas SVG relativas. Se descartan los islotes de
   menos de 3 unidades² (salvo el polígono mayor de cada entidad).
5. **Recuadro ampliado.** La caja que contiene a Aguascalientes, la Ciudad de México, Morelos y
   Tlaxcala (las entidades más chicas), con margen, para mostrarla ampliada junto al mapa.

## Cómo regenerarlo

```sh
# Descarga directa (28.8 MB) o un archivo ya descargado:
node scripts/mapa-entidades.ts
node scripts/mapa-entidades.ts ~/descargas/mgee.json
```

El script valida que lleguen 32 entidades y formatea el módulo con Prettier. Las pruebas
(`scripts/mapa-entidades.test.ts`) revisan la proyección, que el límite compartido no se abra, que
estén las 32 claves, que todo quepa en el lienzo y que el módulo pese menos de 80 KB.
