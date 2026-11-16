// Regla de los recursos federales en entes locales (B10): la autoridad marca si la denuncia
// involucra aportaciones o convenios federales; el panel muestra las autoridades federales
// competentes (ASF, SABG y la Fiscalía Anticorrupción de la FGR) con su fundamento y ofrece dar el
// aviso (Ley de Coordinación Fiscal, art. 49) y turnar al otro nodo. En el nodo Federal, con un ente
// estatal o municipal, guía hacia el nodo del estado. Solo guía: no decide la competencia.
import { useRef, useState } from 'react';
import { FEDERAL_FUNDS_RULE, formatLegalReference, hasAnyFunction } from '@sigilo/contracts';
import type { ComplaintDetail, FederalFunding } from '@sigilo/contracts';
import { SelectField, TextAreaField } from '../../components/Field.tsx';
import { announce } from '../../lib/announce.ts';
import { formatDayDate } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface FederalFundsPanelProps {
  session: AuthoritySession;
  detail: ComplaintDetail;
  onChanged: () => Promise<unknown>;
}

type Recipient = 'asf' | 'sabg' | 'fgr';

const DEFAULT_NOTICE_BASIS =
  'Ley de Coordinación Fiscal, art. 49: aviso inmediato por posible desvío de recursos federales.';

/** Panel de recursos federales. */
export function FederalFundsPanel({ session, detail, onChanged }: FederalFundsPanelProps) {
  const federal = detail.procedure?.federalFunds;
  const canAct =
    hasAnyFunction(session.account, ['intake', 'investigation']) &&
    detail.summary.managementState !== 'closed';
  const [funding, setFunding] = useState<FederalFunding>('aportaciones');
  const [recipients, setRecipients] = useState<Recipient[]>(['asf', 'sabg']);
  const [basis, setBasis] = useState(DEFAULT_NOTICE_BASIS);
  const [message, setMessage] = useState('');
  const isSaving = useRef(false);
  // Ente estatal o municipal: en el nodo Federal, la parte local va al nodo del estado.
  const isLocalEntity = detail.facts.stateCode !== '00';

  async function send(request: Parameters<typeof api.applyProcedure>[2]): Promise<void> {
    if (isSaving.current) return;
    isSaving.current = true;
    try {
      await api.applyProcedure(session.token, detail.summary.folio, request);
      setMessage('Listo.');
      announce('Listo.');
      await onChanged();
    } catch (failure) {
      setMessage(describeError(failure, 'No pudimos guardar. Inténtalo de nuevo.'));
    } finally {
      isSaving.current = false;
    }
  }

  return (
    <section className="card" aria-labelledby="federal-funds-title" data-testid="federal-funds">
      <h3 id="federal-funds-title">Recursos federales</h3>
      {federal === undefined ? (
        <>
          <p>{FEDERAL_FUNDS_RULE.question}</p>
          <p className="field__hint">{FEDERAL_FUNDS_RULE.transfer}</p>
          {isLocalEntity && (
            <p className="field__hint" data-testid="federal-funds-toward-state">
              {FEDERAL_FUNDS_RULE.towardState}
            </p>
          )}
          {canAct && (
            <>
              <SelectField
                id="federal-funding"
                label="Origen del dinero"
                value={funding}
                onChange={(event) =>
                  setFunding(
                    event.target.value === 'convenio_federal' ? 'convenio_federal' : 'aportaciones',
                  )
                }
                data-testid="federal-funding"
              >
                {FEDERAL_FUNDS_RULE.fundings.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void send({ action: 'flag_federal_funds', funding })}
                data-testid="federal-funds-flag"
              >
                Marcar: involucra recursos federales
              </button>
            </>
          )}
        </>
      ) : (
        <div data-testid="federal-funds-guidance">
          <p>
            <strong>Involucra recursos federales: {federal.fundingName}</strong> (marcado el{' '}
            {formatDayDate(federal.flaggedOn)}). Las responsabilidades por esos recursos las
            determinan las autoridades federales (Ley de Coordinación Fiscal, art. 49).
          </p>
          <ul data-testid="federal-authorities">
            {FEDERAL_FUNDS_RULE.authorities.map((authority) => (
              <li key={authority.key}>
                <strong>{authority.name}</strong>: {authority.role} (
                {authority.legalBasis.map(formatLegalReference).join('; ')})
              </li>
            ))}
          </ul>
          <p>{FEDERAL_FUNDS_RULE.notice}</p>
          <p data-testid="federal-funds-transfer">{FEDERAL_FUNDS_RULE.transfer}</p>
          {federal.noticeSentOn !== undefined ? (
            <p data-testid="federal-notice-sent">
              Se dio aviso el {formatDayDate(federal.noticeSentOn)}.
            </p>
          ) : (
            canAct && (
              <fieldset className="field">
                <legend>Dar vista o aviso a las autoridades federales</legend>
                {FEDERAL_FUNDS_RULE.authorities.map((authority) => (
                  <div className="choice" key={authority.key}>
                    <input
                      type="checkbox"
                      id={`federal-recipient-${authority.key}`}
                      checked={recipients.includes(authority.key)}
                      onChange={(event) =>
                        setRecipients((list) =>
                          event.target.checked
                            ? [...list, authority.key]
                            : list.filter((item) => item !== authority.key),
                        )
                      }
                      data-testid={`federal-recipient-${authority.key}`}
                    />
                    <label htmlFor={`federal-recipient-${authority.key}`}>{authority.name}</label>
                  </div>
                ))}
                <TextAreaField
                  id="federal-notice-basis"
                  label="Fundamento"
                  rows={2}
                  maxLength={1000}
                  value={basis}
                  onChange={(event) => setBasis(event.target.value)}
                  data-testid="federal-notice-basis"
                />
                <button
                  type="button"
                  className="button button--secondary"
                  aria-disabled={recipients.length === 0 ? true : undefined}
                  onClick={() => {
                    if (recipients.length === 0 || basis.trim().length < 20) {
                      setMessage(
                        'Elige a quién avisar y escribe el fundamento (al menos 20 caracteres).',
                      );
                      return;
                    }
                    void send({
                      action: 'send_federal_notice',
                      recipients,
                      legalBasis: basis.trim(),
                    });
                  }}
                  data-testid="federal-notice-send"
                >
                  Dar vista
                </button>
              </fieldset>
            )
          )}
        </div>
      )}
      <p role="status" aria-live="polite" data-testid="federal-funds-message">
        {message}
      </p>
    </section>
  );
}
