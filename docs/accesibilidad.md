# Accesibilidad

SIGILO se compromete con el nivel AA de las Pautas de Accesibilidad para el Contenido Web
([WCAG 2.0](https://www.w3.org/TR/2008/REC-WCAG20-20081211/)), como piden las bases del Datatón.
La protección de la identidad no debe excluir a personas con discapacidad, personas adultas mayores
ni personas con poca experiencia en internet.

Una primera auditoría interna encontró 5 bloqueantes AA (barra fija que tapaba el foco, pérdida de
foco, mensajes que no se anunciaban, obligatorios sin marcar y periodo sin agrupar). La auditoría de
la Etapa 5 encontró 18 hallazgos más (H1 a H18), uno crítico: el recibo mostraba las 8 palabras
aunque decía que estaban ocultas. Cada corrección tiene su prueba en `e2e/a11y-audit.spec.ts`. Que
axe no reporte errores **no prueba la conformidad**: axe revisa una parte de los criterios; el
estado real está en la tabla de conformidad de abajo.

## Lo que se cumple

### Perceptible

- [x] Imágenes con texto alternativo; las pruebas limpias tienen «Antes» y «Después (se envía)»
      (1.1.1).
- [x] Estructura semántica: encabezados, listas, tablas con `caption` y `th`, regiones (1.3.1).
- [x] Todos los campos tienen `<label>` visible; el periodo es un `fieldset` con `legend` y los
      obligatorios llevan `aria-required` (1.3.1, 3.3.2).
- [x] El semáforo de riesgo no depende del color: nivel en texto, forma distinta y puntaje; los
      subrayados del revisor usan fondo, onda y número (1.4.1).
- [x] Contraste AA en los temas claro, oscuro y alto contraste de la dirección visual A («Puente
      PDN → S5», en el verde del S5), incluido el foco, el encabezado en degradado y el botón de
      salida rápida (1.4.3). Texto normal desde 5.06:1 (título sobre el fondo claro); el texto blanco
      del encabezado, desde 5.24:1. Los valores están en `apps/web/src/styles/tokens.css`.
- [x] Zoom al 200 % y ancho de 320 px sin desplazamiento horizontal de la página; las tablas anchas
      se desplazan dentro de una región enfocable con nombre (su `caption`) y no parten las palabras
      letra por letra; la barra fija mide unos 60 px y deja de ser fija con poca altura (1.4.4).

### Operable

- [x] Todo se opera con teclado, incluida la carga de archivos y el recibo (2.1.1).
- [x] El diálogo que avisa antes de perder el recibo es un `<dialog>` nativo sin trampas de foco
      (2.1.2).
- [x] Sin límites de tiempo en el formulario. El portapapeles se vacía a los 60 s, con opción de
      volver a copiar (2.2.1).
- [x] Salida rápida: primer elemento enfocable y atajo de Esc dos veces en menos de 1 s.
- [x] Enlace para saltar al contenido (2.4.1).
- [x] Título de página por pantalla y por paso del asistente (2.4.2).
- [x] Foco gestionado: al cambiar de paso va al encabezado, al cambiar de pantalla al `h1`, y cuando
      desaparece el botón pulsado va a un destino estable; foco siempre visible (2.4.3, 2.4.7).

### Comprensible

- [x] Idioma declarado: `lang="es-MX"` (3.1.1).
- [x] Sin cambios de contexto al enfocar o escribir (3.2.1, 3.2.2).
- [x] Errores en texto con resumen enfocable que enlaza a cada campo, y sugerencia de corrección
      (3.3.1, 3.3.3).
- [x] Revisión antes de enviar con la vista «Así te verá la autoridad» (3.3.4).

### Robusto

- [x] Roles ARIA solo cuando no hay elemento nativo; el progreso es una lista con
      `aria-current="step"` (4.1.2).
- [x] Mensajes de estado anunciados por un anunciador global persistente (`role="status"`) que
      existe desde el inicio.

### Además

- Reglas para `forced-colors` (modo de alto contraste de Windows) y `prefers-reduced-motion`.
- Tema de alto contraste (negro, blanco y amarillo) cuando el sistema pide más contraste
  (`prefers-contrast: more`); el tema oscuro sigue a `prefers-color-scheme`. Ambos también se
  pueden fijar con `data-theme="dark"` o `data-theme="contrast"` en `<html>`.
- Menú «Accesibilidad» en la barra fija, con la misma lógica que la versión de pruebas del S5
  (`AccessibilityTools.tsx`): el botón dice cuántos ajustes hay activos y abre un menú con alto
  contraste, tamaño del texto (100 % a 200 %), espaciado (entre líneas y entre letras), lectura
  fácil, lector en voz alta y guía de teclado, más los modos de uso (asistida, quiosco y poca
  conexión). Tamaño, espaciado, lector y guía se abren en paneles flotantes que se apilan a la
  derecha (abajo en el celular), cada uno con «Restablecer» y botón de cerrar; el foco va al título
  del panel y regresa al botón al cerrarlo, y Esc cierra el menú. Un botón aparte cambia el tema
  entre «como mi sistema», claro y oscuro.
- El lector usa solo voces instaladas en el equipo (`localService`): una voz en internet recibiría el
  texto de la denuncia. Si no hay una, lo explica y sugiere el lector de pantalla del sistema.
- El tema (llave `sigilo-tema`) y el tamaño y espaciado del texto (llave `sigilo-lectura`, solo tres
  números) se recuerdan en el navegador con `try/catch`; en modo quiosco no se guardan. Nada de la
  denuncia se guarda (PRV-10). Prueba: E2E `accessibility-tools.spec.ts`.
- Mulish autoalojada (OFL, `apps/web/src/assets/fonts/mulish/`) con `font-display: swap`: el texto se
  ve de inmediato con la fuente del sistema y no se pide nada a terceros.
- Los componentes de la dirección A (distintivos de sistema, anillo de tres llaves, constelaciones,
  ruta de etapas) son decorativos (`aria-hidden`): su significado siempre está en texto. Los estados
  usan píldoras con ícono y texto. La animación del inicio se apaga con `prefers-reduced-motion`.
- El navegador de pasos inferior es fijo solo con altura y ancho suficientes (no por debajo de
  360 px). Su altura real se mide con un `ResizeObserver` y fija el margen inferior de
  desplazamiento; la prueba H7 comprueba que el campo enfocado no queda detrás.
- Piezas de B y C en el lenguaje de A: el talón del recibo (al imprimir solo sale el talón), los
  sellos fechados con nota al margen para «turnada», la regla del plazo («Han pasado X de N días» en
  texto), el sello de lacre con su libro de aperturas (tabla con encabezados), el grafo del
  conflicto y el mapa de México del observatorio. El grafo es `aria-hidden` y tiene su tabla
  equivalente. Los sellos dejan de inclinarse con `prefers-reduced-motion`.
- Mapa de México del observatorio (`CoverageMap.tsx`): tres capas en botones con `aria-pressed`;
  un resumen calculado en texto («Querétaro y Oaxaca operan su propio nodo del S5…») ligado al mapa con
  `aria-describedby`; cada entidad es un `role="button"` con nombre y valor, con tabulación itinerante
  (una sola parada; flechas, Inicio y Fin para recorrer, Enter para elegir) y ficha visible al
  enfocar, tocar o pasar el cursor. Escala de un solo tono (tokens del tema, sin rojo-verde) y
  «sin datos» con trama además de color; leyenda con texto. Un recuadro ampliado vuelve tocables a
  Aguascalientes, la Ciudad de México, Morelos y Tlaxcala. La tabla de las 32 entidades sigue como
  equivalente y la entidad elegida se marca en ella.
- Semáforo de turnado del panel: cada situación es una píldora con ícono (palomita, advertencia o
  alto) y su nombre en texto («A tiempo», «Por vencer», «Vencida»), nunca solo color
  (`apps/web/src/lib/turn-semaphore-text.ts`).
- «Saltar al contenido» se oculta con recorte, no con una posición negativa, para que no asome bajo
  la barra fija en celular.
- Objetivos táctiles de al menos 44 px, incluido el botón del campo de archivo.

## Lenguaje claro y lectura fácil

- Frases cortas, voz activa y segunda persona: «Tus fotos pueden decir dónde estabas».
- Sin tecnicismos: «cifrado» se explica como «bajo llave»; la fecha se muestra sin hora o en la hora
  del centro de México, nunca en UTC.
- Las conductas se nombran por lo que pasó, con el término legal entre paréntesis.
- Lenguaje inclusivo: «Si usas la red de tu trabajo…».
- El recibo usa palabras comunes; basta escribir las primeras 4 letras y no importan los acentos.
- «Escuchar» lee el folio por grupos y deletrea cada palabra, usa solo voces locales del sistema y
  tiene botón «Detener».

## Alineación con el CNPP (art. 109 fr. XI y XII)

El art. 109 del Código Nacional de Procedimientos Penales da a la víctima u ofendido, en la vía
penal, el derecho a un intérprete o traductor gratuito «cuando la víctima u ofendido pertenezca a un
grupo étnico o pueblo indígena o no conozca o no comprenda el idioma español» (fr. XI) y a los
«ajustes al procedimiento penal que sean necesarios» por discapacidad, con condiciones adaptadas
para personas adultas mayores (fr. XII). Esas obligaciones son de la autoridad, no de SIGILO, y no
siempre aplican a quien denuncia ([proteccion-de-quien-denuncia.md](proteccion-de-quien-denuncia.md)).
Lo que sí hace SIGILO va en la misma dirección:

- **Fr. XII (discapacidad y personas adultas mayores):** lo de esta página: WCAG 2.0 AA, menú de
  accesibilidad (tamaño, espaciado, alto contraste, lector local), modos de uso (asistida, quiosco y
  poca conexión), lectura fácil y teclado completo.
- **Fr. XI (lengua):** lenguaje claro en español y lectura fácil. **No hay** interfaz en lenguas
  indígenas ni intérprete: es trabajo pendiente (ver «Lo que sigue»).

## Conformidad con WCAG 2.0 AA (tras la auditoría de la Etapa 5)

Estado de los criterios que la auditoría encontró sin cumplir, después de las correcciones. «Cumple»
significa que la corrección está hecha y probada en Chromium; no sustituye las pruebas pendientes
de la sección siguiente.

| Criterio                                  | Antes      | Ahora     | Hallazgo y prueba                                                                                                                                                  |
| ----------------------------------------- | ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.3.1 Información y relaciones            | No cumplía | Cumple    | H8, H17, H18: errores asociados a su campo, ayuda de los modos en `aria-describedby`, franja dentro de un punto de referencia                                      |
| 1.4.3 Contraste mínimo                    | No cumplía | Cumple    | H6: texto marcado por el revisor en alto contraste (antes 1.65:1, ahora usa `--color-on-mark`)                                                                     |
| 1.4.4 Cambio de tamaño del texto          | No cumplía | Cumple    | H5/H11: tablas y botones no se parten letra por letra al 200 %                                                                                                     |
| 2.2.1 Tiempo ajustable                    | No cumplía | Cumple    | H2: aviso al minuto 13 con «Seguir conectada»; al vencer, nuevo acceso sin perder lo escrito                                                                       |
| 2.2.2 Pausar, detener, ocultar            | No cumplía | Cumple    | H10: la animación del inicio es una sola pulsación de 3 s (y se apaga con `prefers-reduced-motion`)                                                                |
| 2.4.3 Orden del foco                      | No cumplía | Cumple    | H3, H7: el foco va al resultado tras «Registrar respuesta» y «Aplicar»; el navegador de pasos no tapa el campo enfocado                                            |
| 3.3.1 Identificación de errores           | No cumplía | Cumple    | H8, H9: errores del panel y de la inconformidad junto a su campo, con `aria-invalid` y foco al primero; el resumen se anuncia una vez por intento                  |
| 4.1.2 Nombre, función y valor             | No cumplía | Cumple    | H1: el recibo ya no expone palabras ocultas (`aria-expanded` y lo que se ve coinciden); la lista impresa es `aria-hidden`                                          |
| 1.4.10 Reajuste (WCAG 2.1, de referencia) | No cumplía | Cumple    | H5/H11: a 320 px solo se desplazan las tablas, dentro de su región                                                                                                 |
| 1.3.5 Propósito de los campos (WCAG 2.1)  | —          | Excepción | Deliberada: el nombre y el contacto de la identidad sellada llevan `autocomplete="off"`, para que el navegador no guarde ni sugiera la identidad de quien denuncia |

Otros hallazgos corregidos (no son fallas AA, pero afectaban el uso): H4 talón impreso con palabras
numeradas en una columna de cuatro y el folio sin cruzar la perforación; H12 etiquetas del grafo y
del recuadro del mapa sin recortes; H13 espacios entre el plazo y su situación y entre el sello y su fecha; H14
periodos legibles («Sin fecha», «2020 a 2023»); H15 los modos de uso hacen y dicen exactamente lo
mismo (poca conexión: hasta 4 reintentos con más espera); H16 la respuesta al conflicto no viene
preseleccionada y pide confirmar antes de registrarse en la bitácora; y la confirmación vacía del
recibo dice «Escribe la palabra N».

### Lo que no se ha probado

- Lectores de pantalla reales (NVDA, JAWS, VoiceOver en macOS e iOS, TalkBack).
- Navegadores distintos de Chromium: Safari, Firefox y los navegadores de iOS y Android.
- Espaciado de texto (1.4.12, WCAG 2.1): solo una prueba automática que aplica el espaciado de la
  norma con `bypassCSP` de Playwright y revisa que la página no se desborde; falta revisión visual.
- Usabilidad con personas.

## Cómo se valida

| Validación                  | Herramienta                                                                                                                                                   | Estado                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Automática WCAG 2.0 A y AA  | axe-core en `e2e/accessibility.spec.ts`: cada pantalla, cada paso y estado del asistente, panel. Detecta una parte de los criterios; no prueba la conformidad | Sin violaciones de axe |
| Temas y anchos              | Inicio, denunciar (revisión), seguimiento, panel y observatorio en los 3 temas a 390 y 1280 px, sin desplazamiento horizontal                                 | Pasa                   |
| Hallazgos de la auditoría   | `e2e/a11y-audit.spec.ts`: una prueba por cada corrección (H1 a H18)                                                                                           | Pasa                   |
| Control del analizador      | La misma prueba inyecta una violación y comprueba que axe la detecta                                                                                          | Pasa                   |
| Teclado                     | Recorrido del asistente solo con teclado y atajo de salida rápida (`accessibility.spec.ts`)                                                                   | Pasa                   |
| Foco y barra fija           | `e2e/focus.spec.ts` en 320×568: el foco nunca cae en `body` y no queda debajo de la barra                                                                     | Pasa                   |
| Lectores de pantalla reales | NVDA (Windows) y VoiceOver (macOS, iOS) en el flujo de denuncia y seguimiento                                                                                 | Pendiente              |
| Usabilidad con personas     | 5 personas sobre un caso ficticio, con tiempos y hallazgos                                                                                                    | Pendiente              |

Las pruebas con lectores de pantalla reales y con personas no se han hecho. Hasta entonces, el
comportamiento con lector se basa en el código y en patrones conocidos, no en una verificación
directa.

```sh
npm run test:e2e -- e2e/accessibility.spec.ts e2e/focus.spec.ts e2e/a11y-audit.spec.ts
```

## Lo que sigue

- **Lenguas indígenas (CNPP, art. 109 fr. XI, como orientación).** Traducir con personas hablantes,
  no con traducción automática, al menos los textos del asistente, el recibo y el seguimiento, y
  probarlos con ellas. Mientras tanto, la vía es la denuncia asistida con un intérprete que la
  autoridad o una organización acompañante proporcione.
- Pruebas con lectores de pantalla reales y con personas (ver «Lo que no se ha probado»).
