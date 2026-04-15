-- supabase/migrations/029_chat_share_tokens.sql
-- Public share links for chat conversations.
--
-- Model: snapshot-at-share. When a user shares a conversation, we set share_token
-- and shared_at=now(). Viewers fetch the conversation via get_shared_conversation(),
-- which returns only messages with created_at <= shared_at. Re-sharing regenerates
-- the token and bumps shared_at; old links 404.
--
-- Security: RLS on chat_* tables stays strict. Public read flows through the
-- SECURITY DEFINER function only — anon/authenticated cannot read chat_messages
-- or chat_conversations directly.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Share token columns on chat_conversations
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS shared_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_share_token
    ON chat_conversations (share_token)
    WHERE share_token IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Access audit log (append-only, service-role only)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_share_access_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token     TEXT        NOT NULL,
    conversation_id UUID        NOT NULL,
    accessed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash         TEXT,
    user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_share_access_token
    ON chat_share_access_log (share_token, accessed_at DESC);

ALTER TABLE chat_share_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
    ON chat_share_access_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Public read function (SECURITY DEFINER)
-- Runs with table owner privileges; bypasses RLS for exactly the rows that
-- match a valid share_token AND were created before the share snapshot.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_shared_conversation(p_token TEXT)
RETURNS TABLE (
    conversation_id UUID,
    title           TEXT,
    shared_at       TIMESTAMPTZ,
    message_id      UUID,
    role            TEXT,
    content         TEXT,
    parts           JSONB,
    created_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.id           AS conversation_id,
        c.title,
        c.shared_at,
        m.id           AS message_id,
        m.role,
        m.content,
        m.parts,
        m.created_at
    FROM chat_conversations c
    JOIN chat_messages m ON m.conversation_id = c.id
    WHERE c.share_token = p_token
      AND c.shared_at IS NOT NULL
      AND m.created_at <= c.shared_at
    ORDER BY m.created_at ASC;
$$;

-- Lock down callers: only anon/authenticated may EXECUTE; no direct table grants.
REVOKE ALL ON FUNCTION get_shared_conversation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shared_conversation(TEXT) TO anon, authenticated;
