// Aviso de caracteres invisibles o letras de otro alfabeto, con el botón "Eliminar".
import { announce } from '../lib/announce.ts';
import { focusAfterRender } from '../lib/focus.ts';
import { summarizeSuspiciousCharacters } from '../lib/suspicious-characters.ts';

interface InvisibleCharactersAlertProps {
  text: string;
  onChange: (text: string) => void;
  fieldLabel: string;
  /** Campo revisado: recibe el foco cuando el aviso desaparece al eliminar los caracteres. */
  fieldId: string;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`;
}

/** Aviso en lectura fácil de lo que queda para revisión manual. */
const REMAINING_NOTICE =
  'Estas letras parecen normales pero vienen de otro alfabeto o son poco comunes. Revísalas y escríbelas de nuevo si no las pusiste tú.';

/**
 * Muestra el aviso solo cuando hay caracteres sospechosos. Las variantes tipográficas (comillas y
 * rayas automáticas del teclado) no lo disparan; al eliminar, también se normalizan. Solo se
 * ofrece quitar lo que la limpieza de verdad quita; lo que queda (letras de otro alfabeto o poco
 * comunes, que pueden ser parte de un nombre) se señala aparte para que la persona lo revise.
 */
export function InvisibleCharactersAlert({
  text,
  onChange,
  fieldLabel,
  fieldId,
}: InvisibleCharactersAlertProps) {
  const summary = summarizeSuspiciousCharacters(text);
  if (summary.count === 0) return null;
  const { removable, remaining } = summary;

  function strip(): void {
    onChange(summary.stripped);
    // El botón desaparece: el foco vuelve al campo y se dice qué pasó.
    focusAfterRender(fieldId);
    const removed = `Quitamos ${plural(removable, 'marca escondida', 'marcas escondidas')} de «${fieldLabel}».`;
    announce(
      remaining === 0
        ? removed
        : `${removed} Quedan ${plural(remaining, 'letra para revisar', 'letras para revisar')}: escríbelas de nuevo si no las pusiste tú.`,
    );
  }

  return (
    <div className="alert alert--warning" role="alert" data-testid="invisible-characters-alert">
      <p className="alert__title">
        {`Encontramos ${plural(
          summary.count,
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
      {remaining > 0 && (
        <p data-testid="foreign-letters-notice">
          {`${plural(remaining, 'letra queda', 'letras quedan')} para que la revises. ${REMAINING_NOTICE}`}
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
