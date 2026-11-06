// Defensa en profundidad para PRV-23: el servidor rechaza hechos con caracteres invisibles que la
// web siempre elimina antes de enviar (Huella Cero), porque pueden ser la marca con la que se
// rastrea a quien filtró un documento.

/**
 * Caracteres que nunca deben llegar en el texto libre de una denuncia: formato (Cf: ancho cero,
 * controles de dirección, guion suave, etiquetas), controles (Cc) salvo salto de línea y
 * tabulador, uso privado (Co), sin asignar (Cn), sustitutos sueltos (Cs), ignorables por defecto
 * (selectores de variante, U+034F), separadores de línea y párrafo, espacios distintos del normal
 * (Zs salvo U+0020) y rellenos que se dibujan en blanco (Hangul y Braille vacío).
 */
const INVISIBLE_PATTERN =
  /[\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}\u{2028}\u{2029}\u{115F}\u{1160}\u{3164}\u{FFA0}\u{2800}]|[^\P{Cc}\n\t]|[^\P{Zs} ]/u;

/**
 * Indica si el texto contiene un carácter invisible o de marca. La limpieza de la web
 * (`stripInvisibleCharacters`) los quita todos, así que una denuncia enviada por la web nunca los
 * trae; uno presente indica un cliente que no limpió.
 */
export function hasInvisibleCharacters(text: string): boolean {
  return INVISIBLE_PATTERN.test(text);
}
