// Trámite de la denuncia en el panel: estado en el flujo de gestión, plazos y las acciones que la
// función de la cuenta puede hacer (turnar, aceptar, reasignar, devolver, avanzar etapa o cerrar).
import { useEffect, useRef, useState } from 'react';
import {
  ADMINISTRATIVE_STAGES,
  CLOSURE_REASONS,
  CRIMINAL_STAGES,
  ClosureReasonSchema,
  functionForStage,
  functionInChargeAt,
  hasAnyFunction,
  hasFunction,
} from '@sigilo/contracts';
import type {
  AuthorityProfile,
  ClosureReason,
  ComplaintDetail,
  LegalStage,
  ProcedureActionRequest,
} from '@sigilo/contracts';
import { DeadlineList } from '../../components/DeadlineList.tsx';
import { SelectField, TextAreaField, TextField } from '../../components/Field.tsx';
import { VerificationResult } from '../../components/VerificationResult.tsx';
import { announce } from '../../lib/announce.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface ProcedurePanelProps {
  session: AuthoritySession;
  detail: ComplaintDetail;
  /** Recarga el detalle; se espera antes de mover el foco para que no lo pierda al repintar. */
  onChanged: () => Promise<unknown>;
}

type ActionKey = ProcedureActionRequest['action'];

const ACTION_LABELS: Readonly<Record<ActionKey, string>> = {
  route: 'Turnar a una autoridad',
  accept: 'Aceptar (o reabrir) la denuncia',
  reassign: 'Reasignar a otra autoridad',
  return: 'Devolver al buzón general',
  advance_stage: 'Avanzar a la siguiente etapa legal',
  close: 'Cerrar con fundamento',
  respond_conflict: 'Excusarse o justificar ante un posible conflicto de interés',
};

/** Sanción declarada al cerrar: se verifica contra el registro público de sanciones (S3). */
interface SanctionDraft {
  isDeclared: boolean;
  fileNumber: string;
  personName: string;
  sanction: string;
  institution: string;
  stateCode: string;
}

const EMPTY_SANCTION: SanctionDraft = {
  isDeclared: false,
  fileNumber: '',
  personName: '',
  sanction: '',
  institution: '',
  stateCode: '00',
};

/**
 * Acciones que las funciones de la cuenta pueden hacer en el estado actual del flujo (una cuenta
 * de recepción e investigación suma las de ambas). Después del IPRA, avanzar y cerrar es de
 * substanciación (LGRA art. 115; el nodo responde 403 a lo demás).
 */
function availableActions(session: AuthoritySession, detail: ComplaintDetail): ActionKey[] {
  const state = detail.summary.managementState ?? 'received_in_inbox';
  const account = session.account;
  const stage = detail.procedure?.legalStage;
  // LGRA, art. 58 (H5): la autoridad que se excusó no acepta, no avanza ni cierra; solo reasigna,
  // devuelve o turna (el nodo responde 409 a lo demás).
  const review = detail.conflictReview;
  const isExcused =
    review?.response === 'excuse' &&
    review.authorityId === detail.summary.assignedAuthorityId &&
    state !== 'closed';
  if (isExcused) {
    if (!hasFunction(account, 'intake')) return [];
    if (state === 'received_in_inbox' || state === 'returned_to_inbox') return ['route'];
    if (state === 'routed' || state === 'reassigned') return ['reassign', 'return'];
    return [];
  }
  const actions = new Set<ActionKey>();
  if (hasFunction(account, 'intake')) {
    if (state === 'received_in_inbox' || state === 'returned_to_inbox') {
      actions.add('route').add('close');
    }
    if (state === 'routed' || state === 'reassigned') {
      actions.add('accept').add('reassign').add('return');
    }
  }
  if (hasAnyFunction(account, ['intake', 'investigation']) && state === 'closed') {
    actions.add('accept');
  }
  if (state === 'accepted') {
    if (nextStages(stage).some((next) => canAdvanceTo(session, stage, next.key))) {
      actions.add('advance_stage');
    }
    const inCharge = stage === undefined ? 'investigation' : functionInChargeAt(stage);
    if (hasFunction(account, inCharge)) actions.add('close');
  }
  return [...actions];
}

