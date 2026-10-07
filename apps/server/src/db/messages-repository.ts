// Repositorio del buzón: solo sobres cifrados y firmas, ligados a su folio y numerados por remitente.
import type { DatabaseSync } from 'node:sqlite';
import { HpkeEnvelopeSchema, MailboxSenderSchema } from '@sigilo/contracts';
import type { MailboxMessage, MailboxSender } from '@sigilo/contracts';
import { readInteger, readText } from './database.ts';
import type { Row } from './database.ts';

/** Operaciones sobre la tabla `messages`. */
export interface MessagesRepository {
  insert(folio: string, message: MailboxMessage, ledgerSeq: number): void;
  listByFolio(folio: string): MailboxMessage[];
  /** Secuencia que debe llevar el siguiente mensaje de `sender` en el folio (0 si no hay). */
  nextSequence(folio: string, sender: MailboxSender): number;
}

function toMessage(row: Row): MailboxMessage {
  return {
    messageId: readText(row, 'message_id'),
    from: MailboxSenderSchema.parse(readText(row, 'sender')),
    sequence: readInteger(row, 'sequence'),
    sentOn: readText(row, 'sent_on'),
    envelope: HpkeEnvelopeSchema.parse(JSON.parse(readText(row, 'envelope_json'))),
    signature: readText(row, 'signature'),
  };
}

/** Crea el repositorio de mensajes sobre `db`. */
export function createMessagesRepository(db: DatabaseSync): MessagesRepository {
  const insertStatement = db.prepare(
    `INSERT INTO messages (message_id, folio, sender, sequence, sent_on, envelope_json, signature,
       ledger_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStatement = db.prepare('SELECT * FROM messages WHERE folio = ? ORDER BY ledger_seq');
  const nextStatement = db.prepare(
    'SELECT COALESCE(MAX(sequence) + 1, 0) AS next FROM messages WHERE folio = ? AND sender = ?',
  );

  return {
    insert: (folio, message, ledgerSeq) => {
      insertStatement.run(
        message.messageId,
        folio,
        message.from,
        message.sequence,
        message.sentOn,
        JSON.stringify(message.envelope),
        message.signature,
        ledgerSeq,
      );
    },
    listByFolio: (folio) => listStatement.all(folio).map(toMessage),
    nextSequence: (folio, sender) => {
      const row = nextStatement.get(folio, sender);
      return row === undefined ? 0 : readInteger(row, 'next');
    },
  };
}
