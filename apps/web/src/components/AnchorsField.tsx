// Campo para pegar uno o varios anclajes publicados de la bitácora (`anchors/AAAA-MM-DD.json`); lo
// comparten /verificar, el seguimiento y el buzón de la autoridad.
import { TextAreaField } from './Field.tsx';

interface AnchorsFieldProps {
  id: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
  testId?: string;
}

/** Área de texto para los anclajes, con la misma explicación en todas las pantallas. */
export function AnchorsField({ id, value, onChange, error, testId }: AnchorsFieldProps) {
  return (
    <TextAreaField
      id={id}
      label="Contenido de los anclajes"
      hint="Abre cada archivo de anclaje, copia todo su contenido y pégalo aquí, uno tras otro."
      rows={6}
      className="mono"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      data-testid={testId}
    />
  );
}
