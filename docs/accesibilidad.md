# Accesibilidad

SIGILO se compromete con el nivel AA de las Pautas de Accesibilidad para el Contenido Web
([WCAG 2.0](https://www.w3.org/TR/2008/REC-WCAG20-20081211/)), como piden las bases del Datatón.
La protección de la identidad no debe excluir a personas con discapacidad, personas adultas mayores
ni personas con poca experiencia en internet.

## Lista de verificación

### Perceptible

- [ ] Toda imagen informativa tiene texto alternativo; las decorativas usan `alt=""` (1.1.1).
- [ ] La estructura usa encabezados, listas, tablas y etiquetas semánticas (1.3.1).
- [ ] Los campos tienen `<label>` visible asociado (1.3.1, 3.3.2).
- [ ] El semáforo de riesgo no depende solo del color: incluye texto e ícono (1.4.1).
- [ ] Contraste mínimo de 4.5:1 en texto y 3:1 en texto grande (1.4.3).
- [ ] El contenido funciona con zoom al 200 % sin pérdida (1.4.4).

### Operable

- [ ] Todo se opera con teclado, incluida la carga de archivos y el recibo (2.1.1).
- [ ] No hay trampas de foco en diálogos (2.1.2).
- [ ] No hay límites de tiempo en el formulario (2.2.1).
- [ ] Enlace para saltar al contenido (2.4.1).
- [ ] Títulos de página descriptivos por paso (2.4.2).
- [ ] Orden de foco lógico y foco siempre visible (2.4.3, 2.4.7).

### Comprensible

- [ ] Idioma de la página declarado: `lang="es-MX"` (3.1.1).
- [ ] Sin cambios de contexto inesperados al enfocar o escribir (3.2.1, 3.2.2).
- [ ] Errores identificados en texto, con sugerencia de corrección (3.3.1, 3.3.3).
- [ ] Confirmación antes de enviar: la vista "Así te verá la autoridad" (3.3.4).

### Robusto

- [ ] HTML válido y roles ARIA solo cuando no hay elemento nativo (4.1.1, 4.1.2).
- [ ] Mensajes de estado anunciados con `aria-live` (progreso de limpieza, envío).

## Lenguaje claro y lectura fácil

- Frases cortas, voz activa, segunda persona: "Tu foto revela dónde estabas".
- Sin tecnicismos en la interfaz: "cifrado" se explica como "solo la autoridad puede abrirlo".
- Cada paso del formulario dice para qué sirve y qué pasa después.
- El recibo usa palabras comunes; basta escribir las primeras 4 letras.
- La opción "Escuchar" del recibo usa solo voces locales del sistema.

## Validación

1. **Automática:** axe-core en las pruebas E2E de cada pantalla; cero violaciones de nivel A y AA.
2. **Teclado:** recorrido completo de denuncia, seguimiento y panel sin ratón.
3. **Lector de pantalla:** VoiceOver (macOS, iOS) y NVDA (Windows) en el flujo de denuncia.
4. **Usabilidad:** prueba con 5 personas sobre un caso ficticio; se documentan tiempos y hallazgos.

Los resultados se registran en esta misma página antes de la entrega.
