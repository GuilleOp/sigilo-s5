// Cambio de estatus de la denuncia.
import { useState } from 'react';
import { ComplaintStatusSchema } from '@sigilo/contracts';
import type { ComplaintStatus } from '@sigilo/contracts';
import { SelectField } from '../../components/Field.tsx';
import { STATUS_LABELS } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';

interface StatusPanelProps {
  token: string;
  folio: string;
  current: ComplaintStatus;
  onChanged: () => void;
}

/** Selector y botón para cambiar el estatus. */
export function StatusPanel({ token, folio, current, onChanged }: StatusPanelProps) {
  const [status, setStatus] = useState<ComplaintStatus>(current);
  const [message, setMessage] = useState('');

  async function save(): Promise<void> {
    try {
      const summary = await api.updateStatus(token, folio, status);
      setMessage(`Estatus actualizado: ${STATUS_LABELS[summary.status]}.`);
      onChanged();
    } catch (failure) {
      setMessage(describeError(failure, 'No se pudo cambiar el estatus.'));
    }
  }

  return (
    <section className="card" aria-labelledby="status-title">
      <h3 id="status-title">Estatus</h3>
      <SelectField
        id="status-select"
        label="Nuevo estatus"
        value={status}
        onChange={(event) => setStatus(ComplaintStatusSchema.parse(event.target.value))}
        data-testid="status-select"
      >
        {ComplaintStatusSchema.options.map((option) => (
          <option key={option} value={option}>
            {STATUS_LABELS[option]}
          </option>
        ))}
      </SelectField>
      <button
        type="button"
        className="button"
        disabled={status === current}
        onClick={() => void save()}
        data-testid="save-status"
      >
        Guardar estatus
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
