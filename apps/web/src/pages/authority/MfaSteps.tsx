// Pasos del segundo factor del panel: el código de la app o de recuperación al entrar, la
// inscripción (código QR y clave para escribir a mano) y los códigos de recuperación, que se
// muestran una sola vez. El QR se dibuja aquí mismo como SVG, sin servicios externos.
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import qrcode from 'qrcode-generator';
import type { MfaEnrollment } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { TextField } from '../../components/Field.tsx';
import { announce } from '../../lib/announce.ts';
import { focusAfterRender } from '../../lib/focus.ts';

/** Margen blanco alrededor del QR, en módulos (el mínimo del estándar es 4). */
const QR_QUIET_ZONE = 4;

/**
 * Código QR de la URI `otpauth://` como SVG: un solo trazo con los módulos oscuros sobre fondo
 * blanco (también en modo oscuro, para que la cámara lo lea).
 * Seguridad: se genera en el navegador; la URI con el secreto nunca sale a otro servicio.
 */
export function MfaQrCode({ uri }: { uri: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(uri, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: count + QR_QUIET_ZONE * 2, path: d };
  }, [uri]);
  return (
    <svg
      className="mfa-qr"
      role="img"
      aria-label="Código QR para agregar SIGILO a tu app de autenticación"
      viewBox={`0 0 ${size} ${size}`}
      width="220"
      height="220"
      shapeRendering="crispEdges"
      data-testid="mfa-qr"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

/** Clave Base32 en grupos de 4 para copiarla a mano sin perderse. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/gu, '$1 ').trim();
}

/** Deja solo dígitos (y como máximo 6) en el código de la app. */
function cleanTotp(value: string): string {
  return value.replace(/\D/gu, '').slice(0, 6);
}

interface MfaCodeFormProps {
  /** Prefijo de los `id` y `data-testid` (`authority` o `relogin`). */
  idPrefix: string;
  error: string;
  isBusy: boolean;
  onSubmit: (code: string) => void;
  /** Volver a escribir usuario y contraseña. */
  onRestart: () => void;
}

/**
 * Segundo paso del inicio de sesión: código de 6 dígitos de la app o, si no se tiene el teléfono,
 * un código de recuperación. No dice si la contraseña era correcta: eso se sabe hasta aquí.
 */
export function MfaCodeForm({ idPrefix, error, isBusy, onSubmit, onRestart }: MfaCodeFormProps) {
  const [code, setCode] = useState('');
  const [isRecovery, setRecovery] = useState(false);
  const fieldId = `${idPrefix}-code`;

  useEffect(() => focusAfterRender(fieldId), [fieldId, isRecovery]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (isBusy) return;
    onSubmit(code.trim());
  }

  return (
    <form onSubmit={submit} noValidate data-testid={`${idPrefix}-code-form`}>
      <h2 id={`${idPrefix}-code-title`}>Verificación en dos pasos</h2>
      <p>
        {isRecovery
          ? 'Escribe uno de los códigos de recuperación que guardaste al activar la verificación. Cada código sirve una sola vez.'
          : 'Abre tu app de autenticación y escribe el código de 6 dígitos que muestra para SIGILO. Cambia cada 30 segundos.'}
      </p>
      {error && (
        <Alert
          tone="danger"
          title="No se pudo verificar"
          role="alert"
          testId={`${idPrefix}-code-error`}
        >
          <p>{error}</p>
        </Alert>
      )}
      {isRecovery ? (
        <TextField
          key="recovery"
          id={fieldId}
          label="Código de recuperación"
          hint="Tiene 10 letras y números, por ejemplo KQ7ZM-3TR5A. Puedes escribirlo con o sin guion."
          required
          autoComplete="off"
          maxLength={16}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          data-testid={fieldId}
        />
      ) : (
        <TextField
          key="totp"
          id={fieldId}
          label="Código de 6 dígitos"
          hint="Solo números; no importa si dejas un espacio."
          required
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={7}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d ]/gu, ''))}
          data-testid={fieldId}
        />
      )}
      <div className="actions">
        <button
          type="submit"
          className="button"
          aria-disabled={isBusy ? true : undefined}
          data-testid={`${idPrefix}-code-submit`}
        >
          {isBusy ? 'Verificando...' : 'Verificar y entrar'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            setRecovery((value) => !value);
            setCode('');
            announce(
              isRecovery
                ? 'Escribe el código de tu app de autenticación.'
                : 'Escribe un código de recuperación.',
            );
          }}
          data-testid={`${idPrefix}-use-recovery`}
        >
          {isRecovery
            ? 'Usar el código de mi app'
            : 'No tengo mi teléfono: usar un código de recuperación'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onRestart}
          data-testid={`${idPrefix}-code-restart`}
        >
          Volver a escribir usuario y contraseña
        </button>
      </div>
      <p className="field__hint">
        Si perdiste tu teléfono y tus códigos de recuperación, pide a la operación del nodo que
        reinicie tu verificación en dos pasos.
      </p>
    </form>
  );
}

interface MfaEnrollFormProps {
  enrollment: MfaEnrollment;
  error: string;
  isBusy: boolean;
  onConfirm: (code: string) => void;
  onCancel: () => void;
}

