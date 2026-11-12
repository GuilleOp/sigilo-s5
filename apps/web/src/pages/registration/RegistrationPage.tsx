// Pantalla /solicitar-alta (paso 1 del alta de autoridades): la institución pide su alta con su
// competencia, quien solicita, las personas que tendrán cuenta y su candado. Las llaves se crean
// aquí mismo; solo el candado viaja con la solicitud. Quien opera el nodo confirma la huella por
// teléfono antes de aprobar (paso 3, bandeja de operación). En la ventanilla única la solicitud va
// al nodo de la entidad de la institución, según su tabla de funciones; en un solo nodo, a este.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { RegistrationRequestSchema, STATES } from '@sigilo/contracts';
import type {
  AuthorityFunction,
  RegistrationReceipt,
  RegistrationRequest,
} from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { ErrorSummary } from '../../components/ErrorSummary.tsx';
import { SelectField, TextField } from '../../components/Field.tsx';
import { WEB_PROFILE } from '../../config/app-config.ts';
import type { GeneratedAuthorityKeys } from '../../crypto/authority-keygen.ts';
import { createProofProvider, sendWithProof, workerPowSolver } from '../../crypto/proof-of-work.ts';
import { announce } from '../../lib/announce.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { networkState } from '../../network/directory.ts';
import { createNodeRegistrationApi, nodeForJurisdiction } from '../../network/ventanilla-api.ts';
import type { NodeRegistrationApi } from '../../network/ventanilla-api.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { FieldErrors } from '../../state/report-validation.ts';
import { AuthorityKeyGenerator } from '../authority/CreateAuthorityKeys.tsx';

type Role = RegistrationRequest['role'];
type Level = RegistrationRequest['governmentLevel'];

/** Funciones que se pueden pedir para una persona, con su nombre llano. */
const FUNCTION_SETS: readonly { value: string; label: string; functions: AuthorityFunction[] }[] = [
  {
    value: 'intake-investigation',
    label: 'Recibe e investiga',
    functions: ['intake', 'investigation'],
  },
  { value: 'intake', label: 'Solo recibe y turna', functions: ['intake'] },
  { value: 'investigation', label: 'Solo investiga', functions: ['investigation'] },
  {
    value: 'substantiation',
    label: 'Substanciación y resolución',
    functions: ['substantiation'],
  },
  { value: 'supervision', label: 'Titular o supervisión', functions: ['supervision'] },
];

const ROLES: readonly { value: Role; label: string }[] = [
  { value: 'investigating', label: 'Investiga faltas administrativas (OIC o contraloría)' },
  { value: 'supervisory', label: 'Supervisa a otras autoridades' },
  { value: 'prosecution', label: 'Fiscalía de hechos de corrupción' },
];

const LEVELS: readonly { value: Level; label: string }[] = [
  { value: 'estatal', label: 'Estatal' },
  { value: 'municipal', label: 'Municipal' },
  { value: 'federal', label: 'Federal' },
];

interface Person {
  fullName: string;
  set: string;
}

interface Form {
  institutionName: string;
  stateCode: string;
  governmentLevel: Level;
  role: Role;
  laws: { LGRA: boolean; CPF: boolean };
  applicantName: string;
  position: string;
  appointment: string;
  people: Person[];
}

const EMPTY: Form = {
  institutionName: '',
  stateCode: '',
  governmentLevel: 'estatal',
  role: 'investigating',
  laws: { LGRA: true, CPF: false },
  applicantName: '',
  position: '',
  appointment: '',
  people: [{ fullName: '', set: 'intake-investigation' }],
};

const MAX_PEOPLE = 12;

/** Campo del DOM de cada clave de error, para el resumen de errores. */
const FIELD_IDS: Readonly<Record<string, string>> = {
  institutionName: 'registration-institution',
  stateCode: 'registration-state',
  laws: 'registration-law-LGRA',
  applicantName: 'registration-applicant',
  position: 'registration-position',
  appointment: 'registration-appointment',
  people: 'registration-person-0',
  padlock: 'registration-keys',
};

