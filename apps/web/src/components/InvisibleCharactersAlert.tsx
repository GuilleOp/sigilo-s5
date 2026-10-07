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

/** Limpieza manual: además de lo invisible, quita las marcas que no se componen con su letra. */
const MANUAL_STRIP_OPTIONS = { shouldRemoveUncomposedMarks: true } as const;

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`;
}

/**
 * Muestra el aviso solo cuando hay caracteres sospechosos. Las variantes tipográficas (comillas y
 * rayas automáticas del teclado) no lo disparan; al eliminar, también se normalizan. Las letras de
 * otro alfabeto (`mixed_script`) se señalan pero no se borran solas: podrían ser parte de un
 * nombre, así que la persona debe revisarlas y escribirlas de nuevo.
 */
export function InvisibleCharactersAlert({
  text,
  onChange,
  fieldLabel,
  fieldId,
}: InvisibleCharactersAlertProps) {
  const report = findInvisibleCharacters(text, { shouldNormalizeTypography: false });
  if (report.count === 0) return null;
  const foreignLetters = report.items.filter((item) => item.kind === 'mixed_script').length;
  const removable = report.count - foreignLetters;

  function strip(): void {
    onChange(stripInvisibleCharacters(text, MANUAL_STRIP_OPTIONS));
    // El botón desaparece: el foco vuelve al campo y se dice qué pasó.
    focusAfterRender(fieldId);
    const removed = `Quitamos ${plural(removable, 'marca escondida', 'marcas escondidas')} de «${fieldLabel}».`;
    announce(
      foreignLetters === 0
        ? removed
        : `${removed} Quedan letras de otro alfabeto: revísalas y escríbelas de nuevo.`,
    );
  }

  return (
    <div className="alert alert--warning" role="alert" data-testid="invisible-characters-alert">
      <p className="alert__title">
        {`Encontramos ${plural(
          report.count,
          'carácter invisible o de otro alfabeto',
          'caracteres invisibles o de otro alfabeto',
        )} en «${fieldLabel}»`}
      </p>
      {removable > 0 && (
        <p>
          Algunos documentos traen marcas escondidas para saber quién los compartió. Si copiaste el
          texto de un oficio o correo, quítalas.
        </p>
      )}
      {foreignLetters > 0 && (
        <p data-testid="foreign-letters-notice">
          {foreignLetters === 1
            ? 'Hay 1 letra de otro alfabeto que se ve igual a una de las nuestras. '
            : `Hay ${foreignLetters} letras de otro alfabeto que se ven iguales a las nuestras. `}
          No las borramos solas, porque pueden ser parte de un nombre. Revisa el texto y escribe
          esas palabras de nuevo con tu teclado.
        </p>
      )}
      {removable > 0 && (
        <button type="button" className="button" onClick={strip} data-testid="strip-invisible">
          Eliminar caracteres invisibles
        </button>
      )}
    </div>
  );
}
