// Corroboración ciega opcional: la persona puede indicar el contrato, el RFC del proveedor o la
// persona servidora pública para saber si otras personas, por separado, denunciaron lo mismo. Se
// explica qué se compara y qué no; el dato nunca sale del navegador en claro.
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
  { value: 'ocid', label: 'El contrato o procedimiento de compra' },
  { value: 'rfc', label: 'La empresa proveedora (por su RFC)' },
  { value: 'servidor', label: 'La persona servidora pública denunciada' },
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
      <h3 id="corroboration-title">¿Otras personas denunciaron lo mismo? (opcional)</h3>
      <details className="corroboration__explain">
        <summary>Qué se compara y qué no</summary>
        <ul>
          <li>
            Se compara solo el dato que elijas (un contrato, una empresa o una persona servidora
            pública), convertido en tu navegador en una «huella» que no se puede revertir.
          </li>
          <li>
            Nadie recibe el dato en claro: ni el servicio que calcula la huella, ni el que la
            compara, ni la red.
          </li>
          <li>
            No se compara tu nombre, tu relato completo ni tus pruebas. Del relato solo viaja, bajo
            llave, un resumen que sirve para notar si dos denuncias parecen escritas por la misma
            persona.
          </li>
          <li>
            Si coincide con otras denuncias independientes, la autoridad ve cuántas personas
            coinciden, nunca quiénes son. Solo puede subir la prioridad; nunca descarta tu denuncia.
          </li>
        </ul>
      </details>
      {!isAvailable ? (
        <p data-testid="corroboration-unavailable">
          {network.kind === 'loading'
            ? 'Revisando si esta red ofrece la comparación.'
            : 'Esta comparación no está disponible en este sistema. Tu denuncia se envía igual.'}
        </p>
      ) : (
        <>
          <fieldset className="field">
            <legend>¿Qué quieres comparar?</legend>
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
              hint="Se compara junto con la oficina que elegiste. Variantes del nombre no coinciden."
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