function validate(form: Form, keys: GeneratedAuthorityKeys | null): FieldErrors {
  const errors: FieldErrors = {};
  const short = (value: string) => value.trim().length < 2;
  if (short(form.institutionName)) errors.institutionName = 'Escribe el nombre oficial.';
  if (form.governmentLevel !== 'federal' && form.stateCode === '') {
    errors.stateCode = 'Elige la entidad.';
  }
  if (!form.laws.LGRA && !form.laws.CPF) errors.laws = 'Elige al menos una ley.';
  if (short(form.applicantName)) errors.applicantName = 'Escribe tu nombre.';
  if (short(form.position)) errors.position = 'Escribe tu cargo.';
  if (short(form.appointment)) errors.appointment = 'Escribe el número y la fecha del oficio.';
  if (form.people.some((person) => short(person.fullName))) {
    errors.people = 'Escribe el nombre de cada persona que tendrá cuenta.';
  }
  if (keys === null) errors.padlock = 'Crea las llaves de tu institución.';
  return errors;
}

const NO_NODE =
  'Tu entidad todavía no tiene nodo en la red. Primero tu estado debe montar su nodo y declarar su tabla de funciones (guía «Conecta tu estado»); después podrás pedir el alta aquí.';
const NO_DIRECTORY =
  'No pudimos comprobar el directorio firmado de la red, así que no sabemos a qué nodo enviar tu solicitud. Inténtalo más tarde.';

/** Error con un motivo que se muestra tal cual. */
class RegistrationTargetError extends Error {}

/**
 * Operaciones de alta: las de este mismo nodo o, en la ventanilla única, las del nodo de la entidad
 * de la institución. Lanza `RegistrationTargetError` si la entidad no tiene nodo o el directorio no
 * verifica.
 */
async function registrationTarget(request: RegistrationRequest): Promise<NodeRegistrationApi> {
  if (WEB_PROFILE !== 'ventanilla') {
    return {
      getPowChallenge: () => api.getPowChallenge('registration'),
      submitRegistration: (body, proof) => api.submitRegistration(body, proof),
    };
  }
  const state = await networkState();
  if (state.kind !== 'verified') throw new RegistrationTargetError(NO_DIRECTORY);
  const node = nodeForJurisdiction(state.directory, request.stateCode);
  if (node === null) throw new RegistrationTargetError(NO_NODE);
  return createNodeRegistrationApi(node.id);
}

function toRequest(form: Form, keys: GeneratedAuthorityKeys): RegistrationRequest {
  return RegistrationRequestSchema.parse({
    institutionName: form.institutionName,
    stateCode: form.governmentLevel === 'federal' ? null : form.stateCode,
    governmentLevel: form.governmentLevel,
    role: form.role,
    laws: (['LGRA', 'CPF'] as const).filter((law) => form.laws[law]),
    supervisorId: null,
    applicant: {
      fullName: form.applicantName,
      position: form.position,
      appointment: form.appointment,
    },
    people: form.people.map((person) => ({
      fullName: person.fullName,
      functions: FUNCTION_SETS.find((set) => set.value === person.set)?.functions ?? ['intake'],
    })),
    // Seguridad: solo el candado (llaves públicas); la privada nunca sale de este navegador.
    padlock: keys.padlock,
  });
}

