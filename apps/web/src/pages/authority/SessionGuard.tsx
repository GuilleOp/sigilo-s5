// Vencimiento de la sesión del panel (H2, WCAG 2.2.1): dos minutos antes de vencer por inactividad
// avisa con un diálogo de alerta y «Seguir conectada», que renueva la sesión con la petición
// autenticada más ligera. Si la sesión ya venció, pide la contraseña (y el código del segundo
// factor, si la cuenta lo tiene) otra vez sin desmontar el panel: lo que la persona escribió sigue
// ahí.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { SESSION_IDLE_TIMEOUT_SECONDS } from '@sigilo/contracts';
import { TextField } from '../../components/Field.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import {
  lastAuthorityActivity,
  markAuthorityActivity,
  onSessionExpired,
} from '../../services/session-activity.ts';
import type { AuthoritySession } from './authority-session.ts';
import { MfaCodeForm } from './MfaSteps.tsx';

/** Segundos antes del vencimiento en que se avisa. */
export const SESSION_WARNING_SECONDS = 2 * 60;

/** Cada cuánto se revisa el reloj de inactividad. */
const CHECK_INTERVAL_MS = 5_000;

type GuardState = 'active' | 'warning' | 'expired';

interface SessionGuardProps {
  session: AuthoritySession;
  /** Nueva sesión tras volver a entrar (mismas llaves, otro token). */
  onRenewed: (session: AuthoritySession) => void;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
}

/** Aviso de vencimiento y nuevo acceso. */
export function SessionGuard({ session, onRenewed, now = Date.now }: SessionGuardProps) {
  const [state, setState] = useState<GuardState>('active');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  /** Reto del segundo factor al volver a entrar, si la cuenta lo tiene. */
  const [challenge, setChallenge] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    markAuthorityActivity(now());
    const timer = setInterval(() => {
      const idleSeconds = (now() - lastAuthorityActivity()) / 1000;
      if (idleSeconds >= SESSION_IDLE_TIMEOUT_SECONDS) setState('expired');
      else if (idleSeconds >= SESSION_IDLE_TIMEOUT_SECONDS - SESSION_WARNING_SECONDS) {
        setState((current) => (current === 'active' ? 'warning' : current));
      }
    }, CHECK_INTERVAL_MS);
    const stop = onSessionExpired(() => setState('expired'));
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [session.token, now]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (state === 'warning' && !dialog.open) dialog.showModal();
    if (state !== 'warning' && dialog.open) dialog.close();
    if (state === 'expired') focusAfterRender('session-expired-title');
  }, [state]);

  async function stayConnected(): Promise<void> {
    try {
      await api.getSession(session.token);
      setState('active');
    } catch {
      // Si ya venció, el cliente avisa (`onSessionExpired`) y se pide entrar de nuevo.
      setState('expired');
    }
  }

  async function relogin(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    try {
      const result = await api.login(username.trim(), password);
      setPassword('');
      if (result.step === 'code') {
        setChallenge(result.challenge);
        return;
      }
      if (result.step === 'enroll') {
        // La verificación en dos pasos se reinició: se inscribe desde la entrada del panel.
        void api.logout(result.token).catch(() => undefined);
        setError(
          'Tu cuenta debe activar de nuevo la verificación en dos pasos. Sal del panel y vuelve a entrar.',
        );
        return;
      }
      renew(result);
    } catch (failure) {
      setError(describeError(failure, 'No pudimos abrir tu sesión. Inténtalo de nuevo.'));
      focusAfterRender('relogin-username');
    }
  }

  function renew(renewed: { token: string; account: AuthoritySession['account'] }): void {
    setChallenge(null);
    setError('');
    setState('active');
    onRenewed({ token: renewed.token, account: renewed.account, keys: session.keys });
  }

  async function submitCode(code: string): Promise<void> {
    if (challenge === null) return;
    setBusy(true);
    setError('');
    try {
      renew(await api.loginCode(challenge, code));
    } catch (failure) {
      setError(
        describeError(
          failure,
          'El código no es válido o ya se usó, o el usuario o la contraseña no coinciden.',
        ),
      );
      focusAfterRender('relogin-code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby="session-warning-title"
        aria-describedby="session-warning-text"
        className="dialog session-dialog"
        data-testid="session-warning"
        onCancel={(event) => {
          // Esc no debe cerrar el aviso sin decidir: la sesión vencería sin que se note.
          event.preventDefault();
        }}
      >
        <h2 id="session-warning-title">Tu sesión está por cerrarse</h2>
        <p id="session-warning-text">
          Por seguridad, la sesión del panel se cierra tras 15 minutos sin actividad. Quedan unos 2
          minutos. ¿Quieres seguir conectada?
        </p>
        <button
          type="button"
          className="button"
          onClick={() => void stayConnected()}
          data-testid="session-stay"
        >
          Seguir conectada
        </button>
      </dialog>
      {state === 'expired' && (
        <section
          className="card session-expired"
          aria-labelledby="session-expired-title"
          data-testid="session-expired"
        >
          <h2 id="session-expired-title" tabIndex={-1}>
            Tu sesión se cerró por inactividad
          </h2>
          <p>Vuelve a entrar. Lo que escribiste sigue aquí.</p>
          {challenge !== null ? (
            <MfaCodeForm
              idPrefix="relogin"
              error={error}
              isBusy={isBusy}
              onSubmit={(code) => void submitCode(code)}
              onRestart={() => {
                setChallenge(null);
                setError('');
                focusAfterRender('relogin-username');
              }}
            />
          ) : (
            <form onSubmit={(event) => void relogin(event)} noValidate>
              <TextField
                id="relogin-username"
                label="Usuario"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                data-testid="relogin-username"
              />
              <TextField
                id="relogin-password"
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                value={password}
                error={error || undefined}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="relogin-password"
              />
              <button type="submit" className="button" data-testid="relogin-submit">
                Volver a entrar
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
