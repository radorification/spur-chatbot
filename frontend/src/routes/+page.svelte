<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { sendMessage, getHistory } from '$lib/api';

  // ── Types ──────────────────────────────────────────────────────────────────
  type Sender = 'user' | 'ai';

  interface ChatMessage {
    id: string;
    sender: Sender;
    text: string;
    createdAt: number;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let messages: ChatMessage[] = [];
  let inputText = '';
  let isLoading = false;
  let sessionId: string | null = null;
  let messagesEl: HTMLDivElement;
  let textareaEl: HTMLTextAreaElement;
  let errorText = '';

  const SESSION_KEY = 'novastore_chat_session';

  const SUGGESTIONS = [
    "What's your return policy?",
    'How long does shipping take?',
    'Do you ship internationally?',
    'What payment methods do you accept?',
    'What are your support hours?',
  ];

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(async () => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const data = await getHistory(stored);
        sessionId = data.sessionId;
        messages = data.messages.map((m) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          createdAt: m.createdAt,
        }));
        await scrollToBottom();
      } catch {
        // Stale or unknown session — start fresh
        localStorage.removeItem(SESSION_KEY);
      }
    }
    textareaEl?.focus();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function scrollToBottom() {
    await tick();
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function formatTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function autoResize(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function send(overrideText?: string) {
    const text = (overrideText ?? inputText).trim();
    if (!text || isLoading) return;

    errorText = '';
    if (!overrideText) {
      inputText = '';
      // Reset textarea height
      if (textareaEl) {
        textareaEl.style.height = 'auto';
      }
    }
    isLoading = true;

    // Optimistic user message
    const tempId = crypto.randomUUID();
    messages = [
      ...messages,
      { id: tempId, sender: 'user', text, createdAt: Date.now() / 1000 },
    ];
    await scrollToBottom();

    try {
      const result = await sendMessage(text, sessionId ?? undefined);
      sessionId = result.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);

      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          sender: 'ai',
          text: result.reply,
          createdAt: Date.now() / 1000,
        },
      ];
    } catch (err: unknown) {
      errorText =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';
      // Roll back the optimistic message and restore input
      messages = messages.filter((m) => m.id !== tempId);
      if (!overrideText) inputText = text;
    } finally {
      isLoading = false;
      await scrollToBottom();
      textareaEl?.focus();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearSession() {
    messages = [];
    sessionId = null;
    errorText = '';
    localStorage.removeItem(SESSION_KEY);
    textareaEl?.focus();
  }
</script>

<svelte:head>
  <title>Nova Store – Live Support</title>
</svelte:head>

<div class="wrapper">
  <div class="chat">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="chat-header">
      <div class="header-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
          <path
            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
          />
        </svg>
      </div>

      <div class="header-info">
        <h1>Nova Store Support</h1>
        <p class="online-status">
          <span class="status-dot" aria-hidden="true"></span>
          AI Agent · Replies instantly
        </p>
      </div>

      {#if messages.length > 0}
        <button
          class="btn-icon"
          on:click={clearSession}
          title="Start a new conversation"
          aria-label="Start a new conversation"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="18"
            height="18"
          >
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 .49-3.01"></path>
          </svg>
        </button>
      {/if}
    </header>

    <!-- ── Messages ───────────────────────────────────────────────────── -->
    <div
      class="messages"
      bind:this={messagesEl}
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      {#if messages.length === 0 && !isLoading}
        <div class="empty-state">
          <div class="bot-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36">
              <path
                d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
              />
            </svg>
          </div>
          <h2>Hello there! 👋</h2>
          <p>
            I'm the Nova Store support agent. Ask me anything about shipping,
            returns, payments, or our products.
          </p>
          <div class="suggestions" role="list" aria-label="Suggested questions">
            {#each SUGGESTIONS as s}
              <button
                class="suggestion"
                role="listitem"
                on:click={() => send(s)}
              >
                {s}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        {#each messages as msg (msg.id)}
          <div class="msg-row {msg.sender}" role="article">
            {#if msg.sender === 'ai'}
              <div class="msg-avatar" aria-hidden="true">N</div>
            {/if}
            <div class="msg-bubble">
              <p>{msg.text}</p>
              <time datetime={new Date(msg.createdAt * 1000).toISOString()}>
                {formatTime(msg.createdAt)}
              </time>
            </div>
          </div>
        {/each}

        {#if isLoading}
          <div class="msg-row ai" aria-label="Agent is typing">
            <div class="msg-avatar" aria-hidden="true">N</div>
            <div class="msg-bubble typing" aria-hidden="true">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- ── Error banner ───────────────────────────────────────────────── -->
    {#if errorText}
      <div class="error-bar" role="alert">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          width="16"
          height="16"
          aria-hidden="true"
          flex-shrink="0"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48
             10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
          />
        </svg>
        <span>{errorText}</span>
        <button
          class="error-dismiss"
          on:click={() => (errorText = '')}
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>
    {/if}

    <!-- ── Input area ─────────────────────────────────────────────────── -->
    <div class="input-area">
      <textarea
        bind:this={textareaEl}
        bind:value={inputText}
        on:keydown={onKeydown}
        on:input={autoResize}
        placeholder="Type a message…"
        rows="1"
        disabled={isLoading}
        maxlength="2000"
        aria-label="Type your message"
      ></textarea>

      <button
        class="send-btn"
        on:click={() => send()}
        disabled={isLoading || !inputText.trim()}
        aria-label="Send message"
      >
        {#if isLoading}
          <svg
            class="spinner"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            width="18"
            height="18"
          >
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  /* ── Layout ──────────────────────────────────────────────────────────────── */
  .wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }

  .chat {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 720px;
    height: calc(100vh - 40px);
    max-height: 860px;
    background: #fff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow:
      0 8px 40px rgba(99, 102, 241, 0.18),
      0 2px 8px rgba(0, 0, 0, 0.07);
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: #fff;
    flex-shrink: 0;
  }

  .header-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .header-info {
    flex: 1;
    min-width: 0;
  }

  .header-info h1 {
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .online-status {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    opacity: 0.85;
    margin-top: 2px;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    background: #4ade80;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .btn-icon {
    background: rgba(255, 255, 255, 0.15);
    border: none;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    transition: background 0.15s;
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.28);
  }

  /* ── Messages ────────────────────────────────────────────────────────────── */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scroll-behavior: smooth;
  }

  .messages::-webkit-scrollbar {
    width: 4px;
  }
  .messages::-webkit-scrollbar-track {
    background: transparent;
  }
  .messages::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 2px;
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    padding: 24px;
    color: #6b7280;
    gap: 8px;
  }

  .bot-icon {
    width: 72px;
    height: 72px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    margin-bottom: 8px;
  }

  .empty-state h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
  }

  .empty-state > p {
    font-size: 0.88rem;
    max-width: 320px;
    line-height: 1.55;
    margin-bottom: 12px;
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    max-width: 520px;
  }

  .suggestion {
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 0.82rem;
    font-family: inherit;
    color: #374151;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }

  .suggestion:hover {
    background: #ede9fe;
    border-color: #a78bfa;
    color: #4f46e5;
  }

  /* ── Message rows ────────────────────────────────────────────────────────── */
  .msg-row {
    display: flex;
    gap: 10px;
    max-width: 82%;
  }

  .msg-row.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .msg-row.ai {
    align-self: flex-start;
  }

  .msg-avatar {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.72rem;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
    align-self: flex-end;
  }

  .msg-bubble {
    padding: 11px 15px;
    border-radius: 18px;
    line-height: 1.55;
    word-break: break-word;
    max-width: 100%;
  }

  .msg-row.user .msg-bubble {
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: #fff;
    border-bottom-right-radius: 4px;
  }

  .msg-row.ai .msg-bubble {
    background: #f3f4f6;
    color: #111827;
    border-bottom-left-radius: 4px;
  }

  .msg-bubble p {
    font-size: 0.92rem;
    white-space: pre-wrap;
  }

  .msg-bubble time {
    display: block;
    font-size: 0.68rem;
    margin-top: 5px;
    opacity: 0.55;
  }

  /* ── Typing indicator ────────────────────────────────────────────────────── */
  .typing {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 14px 18px;
    min-width: 58px;
  }

  .typing .dot {
    width: 8px;
    height: 8px;
    background: #9ca3af;
    border-radius: 50%;
    animation: bounce 1.2s ease-in-out infinite;
  }

  .typing .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0.65);
      opacity: 0.4;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* ── Error banner ────────────────────────────────────────────────────────── */
  .error-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #fef2f2;
    color: #dc2626;
    font-size: 0.82rem;
    border-top: 1px solid #fecaca;
    flex-shrink: 0;
  }

  .error-bar span {
    flex: 1;
  }

  .error-dismiss {
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    font-size: 1.3rem;
    line-height: 1;
    padding: 0 2px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .error-dismiss:hover {
    opacity: 1;
  }

  /* ── Input area ──────────────────────────────────────────────────────────── */
  .input-area {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    background: #fff;
    flex-shrink: 0;
  }

  textarea {
    flex: 1;
    resize: none;
    border: 1.5px solid #e5e7eb;
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 0.9rem;
    font-family: inherit;
    line-height: 1.5;
    outline: none;
    transition:
      border-color 0.15s,
      background 0.15s;
    max-height: 120px;
    overflow-y: auto;
    color: #111827;
    background: #f9fafb;
  }

  textarea:focus {
    border-color: #6366f1;
    background: #fff;
  }

  textarea:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  textarea::placeholder {
    color: #9ca3af;
  }

  .send-btn {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    border: none;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: flex-end;
    transition:
      opacity 0.15s,
      transform 0.1s;
  }

  .send-btn:hover:not(:disabled) {
    opacity: 0.88;
    transform: scale(1.06);
  }

  .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none;
  }

  .spinner {
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 520px) {
    .wrapper {
      padding: 0;
    }

    .chat {
      height: 100vh;
      max-height: none;
      border-radius: 0;
    }

    .msg-row {
      max-width: 92%;
    }
  }
</style>