/** Solicitud de alta de una institución. */
export function RegistrationPage() {
  useDocumentTitle('Solicitar alta de mi institución');
  const [form, setForm] = useState<Form>(EMPTY);
  const [keys, setKeys] = useState<GeneratedAuthorityKeys | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState('');
  const [status, setStatus] = useState('');
  const [isBusy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<RegistrationReceipt | null>(null);

  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
  const updatePerson = (index: number, patch: Partial<Person>) =>
    update({
      people: form.people.map((person, at) => (at === index ? { ...person, ...patch } : person)),
    });

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (isBusy) return;
    const found = validate(form, keys);
    setErrors(found);
    setAttempt((value) => value + 1);
    setFailure('');
    if (Object.keys(found).length > 0 || keys === null) return;
    setBusy(true);
    try {
      const request = toRequest(form, keys);
      const target = await registrationTarget(request);
      const proofs = createProofProvider(target, 'registration', workerPowSolver, setStatus);
      const result = await sendWithProof(proofs, (proof) =>
        target.submitRegistration(request, proof),
      );
      setReceipt(result);
      announce('Solicitud enviada.');
      focusAfterRender('registration-done');
    } catch (error) {
      setFailure(
        error instanceof RegistrationTargetError
          ? error.message
          : describeError(error, 'No pudimos enviar la solicitud. Inténtalo de nuevo.'),
      );
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  if (receipt !== null) {
    return (
      <>
        <h1 id="registration-done" tabIndex={-1}>
          Solicitud enviada
        </h1>
        <Alert tone="info" title="Guarda este folio">
          <p>
            Folio:{' '}
            <strong className="mono" data-testid="registration-folio">
              {receipt.requestId}
            </strong>
          </p>
        </Alert>
        <p>
          Quien opera {WEB_PROFILE === 'ventanilla' ? 'el nodo de tu estado' : 'este nodo'} revisará
          tu nombramiento y te llamará por teléfono. Lean juntos esta huella; solo si coincide se
          aprueba la solicitud:
        </p>
        <p className="registration__fingerprint">
          <strong className="mono" data-testid="registration-fingerprint">
            {receipt.fingerprint}
          </strong>
        </p>
        <p>
          <strong>Nunca te pediremos tu llave privada.</strong> Si alguien te la pide, no la
          compartas.
        </p>
        <p>
          Después de aprobar, tu institución se agrega al directorio firmado de la red y se crean
          las cuentas. Entonces cada persona entra al panel con su usuario y el archivo de llave que
          descargaste.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Solicitar alta de mi institución</h1>
      <p className="lead">
        Para recibir denuncias en la red, tu institución necesita estar en el directorio firmado y
        tener cuentas en el panel. Llena esta solicitud; quien opera el nodo la revisa y te llama
        para confirmarla.
      </p>
      <form onSubmit={(event) => void submit(event)} noValidate data-testid="registration-form">
        <ErrorSummary errors={errors} fieldIds={FIELD_IDS} attempt={attempt} />
        {failure && (
          <Alert tone="danger" title="No se envió la solicitud" role="alert">
            <p>{failure}</p>
          </Alert>
        )}

        <fieldset>
          <legend>Tu institución</legend>
          <TextField
            id="registration-institution"
            label="Nombre oficial"
            required
            value={form.institutionName}
            error={errors.institutionName}
            onChange={(event) => update({ institutionName: event.target.value })}
            data-testid="registration-institution"
          />
          <SelectField
            id="registration-level"
            label="Orden de gobierno"
            value={form.governmentLevel}
            onChange={(event) => update({ governmentLevel: event.target.value as Level })}
            data-testid="registration-level"
          >
            {LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </SelectField>
          {form.governmentLevel !== 'federal' && (
            <SelectField
              id="registration-state"
              label="Entidad"
              required
              value={form.stateCode}
              error={errors.stateCode}
              onChange={(event) => update({ stateCode: event.target.value })}
              data-testid="registration-state"
            >
              <option value="">Elige la entidad</option>
              {STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </SelectField>
          )}
          <fieldset className="field">
            <legend>¿Qué hace?</legend>
            <div className="choice-list">
              {ROLES.map((role) => (
                <div key={role.value} className="choice">
                  <input
                    type="radio"
                    id={`registration-role-${role.value}`}
                    name="registration-role"
                    checked={form.role === role.value}
                    onChange={() => update({ role: role.value })}
                  />
                  <label htmlFor={`registration-role-${role.value}`}>{role.label}</label>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset
            className="field"
            aria-describedby={errors.laws ? 'registration-laws-error' : undefined}
          >
            <legend>¿Qué conoce?</legend>
            <div className="choice-list">
              {(
                [
                  [
                    'LGRA',
                    'Faltas administrativas (Ley General de Responsabilidades Administrativas)',
                  ],
                  ['CPF', 'Delitos por hechos de corrupción (Código Penal Federal)'],
                ] as const
              ).map(([law, label]) => (
                <div key={law} className="choice">
                  <input
                    type="checkbox"
                    id={`registration-law-${law}`}
                    checked={form.laws[law]}
                    onChange={(event) =>
                      update({ laws: { ...form.laws, [law]: event.target.checked } })
                    }
                  />
                  <label htmlFor={`registration-law-${law}`}>{label}</label>
                </div>
              ))}
            </div>
            {errors.laws && (
              <p id="registration-laws-error" className="field__error">
                Error: {errors.laws}
              </p>
            )}
          </fieldset>
        </fieldset>

        <fieldset>
          <legend>Quién solicita</legend>
          <TextField
            id="registration-applicant"
            label="Tu nombre"
            required
            value={form.applicantName}
            error={errors.applicantName}
            onChange={(event) => update({ applicantName: event.target.value })}
            data-testid="registration-applicant"
          />
          <TextField
            id="registration-position"
            label="Tu cargo"
            required
            value={form.position}
            error={errors.position}
            onChange={(event) => update({ position: event.target.value })}
            data-testid="registration-position"
          />
          <TextField
            id="registration-appointment"
            label="Oficio de nombramiento (número y fecha)"
            hint="Por ejemplo: Oficio SC/001/2026 del 2 de enero de 2026."
            required
            value={form.appointment}
            error={errors.appointment}
            onChange={(event) => update({ appointment: event.target.value })}
            data-testid="registration-appointment"
          />
        </fieldset>

        <fieldset>
          <legend>Personas que tendrán cuenta</legend>
          <p className="field__hint">
            Cada persona tendrá su propia cuenta. La LGRA pide que quien substancia y resuelve no
            sea quien investiga (art. 115).
          </p>
          {errors.people && (
            <p className="field__error" id="registration-people-error">
              Error: {errors.people}
            </p>
          )}
          {form.people.map((person, index) => (
            <div key={index} className="registration__person" data-testid="registration-person">
              <TextField
                id={`registration-person-${index}`}
                label={`Persona ${index + 1}: nombre`}
                required
                value={person.fullName}
                onChange={(event) => updatePerson(index, { fullName: event.target.value })}
              />
              <SelectField
                id={`registration-person-${index}-functions`}
                label={`Persona ${index + 1}: qué hará`}
                value={person.set}
                onChange={(event) => updatePerson(index, { set: event.target.value })}
              >
                {FUNCTION_SETS.map((set) => (
                  <option key={set.value} value={set.value}>
                    {set.label}
                  </option>
                ))}
              </SelectField>
              {form.people.length > 1 && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => update({ people: form.people.filter((_, at) => at !== index) })}
                >
                  Quitar a la persona {index + 1}
                </button>
              )}
            </div>
          ))}
          {form.people.length < MAX_PEOPLE && (
            <div className="actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  update({
                    people: [...form.people, { fullName: '', set: 'intake-investigation' }],
                  });
                  focusAfterRender(`registration-person-${form.people.length}`);
                }}
                data-testid="registration-add-person"
              >
                Agregar otra persona
              </button>
            </div>
          )}
        </fieldset>

        <section aria-labelledby="registration-keys" className="card">
          <h2 id="registration-keys" tabIndex={-1}>
            Las llaves de tu institución
          </h2>
          <p>
            Se crean aquí, en tu navegador. La <strong>llave privada</strong> se descarga a tu
            equipo y no se envía: con ella tu institución abrirá lo que le manden. El{' '}
            <strong>candado</strong> (la llave pública) viaja con esta solicitud.
          </p>
          <AuthorityKeyGenerator
            onGenerated={(generated) => {
              setKeys(generated);
              setErrors(({ padlock: _ignored, ...rest }) => rest);
            }}
            padlockStep="Este candado se adjunta solo a tu solicitud."
            closing="Guarda también esta huella: te la pedirán por teléfono."
          />
          {errors.padlock && <p className="field__error">Error: {errors.padlock}</p>}
        </section>

        {status && (
          <p role="status" className="field__hint">
            {status}
          </p>
        )}
        <div className="actions">
          <button
            type="submit"
            className="button"
            aria-disabled={isBusy ? true : undefined}
            data-testid="registration-submit"
          >
            {isBusy ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </form>
    </>
  );
}
