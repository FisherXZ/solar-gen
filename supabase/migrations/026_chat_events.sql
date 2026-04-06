-- supabase/migrations/026_chat_events.sql
-- Append-only event log for agent session durability and observability.
-- Each row is one event in the agent loop (tool call, turn boundary, failure).
-- Writes are fire-and-forget from the Python side; failures are logged, not raised.

CREATE TABLE IF NOT EXISTS chat_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    turn_number     INT         NOT NULL DEFAULT 0,
    event_type      TEXT        NOT NULL,
    data            JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_events_conversation
    ON chat_events (conversation_id, created_at);

-- Service role only — no anon reads
ALTER TABLE chat_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
    ON chat_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Token tracking on chat_messages (all nullable for backward compat)
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS input_tokens       INT,
    ADD COLUMN IF NOT EXISTS output_tokens      INT,
    ADD COLUMN IF NOT EXISTS cache_read_tokens  INT,
    ADD COLUMN IF NOT EXISTS cache_write_tokens INT,
    ADD COLUMN IF NOT EXISTS iterations         INT;
