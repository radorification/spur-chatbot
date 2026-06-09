# Spur – AI Live Chat Agent

A mini AI-powered customer support chat widget for a fictional e-commerce store
(**Nova Store**).

---

## Tech Stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Backend   | Node.js + TypeScript, Express                |
| Frontend  | SvelteKit (Svelte 4)                         |
| Database  | SQLite via `better-sqlite3`                  |
| LLM       | Google Gemini (`gemini-2.5-flash-lite`)      |
| Validation| Zod                                          |

---

## Prerequisites

- **Node.js** ≥ 18  
- **npm** ≥ 9  
- A **Google Gemini API key** from AI Studio (get one at <https://aistudio.google.com/app/apikey>)

---

## Running Locally – Step by Step

### 1. Clone the repo

```bash
git clone https://github.com/radorification/spur-chatbot.git
cd spur-chatbot
```

### 2. Configure environment variables

**Backend**

```bash
cd backend
cp .env.example .env
# Open .env and fill in GEMINI_API_KEY=AQ...
# Get a free key at https://aistudio.google.com/app/apikey
```

**Frontend** (optional – defaults work for local dev)

```bash
cd ../frontend
cp .env.example .env
# VITE_API_URL defaults to http://localhost:3001
```

### 3. Install dependencies

```bash
# backend
cd backend
npm install

# frontend
cd frontend
npm install
```

### 4. Start the backend

```bash
cd backend
npm run dev
# Server starts on http://localhost:3001
# SQLite database is auto-created at ./data/chat.db on first run
```

The database schema is applied automatically when the server starts — **no
manual migration step needed**.

### 5. Start the frontend

```bash
cd frontend
npm run dev
# App available at http://localhost:5173
```

Open <http://localhost:5173> in your browser.

### 6. Test the app quickly

1. Open the frontend in the browser.
2. Ask a FAQ like `What is your return policy?` or `Do you ship to Canada?`.
3. Refresh the page and confirm the prior conversation is restored.
4. Try an empty message and confirm the UI blocks it.
5. Temporarily remove `GEMINI_API_KEY` from `backend/.env` and confirm the app shows a friendly fallback error instead of crashing.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable              | Required | Default             | Description                                    |
| --------------------- | -------- | ------------------- | ---------------------------------------------- |
| `GEMINI_API_KEY`      | **Yes**  | –                   | Your Google Gemini API key                     |
| `PORT`                | No       | `3001`              | HTTP port the server listens on                |
| `DATABASE_PATH`       | No       | `./data/chat.db`    | Path to the SQLite file                        |
| `MAX_MESSAGE_LENGTH`  | No       | `2000`              | Maximum characters accepted per user message   |
| `MAX_HISTORY_MESSAGES`| No       | `20`                | Max turns included in the LLM context window   |
| `CORS_ORIGIN`         | No       | `http://localhost:5173` | Allowed frontend origin                    |

### Frontend (`frontend/.env`)

| Variable        | Required | Default                    | Description           |
| --------------- | -------- | -------------------------- | --------------------- |
| `VITE_API_URL`  | No       | `http://localhost:3001`    | Backend API base URL  |

---

## API Reference

### `POST /chat/message`

Send a user message and receive an AI reply.

**Request body**
```json
{
  "message": "What is your return policy?",
  "sessionId": "optional-uuid-from-previous-response"
}
```

**Response**
```json
{
  "reply": "We have a 30-day return policy...",
  "sessionId": "uuid-v4"
}
```

### `GET /chat/history/:sessionId`

Fetch the full message history for a session.

**Response**
```json
{
  "sessionId": "uuid-v4",
  "messages": [
    { "id": "...", "conversationId": "...", "sender": "user", "text": "...", "createdAt": 1718000000 }
  ]
}
```

### `GET /health`

Returns `{ "status": "ok", "timestamp": "..." }` — useful for deployment health checks.

---

## Architecture Overview

```
spur/
├── backend/
│   └── src/
│       ├── index.ts              # Express app bootstrap, middleware, route registration
│       ├── config.ts             # Centralised env-var config
│       ├── db/
│       │   ├── index.ts          # SQLite connection + pragmas
│       │   └── migrate.ts        # DDL — runs on startup, idempotent
│       ├── routes/
│       │   └── chat.ts           # POST /chat/message, GET /chat/history/:id
│       ├── services/
│       │   ├── conversation.ts   # Data-access layer (CRUD on conversations & messages)
│       │   └── llm.ts            # Gemini wrapper — generateReply()
│       └── middleware/
│           └── errorHandler.ts   # Global catch-all error handler
└── frontend/
    └── src/
        ├── routes/
        │   ├── +layout.ts        # Disables SSR (app is fully client-side)
        │   ├── +layout.svelte    # Global styles
        │   └── +page.svelte      # Chat UI — all state, input handling, rendering
        └── lib/
            └── api.ts            # Typed fetch wrappers for backend endpoints
```

### Layers / Separation of Concerns

| Layer      | Responsibility                                                   |
| ---------- | ---------------------------------------------------------------- |
| **Route**  | Parse & validate HTTP input (Zod), call services, return JSON    |
| **Service** | Business logic — conversation lifecycle, LLM orchestration     |
| **DB**     | Raw SQLite queries — no ORM to keep the footprint small          |
| **Config** | Single source of truth for all env vars                          |

### Interesting Design Decisions

- **LLM failures never crash a request.** The route layer catches all LLM
  errors and substitutes a friendly plain-English message so the chat always
  responds, even when the AI is down.
- **Optimistic UI.** The frontend appends the user's message immediately on
  send, then rolls it back on error — matching the feel of real chat apps.
- **Session continuity via `localStorage`.** No login required; the session
  UUID is stored client-side and replayed on reload via `GET /chat/history`.
- **Idempotent migrations.** `CREATE TABLE IF NOT EXISTS` means the server can
  restart safely at any time.

---

## LLM Notes

**Provider:** Google Gemini (`gemini-2.5-flash-lite`)

**Why `gemini-2.5-flash-lite`?** It worked reliably with the project's AI Studio key through Gemini's OpenAI-compatible endpoint while being a better fit for free-tier quota limits during evaluation and demo usage. The backend uses Gemini's compatibility layer rather than the deprecated legacy JS SDK.

**Prompting strategy:**

1. A detailed **system prompt** is prepended to every conversation. It includes
   a "Knowledge Base" section with Nova Store's shipping, return, payment, and
   support policies — formatted as plain text so the model can retrieve facts
   reliably.
2. The last `MAX_HISTORY_MESSAGES` (default 20) turns of conversation history
   are included so replies are contextual.
3. `reasoning_effort: "none"` reduces unnecessary internal reasoning spend for a simple support chatbot.
4. `max_tokens: 1000` avoids premature truncation while still keeping replies bounded.

**Guardrails implemented:**

- API errors (rate limit, invalid key, 5xx) are caught and translated to friendly
  user-facing messages — the request always resolves with a reply.
- The system prompt instructs the model to say "I don't know — please email
  support@novastore.com" rather than hallucinate.
- Request body is capped at 50 KB; individual messages are capped at
  `MAX_MESSAGE_LENGTH` characters.

**Assumptions / limitations:**

- SQLite is used for simplicity and fast local setup; for production or multi-instance deployment, PostgreSQL would be the next step.
- The app persists conversation history client-side via `localStorage` session IDs and server-side in SQLite; there is no auth layer.
- The Gemini integration uses the OpenAI-compatible endpoint because it proved more reliable than the deprecated legacy JS Gemini SDK during implementation.

---

## Trade-offs & "If I Had More Time…"

| Thing                        | What I'd do                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| **Database**                 | Swap SQLite for PostgreSQL for multi-instance deployments                                           |
| **Rate limiting**            | Add per-IP rate limiting (e.g. `express-rate-limit`) to protect the LLM endpoint                   |
| **Streaming responses**      | Stream tokens via SSE so long replies appear word-by-word instead of all at once                    |
| **Typed DB queries**         | Introduce Drizzle ORM or Kysely for type-safe queries                                               |
| **Message search**           | Full-text search over conversation history                                                          |
| **Auth**                     | Optional lightweight session auth (magic-link or OAuth) for returning customers                     |
| **Multi-channel routing**    | Abstract the `generateReply` call behind a `Channel` interface so WhatsApp/IG handlers can reuse it |
| **Knowledge base in DB**     | Move store policies to a `knowledge_entries` table so non-engineers can update them via an admin UI |
| **Tests**                    | Unit tests for the service layer + integration tests for the API routes                             |
| **Docker Compose**           | Single-command local setup for reviewers                                                            |

---

## Deployment Notes

- **Backend:** Render works well with `backend` as the root directory.
- **Frontend:** Vercel or Netlify work well with `frontend` as the root directory.
- Set `VITE_API_URL` on the frontend to your deployed backend URL.
- Set `CORS_ORIGIN` on the backend to your deployed frontend URL.

---

## Screenshots

