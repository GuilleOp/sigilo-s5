// Aviso de caracteres invisibles o letras de otro alfabeto, con el botón "Eliminar".
import { findInvisibleCharacters, stripInvisibleCharacters } from '@sigilo/huella';
import { announce } from '../lib/announce.ts';
import { focusAfterRender } from '../lib/focus.ts';

interface InvisibleCharactersAlertProps {
  text: string;
  onChange: (text: string) => void;
  fieldLabel: string;
  /** Campo revisado: recibe el foco cuando el aviso desaparece al eliminar los caracteres. */
  fieldId: string;
}

/**
 * Muestra el aviso solo cuando hay caracteres sospechosos. Las variantes tipográficas (comillas y
 * rayas automáticas del teclado) no lo disparan; al eliminar, también se normalizan.
 */
export function InvisibleCharactersAlert({
  text,
  onChange,
  fieldLabel,
  fieldId,
}: InvisibleCharactersAlertProps) {
  const { count } = findInvisibleCharacters(text, { shouldNormalizeTypography: false });
  if (count === 0) return null;

  function strip(): void {
    onChange(stripInvisibleCharacters(text));
    // El aviso y su botón desaparecen: el foco vuelve al campo y se dice qué pasó.
    focusAfterRender(fieldId);
    announce(
      count === 1
        ? `Quitamos 1 marca escondida de «${fieldLabel}».`
        : `Quitamos ${count} marcas escondidas de «${fieldLabel}».`,
    );
  }

  return (
    <div className="alert alert--warning" role="alert" data-testid="invisible-characters-alert">
      <p className="alert__title">
        {count === 1
          ? `Encontramos 1 carácter invisible o de otro alfabeto en «${fieldLabel}»`
          : `Encontramos ${count} caracteres invisibles o de otro alfabeto en «${fieldLabel}»`}
      </p>
      <p>
        Algunos documentos traen marcas escondidas para saber quién los compartió. Si copiaste el
        texto de un oficio o correo, quítalas.
      </p>
      <button type="button" className="button" onClick={strip} data-testid="strip-invisible">
        Eliminar caracteres invisibles
      </button>
    </div>
  );
}
