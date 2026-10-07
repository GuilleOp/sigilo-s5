// Buzón de la autoridad: respuestas descifradas y envío de preguntas cifradas a la persona.
import { useEffect, useState } from 'react';
import type { ComplaintDetail } from '@sigilo/contracts';
import { TextAreaField } from '../../components/Field.tsx';
import { MessageThread } from '../../components/MessageThread.tsx';
import type { ThreadItem } from '../../components/MessageThread.tsx';
import { decodeAuthorityThread, sealAuthorityQuestion } from '../../crypto/authority.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';

interface AuthorityMailboxProps {
  session: AuthoritySession;
  detail: ComplaintDetail;
  onSent: () => void;
}

/** Hilo y formulario de pregunta. */
export function AuthorityMailbox({ session, detail, onSent }: AuthorityMailboxProps) {
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');

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
    const text = question.trim();
    if (text === '') return;
    try {
      const sealed = await sealAuthorityQuestion(text, detail, session.keys);
      await api.sendAuthorityMessage(session.token, detail.summary.folio, sealed);
      setQuestion('');
      setStatus('Pregunta enviada cifrada.');
      onSent();
    } catch (failure) {
      setStatus(describeError(failure, 'No se pudo enviar la pregunta.'));
    }
  }

  return (
    <section
      className="card"
      aria-labelledby="authority-mailbox-title"
      data-testid="authority-mailbox"
    >
      <h3 id="authority-mailbox-title">Buzón anónimo</h3>
      <MessageThread items={items} emptyText="Sin mensajes." />
      <TextAreaField
        id="authority-question"
        label="Pregunta para la persona denunciante"
        hint="No pidas datos que la identifiquen si eligió el anonimato."
        rows={4}
        maxLength={4000}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        data-testid="authority-question"
      />
      <button
        type="button"
        className="button"
        onClick={() => void send()}
        data-testid="send-question"
      >
        Enviar pregunta cifrada
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
