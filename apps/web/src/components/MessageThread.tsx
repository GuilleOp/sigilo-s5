// Hilo de mensajes del buzón, común a la persona denunciante y a la autoridad.
import { formatHourDate } from '../lib/format.ts';

/** Mensaje listo para mostrarse. */
export interface ThreadItem {
  id: string;
  author: string;
  sentOn: string;
  text: string;
  tone: 'authority' | 'own' | 'warning';
}

interface MessageThreadProps {
  items: readonly ThreadItem[];
  emptyText: string;
}

/** Lista de mensajes en orden. */
export function MessageThread({ items, emptyText }: MessageThreadProps) {
  if (items.length === 0) return <p>{emptyText}</p>;
  return (
    <ol className="plain-list" data-testid="message-thread">
      {items.map((item) => (
        <li
          key={item.id}
          className={`message${item.tone === 'authority' ? ' message--authority' : ''}${item.tone === 'warning' ? ' alert alert--danger' : ''}`}
          data-testid="mailbox-message"
        >
          <p>
            <strong>{item.author}</strong>{' '}
            <span className="muted">({formatHourDate(item.sentOn)})</span>
          </p>
          <p>{item.text}</p>
        </li>
      ))}
    </ol>
  );
}
