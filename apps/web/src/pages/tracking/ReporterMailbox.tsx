// Buzón anónimo de la persona denunciante: mensajes descifrados y respuesta revisada.
import { useState } from 'react';
import { MessageThread } from '../../components/MessageThread.tsx';
import { Alert } from '../../components/Alert.tsx';
import { ReviewedTextArea } from '../../components/ReviewedTextArea.tsx';
import type { DecodedMessage } from '../../crypto/tracking.ts';
import { detectPersonalDataRequest } from '../../lib/personal-data-request.ts';

interface ReporterMailboxProps {
  messages: readonly DecodedMessage[];
  sentTexts: Readonly<Record<string, string>>;
  isSending: boolean;
  status: string;
  onSend: (text: string) => Promise<boolean>;
}

const MAX_REPLY = 4000;

/** Hilo del buzón y formulario de respuesta. */
export function ReporterMailbox({
  messages,
  sentTexts,
  isSending,
  status,
  onSend,
}: ReporterMailboxProps) {
  const [reply, setReply] = useState('');
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
            text: 'Este mensaje no tiene una firma válida de la autoridad y no se muestra.',
            tone: 'warning' as const,
          };
    }
    return {
      id: message.messageId,
      author: 'Tú',
      sentOn: message.sentOn,
      text:
        sentTexts[message.messageId] ??
        'Mensaje cifrado para la autoridad. Por seguridad, ni tú puedes volver a leerlo aquí.',
      tone: 'own' as const,
    };
  });

  return (
    <section className="card" aria-labelledby="mailbox-title" data-testid="reporter-mailbox">
      <h2 id="mailbox-title">Buzón anónimo</h2>
      <p>Los mensajes se descifran en tu navegador. El servidor solo guarda texto cifrado.</p>
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
          if (reply.trim() === '') return;
          void onSend(reply.trim()).then((ok) => {
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
          maxLength={MAX_REPLY}
          value={reply}
          onChange={setReply}
        />
        <button
          type="submit"
          className="button"
          disabled={isSending || reply.trim() === ''}
          data-testid="send-reply"
        >
          {isSending ? 'Enviando...' : 'Enviar respuesta cifrada'}
        </button>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </section>
  );
}
