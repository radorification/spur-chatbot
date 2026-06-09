import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

const dbPath = path.resolve(config.databasePath);
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Performance & safety pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

export default db;