/**
 * Indica si la cuenta puede avanzar de `current` a `next`: investigación hasta el IPRA; después,
 * substanciación, y solo con el informe ya presentado (el nodo responde 409 si se salta).
 */
function canAdvanceTo(
  session: AuthoritySession,
  current: LegalStage | undefined,
  next: LegalStage,
): boolean {
  const owner = functionForStage(next);
  if (!hasFunction(session.account, owner)) return false;
  return (
    owner === 'investigation' ||
    (current !== undefined && functionInChargeAt(current) === 'substantiation')
  );
}

/** Etapas posteriores a la actual en su vía (o la primera de cada vía si no hay etapa). */
function nextStages(current: LegalStage | undefined): { key: LegalStage; name: string }[] {
  const tracks = [ADMINISTRATIVE_STAGES, CRIMINAL_STAGES];
  if (current === undefined) return tracks.flatMap((track) => (track[0] ? [track[0]] : []));
  const track = tracks.find((stages) => stages.some((stage) => stage.key === current)) ?? [];
  const index = track.findIndex((stage) => stage.key === current);
  return track.slice(index + 1);
}

/** Panel del trámite. */
export function ProcedurePanel({ session, detail, onChanged }: ProcedurePanelProps) {
  const actions = availableActions(session, detail);
  const procedure = detail.procedure;
  const stages = nextStages(procedure?.legalStage).filter((item) =>
    canAdvanceTo(session, procedure?.legalStage, item.key),
  );
  const [authorities, setAuthorities] = useState<AuthorityProfile[]>([]);
  const [action, setAction] = useState<ActionKey | ''>(actions[0] ?? '');
  const [authorityId, setAuthorityId] = useState('');
  const [stage, setStage] = useState<LegalStage | ''>(stages[0]?.key ?? '');
  const [reason, setReason] = useState<ClosureReason>('attended');
  const [note, setNote] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [agreement, setAgreement] = useState('');
  const [sanction, setSanction] = useState<SanctionDraft>(EMPTY_SANCTION);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [severity, setSeverity] = useState<'serious' | 'non_serious'>('serious');
  const [message, setMessage] = useState('');
  const [isSaving, setSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isMounted = useRef(true);
  const current = detail.summary.assignedAuthorityId;

  useEffect(() => {
    isMounted.current = true;
    api.listAuthorities(session.token).then(
      (list) => {
        if (isMounted.current) setAuthorities(list);
      },
      () => undefined,
    );
    return () => {
      isMounted.current = false;
    };
  }, [session.token]);

  const targets = authorities.filter((item) => !item.isInbox && item.authorityId !== current);

  /**
   * H8: errores por campo (identificador del campo → mensaje), para marcarlos con aria-invalid,
   * asociarlos con su campo y llevar el foco al primero.
   */
  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    const trimmedNote = note.trim();
    if ((action === 'route' || action === 'reassign') && authorityId === '') {
      found['procedure-authority'] = 'Elige la autoridad.';
    }
    if ((action === 'reassign' || action === 'return') && trimmedNote === '') {
      found['procedure-note'] = 'Escribe la nota pública: la persona la leerá.';
    }
    if (action === 'advance_stage' && stage === '') found['procedure-stage'] = 'Elige la etapa.';
    const isQualification = action === 'advance_stage' && stage === 'qualification';
    const prefix = isQualification ? 'qualification' : 'procedure';
    if (isQualification || action === 'close') {
      if (legalBasis.trim().length < 20) {
        found[`${prefix}-legal-basis`] = 'Escribe el fundamento (al menos 20 caracteres).';
      }
      if (agreement.trim().length < 50) {
        found[`${prefix}-agreement`] =
          'Escribe el acuerdo en versión pública (al menos 50 caracteres).';
      }
    }
    if (action === 'close' && sanction.isDeclared) {
      for (const field of ['fileNumber', 'personName', 'sanction', 'institution'] as const) {
        if (sanction[field].trim() === '') found[`sanction-${field}`] = 'Escribe este dato.';
      }
    }
    return found;
  }

  function buildRequest(): ProcedureActionRequest | null {
    const trimmedNote = note.trim();
    const withNote = trimmedNote === '' ? {} : { note: trimmedNote };
    switch (action) {
      case 'route':
        return authorityId === '' ? null : { action, authorityId, ...withNote };
      case 'accept':
        return { action, ...withNote };
      case 'reassign':
        return authorityId === '' || trimmedNote === ''
          ? null
          : { action, authorityId, note: trimmedNote };
      case 'return':
        return trimmedNote === '' ? null : { action, note: trimmedNote };
      case 'advance_stage': {
        if (stage === '') return null;
        if (stage !== 'qualification') return { action, stage, ...withNote };
        // La calificación lleva su gravedad, su fundamento y el acuerdo (el auditor lo revisa).
        return {
          action,
          stage,
          ...withNote,
          qualification: { severity, legalBasis: legalBasis.trim(), agreement: agreement.trim() },
        };
      }
      case 'close': {
        const base = { action, reason, legalBasis: legalBasis.trim(), agreement: agreement.trim() };
        if (!sanction.isDeclared) return base;
        const fields = [sanction.fileNumber, sanction.personName, sanction.sanction];
        if (fields.some((value) => value.trim() === '') || sanction.institution.trim() === '') {
          return null;
        }
        return {
          ...base,
          sanction: {
            fileNumber: sanction.fileNumber.trim(),
            personName: sanction.personName.trim(),
            sanction: sanction.sanction.trim(),
            institution: sanction.institution.trim(),
            stateCode: sanction.stateCode.trim(),
          },
        };
      }
      default:
        return null;
    }
  }

  async function apply(): Promise<void> {
    if (isSavingRef.current) return;
    const found = validate();
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    const request = firstInvalid === undefined ? buildRequest() : null;
    if (request === null) {
      setMessage('Revisa los datos marcados de la acción.');
      if (firstInvalid !== undefined) focusAfterRender(firstInvalid);
      return;
    }
    isSavingRef.current = true;
    setSaving(true);
    try {
      const state = await api.applyProcedure(session.token, detail.summary.folio, request);
      if (!isMounted.current) return;
      // Si la denuncia pasó a otra autoridad, ya no se puede volver a leer: no se recarga.
      if (state.assignedAuthorityId !== session.account.authorityId) {
        setMessage(
          `Listo: ${ACTION_LABELS[request.action]}. La denuncia ya no está en tu bandeja.`,
        );
        // H3: el botón pulsado desaparece; el foco va al resultado.
        focusAfterRender('procedure-message');
        return;
      }
      setMessage(`Listo: ${ACTION_LABELS[request.action]}.`);
      // H3: el panel se vuelve a pintar con el estado nuevo; el foco va a su encabezado y el
      // resultado se anuncia.
      announce(`Listo: ${ACTION_LABELS[request.action]}.`);
      await onChanged();
      if (isMounted.current) focusAfterRender('procedure-title');
    } catch (failure) {
      if (isMounted.current) {
        setMessage(describeError(failure, 'No pudimos aplicar la acción. Inténtalo de nuevo.'));
      }
    } finally {
      isSavingRef.current = false;
      if (isMounted.current) setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="procedure-title" data-testid="procedure-panel">
      <h3 id="procedure-title" tabIndex={-1}>
        Trámite
      </h3>
      {procedure && (
        <>
          <p data-testid="procedure-state">
            {procedure.managementStateName}
            {procedure.legalStageName ? ` · Etapa: ${procedure.legalStageName}` : ''}
          </p>
          <DeadlineList deadlines={procedure.deadlines} testId="procedure-deadlines" />
          {procedure.rules.length > 0 && (
            <ul className="rule-list" data-testid="procedure-rules">
              {procedure.rules.map((rule) => (
                <li key={`${rule.ruleKey}-${rule.on}`} className="rule" data-effect={rule.effect}>
                  <strong>{rule.name}</strong> ({formatDayDate(rule.on)}):{' '}
                  {rule.effect === 'escalate' ? 'escaló a la supervisora.' : 'aviso.'}{' '}
                  {rule.explanation}
                </li>
              ))}
            </ul>
          )}
          {procedure.qualification !== undefined && (
            <div className="qualification" data-testid="procedure-qualification">
              <p>
                <strong>Calificación: {procedure.qualification.severityName}</strong> (
                {formatDayDate(procedure.qualification.legalOn)}).{' '}
                {procedure.qualification.appeal !== undefined
                  ? `La persona se inconformó el ${formatDayDate(procedure.qualification.appeal.legalOn)}.`
                  : procedure.qualification.appealDueOn !== undefined
                    ? `Puede inconformarse hasta el ${formatDayDate(procedure.qualification.appealDueOn)}.`
                    : ''}
              </p>
              {procedure.qualification.appeal !== undefined && (
                <p>Motivos: «{procedure.qualification.appeal.reasons}»</p>
              )}
            </div>
          )}
          {procedure.closure !== undefined && (
            <div className="closure" data-testid="procedure-closure">
              <p>
                <strong>Cierre: {procedure.closure.reasonName}</strong> (
                {formatDayDate(procedure.closure.legalOn)}). Fundamento: «
                {procedure.closure.legalBasis}»
              </p>
              {procedure.closure.sanctionCheck !== undefined && (
                <VerificationResult
                  outcome={procedure.closure.sanctionCheck.outcome}
                  testId="procedure-sanction-check"
                >
                  <p>{procedure.closure.sanctionCheck.explanation}</p>
                  {procedure.closure.sanctionCheck.unverifiable && (
                    <p>
                      Señal «sanción no verificable»: el registro cubre a la institución, pasó el
                      plazo de publicación y no aparece.
                    </p>
                  )}
                </VerificationResult>
              )}
            </div>
          )}
        </>
      )}
      {actions.length === 0 ? (
        <p>Tu función no tiene acciones del trámite en este estado.</p>
      ) : (
        <>
          <SelectField
            id="procedure-action"
            label="Acción"
            value={action}
            onChange={(event) => setAction(event.target.value as ActionKey)}
            data-testid="procedure-action"
          >
            {actions.map((key) => (
              <option key={key} value={key}>
                {ACTION_LABELS[key]}
              </option>
            ))}
          </SelectField>
          {(action === 'route' || action === 'reassign') && (
            <SelectField
              id="procedure-authority"
              error={errors['procedure-authority']}
              label="Autoridad"
              value={authorityId}
              onChange={(event) => setAuthorityId(event.target.value)}
              data-testid="procedure-authority"
            >
              <option value="">Elige la autoridad</option>
              {targets.map((item) => (
                <option key={item.authorityId} value={item.authorityId}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          )}
          {action === 'advance_stage' && (
            <SelectField
              id="procedure-stage"
              error={errors['procedure-stage']}
              label="Etapa"
              value={stage}
              onChange={(event) => setStage(event.target.value as LegalStage)}
              data-testid="procedure-stage"
            >
              {stages.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          )}
          {action === 'advance_stage' && stage === 'qualification' && (
            <fieldset className="field qualification-fields" data-testid="qualification-fields">
              <legend>Calificación de la falta (LGRA, art. 100)</legend>
              <p className="field__hint">
                Si la calificas como no grave, se notifica a quien denunció y puede inconformarse en
                5 días hábiles (arts. 102 y 103). El auditor revisa el acuerdo.
              </p>
              <SelectField
                id="qualification-severity"
                label="Gravedad"
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value === 'non_serious' ? 'non_serious' : 'serious')
                }
                data-testid="qualification-severity"
              >
                <option value="serious">Falta grave</option>
                <option value="non_serious">Falta no grave</option>
              </SelectField>
              <TextAreaField
                id="qualification-legal-basis"
                error={errors['qualification-legal-basis']}
                label="Fundamento legal"
                hint="Al menos 20 caracteres. La persona denunciante lo verá."
                rows={2}
                maxLength={1000}
                value={legalBasis}
                onChange={(event) => setLegalBasis(event.target.value)}
                data-testid="qualification-legal-basis"
              />
              <TextAreaField
                id="qualification-agreement"
                error={errors['qualification-agreement']}
                label="Acuerdo de calificación en versión pública"
                hint="Al menos 50 caracteres, sin datos personales."
                rows={4}
                maxLength={20000}
                value={agreement}
                onChange={(event) => setAgreement(event.target.value)}
                data-testid="qualification-agreement"
              />
            </fieldset>
          )}
          {action === 'close' ? (
            <>
              <SelectField
                id="procedure-reason"
                label="Motivo de cierre"
                value={reason}
                onChange={(event) => setReason(ClosureReasonSchema.parse(event.target.value))}
                data-testid="procedure-reason"
              >
                {CLOSURE_REASONS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              <TextAreaField
                id="procedure-legal-basis"
                error={errors['procedure-legal-basis']}
                label="Fundamento legal"
                hint="Al menos 20 caracteres. La persona denunciante lo verá."
                rows={2}
                maxLength={1000}
                value={legalBasis}
                onChange={(event) => setLegalBasis(event.target.value)}
                data-testid="procedure-legal-basis"
              />
              <TextAreaField
                id="procedure-agreement"
                error={errors['procedure-agreement']}
                label="Acuerdo en versión pública"
                hint="Al menos 50 caracteres, sin datos personales. La persona y el auditor lo leerán."
                rows={5}
                maxLength={20000}
                value={agreement}
                onChange={(event) => setAgreement(event.target.value)}
                data-testid="procedure-agreement"
              />
              <div className="choice">
                <input
                  type="checkbox"
                  id="procedure-sanction"
                  checked={sanction.isDeclared}
                  onChange={(event) =>
                    setSanction((current) => ({ ...current, isDeclared: event.target.checked }))
                  }
                  data-testid="procedure-sanction"
                />
                <label htmlFor="procedure-sanction">
                  Declarar la sanción impuesta (se verificará contra el registro público)
                </label>
              </div>
              {sanction.isDeclared && (
                <fieldset className="field sanction-fields">
                  <legend>Sanción declarada</legend>
                  <p className="field__hint">
                    Solo lo confirmado en el registro público cuenta como sanción verificada. Si no
                    aparece, se informa «sin cobertura», nunca «falsa».
                  </p>
                  {(
                    [
                      ['fileNumber', 'Expediente de la resolución'],
                      ['personName', 'Persona sancionada'],
                      ['sanction', 'Sanción (por ejemplo, «Amonestación pública»)'],
                      ['institution', 'Institución de la persona'],
                      ['stateCode', 'Entidad (clave INEGI; 00 para lo federal)'],
                    ] as const
                  ).map(([field, label]) => (
                    <TextField
                      key={field}
                      id={`sanction-${field}`}
                      error={errors[`sanction-${field}`]}
                      label={label}
                      value={sanction[field]}
                      maxLength={field === 'institution' ? 300 : 200}
                      onChange={(event) =>
                        setSanction((current) => ({ ...current, [field]: event.target.value }))
                      }
                      data-testid={`sanction-${field}`}
                    />
                  ))}
                </fieldset>
              )}
            </>
          ) : (
            action !== '' && (
              <TextAreaField
                id="procedure-note"
                error={errors['procedure-note']}
                label={
                  action === 'reassign' || action === 'return'
                    ? 'Nota pública (obligatoria)'
                    : 'Nota pública (opcional)'
                }
                hint="La persona denunciante la leerá tal cual en su seguimiento."
                rows={2}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                data-testid="procedure-note"
              />
            )
          )}
          <button
            type="button"
            className="button"
            aria-disabled={isSaving ? true : undefined}
            onClick={() => void apply()}
            data-testid="apply-procedure"
          >
            {isSaving ? 'Guardando...' : 'Aplicar'}
          </button>
        </>
      )}
      <p
        id="procedure-message"
        tabIndex={-1}
        role="status"
        aria-live="polite"
        data-testid="procedure-message"
      >
        {message}
      </p>
    </section>
  );
}
