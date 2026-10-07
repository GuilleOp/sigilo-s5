// Buzón de la autoridad: respuestas descifradas y envío de preguntas cifradas a la persona.
import { useEffect, useRef, useState } from 'react';
import type { ComplaintDetail, LedgerAnchor, MailboxMessage } from '@sigilo/contracts';
import { isMailboxSequenceComplete, MAX_MAILBOX_TEXT_LENGTH } from '@sigilo/core';
import { Alert } from '../../components/Alert.tsx';
import { AnchorsField } from '../../components/AnchorsField.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import { MessageThread } from '../../components/MessageThread.tsx';
import type { ThreadItem } from '../../components/MessageThread.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import {
  decodeAuthorityThread,
  sealAuthorityQuestion,
  verifyReporterKeys,
} from '../../crypto/authority.ts';
import type { ReporterKeysVerification } from '../../crypto/authority.ts';
import { parseLedgerAnchors } from '../../crypto/ledger-verification.ts';
import { mailboxCountText, prepareMailboxText } from '../../lib/mailbox-text.ts';
import { api } from '../../services/api.ts';
import { ApiRequestError, describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface AuthorityMailboxProps {
  session: AuthoritySession;
  detail: ComplaintDetail;
  /** Vuelve a cargar el detalle; devuelve `null` si falló o si quedó obsoleto. */
  reload: () => Promise<ComplaintDetail | null>;
}

/**
 * Sella y envía la pregunta. Si el servidor la rechaza porque la secuencia ya no es la siguiente
 * (otra pestaña envió antes), recarga el detalle y vuelve a sellar una sola vez.
 */
async function sendQuestion(
  text: string,
  detail: ComplaintDetail,
  session: AuthoritySession,
  reload: AuthorityMailboxProps['reload'],
): Promise<MailboxMessage> {
  const send = async (current: ComplaintDetail): Promise<MailboxMessage> =>
    api.sendAuthorityMessage(
      session.token,
      current.summary.folio,
      await sealAuthorityQuestion(text, current, session.keys),
    );
  try {
    return await send(detail);
  } catch (failure) {
    if (!(failure instanceof ApiRequestError) || failure.code !== 'bad_request') throw failure;
    const fresh = await reload();
    if (fresh === null) throw failure;
    return send(fresh);
  }
}

/** Aviso del estado de las llaves del buzón frente al registro público. */
function KeysStatus({ status }: { status: ReporterKeysVerification | 'checking' | 'unknown' }) {
  if (status === 'verified') {
    return (
      <p className="field__hint" data-testid="reporter-keys-verified">
        Las llaves de la persona coinciden con el registro público: los mensajes van a quien hizo la
        denuncia.
      </p>
    );
  }
  if (status === 'mismatch') {
    return (
      <Alert tone="danger" title="Las llaves no coinciden" testId="reporter-keys-mismatch">
        <p>
          Los datos de esta denuncia no coinciden con su anotación en el registro público. El
          servidor podría haber cambiado las llaves del buzón: no envíes preguntas.
        </p>
      </Alert>
    );
  }
  return (
    <p className="alert alert--warning" data-testid="reporter-keys-unverified">
      Las llaves de la persona aún no están verificadas contra el registro público.
    </p>
  );
}

/** Hilo y formulario de pregunta. */
export function AuthorityMailbox({ session, detail, reload }: AuthorityMailboxProps) {
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [isSending, setSending] = useState(false);
  /** Seguridad: evita el doble envío aunque el estado de React todavía no se actualice. */
  const isSendingRef = useRef(false);
  const isMounted = useRef(true);
  const isComplete = isMailboxSequenceComplete(detail.messages);
  const [keysStatus, setKeysStatus] = useState<ReporterKeysVerification | 'checking' | 'unknown'>(
    'checking',
  );
  const [anchorText, setAnchorText] = useState('');
  const [anchorError, setAnchorError] = useState('');
  /** Anclajes pegados ya validados; cambiar la lista vuelve a verificar las llaves con ellos. */
  const [anchors, setAnchors] = useState<readonly LedgerAnchor[]>([]);

  useEffect(() => {
    let isActive = true;
    void verifyReporterKeys(
      detail,
      (from, limit) => api.getLedgerEvents(from, limit),
      PINNED_KEYS,
      anchors,
    ).then(
      (status) => {
        if (isActive) setKeysStatus(status);
      },
      () => {
        if (isActive) setKeysStatus('unknown');
      },
    );
    return () => {
      isActive = false;
    };
  }, [detail, anchors]);

  function applyAnchors(): void {
    const parsed = parseLedgerAnchors(anchorText);
    if (parsed === null) {
      setAnchorError('El texto pegado no es un anclaje válido.');
      return;
    }
    setAnchorError('');
    setKeysStatus('checking');
    setAnchors(parsed);
  }

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    void decodeAuthorityThread(detail, session.keys).then((thread) => {
      if (!isActive) return;
      setItems(
        thread.map((message) => ({
          id: message.messageId,
          author: message.from === 'authority' ? 'Autoridad' : 'Persona denunciante',
          sentOn: message.sentOn,
          tone:
            message.from === 'authority'
              ? 'own'
              : message.state === 'opened'
                ? 'authority'
                : 'warning',
          text:
            message.from === 'authority'
              ? 'Pregunta cifrada para la persona denunciante; solo ella puede leerla.'
              : message.state === 'opened'
                ? message.text
                : 'Mensaje sin firma válida de la persona denunciante; no se muestra.',
        })),
      );
    });
    return () => {
      isActive = false;
    };
  }, [detail, session.keys]);

  async function send(): Promise<void> {
    if (isSendingRef.current) return;
    const prepared = prepareMailboxText(question);
    if (!prepared.ok) {
      setStatus(prepared.error);
      return;
    }
    isSendingRef.current = true;
    setSending(true);
    setStatus('Enviando la pregunta.');
    try {
      await sendQuestion(prepared.text, detail, session, reload);
      if (!isMounted.current) return;
      setQuestion('');
      setStatus('Pregunta enviada cifrada.');
      void reload();
    } catch (failure) {
      if (isMounted.current) {
        setStatus(describeError(failure, 'No pudimos enviar la pregunta. Inténtalo de nuevo.'));
      }
    } finally {
      isSendingRef.current = false;
      if (isMounted.current) setSending(false);
    }
  }

  return (
    <section
      className="card"
      aria-labelledby="authority-mailbox-title"
      data-testid="authority-mailbox"
    >
      <h3 id="authority-mailbox-title">Mensajes con la persona denunciante</h3>
      <KeysStatus status={keysStatus} />
      <details>
        <summary>Comparar también con anclajes publicados (opcional)</summary>
        <p>
          Si pegas anclajes de la bitácora publicados fuera del sistema, la verificación de las
          llaves exige que el tramo del registro público también coincida con ellos.
        </p>
        <AnchorsField
          id="authority-anchors"
          value={anchorText}
          onChange={setAnchorText}
          error={anchorError}
          testId="authority-anchor-input"
        />
        <button
          type="button"
          className="button button--secondary"
          onClick={applyAnchors}
          data-testid="authority-compare-anchors"
        >
          Verificar con los anclajes
        </button>
        {anchors.length > 0 && (
          <p className="field__hint" data-testid="authority-anchors-applied">
            {anchors.length === 1
              ? 'La verificación usa 1 anclaje.'
              : `La verificación usa ${anchors.length} anclajes.`}
          </p>
        )}
      </details>
      {!isComplete && (
        <Alert tone="danger" title="La conversación está incompleta" testId="mailbox-incomplete">
          <p>
            Faltan, sobran o están desordenados algunos mensajes. El servidor podría estar ocultando
            parte de la conversación.
          </p>
        </Alert>
      )}
      <MessageThread items={items} emptyText="Sin mensajes." />
      <TextAreaField
        id="authority-question"
        label="Pregunta para la persona denunciante"
        hint="No pidas datos que la identifiquen si eligió el anonimato."
        rows={4}
        maxLength={MAX_MAILBOX_TEXT_LENGTH}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        data-testid="authority-question"
      />
      <p className="field__hint char-count" data-testid="authority-question-count">
        {mailboxCountText(question.trim().length)}
      </p>
      {/* aria-disabled: mientras envía, el botón conserva el foco. */}
      <button
        type="button"
        className="button"
        onClick={() => void send()}
        aria-disabled={isSending ? true : undefined}
        data-testid="send-question"
      >
        {isSending ? 'Enviando...' : 'Enviar pregunta cifrada'}
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
