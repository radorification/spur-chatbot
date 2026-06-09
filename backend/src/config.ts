import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envPathCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '..', '.env'),
];

const envPath = envPathCandidates.find((candidate) => fs.existsSync(candidate));
dotenv.config(envPath ? { path: envPath } : undefined);

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  databasePath: process.env.DATABASE_PATH || './data/chat.db',
  maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || '2000', 10),
  maxHistoryMessages: parseInt(process.env.MAX_HISTORY_MESSAGES || '20', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
} as const;
