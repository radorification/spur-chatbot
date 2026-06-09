import { v4 as uuidv4 } from 'uuid';
import db from '../db';

export interface Message {
  id: string;
  conversationId: string;
  sender: 'user' | 'ai';
  text: string;
  createdAt: number;
}

interface ConversationRow {
  id: string;
}

interface MessageRow {
  id: string;
  conversationId: string;
  sender: 'user' | 'ai';
  text: string;
  createdAt: number;
}

/**
 * Returns the conversation ID to use.
 * If `id` is provided and exists, reuse it.
 * Otherwise create a new conversation and return its ID.
 */
export function getOrCreateConversation(id?: string): string {
  if (id) {
    const existing = db
      .prepare('SELECT id FROM conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined;
    if (existing) return existing.id;
  }

  const newId = uuidv4();
  db.prepare('INSERT INTO conversations (id) VALUES (?)').run(newId);
  return newId;
}

export function addMessage(
  conversationId: string,
  sender: 'user' | 'ai',
  text: string,
): Message {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    'INSERT INTO messages (id, conversation_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, conversationId, sender, text, now);

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
    now,
    conversationId,
  );

  return { id, conversationId, sender, text, createdAt: now };
}

export function getConversationMessages(
  conversationId: string,
  limit = 20,
): Message[] {
  const rows = db
    .prepare(
      `SELECT
         id,
         conversationId,
         sender,
         text,
         createdAt
       FROM (
         SELECT
           id,
           conversation_id AS conversationId,
           sender,
           text,
           created_at      AS createdAt,
           rowid
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?
       )
       ORDER BY createdAt ASC, rowid ASC`,
    )
    .all(conversationId, limit) as MessageRow[];

  return rows;
}
