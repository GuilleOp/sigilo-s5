// Bandeja de la cuenta de operación del nodo (paso 3 del alta de autoridades): revisa cada
// solicitud, recalcula en este navegador la huella del candado y solo deja aprobar si coincide con
// la que la institución lee por teléfono. Al aprobar muestra la entrada propuesta del directorio.
// Esta cuenta nunca ve denuncias.
import { useCallback, useEffect, useState } from 'react';
import { findState } from '@sigilo/contracts';
import type { RegistrationView } from '@sigilo/contracts';
import { fromBase64Url, padlockFingerprint } from '@sigilo/core';
import { Alert } from '../../components/Alert.tsx';
import { TextAreaField, TextField } from '../../components/Field.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { OperationSession } from './authority-session.ts';

const STATUS_LABELS: Readonly<Record<RegistrationView['status'], string>> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

const FUNCTION_LABELS: Readonly<Record<string, string>> = {
  intake: 'recibe y turna',
  investigation: 'investiga',
  substantiation: 'substanciación y resolución',
  supervision: 'titular o supervisión',
};

const ROLE_LABELS: Readonly<Record<string, string>> = {
  investigating: 'Investiga faltas administrativas',
  supervisory: 'Supervisa a otras autoridades',
  prosecution: 'Fiscalía de hechos de corrupción',
};

/**
 * Huella calculada aquí a partir del candado recibido.
 * Seguridad: no se confía en una huella que mande el servidor; si alguien cambió el candado en el
 * camino, esta huella no coincidirá con la que lee la institución.
 */
function localFingerprint(view: RegistrationView): string {
  const { padlock } = view.request;
  return padlockFingerprint(
    fromBase64Url(padlock.boxPublicKey),
    fromBase64Url(padlock.signingPublicKey),
  );
}

/** Normaliza lo que se escribe al dictado: sin espacios ni mayúsculas. */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-f]/gu, '');
}

interface DetailProps {
  session: OperationSession;
  view: RegistrationView;
  onDecided: (view: RegistrationView) => void;
  onBack: () => void;
}

