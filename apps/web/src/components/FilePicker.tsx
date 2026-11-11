// Selector de archivos en español. El control nativo dice «Choose Files / No file chosen» en el
// idioma del navegador; aquí el campo real queda transparente encima de un botón «Elegir archivos»
// y junto a él se dice qué se eligió. El campo sigue siendo el que recibe el foco y el clic, con su
// etiqueta y su ayuda, así que el teclado, los lectores de pantalla y las pruebas lo usan igual.
import type { InputHTMLAttributes } from 'react';

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> & {
  id: string;
  /** Texto del botón; por omisión «Elegir archivo» o «Elegir archivos» (si acepta varios). */
  buttonLabel?: string;
  /** Qué se eligió; por omisión «Ningún archivo elegido». */
  status?: string | undefined;
};

/** Campo de archivo con botón y texto en español. */
export function FilePicker({ id, buttonLabel, status, multiple, ...inputProps }: FilePickerProps) {
  const statusId = `${id}-status`;
  const describedBy = [inputProps['aria-describedby'], statusId].filter(Boolean).join(' ');
  return (
    <div className="file-picker">
      <span className="file-picker__control">
        <span className="button button--secondary file-picker__button" aria-hidden="true">
          {buttonLabel ?? (multiple ? 'Elegir archivos' : 'Elegir archivo')}
        </span>
        <input
          {...inputProps}
          id={id}
          type="file"
          multiple={multiple}
          className="file-picker__input"
          aria-describedby={describedBy}
        />
      </span>
      <span id={statusId} className="file-picker__status">
        {status ?? 'Ningún archivo elegido'}
      </span>
    </div>
  );
}
