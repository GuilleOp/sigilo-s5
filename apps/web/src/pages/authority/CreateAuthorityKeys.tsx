// «Crear mis llaves» en la entrada del panel (plegado) y dentro de la solicitud de alta: la
// autoridad genera su par en este navegador y descarga la llave privada; el candado (la llave
// pública) se agrega a su entrada del directorio firmado. Generar no envía nada.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { generateAuthorityKeys, toKeyFileText } from '../../crypto/authority-keygen.ts';
import type { GeneratedAuthorityKeys } from '../../crypto/authority-keygen.ts';

interface Generated {
  keys: GeneratedAuthorityKeys;
  privateUrl: string;
  padlockUrl: string;
}

/** Enlaces locales (Blob) de los dos archivos; se revocan al regenerar o salir. */
function withDownloads(keys: GeneratedAuthorityKeys): Generated {
  const json = { type: 'application/json' };
  return {
    keys,
    privateUrl: URL.createObjectURL(new Blob([toKeyFileText(keys.privateFile)], json)),
    padlockUrl: URL.createObjectURL(new Blob([toKeyFileText(keys.padlock)], json)),
  };
}

interface AuthorityKeyGeneratorProps {
  /** Avisa del par nuevo (p. ej. para adjuntar el candado a la solicitud de alta). */
  onGenerated?: (keys: GeneratedAuthorityKeys) => void;
  /** Qué hacer con el candado, según dónde se usa el generador. */
  padlockStep: ReactNode;
  /** Último paso, según dónde se usa el generador. */
  closing: ReactNode;
}

/** Botón para crear el par, descarga de la privada, candado y huella. */
export function AuthorityKeyGenerator({
  onGenerated,
  padlockStep,
  closing,
}: AuthorityKeyGeneratorProps) {
  const [generated, setGenerated] = useState<Generated | null>(null);

  // Seguridad: el enlace al archivo privado deja de existir al regenerar o al salir de la pantalla.
  useEffect(
    () => () => {
      if (generated === null) return;
      URL.revokeObjectURL(generated.privateUrl);
      URL.revokeObjectURL(generated.padlockUrl);
    },
    [generated],
  );

  const file = generated === null ? '' : `llave-autoridad-${generated.keys.padlock.keyId}.json`;
  return (
    <>
      <div className="actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            const keys = generateAuthorityKeys();
            setGenerated(withDownloads(keys));
            onGenerated?.(keys);
          }}
          data-testid="create-authority-keys-generate"
        >
          {generated === null ? 'Crear mis llaves' : 'Crear otro par'}
        </button>
      </div>
      {generated !== null && (
        <div data-testid="created-authority-keys" aria-live="polite">
          <h2>Tus llaves nuevas</h2>
          <p>
            1. Descarga tu llave privada y guárdala. Si la pierdes, no se puede recuperar: habría
            que crear otro par y cambiar tu candado en el directorio.
          </p>
          <div className="actions">
            <a
              className="button"
              href={generated.privateUrl}
              download={file}
              data-testid="download-authority-private-key"
            >
              Descargar mi llave privada
            </a>
          </div>
          <p>2. {padlockStep}</p>
          <pre className="mono authority-padlock" data-testid="authority-padlock">
            {toKeyFileText(generated.keys.padlock)}
          </pre>
          <div className="actions">
            <a
              className="button button--secondary"
              href={generated.padlockUrl}
              download={`candado-${generated.keys.padlock.keyId}.json`}
              data-testid="download-authority-padlock"
            >
              Descargar el candado
            </a>
          </div>
          <p>
            3. Cuando quien opera la red te llame, lean juntos esta huella. Si no coincide, no la
            agreguen.
          </p>
          <p>
            Huella:{' '}
            <strong className="mono" data-testid="authority-padlock-fingerprint">
              {generated.keys.fingerprint}
            </strong>
          </p>
          <p>{closing}</p>
        </div>
      )}
    </>
  );
}

/** Sección plegable de la entrada del panel para generar las llaves de una autoridad. */
export function CreateAuthorityKeys() {
  return (
    <details className="more more--minor" data-testid="create-authority-keys">
      <summary>¿Tu autoridad todavía no tiene llaves? Crear mis llaves</summary>
      <p>
        Tu autoridad necesita un par de llaves. Se crean aquí, en tu navegador: no se envía nada.
      </p>
      <ul>
        <li>
          <strong>La llave privada</strong> se queda en tu equipo. Con ella abres las identidades
          selladas y los mensajes que te envían. Guárdala en un lugar seguro y no la compartas: ni
          quien opera el nodo debe tenerla.
        </li>
        <li>
          <strong>La llave pública</strong> es tu «candado»: con él la gente cierra lo que solo tú
          puedes abrir. Se agrega a tu entrada del directorio firmado de la red. Envíalo por oficio
          y confirma la huella por teléfono con quien opera la red.
        </li>
      </ul>
      <AuthorityKeyGenerator
        padlockStep="Envía este candado por oficio (puedes adjuntar el archivo o copiar el texto)."
        closing="Cuando tu candado ya esté en el directorio firmado, entra al panel con tu cuenta y este archivo de llave."
      />
    </details>
  );
}
