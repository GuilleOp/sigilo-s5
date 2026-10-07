// Repositorio del buzón: solo sobres cifrados y firmas, ligados a su folio.
import type { DatabaseSync } from 'node:sqlite';
import { HpkeEnvelopeSchema, MailboxSenderSchema } from '@sigilo/contracts';
import type { MailboxMessage } from '@sigilo/contracts';
import { readText } from './database.ts';
import type { Row } from './database.ts';

/** Operaciones sobre la tabla `messages`. */
export interface MessagesRepository {
  insert(folio: string, message: MailboxMessage, ledgerSeq: number): void;
  listByFolio(folio: string): MailboxMessage[];
}

function toMessage(row: Row): MailboxMessage {
  return {
    messageId: readText(row, 'message_id'),
    from: MailboxSenderSchema.parse(readText(row, 'sender')),
    sentOn: readText(row, 'sent_on'),
    envelope: HpkeEnvelopeSchema.parse(JSON.parse(readText(row, 'envelope_json'))),
    signature: readText(row, 'signature'),
  };
}

/** Crea el repositorio de mensajes sobre `db`. */
export function createMessagesRepository(db: DatabaseSync): MessagesRepository {
  const insertStatement = db.prepare(
    `INSERT INTO messages (message_id, folio, sender, sent_on, envelope_json, signature, ledger_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStatement = db.prepare('SELECT * FROM messages WHERE folio = ? ORDER BY ledger_seq');

  return {
    insert: (folio, message, ledgerSeq) => {
      insertStatement.run(
        message.messageId,
        folio,
        message.from,
        message.sentOn,
        JSON.stringify(message.envelope),
        message.signature,
        ledgerSeq,
      );
    },
    listByFolio: (folio) => listStatement.all(folio).map(toMessage),
  };
}
