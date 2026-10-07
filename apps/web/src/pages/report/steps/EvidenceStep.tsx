// Paso 3: pruebas. Se limpian en el navegador y solo se envían las copias limpias.
import { MAX_EVIDENCE_ITEMS } from '@sigilo/contracts';
import { Alert } from '../../../components/Alert.tsx';
import type { ReportDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';
import { cleanImageCount } from '../../../state/report-validation.ts';
import { addFiles, cleanAllEvidence, dismissRejected } from '../evidence-processing.ts';
import { EvidenceItemCard } from './EvidenceItemCard.tsx';

interface EvidenceStepProps {
  draft: ReportDraft;
  errors: FieldErrors;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

/** Carga y limpieza de pruebas. */
export function EvidenceStep({ draft, errors }: EvidenceStepProps) {
  const pending = draft.evidence.filter((item) => item.status === 'needs-cleaning').length;
  return (
    <>
      <p>
        Las pruebas son opcionales. Se aceptan fotos (JPG, PNG, WebP) y PDF. Todo se procesa en tu
        equipo; solo se envían copias limpias, hasta {MAX_EVIDENCE_ITEMS} imágenes.
      </p>
      <div className="field" id="evidence">
        <label htmlFor="evidence-input">Agregar pruebas</label>
        <p id="evidence-hint" className="field__hint">
          Puedes elegir varios archivos. Llevas {cleanImageCount(draft)} de {MAX_EVIDENCE_ITEMS}{' '}
          imágenes limpias.
        </p>
        <input
          id="evidence-input"
          type="file"
          multiple
          accept={ACCEPT}
          aria-describedby={errors['evidence'] ? 'evidence-hint evidence-error' : 'evidence-hint'}
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
            onClick={() => dismissRejected(file.id)}
          >
            Entendido
          </button>
        </Alert>
      ))}

      {pending > 1 && (
        <button type="button" className="button" onClick={() => void cleanAllEvidence()}>
          Limpiar todas ({pending})
        </button>
      )}
      <ul className="plain-list" aria-label="Pruebas agregadas">
        {draft.evidence.map((item) => (
          <EvidenceItemCard key={item.id} item={item} />
        ))}
      </ul>
    </>
  );
}