/** Inscripción: QR o clave a mano y el primer código para confirmar. */
export function MfaEnrollForm({
  enrollment,
  error,
  isBusy,
  onConfirm,
  onCancel,
}: MfaEnrollFormProps) {
  const [code, setCode] = useState('');

  useEffect(() => focusAfterRender('mfa-enroll-title'), []);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (isBusy) return;
    onConfirm(cleanTotp(code));
  }

  return (
    <form onSubmit={submit} noValidate data-testid="mfa-enroll">
      <h2 id="mfa-enroll-title" tabIndex={-1}>
        Activa la verificación en dos pasos
      </h2>
      <p>
        Este nodo pide un segundo paso para entrar al panel: además de tu contraseña, un código que
        cambia cada 30 segundos en tu teléfono. Así, una contraseña robada no basta.
      </p>
      <ol className="mfa-steps">
        <li>
          Abre una app de autenticación en tu teléfono (cualquiera que use códigos de 6 dígitos; las
          más comunes sirven).
        </li>
        <li>
          Agrega una cuenta nueva y escanea este código QR.
          <div className="mfa-qr-frame">
            <MfaQrCode uri={enrollment.otpauthUri} />
          </div>
          <p id="mfa-secret-hint" className="field__hint">
            ¿No puedes escanearlo? Elige «escribir la clave» en la app y copia esta clave (sin los
            espacios), de tipo «basada en tiempo»:
          </p>
          <p>
            <code
              className="mfa-secret"
              aria-describedby="mfa-secret-hint"
              data-testid="mfa-secret"
            >
              {groupSecret(enrollment.secret)}
            </code>
          </p>
        </li>
        <li>Escribe el código de 6 dígitos que muestra la app para confirmar.</li>
      </ol>
      {error && (
        <Alert tone="danger" title="No se pudo confirmar" role="alert" testId="mfa-enroll-error">
          <p>{error}</p>
        </Alert>
      )}
      <TextField
        id="mfa-enroll-code"
        label="Código de 6 dígitos"
        hint="Si el código cambia mientras lo escribes, usa el nuevo."
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={7}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/[^\d ]/gu, ''))}
        data-testid="mfa-enroll-code"
      />
      <div className="actions">
        <button
          type="submit"
          className="button"
          aria-disabled={isBusy ? true : undefined}
          data-testid="mfa-enroll-submit"
        >
          {isBusy ? 'Confirmando...' : 'Confirmar y activar'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onCancel}
          data-testid="mfa-enroll-cancel"
        >
          Cancelar y salir
        </button>
      </div>
    </form>
  );
}

interface MfaRecoveryCodesProps {
  codes: readonly string[];
  onContinue: () => void;
}

/**
 * Códigos de recuperación recién creados: se ven una sola vez, con descarga en texto y opción de
 * imprimir. Para seguir hay que confirmar que se guardaron.
 * Seguridad: el archivo se arma en el navegador (Blob) y el enlace se revoca al salir.
 */
export function MfaRecoveryCodes({ codes, onContinue }: MfaRecoveryCodesProps) {
  const [isSaved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const url = useMemo(
    () =>
      URL.createObjectURL(
        new Blob(
          [
            [
              'Códigos de recuperación de SIGILO (verificación en dos pasos del panel).',
              'Cada código sirve una sola vez. Guárdalos fuera de tu teléfono y no los compartas.',
              '',
              ...codes,
              '',
            ].join('\n'),
          ],
          { type: 'text/plain' },
        ),
      ),
    [codes],
  );

  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    focusAfterRender('mfa-recovery-title');
    announce('Verificación en dos pasos activada. Guarda tus códigos de recuperación.');
  }, []);

  return (
    <section aria-labelledby="mfa-recovery-title" data-testid="mfa-recovery">
      <h2 id="mfa-recovery-title" tabIndex={-1}>
        Guarda tus códigos de recuperación
      </h2>
      <Alert tone="success" title="Verificación en dos pasos activada" role="status">
        <p>
          Si pierdes tu teléfono, cada uno de estos códigos te deja entrar una vez en lugar del
          código de la app. Solo se muestran ahora: descárgalos o imprímelos y guárdalos en un lugar
          seguro, fuera de tu teléfono.
        </p>
      </Alert>
      <ol className="mfa-recovery-list" data-testid="mfa-recovery-codes">
        {codes.map((code) => (
          <li key={code}>
            <code data-testid="mfa-recovery-code">{code}</code>
          </li>
        ))}
      </ol>
      <div className="actions">
        <a
          className="button button--secondary"
          href={url}
          download="sigilo-codigos-de-recuperacion.txt"
          data-testid="mfa-recovery-download"
        >
          Descargar códigos (.txt)
        </a>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => window.print()}
          data-testid="mfa-recovery-print"
        >
          Imprimir códigos
        </button>
      </div>
      {error && (
        <Alert tone="warning" title="Falta un paso" role="alert">
          <p>{error}</p>
        </Alert>
      )}
      <label className="choice">
        <input
          type="checkbox"
          checked={isSaved}
          onChange={(event) => {
            setSaved(event.target.checked);
            if (event.target.checked) setError('');
          }}
          data-testid="mfa-recovery-saved"
        />
        <span>Ya guardé mis códigos de recuperación en un lugar seguro.</span>
      </label>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            if (!isSaved) {
              setError('Marca la casilla cuando hayas guardado tus códigos.');
              return;
            }
            onContinue();
          }}
          data-testid="mfa-recovery-continue"
        >
          Continuar al panel
        </button>
      </div>
    </section>
  );
}
