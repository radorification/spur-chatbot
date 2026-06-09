import express from 'express';
import cors from 'cors';
import { config } from './config';
import { migrate } from './db/migrate';
import chatRouter from './routes/chat';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: config.corsOrigin, methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '50kb' })); // hard cap on request body size

// ── Database ────────────────────────────────────────────────────────────────
migrate();

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/chat', chatRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler (must be registered last) ─────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[Server] Listening on http://localhost:${config.port}`);
  if (!config.geminiApiKey) {
    console.warn(
      '[Warn] GEMINI_API_KEY is not set — LLM calls will return friendly error messages.',
    );
  }
});
