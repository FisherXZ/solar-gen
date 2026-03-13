-- Drop workspace concept + add proper email allowlist auth hook
-- Run manually in Supabase SQL Editor
-- IMPORTANT: Deploy code changes FIRST, then run this migration

-- ============================================================
-- 1. DROP OLD TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- ============================================================
-- 2. DROP workspace_id COLUMNS (FK constraints drop automatically)
-- ============================================================

ALTER TABLE epc_discoveries DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE chat_conversations DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE chat_messages DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE entities DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE epc_engagements DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE research_attempts DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE agent_memory DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE research_scratch DROP COLUMN IF EXISTS workspace_id;

-- ============================================================
-- 3. DROP WORKSPACES TABLE
-- ============================================================

DROP TABLE IF EXISTS workspaces CASCADE;

-- ============================================================
-- 4. CLEAN UP STALE RLS POLICIES (from migrations 014/015)
-- ============================================================

-- These may or may not exist depending on which version of 015 was run
DROP POLICY IF EXISTS "Authenticated read epc_discoveries" ON epc_discoveries;
DROP POLICY IF EXISTS "Authenticated read chat_conversations" ON chat_conversations;
DROP POLICY IF EXISTS "Authenticated read chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated read entities" ON entities;
DROP POLICY IF EXISTS "Authenticated read epc_engagements" ON epc_engagements;
DROP POLICY IF EXISTS "Authenticated read research_attempts" ON research_attempts;
DROP POLICY IF EXISTS "Authenticated read agent_memory" ON agent_memory;
DROP POLICY IF EXISTS "Authenticated read research_scratch" ON research_scratch;

-- ============================================================
-- 5. SIMPLE RLS: authenticated users can read all team data
-- ============================================================

CREATE POLICY "Authenticated read" ON epc_discoveries
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read" ON chat_conversations
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read" ON chat_messages
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read" ON entities
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read" ON epc_engagements
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read" ON research_attempts
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read" ON agent_memory
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read" ON research_scratch
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 6. EMAIL ALLOWLIST AUTH HOOK (before-user-created)
-- ============================================================
-- After running this migration, go to Supabase Dashboard:
--   Authentication > Hooks > Before User Created
--   Select: check_email_allowlist
-- ============================================================

-- Ensure allowed_emails table exists (may already exist from 015)
CREATE TABLE IF NOT EXISTS allowed_emails (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed if empty
INSERT INTO allowed_emails (email) VALUES
    ('fisher262425@gmail.com'),
    ('liav@civrobotics.com')
ON CONFLICT (email) DO NOTHING;

-- Auth hook function — returns 403 JSON if email not allowed
CREATE OR REPLACE FUNCTION public.check_email_allowlist(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    user_email TEXT;
BEGIN
    user_email := lower(event->'user'->>'email');

    IF NOT EXISTS (
        SELECT 1 FROM public.allowed_emails WHERE lower(email) = user_email
    ) THEN
        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 403,
                'message', 'This email is not authorized to access this application.'
            )
        );
    END IF;

    RETURN '{}'::jsonb;
END;
$$;

-- Grant to auth admin, revoke from public
GRANT EXECUTE ON FUNCTION public.check_email_allowlist TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.check_email_allowlist FROM authenticated, anon, public;
GRANT SELECT ON public.allowed_emails TO supabase_auth_admin;

-- RLS on allowed_emails
ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON allowed_emails;
CREATE POLICY "Service role only" ON allowed_emails
    FOR ALL USING (auth.role() = 'service_role');
