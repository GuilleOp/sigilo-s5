// Acceso al panel: token bearer e importación local de authority-demo-key.json.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert } from '../../components/Alert.tsx';
import { TextField } from '../../components/Field.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { importAuthorityKey, wipeAuthorityKeys } from '../../crypto/authority.ts';
import type { AuthorityKeys } from '../../crypto/authority.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface AuthorityLoginProps {
  onReady: (session: AuthoritySession) => void;
}

const MIN_TOKEN_LENGTH = 32;

/** Formulario de acceso de la autoridad. */
export function AuthorityLogin({ onReady }: AuthorityLoginProps) {
  const [token, setToken] = useState('');
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
    if (token.trim().length < MIN_TOKEN_LENGTH) {
      setError(`El token debe tener al menos ${MIN_TOKEN_LENGTH} caracteres.`);
      return;
    }
    if (file === null) {
      setError('Elige el archivo de llave de la autoridad.');
      return;
    }
    setBusy(true);
    let keys: AuthorityKeys | null = null;
    try {
      keys = importAuthorityKey(await file.text(), PINNED_KEYS);
      // Comprueba el token antes de abrir el panel.
      await api.listComplaints(token.trim());
      // Seguridad: si la pantalla se cerró mientras tanto, la llave no se queda en memoria.
      if (!isMounted.current) {
        wipeAuthorityKeys(keys);
        return;
      }
      onReady({ token: token.trim(), keys });
    } catch (failure) {
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
    <form onSubmit={(event) => void submit(event)} noValidate data-testid="authority-login">
      <Alert tone="info" title="Panel de demostración">
        <p>
          La llave privada se lee en tu navegador y se queda en memoria: no se sube ni se guarda. Al
          recargar la página tendrás que importarla de nuevo.
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
        id="authority-token"
        label="Token de acceso"
        required
        type="password"
        autoComplete="off"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        data-testid="authority-token"
      />
      <div className="field">
        <label htmlFor="authority-key">Llave de la autoridad (authority-demo-key.json)</label>
        <input
          id="authority-key"
          type="file"
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
  );
}
