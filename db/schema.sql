-- PocketPilot175Bot D1 schema
-- Safe to run against an existing database: creates missing tables only.
-- Existing rows and historical records are not deleted or rewritten.

CREATE TABLE IF NOT EXISTS bot_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'demo',
  paused INTEGER NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  risk_percent REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS owner_profile (
  telegram_id TEXT PRIMARY KEY,
  pocket_uid TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uid_check TEXT NOT NULL DEFAULT 'format_only'
);

CREATE TABLE IF NOT EXISTS paper_positions (
  symbol TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry_price REAL NOT NULL,
  amount REAL NOT NULL,
  entry_bar_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome TEXT NOT NULL CHECK (outcome IN ('win','loss')),
  amount REAL NOT NULL,
  pnl REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  symbol TEXT,
  direction TEXT,
  entry_price REAL,
  exit_price REAL,
  entry_bar_time TEXT
);

CREATE TABLE IF NOT EXISTS signal_state (
  symbol TEXT PRIMARY KEY,
  last_bar_time TEXT NOT NULL,
  last_signal TEXT NOT NULL DEFAULT 'NONE'
);

INSERT OR IGNORE INTO bot_state (id) VALUES (1);
