const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

export interface SendMessageResult {
  reply: string;
  sessionId: string;
}

export interface HistoryMessage {
  id: string;
  conversationId: string;
  sender: 'user' | 'ai';
  text: string;
  createdAt: number;
}

export interface ConversationHistory {
  messages: HistoryMessage[];
  sessionId: string;
}

export async function sendMessage(
  message: string,
  sessionId?: string,
): Promise<SendMessageResult> {
  const res = await fetch(`${API_BASE}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  });

  const data = await res.json().catch(() => ({ error: 'Invalid server response' }));

  if (!res.ok) {
    throw new Error(data.error ?? `Server error (${res.status})`);
  }

  return data as SendMessageResult;
}

export async function getHistory(
  sessionId: string,
): Promise<ConversationHistory> {
  const res = await fetch(
    `${API_BASE}/chat/history/${encodeURIComponent(sessionId)}`,
  );

  if (!res.ok) {
    throw new Error(`Failed to load history (${res.status})`);
  }

  return res.json() as Promise<ConversationHistory>;
}
