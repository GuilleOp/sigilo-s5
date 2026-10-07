// Buzón de la autoridad: respuestas descifradas y envío de preguntas cifradas a la persona.
import { useEffect, useRef, useState } from 'react';
import type { ComplaintDetail, MailboxMessage } from '@sigilo/contracts';
import { isMailboxSequenceComplete, MAX_MAILBOX_TEXT_LENGTH } from '@sigilo/core';
import { Alert } from '../../components/Alert.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import { MessageThread } from '../../components/MessageThread.tsx';
import type { ThreadItem } from '../../components/MessageThread.tsx';
import { decodeAuthorityThread, sealAuthorityQuestion } from '../../crypto/authority.ts';
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
      {detail.summary.mode === 'anonymous' && (
        <p className="field__hint">
          En una denuncia anónima, la llave del buzón de la persona la entrega el servidor sin una
          prueba criptográfica.
        </p>
      )}
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
