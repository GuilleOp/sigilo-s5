// Paso 3: pruebas. Se limpian en el navegador y solo se envían las copias limpias.
import { MAX_EVIDENCE_ITEMS } from '@sigilo/contracts';
import { Alert } from '../../../components/Alert.tsx';
import { focusAfterRender } from '../../../lib/focus.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';
import { cleanImageCount } from '../../../state/report-validation.ts';
import { addFiles, cleanAllEvidence, dismissRejected } from '../evidence-processing.ts';
import { EvidenceItemCard, evidenceTitleId } from './EvidenceItemCard.tsx';

interface EvidenceStepProps {
  draft: ReportDraft;
  errors: FieldErrors;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

/** Identificador del campo de archivo: destino estable del foco en este paso. */
export const EVIDENCE_INPUT_ID = 'evidence-input';

/** Carga y limpieza de pruebas. */
export function EvidenceStep({ draft, errors }: EvidenceStepProps) {
  const pending = draft.evidence.filter((item) => item.status === 'needs-cleaning');
  return (
    <>
      <p>
        Este paso es opcional. Se aceptan fotos (JPG, PNG, WebP) y PDF. Todo se revisa en tu equipo:
        solo se envían copias limpias, hasta {MAX_EVIDENCE_ITEMS} imágenes.
      </p>
      <div className="field" id="evidence">
        <label htmlFor={EVIDENCE_INPUT_ID}>Agregar pruebas (opcional)</label>
        <p id="evidence-hint" className="field__hint">
          Puedes elegir varios archivos. Llevas {cleanImageCount(draft)} de {MAX_EVIDENCE_ITEMS}{' '}
          imágenes limpias.
        </p>
        <input
          id={EVIDENCE_INPUT_ID}
          type="file"
          multiple
          accept={ACCEPT}
          aria-describedby={errors['evidence'] ? 'evidence-hint evidence-error' : 'evidence-hint'}
          aria-invalid={errors['evidence'] ? true : undefined}
          data-testid="evidence-input"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        {errors['evidence'] && (
          <p id="evidence-error" className="field__error">
            Error: {errors['evidence']}
          </p>
        )}
      </div>

      {draft.rejected.map((file) => (
        <Alert
          key={file.id}
          tone="danger"
          title={`No se puede usar «${file.fileName}»`}
          testId="rejected-file"
        >
          <p>{file.reason}</p>
          <p>
            <strong>Qué hacer:</strong> {file.guide}
          </p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              dismissRejected(file.id);
              // El aviso desaparece: el foco vuelve al campo de archivo.
              focusAfterRender(EVIDENCE_INPUT_ID);
            }}
            data-testid="dismiss-rejected"
          >
            Entendido
          </button>
        </Alert>
      ))}

      {pending.length > 1 && (
        <button
          type="button"
          className="button"
          onClick={() => {
            const first = pending[0];
            // El botón desaparece al empezar: el foco pasa a la primera prueba que se limpia.
            if (first !== undefined) focusAfterRender(evidenceTitleId(first.id));
            void cleanAllEvidence();
          }}
          data-testid="clean-all-evidence"
        >
          Limpiar todas ({pending.length})
        </button>
      )}
      <ul className="plain-list" aria-label="Pruebas agregadas">
        {draft.evidence.map((item, index) => (
          <EvidenceItemCard
            key={item.id}
            item={item}
            nextFocusId={() => {
              const next = draft.evidence[index + 1] ?? draft.evidence[index - 1];
              return next === undefined ? EVIDENCE_INPUT_ID : evidenceTitleId(next.id);
            }}
          />
        ))}
      </ul>
    </>
  );
}
