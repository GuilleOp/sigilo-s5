// Acceso al panel: cuenta individual (usuario y contraseña, y el código del segundo factor si la
// cuenta lo tiene) e importación local de la llave de su autoridad (la propia del directorio
// firmado en la red; la del buzón del nodo con un solo nodo). Una cuenta que debe tener segundo
// factor y aún no lo inscribe lo inscribe aquí antes de ver el panel.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { hasFunction } from '@sigilo/contracts';
import type { AuthorityAccountView, LoginSessionStep, MfaEnrollment } from '@sigilo/contracts';
import { PATHS } from '../../app/paths.ts';
import { Alert } from '../../components/Alert.tsx';
import { TextField } from '../../components/Field.tsx';
import { FilePicker } from '../../components/FilePicker.tsx';
import { VENTANILLA_URL, WEB_PROFILE } from '../../config/app-config.ts';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import {
  assertAuthorityKeyFor,
  readAuthorityKeyFile,
  wipeAuthorityKeys,
} from '../../crypto/authority.ts';
import type { AuthorityKeys } from '../../crypto/authority.ts';
import { networkState } from '../../network/directory.ts';
import { api } from '../../services/api.ts';
import { ApiRequestError, describeError } from '../../services/api-client.ts';
import { announce } from '../../lib/announce.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import type { AuthoritySession, OperationSession } from './authority-session.ts';
import { CreateAuthorityKeys } from './CreateAuthorityKeys.tsx';
import { MfaCodeForm, MfaEnrollForm, MfaRecoveryCodes } from './MfaSteps.tsx';

interface AuthorityLoginProps {
  onReady: (session: AuthoritySession) => void;
  /** Entrada de la cuenta de operación del nodo, que no usa llave de autoridad. */
  onOperation: (session: OperationSession) => void;
}

const MISSING_KEY = 'Elige el archivo de llave de la autoridad.';

const MIN_PASSWORD_LENGTH = 12;

/** Etapa del acceso: credenciales, código del segundo factor, inscripción o códigos nuevos. */
type Stage =
  | { kind: 'credentials' }
  | { kind: 'code'; challenge: string }
  | { kind: 'enroll'; token: string; enrollment: MfaEnrollment }
  | { kind: 'recovery'; codes: string[]; session: LoginSessionStep };

/** Mensaje de un fallo del segundo paso: no dice si falló la contraseña o el código. */
const CODE_FAILED =
  'El código no es válido o ya se usó, o el usuario o la contraseña no coinciden. Escribe el código nuevo de tu app; si vuelve a fallar, vuelve a escribir tu usuario y contraseña.';

