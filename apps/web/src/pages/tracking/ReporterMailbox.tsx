// Mensajes de la persona denunciante con la autoridad: hilo y respuesta revisada. El botón de
// enviar siempre está activo; si la respuesta está vacía o es muy larga, se dice en el campo.
// Antes de sellarla se quitan siempre los caracteres invisibles.
import { useState } from 'react';
import { MAX_MAILBOX_TEXT_LENGTH } from '@sigilo/core';
import { MessageThread } from '../../components/MessageThread.tsx';
import { Alert } from '../../components/Alert.tsx';
import { ReviewedTextArea } from '../../components/ReviewedTextArea.tsx';
import type { DecodedMessage } from '../../crypto/tracking.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { prepareMailboxText } from '../../lib/mailbox-text.ts';
import { detectPersonalDataRequest } from '../../lib/personal-data-request.ts';

interface ReporterMailboxProps {
  messages: readonly DecodedMessage[];
  sentTexts: Readonly<Record<string, string>>;
  isSending: boolean;
  status: string;
  onSend: (text: string) => Promise<boolean>;
}

/** Hilo del buzón y formulario de respuesta. */
export function ReporterMailbox({
  messages,
  sentTexts,
  isSending,
  status,
  onSend,
}: ReporterMailboxProps) {
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const requested = messages.flatMap((message) =>
    message.from === 'authority' && message.state === 'opened'
      ? detectPersonalDataRequest(message.text)
      : [],
  );
  const items = messages.map((message) => {
    if (message.from === 'authority') {
      return message.state === 'opened'
        ? {
            id: message.messageId,
            author: 'La autoridad',
            sentOn: message.sentOn,
            text: message.text,
            tone: 'authority' as const,
          }
        : {
            id: message.messageId,
            author: 'La autoridad',
            sentOn: message.sentOn,
            text: 'No mostramos este mensaje porque no pudimos comprobar que lo escribió la autoridad.',
            tone: 'warning' as const,
          };
    }
    return {
      id: message.messageId,
      author: 'Tú',
      sentOn: message.sentOn,
      text:
        sentTexts[message.messageId] ??
        'Enviaste un mensaje. Por seguridad, ya no se puede ver aquí.',
      tone: 'own' as const,
    };
  });

  return (
    <section className="card" aria-labelledby="mailbox-title" data-testid="reporter-mailbox">
      <h2 id="mailbox-title">Mensajes con la autoridad</h2>
      <p>Solo tú y la autoridad pueden leer estos mensajes.</p>
      <MessageThread items={items} emptyText="Todavía no hay mensajes." />
      {requested.length > 0 && (
        <Alert
          tone="warning"
          title="La autoridad te pide datos personales"
          role="alert"
          testId="personal-data-warning"
        >
          <p>
            Parece que te piden {[...new Set(requested)].join(', ')}. No estás obligada ni obligado
            a darlos: puedes responder sin identificarte o explicar que prefieres seguir en el
            anonimato.
          </p>
        </Alert>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isSending) return;
          const prepared = prepareMailboxText(reply);
          if (!prepared.ok) {
            setReplyError(prepared.error);
            focusAfterRender('reply');
            return;
          }
          setReplyError('');
          void onSend(prepared.text).then((ok) => {
            if (ok) setReply('');
          });
        }}
        noValidate
      >
        <ReviewedTextArea
          id="reply"
          label="Tu respuesta"
          hint="Revisa que no incluya datos que te identifiquen."
          rows={5}
          maxLength={MAX_MAILBOX_TEXT_LENGTH}
          required
          value={reply}
          error={replyError || undefined}
          onChange={(value) => {
            setReply(value);
            if (value.trim() !== '') setReplyError('');
          }}
        />
        {/* aria-disabled: mientras envía, el botón conserva el foco. */}
        <button
          type="submit"
          className="button"
          aria-disabled={isSending ? true : undefined}
          data-testid="send-reply"
        >
          {isSending ? 'Enviando...' : 'Enviar respuesta'}
        </button>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </section>
  );
}
