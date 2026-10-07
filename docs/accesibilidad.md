# Accesibilidad

SIGILO se compromete con el nivel AA de las Pautas de Accesibilidad para el Contenido Web
([WCAG 2.0](https://www.w3.org/TR/2008/REC-WCAG20-20081211/)), como piden las bases del Datatón.
La protección de la identidad no debe excluir a personas con discapacidad, personas adultas mayores
ni personas con poca experiencia en internet.

Una auditoría interna encontró 5 bloqueantes AA (barra fija que tapaba el foco, pérdida de foco,
mensajes que no se anunciaban, obligatorios sin marcar y periodo sin agrupar). Todos están corregidos
y cubiertos por pruebas automáticas.

## Lo que se cumple

### Perceptible

- [x] Imágenes con texto alternativo; las pruebas limpias tienen «Antes» y «Después (se envía)»
      (1.1.1).
- [x] Estructura semántica: encabezados, listas, tablas con `caption` y `th`, regiones (1.3.1).
- [x] Todos los campos tienen `<label>` visible; el periodo es un `fieldset` con `legend` y los
      obligatorios llevan `aria-required` (1.3.1, 3.3.2).
- [x] El semáforo de riesgo no depende del color: nivel en texto, forma distinta y puntaje; los
      subrayados del revisor usan fondo, onda y número (1.4.1).
- [x] Contraste AA en los temas claro y oscuro, incluido el foco y el botón de salida rápida (1.4.3).
- [x] Zoom al 200 % y ancho de 320 px sin desplazamiento horizontal; la barra fija mide unos 60 px y
      deja de ser fija con poca altura (1.4.4).

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

## Cómo se valida

| Validación                  | Herramienta                                                                                     | Estado    |
| --------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| Automática WCAG 2.0 A y AA  | axe-core en `e2e/accessibility.spec.ts`: cada pantalla, cada paso y estado del asistente, panel | 0 errores |
| Control del analizador      | La misma prueba inyecta una violación y comprueba que axe la detecta                            | Pasa      |
| Teclado                     | Recorrido del asistente solo con teclado y atajo de salida rápida (`accessibility.spec.ts`)     | Pasa      |
| Foco y barra fija           | `e2e/focus.spec.ts` en 320×568: el foco nunca cae en `body` y no queda debajo de la barra       | Pasa      |
| Lectores de pantalla reales | NVDA (Windows) y VoiceOver (macOS, iOS) en el flujo de denuncia y seguimiento                   | Pendiente |
| Usabilidad con personas     | 5 personas sobre un caso ficticio, con tiempos y hallazgos                                      | Pendiente |

Las pruebas con lectores de pantalla reales y con personas no se han hecho. Hasta entonces, el
comportamiento con lector se basa en el código y en patrones conocidos, no en una verificación
directa.

```sh
npm run test:e2e -- e2e/accessibility.spec.ts e2e/focus.spec.ts
```
