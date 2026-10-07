// Paso 1: modo anónimo (recomendado) o identidad sellada, con sus datos.
import { TextAreaField, TextField } from '../../../components/Field.tsx';
import { advisorRecommendationStore } from '../../../lib/advisor-recommendation.ts';
import { useMemoryStore } from '../../../state/memory-store.ts';
import { reportDraftStore } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';
import { MAX_WITNESSES } from '../../../state/report-validation.ts';

interface ModeStepProps {
  draft: ReportDraft;
  errors: FieldErrors;
}

const MODE_TITLES = { anonymous: 'Anónima', sealed: 'Identidad sellada' } as const;

function setIdentity(field: keyof ReportDraft['identity'], value: string): void {
  reportDraftStore.set((draft) => ({ ...draft, identity: { ...draft.identity, [field]: value } }));
}

/** Elección del modo de denuncia. */
export function ModeStep({ draft, errors }: ModeStepProps) {
  const recommended = useMemoryStore(advisorRecommendationStore);
  const setMode = (mode: 'anonymous' | 'sealed'): void =>
    reportDraftStore.set((current) => ({ ...current, mode }));
  const modeError = errors['mode'];
  // Cada radio lleva el error y la recomendación; el primero recibe el foco desde el resumen.
  const radioDescription =
    [recommended === null ? '' : 'mode-recommendation', modeError ? 'mode-error' : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const radioProps = {
    type: 'radio',
    name: 'mode',
    required: true,
    'aria-describedby': radioDescription,
    'aria-invalid': modeError ? true : undefined,
  } as const;
  return (
    <>
      <fieldset id="mode" data-group-field>
        <legend>Elige una opción</legend>
        {recommended !== null && (
          <p id="mode-recommendation" className="field__hint">
            Según tus respuestas al asesor, te recomendamos: «{MODE_TITLES[recommended]}». Puedes
            elegir otra opción.
          </p>
        )}
        <label className="choice">
          <input
            {...radioProps}
            id="mode-anonymous"
            value="anonymous"
            checked={draft.mode === 'anonymous'}
            onChange={() => setMode('anonymous')}
            data-testid="mode-anonymous"
          />
          <span>
            <span className="choice__title">Anónima (recomendada)</span>
            No das tu nombre ni datos de contacto. Ves cómo va tu denuncia y respondes preguntas con
            tu folio y 8 palabras que te daremos.
          </span>
        </label>
        <label className="choice">
          <input
            {...radioProps}
            id="mode-sealed"
            value="sealed"
            checked={draft.mode === 'sealed'}
            onChange={() => setMode('sealed')}
            data-testid="mode-sealed"
          />
          <span>
            <span className="choice__title">Identidad sellada</span>
            Das tu nombre. Puedes pedir protección. Tu nombre va guardado bajo llave: solo la
            autoridad puede abrirlo. Si lo abre, debe decir qué ley se lo permite. Tú lo verás.
          </span>
        </label>
        {modeError && (
          <p id="mode-error" className="field__error">
            Error: {modeError}
          </p>
        )}
      </fieldset>

      {draft.mode === 'sealed' && (
        <section className="card" aria-labelledby="identity-title">
          <h3 id="identity-title">Tus datos, bajo llave</h3>
          <p>
            Tus datos se guardan bajo llave antes de salir de tu equipo. Nadie del sistema puede
            leerlos. Solo la autoridad puede abrirlos y debe decir qué ley se lo permite. Tú verás
            cada vez que los abran.
          </p>
          <TextField
            id="fullName"
            label="Nombre completo"
            required
            value={draft.identity.fullName}
            maxLength={200}
            error={errors['fullName']}
            onChange={(event) => setIdentity('fullName', event.target.value)}
            data-testid="identity-name"
          />
          <TextField
            id="contact"
            label="Cómo contactarte (opcional)"
            hint="No es necesario: la autoridad puede escribirte por mensajes en tu seguimiento."
            value={draft.identity.contact}
            maxLength={200}
            error={errors['contact']}
            onChange={(event) => setIdentity('contact', event.target.value)}
          />
          <TextAreaField
            id="witnesses"
            label="Testigos (opcional)"
            hint={`Personas que vieron lo que pasó. Una por línea, hasta ${MAX_WITNESSES}.`}
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
              <span className="choice__title">
                Pido protección (por ejemplo, para que no me castiguen en mi trabajo)
              </span>
              La autoridad lo verá al recibir tu denuncia.
            </span>
          </label>
        </section>
      )}
    </>
  );
}
