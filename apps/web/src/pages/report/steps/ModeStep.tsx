// Paso 1: modo anónimo (recomendado) o identidad sellada, con sus datos.
import { TextAreaField, TextField } from '../../../components/Field.tsx';
import { reportDraftStore } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';
import { MAX_WITNESSES } from '../../../state/report-validation.ts';

interface ModeStepProps {
  draft: ReportDraft;
  errors: FieldErrors;
}

function setIdentity(field: keyof ReportDraft['identity'], value: string): void {
  reportDraftStore.set((draft) => ({ ...draft, identity: { ...draft.identity, [field]: value } }));
}

/** Elección del modo de denuncia. */
export function ModeStep({ draft, errors }: ModeStepProps) {
  const setMode = (mode: 'anonymous' | 'sealed'): void =>
    reportDraftStore.set((current) => ({ ...current, mode }));
  return (
    <>
      <fieldset id="mode" aria-describedby={errors['mode'] ? 'mode-error' : undefined}>
        <legend>¿Cómo quieres denunciar?</legend>
        <label className="choice">
          <input
            type="radio"
            name="mode"
            value="anonymous"
            checked={draft.mode === 'anonymous'}
            onChange={() => setMode('anonymous')}
            data-testid="mode-anonymous"
          />
          <span>
            <span className="choice__title">Anónima (recomendada)</span>
            No das tu nombre ni datos de contacto. Das seguimiento y respondes preguntas con tu
            folio y un recibo de 8 palabras.
          </span>
        </label>
        <label className="choice">
          <input
            type="radio"
            name="mode"
            value="sealed"
            checked={draft.mode === 'sealed'}
            onChange={() => setMode('sealed')}
            data-testid="mode-sealed"
          />
          <span>
            <span className="choice__title">Con identidad sellada</span>
            Das tu nombre, testigos y puedes pedir medidas de protección. Tus datos viajan cifrados:
            solo la autoridad competente puede abrirlos, cada apertura queda registrada con su
            fundamento y tú la verás en tu seguimiento.
          </span>
        </label>
        {errors['mode'] && (
          <p id="mode-error" className="field__error">
            Error: {errors['mode']}
          </p>
        )}
      </fieldset>

      {draft.mode === 'sealed' && (
        <section className="card" aria-labelledby="identity-title">
          <h3 id="identity-title">Tus datos (se cifran en tu navegador)</h3>
          <p>
            Nadie en el servidor puede leerlos. Para abrirlos, la autoridad debe escribir el
            fundamento legal; eso queda registrado y tú lo verás.
          </p>
          <TextField
            id="fullName"
            label="Nombre completo"
            value={draft.identity.fullName}
            maxLength={200}
            error={errors['fullName']}
            onChange={(event) => setIdentity('fullName', event.target.value)}
            data-testid="identity-name"
          />
          <TextField
            id="contact"
            label="Medio de contacto (opcional)"
            hint="No es necesario: la autoridad puede escribirte por el buzón anónimo."
            value={draft.identity.contact}
            maxLength={200}
            error={errors['contact']}
            onChange={(event) => setIdentity('contact', event.target.value)}
          />
          <TextAreaField
            id="witnesses"
            label="Testigos (opcional)"
            hint={`Una persona por línea, hasta ${MAX_WITNESSES}.`}
            rows={4}
            value={draft.identity.witnesses}
            error={errors['witnesses']}
            onChange={(event) => setIdentity('witnesses', event.target.value)}
          />
          <label className="choice">
            <input
              type="checkbox"
              checked={draft.protectionRequested}
              onChange={(event) =>
                reportDraftStore.set((current) => ({
                  ...current,
                  protectionRequested: event.target.checked,
                }))
              }
              data-testid="protection-requested"
            />
            <span>
              <span className="choice__title">Solicito medidas de protección</span>
              Por ejemplo, contra represalias en tu trabajo. La autoridad lo verá al recibir tu
              denuncia.
            </span>
          </label>
        </section>
      )}
    </>
  );
}
