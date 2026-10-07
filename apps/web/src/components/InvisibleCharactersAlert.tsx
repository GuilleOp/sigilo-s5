// Aviso de caracteres invisibles o letras de otro alfabeto, con el botón "Eliminar".
import { findInvisibleCharacters, stripInvisibleCharacters } from '@sigilo/huella';

interface InvisibleCharactersAlertProps {
  text: string;
  onChange: (text: string) => void;
  fieldLabel: string;
}

/** Muestra el aviso solo cuando hay caracteres sospechosos. */
export function InvisibleCharactersAlert({
  text,
  onChange,
  fieldLabel,
}: InvisibleCharactersAlertProps) {
  const { count } = findInvisibleCharacters(text);
  if (count === 0) return null;
  return (
    <div className="alert alert--warning" role="alert" data-testid="invisible-characters-alert">
      <p className="alert__title">
        {count === 1
          ? `Encontramos 1 carácter invisible o de otro alfabeto en «${fieldLabel}»`
          : `Encontramos ${count} caracteres invisibles o de otro alfabeto en «${fieldLabel}»`}
      </p>
      <p>
        Pueden venir de un documento marcado para saber quién lo filtró. Si copiaste el texto de un
        oficio o correo, elimínalos.
      </p>
      <button
        type="button"
        className="button"
        onClick={() => onChange(stripInvisibleCharacters(text))}
        data-testid="strip-invisible"
      >
        Eliminar caracteres invisibles
      </button>
    </div>
  );
}