function RegistrationDetail({ session, view, onDecided, onBack }: DetailProps) {
  const [heard, setHeard] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setBusy] = useState(false);
  const fingerprint = localFingerprint(view);
  const matches = heard.trim() !== '' && compact(heard) === compact(fingerprint);
  const { request } = view;
  const place =
    request.stateCode === null
      ? 'Federal'
      : (findState(request.stateCode)?.name ?? request.stateCode);

  async function decide(decision: 'approve' | 'reject'): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const updated = await api.decideRegistration(
        session.token,
        view.requestId,
        decision === 'approve'
          ? { decision: 'approve', fingerprint }
          : { decision: 'reject', reason },
      );
      setConfirming(null);
      onDecided(updated);
      focusAfterRender('registration-detail-title');
    } catch (failure) {
      setError(describeError(failure, 'No se pudo guardar la decisión. Inténtalo de nuevo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="registration-detail-title" data-testid="registration-detail">
      <div className="actions">
        <button type="button" className="button button--secondary" onClick={onBack}>
          ← Volver a las solicitudes
        </button>
      </div>
      <h2 id="registration-detail-title" tabIndex={-1}>
        {request.institutionName}
      </h2>
      <p>
        Folio <span className="mono">{view.requestId}</span> · recibida el {view.receivedOn} ·{' '}
        <strong data-testid="registration-status">{STATUS_LABELS[view.status]}</strong>
      </p>
      <dl className="definition-list card">
        <dt>Qué hace</dt>
        <dd>{ROLE_LABELS[request.role]}</dd>
        <dt>Dónde</dt>
        <dd>
          {place} · orden {request.governmentLevel}
        </dd>
        <dt>Qué conoce</dt>
        <dd>{request.laws.join(' y ')}</dd>
        <dt>Quién solicita</dt>
        <dd>
          {request.applicant.fullName}, {request.applicant.position}. Nombramiento:{' '}
          {request.applicant.appointment}
        </dd>
        <dt>Cuentas que pide</dt>
        <dd>
          <ul>
            {request.people.map((person, index) => (
              <li key={index}>
                {person.fullName}:{' '}
                {person.functions.map((fn) => FUNCTION_LABELS[fn] ?? fn).join(' e ')}
              </li>
            ))}
          </ul>
        </dd>
      </dl>

      {view.status === 'pending' ? (
        <>
          <h3>1. Confirma la huella por teléfono</h3>
          <p>
            Llama a la institución a un número que obtengas por tu cuenta (no el de la solicitud) y
            pide que te lean su huella. Escríbela aquí. Solo si coincide con la que calcula tu
            navegador podrás aprobar.
          </p>
          <TextField
            id="registration-heard"
            label="Huella que te leyó la institución"
            hint="16 caracteres; los espacios no importan."
            value={heard}
            onChange={(event) => setHeard(event.target.value)}
            data-testid="registration-heard"
          />
          {heard.trim() !== '' && (
            <p
              className={matches ? 'field__ok' : 'field__error'}
              role="status"
              data-testid="registration-fingerprint-check"
            >
              {matches
                ? 'Coincide con la huella del candado recibido.'
                : 'No coincide. No apruebes: el candado pudo cambiar en el camino.'}
            </p>
          )}
          <h3>2. Decide</h3>
          {error && (
            <Alert tone="danger" title="No se guardó" role="alert">
              <p>{error}</p>
            </Alert>
          )}
          {confirming === null && (
            <div className="actions">
              <button
                type="button"
                className="button"
                disabled={!matches}
                onClick={() => setConfirming('approve')}
                data-testid="registration-approve"
              >
                Aprobar
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setConfirming('reject')}
                data-testid="registration-reject"
              >
                Rechazar
              </button>
            </div>
          )}
          {confirming === 'approve' && (
            <div className="card" role="group" aria-labelledby="confirm-approve-title">
              <p id="confirm-approve-title">
                <strong>¿Aprobar la solicitud de {request.institutionName}?</strong> Queda
                registrado con tu cuenta. Después habrá que agregarla al directorio y firmarlo.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  aria-disabled={isBusy ? true : undefined}
                  onClick={() => void decide('approve')}
                  data-testid="registration-approve-confirm"
                >
                  Sí, aprobar
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setConfirming(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {confirming === 'reject' && (
            <div className="card" role="group" aria-labelledby="confirm-reject-title">
              <p id="confirm-reject-title">
                <strong>Rechazar la solicitud.</strong> Escribe el motivo; queda registrado.
              </p>
              <TextAreaField
                id="registration-reason"
                label="Motivo del rechazo"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                data-testid="registration-reason"
              />
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  disabled={reason.trim().length < 5}
                  aria-disabled={isBusy ? true : undefined}
                  onClick={() => void decide('reject')}
                  data-testid="registration-reject-confirm"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setConfirming(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {view.decision && (
            <p>
              {STATUS_LABELS[view.status]} el {view.decision.on} por la cuenta{' '}
              <span className="mono">{view.decision.accountId}</span>
              {view.decision.reason ? `. Motivo: ${view.decision.reason}` : '.'}
            </p>
          )}
          {view.directoryEntry && (
            <section
              aria-labelledby="directory-entry-title"
              data-testid="registration-directory-entry"
            >
              <h3 id="directory-entry-title">Siguiente paso: agregarla al directorio</h3>
              <p>
                Esta es la entrada propuesta. Agrégala al directorio, fírmalo y pide a los testigos
                que lo cofirmen (guía para conectar un estado, sección 3). Después crea las cuentas
                de la lista.
              </p>
              <pre className="mono authority-padlock">
                {`${JSON.stringify(view.directoryEntry, null, 2)}\n`}
              </pre>
            </section>
          )}
        </>
      )}
    </section>
  );
}

interface OperationInboxProps {
  session: OperationSession;
  onLogout: () => void;
}

/** Bandeja «Solicitudes de alta». */
export function OperationInbox({ session, onLogout }: OperationInboxProps) {
  const [views, setViews] = useState<RegistrationView[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.listRegistrations(session.token).then(
      (list) => {
        setViews(list.registrations);
        setError('');
      },
      (failure: unknown) =>
        setError(describeError(failure, 'No pudimos cargar las solicitudes. Inténtalo de nuevo.')),
    );
  }, [session.token]);

  useEffect(() => load(), [load]);

  const current = views?.find((view) => view.requestId === selected) ?? null;
  return (
    <>
      <div className="actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            void api.logout(session.token).catch(() => undefined);
            onLogout();
          }}
          data-testid="authority-logout"
        >
          Cerrar sesión
        </button>
      </div>
      <Alert tone="info" title="Operación del nodo">
        <p>
          Revisas las solicitudes de alta de las instituciones. Esta cuenta no ve denuncias ni
          identidades.
        </p>
      </Alert>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {current !== null ? (
        <RegistrationDetail
          session={session}
          view={current}
          onBack={() => {
            setSelected(null);
            focusAfterRender('registration-list-title');
          }}
          onDecided={(updated) =>
            setViews(
              (list) =>
                list?.map((view) => (view.requestId === updated.requestId ? updated : view)) ??
                null,
            )
          }
        />
      ) : (
        <section aria-labelledby="registration-list-title">
          <h2 id="registration-list-title" tabIndex={-1}>
            Solicitudes de alta
          </h2>
          {views === null ? (
            <p>Cargando…</p>
          ) : views.length === 0 ? (
            <p>No hay solicitudes.</p>
          ) : (
            <ul className="registration-list" data-testid="registration-list">
              {views.map((view) => (
                <li key={view.requestId}>
                  <button
                    type="button"
                    className="registration-list__item"
                    onClick={() => {
                      setSelected(view.requestId);
                      focusAfterRender('registration-detail-title');
                    }}
                    data-testid="registration-item"
                  >
                    <strong>{view.request.institutionName}</strong>
                    <span>
                      {STATUS_LABELS[view.status]} · {view.receivedOn} ·{' '}
                      <span className="mono">{view.requestId}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
