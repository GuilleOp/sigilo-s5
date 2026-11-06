// Pregunta opcional del paso de hechos: si quien denuncia trabaja o trabajó en la oficina, para
// avisarle si su grupo es pequeño o, si no trabaja ahí, darle los consejos para personas
// ciudadanas. La respuesta no se envía: solo decide el aviso en la revisión.
import { TextField } from '../../../components/Field.tsx';
import { reportDraftStore } from '../../../state/report-draft.ts';
import type { WorkplaceDraft } from '../../../state/report-draft.ts';

interface WorkplaceFieldsProps {
  workplace: WorkplaceDraft;
}

function setWorkplace(patch: Partial<WorkplaceDraft>): void {
  reportDraftStore.set((draft) => ({ ...draft, workplace: { ...draft.workplace, ...patch } }));
}

/** Campos del lugar de trabajo. */
export function WorkplaceFields({ workplace }: WorkplaceFieldsProps) {
  return (
    <fieldset className="field workplace" data-testid="workplace-fields">
      <legend>¿Trabajas o trabajaste en esa oficina? (opcional)</legend>
      <p id="workplace-hint" className="field__hint">
        Si es así, te diremos si tu grupo de compañeras y compañeros es pequeño, porque entonces el
        relato podría identificarte. Si no trabajas ahí, te daremos consejos para ese caso. Esta
        respuesta no se envía.
      </p>
      <div className="choice-list">
        {(
          [
            ['yes', 'Sí'],
            ['no', 'No (por ejemplo, fui a hacer un trámite)'],
          ] as const
        ).map(([value, label]) => (
          <div key={value} className="choice">
            <input
              type="radio"
              id={`workplace-${value}`}
              name="workplace"
              value={value}
              checked={workplace.worksThere === value}
              aria-describedby="workplace-hint"
              onChange={() => setWorkplace({ worksThere: value })}
              data-testid={`workplace-${value}`}
            />
            <label htmlFor={`workplace-${value}`}>{label}</label>
          </div>
        ))}
      </div>
      {workplace.worksThere === 'yes' && (
        <TextField
          id="workplace-area"
          label="Tu área (opcional)"
          hint="Por ejemplo: «Departamento de Compras». Tampoco se envía."
          value={workplace.area}
          maxLength={300}
          onChange={(event) => setWorkplace({ area: event.target.value })}
          data-testid="workplace-area"
        />
      )}
    </fieldset>
  );
}
