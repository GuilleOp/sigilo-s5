// Corroboración ciega opcional: la persona puede indicar el contrato, el RFC del proveedor o la
// persona servidora pública para que su denuncia sume con otras que, por separado, señalan lo
// mismo. Se presenta por su beneficio (más prioridad) y el «cómo» queda plegado; el dato nunca
// sale del navegador en claro.
import { TextField } from '../../../components/Field.tsx';
import { identifierFromDraft } from '../../../corroboration/blind-corroboration.ts';
import { useNetworkState } from '../../../network/use-network-state.ts';
import { reportDraftStore } from '../../../state/report-draft.ts';
import type { CorroborationDraft, CorroborationKindDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';

interface CorroborationFieldsProps {
  corroboration: CorroborationDraft;
  entityId: string;
  errors: FieldErrors;
}

const KINDS: readonly { value: CorroborationKindDraft; label: string }[] = [
  { value: '', label: 'No, gracias' },
  { value: 'ocid', label: 'Un contrato o compra de gobierno' },
  { value: 'rfc', label: 'Una empresa (por su RFC)' },
  { value: 'servidor', label: 'La persona servidora pública que denuncias' },
];

function setCorroboration(patch: Partial<CorroborationDraft>): void {
  reportDraftStore.set((draft) => ({
    ...draft,
    corroboration: { ...draft.corroboration, ...patch },
  }));
}

/** Campos de la corroboración ciega, dentro del paso de pruebas. */
export function CorroborationFields({ corroboration, entityId, errors }: CorroborationFieldsProps) {
  const network = useNetworkState();
  const isAvailable = network.kind === 'verified' && network.directory.corroboration !== undefined;
  const checked = identifierFromDraft(corroboration, entityId);
  const typed = corroboration.value !== '' || corroboration.personName !== '';
  const error =
    errors['corroboration-value'] ??
    errors['corroboration-person'] ??
    (checked !== null && 'error' in checked && typed ? checked.error : undefined);
  return (
    <section
      className="card corroboration"
      aria-labelledby="corroboration-title"
      data-testid="corroboration-fields"
    >
      <h3 id="corroboration-title">Haz que tu denuncia sume con otras (opcional)</h3>
      <p>
        Si otras personas, por separado, ya denunciaron el mismo contrato, empresa o persona, la
        autoridad verá que no es un caso aislado y le dará más prioridad. Nunca sabrá quiénes son.
      </p>
      <details className="corroboration__explain">
        <summary>¿Cómo se hace sin revelar nada?</summary>
        <ul>
          <li>
            Tu navegador convierte el dato que elijas en un código que no se puede revertir. Ese
            código, y no el dato, es lo que se busca entre otras denuncias.
          </li>
          <li>Nadie recibe el dato en claro: ni los servicios que buscan, ni la red.</li>
          <li>
            Tu nombre, tu relato y tus pruebas no se usan para buscar. Del relato solo viaja, bajo
            llave, un resumen para notar si dos denuncias las escribió la misma persona.
          </li>
          <li>
            La autoridad solo ve cuántas personas señalan lo mismo. Eso puede subir la prioridad;
            nunca hace que descarten tu denuncia.
          </li>
        </ul>
      </details>
      {!isAvailable ? (
        <p data-testid="corroboration-unavailable">
          {network.kind === 'loading'
            ? 'Revisando si este sistema puede buscar denuncias iguales.'
            : 'Este sistema no tiene activada la búsqueda de denuncias iguales. Tu denuncia se envía igual.'}
        </p>
      ) : (
        <>
          <fieldset className="field">
            <legend>¿Con qué dato buscamos denuncias iguales?</legend>
            <div className="choice-list">
              {KINDS.map((kind) => (
                <div key={kind.value || 'none'} className="choice">
                  <input
                    type="radio"
                    id={`corroboration-${kind.value || 'none'}`}
                    name="corroboration-kind"
                    checked={corroboration.kind === kind.value}
                    onChange={() => setCorroboration({ kind: kind.value })}
                    data-testid={`corroboration-${kind.value || 'none'}`}
                  />
                  <label htmlFor={`corroboration-${kind.value || 'none'}`}>{kind.label}</label>
                </div>
              ))}
            </div>
          </fieldset>
          {(corroboration.kind === 'ocid' || corroboration.kind === 'rfc') && (
            <TextField
              id="corroboration-value"
              label={
                corroboration.kind === 'ocid'
                  ? 'Identificador del procedimiento (empieza con «ocds-»)'
                  : 'RFC de la empresa'
              }
              hint={
                corroboration.kind === 'ocid'
                  ? 'Aparece en los portales de compras públicas.'
                  : '12 caracteres para empresas.'
              }
              value={corroboration.value}
              maxLength={240}
              error={error}
              onChange={(event) => setCorroboration({ value: event.target.value })}
              data-testid="corroboration-value"
            />
          )}
          {corroboration.kind === 'servidor' && (
            <TextField
              id="corroboration-person"
              label="Nombre y apellido de la persona servidora pública"
              hint="Escríbelo completo, como aparece en documentos oficiales. Se busca junto con la oficina que elegiste; si alguien lo escribió distinto, no se junta."
              value={corroboration.personName}
              maxLength={200}
              error={error}
              onChange={(event) => setCorroboration({ personName: event.target.value })}
              data-testid="corroboration-person"
            />
          )}
        </>
      )}
    </section>
  );
}
