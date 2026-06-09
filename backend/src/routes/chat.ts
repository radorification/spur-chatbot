import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getOrCreateConversation,
  addMessage,
  getConversationMessages,
} from '../services/conversation';
import { generateReply } from '../services/llm';
import { config } from '../config';

const router = Router();

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------
const SendMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(
      config.maxMessageLength,
      `Message too long (max ${config.maxMessageLength} characters)`,
    ),
  sessionId: z.string().uuid('Invalid session ID format').optional(),
});

const SessionIdParam = z.object({
  sessionId: z.string().uuid('Invalid session ID format'),
});

// ---------------------------------------------------------------------------
// Friendly messages for known LLM error codes
// ---------------------------------------------------------------------------
const LLM_ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMIT:
    "I'm a bit busy right now — please try again in a moment.",
  QUOTA_EXCEEDED:
    "Our AI service has reached its free usage limit for now. Please try again shortly or contact support@novastore.com.",
  INVALID_API_KEY:
    'The AI service is misconfigured. Please contact support@novastore.com.',
  LLM_UNAVAILABLE:
    'The AI service is temporarily unavailable. Please try again shortly.',
  'GEMINI_API_KEY is not set':
    'The AI service is not configured. Please contact support@novastore.com.',
};

function friendlyLLMError(err: unknown): string {
  const code = err instanceof Error ? err.message : 'UNKNOWN';
  return (
    LLM_ERROR_MESSAGES[code] ??
    "I'm having trouble responding right now. Please try again or email support@novastore.com."
  );
}

// ---------------------------------------------------------------------------
// POST /chat/message
// ---------------------------------------------------------------------------
router.post(
  '/message',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }

      const { message, sessionId } = parsed.data;

      const conversationId = getOrCreateConversation(sessionId);

      // Persist user message first
      addMessage(conversationId, 'user', message);

      // Fetch history for LLM context (exclude the message we just added)
      const allMessages = getConversationMessages(
        conversationId,
        config.maxHistoryMessages,
      );
      const historyForLLM = allMessages.slice(0, -1);

      // Call LLM — never crash the request on AI failures
      let reply: string;
      try {
        reply = await generateReply(historyForLLM, message);
      } catch (llmErr) {
        reply = friendlyLLMError(llmErr);
      }

      // Persist AI reply
      addMessage(conversationId, 'ai', reply);

      return res.json({ reply, sessionId: conversationId });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /chat/history/:sessionId
// ---------------------------------------------------------------------------
router.get(
  '/history/:sessionId',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SessionIdParam.safeParse({ sessionId: req.params['sessionId'] });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const messages = getConversationMessages(parsed.data.sessionId, 100);
      return res.json({ messages, sessionId: parsed.data.sessionId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