/** Formulario de acceso de la autoridad. */
export function AuthorityLogin({ onReady, onOperation }: AuthorityLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [stepError, setStepError] = useState('');
  const [isBusy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'credentials' });
  const isMounted = useRef(true);
  /** Llave leída al enviar la contraseña; vive solo en memoria hasta abrir el panel. */
  const keysRef = useRef<AuthorityKeys | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Seguridad: si la pantalla se cierra a medio camino, la llave no se queda en memoria.
      if (keysRef.current !== null) wipeAuthorityKeys(keysRef.current);
      keysRef.current = null;
    };
  }, []);

  function takeKeys(): AuthorityKeys | null {
    const keys = keysRef.current;
    keysRef.current = null;
    return keys;
  }

  /** Vuelve al inicio: borra la llave y cierra la sesión limitada si la había. */
  function restart(message = ''): void {
    if (stage.kind === 'enroll') void api.logout(stage.token).catch(() => undefined);
    const keys = takeKeys();
    if (keys !== null) wipeAuthorityKeys(keys);
    setStepError('');
    setError(message);
    setStage({ kind: 'credentials' });
    focusAfterRender('authority-username');
  }

  /** Abre el panel con la sesión completa (o la bandeja de operación). */
  async function finish(session: { token: string; account: AuthorityAccountView }): Promise<void> {
    const keys = takeKeys();
    try {
      // La operación del nodo solo revisa solicitudes de alta: no necesita llave ni la conserva.
      if (hasFunction(session.account, 'operation')) {
        if (keys !== null) wipeAuthorityKeys(keys);
        if (!isMounted.current) {
          void api.logout(session.token).catch(() => undefined);
          return;
        }
        onOperation({ token: session.token, account: session.account });
        return;
      }
      if (keys === null) throw new Error(MISSING_KEY);
      // La llave debe ser la de la autoridad de ESTA cuenta, que solo se conoce tras entrar.
      assertAuthorityKeyFor(keys, session.account.authorityId, await networkState(), PINNED_KEYS);
      // Seguridad: si la pantalla se cerró mientras tanto, la llave no se queda en memoria y la
      // sesión se cierra en el servidor.
      if (!isMounted.current) {
        wipeAuthorityKeys(keys);
        void api.logout(session.token).catch(() => undefined);
        return;
      }
      onReady({ token: session.token, account: session.account, keys });
    } catch (failure) {
      // Seguridad: con una llave que no es de la cuenta no se abre el panel; la sesión recién
      // abierta se cierra también en el servidor.
      void api.logout(session.token).catch(() => undefined);
      if (keys !== null) wipeAuthorityKeys(keys);
      if (isMounted.current) {
        setStage({ kind: 'credentials' });
        setError(
          describeError(
            failure,
            failure instanceof Error ? failure.message : 'No pudimos abrir el panel.',
          ),
        );
      }
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (isBusy) return;
    setError('');
    if (username.trim() === '' || password.length < MIN_PASSWORD_LENGTH) {
      setError(`Escribe tu usuario y tu contraseña (al menos ${MIN_PASSWORD_LENGTH} caracteres).`);
      return;
    }
    setBusy(true);
    try {
      keysRef.current = file === null ? null : readAuthorityKeyFile(await file.text());
      const result = await api.login(username.trim(), password);
      setPassword('');
      if (!isMounted.current) {
        if (result.step !== 'code') void api.logout(result.token).catch(() => undefined);
        return;
      }
      if (result.step === 'session') {
        await finish(result);
      } else if (result.step === 'code') {
        setStepError('');
        setStage({ kind: 'code', challenge: result.challenge });
        announce('Falta el código de verificación de tu app.');
      } else {
        // Si no se pudo pedir el secreto, la sesión limitada se cierra también en el servidor.
        const enrollment = await api.enrollMfa(result.token).catch((failure: unknown) => {
          void api.logout(result.token).catch(() => undefined);
          throw failure;
        });
        if (!isMounted.current) return;
        setStepError('');
        setStage({ kind: 'enroll', token: result.token, enrollment });
        announce('Tu cuenta debe activar la verificación en dos pasos.');
      }
    } catch (failure) {
      const keys = takeKeys();
      if (keys !== null) wipeAuthorityKeys(keys);
      if (isMounted.current) {
        setError(
          describeError(
            failure,
            failure instanceof Error ? failure.message : 'No pudimos abrir el panel.',
          ),
        );
      }
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }

  async function submitCode(challenge: string, code: string): Promise<void> {
    if (code === '') {
      setStepError('Escribe el código de tu app o un código de recuperación.');
      return;
    }
    setBusy(true);
    setStepError('');
    try {
      const session = await api.loginCode(challenge, code);
      if (!isMounted.current) {
        void api.logout(session.token).catch(() => undefined);
        return;
      }
      await finish(session);
    } catch (failure) {
      if (!isMounted.current) return;
      if (failure instanceof ApiRequestError && failure.code === 'rate_limited') {
        restart(describeError(failure, 'Hubo demasiados intentos.'));
        return;
      }
      setStepError(
        failure instanceof ApiRequestError && failure.status === 401
          ? CODE_FAILED
          : describeError(failure, CODE_FAILED),
      );
      focusAfterRender('authority-code');
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }

  async function confirmEnrollment(token: string, code: string): Promise<void> {
    if (!/^\d{6}$/u.test(code)) {
      setStepError('Escribe los 6 dígitos que muestra tu app.');
      focusAfterRender('mfa-enroll-code');
      return;
    }
    setBusy(true);
    setStepError('');
    try {
      const confirmed = await api.confirmMfa(token, code);
      if (!isMounted.current) {
        void api.logout(confirmed.session.token).catch(() => undefined);
        return;
      }
      setStage({ kind: 'recovery', codes: confirmed.recoveryCodes, session: confirmed.session });
    } catch (failure) {
      if (!isMounted.current) return;
      if (failure instanceof ApiRequestError && failure.code === 'bad_request') {
        setStepError(
          'El código no coincide. Revisa que la hora de tu teléfono sea automática y escribe el código nuevo.',
        );
        focusAfterRender('mfa-enroll-code');
      } else {
        restart(describeError(failure, 'No pudimos activar la verificación. Vuelve a entrar.'));
      }
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }

  if (stage.kind === 'code') {
    return (
      <MfaCodeForm
        idPrefix="authority"
        error={stepError}
        isBusy={isBusy}
        onSubmit={(code) => void submitCode(stage.challenge, code)}
        onRestart={() => restart()}
      />
    );
  }
  if (stage.kind === 'enroll') {
    return (
      <MfaEnrollForm
        enrollment={stage.enrollment}
        error={stepError}
        isBusy={isBusy}
        onConfirm={(code) => void confirmEnrollment(stage.token, code)}
        onCancel={() => restart()}
      />
    );
  }
  if (stage.kind === 'recovery') {
    return <MfaRecoveryCodes codes={stage.codes} onContinue={() => void finish(stage.session)} />;
  }

  return (
    <>
      <form onSubmit={(event) => void submit(event)} noValidate data-testid="authority-login">
        <Alert tone="info" title="Panel de demostración">
          <p>
            Entra con tu cuenta personal: cada acción queda registrada con tu cuenta. La sesión se
            cierra sola tras 15 minutos sin actividad.
          </p>
          <p>
            La llave privada de tu autoridad se lee en tu navegador y se queda en memoria: no se
            sube ni se guarda. Al recargar la página tendrás que importarla de nuevo.
          </p>
        </Alert>
        {error && (
          <Alert
            tone="danger"
            title="No se pudo abrir el panel"
            role="alert"
            testId="authority-error"
          >
            <p>{error}</p>
          </Alert>
        )}
        <TextField
          id="authority-username"
          label="Usuario"
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          data-testid="authority-username"
        />
        <TextField
          id="authority-password"
          label="Contraseña"
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="authority-password"
        />
        <div className="field">
          <label htmlFor="authority-key">Llave de tu autoridad (archivo .json)</label>
          <p id="authority-key-hint" className="field__hint">
            La cuenta de operación del nodo no la necesita.
          </p>
          <FilePicker
            aria-describedby="authority-key-hint"
            id="authority-key"
            status={file?.name}
            aria-required="true"
            accept="application/json,.json"
            data-testid="authority-key-file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <button
          type="submit"
          className="button"
          aria-disabled={isBusy ? true : undefined}
          data-testid="authority-login-submit"
        >
          {isBusy ? 'Verificando...' : 'Entrar al panel'}
        </button>
      </form>
      <CreateAuthorityKeys />
      <p className="registration-link">
        ¿Tu institución todavía no está en la red?{' '}
        {/* En el nodo de un estado (perfil panel), la solicitud de alta está en la ventanilla. */}
        {WEB_PROFILE === 'panel' && VENTANILLA_URL !== null ? (
          <a
            href={`${VENTANILLA_URL}${PATHS.registration}`}
            rel="noreferrer"
            data-testid="registration-link"
          >
            Solicita su alta en la ventanilla única
          </a>
        ) : (
          <Link to={PATHS.registration} data-testid="registration-link">
            Solicita su alta
          </Link>
        )}
      </p>
    </>
  );
}
