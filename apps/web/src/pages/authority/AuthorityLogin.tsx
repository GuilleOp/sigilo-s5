// Acceso al panel: cuenta individual (usuario y contraseña) e importación local de la llave de su
// autoridad (la propia del directorio firmado en la red; la del buzón del nodo con un solo nodo).
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { hasFunction } from '@sigilo/contracts';
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
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession, OperationSession } from './authority-session.ts';
import { CreateAuthorityKeys } from './CreateAuthorityKeys.tsx';

interface AuthorityLoginProps {
  onReady: (session: AuthoritySession) => void;
  /** Entrada de la cuenta de operación del nodo, que no usa llave de autoridad. */
  onOperation: (session: OperationSession) => void;
}

const MISSING_KEY = 'Elige el archivo de llave de la autoridad.';

const MIN_PASSWORD_LENGTH = 12;

/** Formulario de acceso de la autoridad. */
export function AuthorityLogin({ onReady, onOperation }: AuthorityLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setBusy] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (isBusy) return;
    setError('');
    if (username.trim() === '' || password.length < MIN_PASSWORD_LENGTH) {
      setError(`Escribe tu usuario y tu contraseña (al menos ${MIN_PASSWORD_LENGTH} caracteres).`);
      return;
    }
    setBusy(true);
    let keys: AuthorityKeys | null = null;
    let token: string | null = null;
    try {
      keys = file === null ? null : readAuthorityKeyFile(await file.text());
      const session = await api.login(username.trim(), password);
      token = session.token;
      setPassword('');
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
      if (token !== null) void api.logout(token).catch(() => undefined);
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
