CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fact', 'preference', 'project')),
  importance DOUBLE PRECISION NOT NULL CHECK (importance >= 0 AND importance <= 1),
  source_conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  embedding vector(768) NOT NULL
);

CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories (user_id);
CREATE INDEX IF NOT EXISTS memories_user_importance_idx
  ON memories (user_id, importance);
