import { config } from '../config';
import type { Message } from './conversation';

// ---------------------------------------------------------------------------
// Store knowledge injected into every system prompt.
// Extend or move to DB when the knowledge base grows.
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `\
You are a helpful, friendly support agent for Nova Store, an online electronics \
and gadgets retailer. Answer clearly and concisely. Do not make up information \
that is not in the store knowledge below. If you cannot answer something specific, \
direct the customer to support@novastore.com.

=== NOVA STORE KNOWLEDGE BASE ===

ABOUT US
- Nova Store sells consumer electronics, gadgets, and accessories online.
- Website: novastore.com

SHIPPING POLICY
- Free standard shipping on orders over $50.
- Standard shipping (3–5 business days): $4.99 for orders under $50.
- Express shipping (1–2 business days): $12.99.
- International shipping (7–14 business days): $24.99.
- We ship to the USA, Canada, the UK, Australia, and most EU countries.

RETURNS & REFUNDS
- 30-day return window from the delivery date.
- Items must be unopened and in original packaging for a full refund.
- Opened items may incur a 15% restocking fee.
- Defective or damaged items: full refund or free replacement within 90 days.
- To start a return, visit novastore.com/returns.

PAYMENT
- We accept Visa, Mastercard, American Express, PayPal, Apple Pay, and Google Pay.
- All transactions are SSL-encrypted; we never store full card numbers.

SUPPORT HOURS
- Monday–Friday: 9:00 AM – 6:00 PM EST
- Saturday: 10:00 AM – 4:00 PM EST
- Sunday: Closed
- Email: support@novastore.com (responses within 1 business day)

PRODUCTS
- We sell wireless earbuds, smartwatches, phone accessories, laptops, tablets, \
smart home devices, and more.
- All products include the manufacturer's warranty.
- For stock or product-specific questions, search novastore.com or email support.

=== END OF KNOWLEDGE BASE ===`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an AI reply given the prior conversation history and the latest
 * user message.
 *
 * Assumptions / cost controls:
 *   - Model: gemini-2.5-flash-lite  (validated against this API key)
 *   - reasoning_effort: none   (reduces token burn on internal reasoning)
 *   - max_tokens: 1000         (avoids premature truncation)
 *   - History is already limited upstream via MAX_HISTORY_MESSAGES
 */
export async function generateReply(
  history: Message[],
  userMessage: string,
): Promise<string> {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...history.map((message) => ({
      role: message.sender === 'user' ? 'user' : 'assistant',
      content: message.text,
    })),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${config.geminiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash-lite',
          messages,
          reasoning_effort: 'none',
          max_tokens: 1000,
        }),
      },
    );

    const rawBody = await response.text();
    const payload = safeParseResponse(rawBody) as {
      error?: { message?: string; code?: string };
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string };
      }>;
    } | undefined;

    if (!response.ok) {
      const errorMessage = payload?.error?.message ?? (rawBody || `HTTP ${response.status}`);
      console.error('[LLM Error]', response.status, errorMessage);

      if (response.status === 401) throw new Error('INVALID_API_KEY');
      if (response.status === 429) {
        if (/quota exceeded|resource_exhausted|current quota/i.test(errorMessage)) {
          throw new Error('QUOTA_EXCEEDED');
        }
        if (/rate limit|retry/i.test(errorMessage)) {
          throw new Error('RATE_LIMIT');
        }
        throw new Error('QUOTA_EXCEEDED');
      }
      if (response.status >= 500) throw new Error('LLM_UNAVAILABLE');

      throw new Error(errorMessage);
    }

    const text = payload?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from LLM');
    return text.trim();
  } catch (err: unknown) {
    console.error('[LLM Error]', err instanceof Error ? err.message : err);

    const msg = err instanceof Error ? err.message : '';
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || msg.includes('timed out') || msg.includes('aborted'));

    if (isTimeout) {
      throw new Error('LLM_UNAVAILABLE');
    }

    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      throw new Error('INVALID_API_KEY');
    }
    if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('QUOTA_EXCEEDED');
    }
    if (msg.includes('429') || msg.includes('RATE_LIMIT_EXCEEDED')) {
      throw new Error('RATE_LIMIT');
    }
    if (msg.includes('503') || msg.includes('unavailable') || msg.includes('500')) {
      throw new Error('LLM_UNAVAILABLE');
    }

    throw err;
  }
}

function safeParseResponse(rawBody: string): unknown {
  if (!rawBody) return undefined;

  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}
