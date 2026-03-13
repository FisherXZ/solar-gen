-- Shared workspace + email allow list
-- Run manually in Supabase SQL Editor

-- 1. Create allowed_emails table
CREATE TABLE allowed_emails (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO allowed_emails (email) VALUES
    ('fisher262425@gmail.com'),
    ('liav@civrobotics.com');

-- 2. Update trigger to check allowlist + share workspace
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_workspace_id UUID;
    new_workspace_id UUID;
BEGIN
    -- Check email allowlist (case-insensitive)
    IF NOT EXISTS (
        SELECT 1 FROM allowed_emails WHERE lower(email) = lower(NEW.email)
    ) THEN
        -- Block unauthorized user by deleting them
        DELETE FROM auth.users WHERE id = NEW.id;
        RETURN NULL;
    END IF;

    -- Check if a workspace already exists (shared model)
    SELECT id INTO existing_workspace_id FROM workspaces LIMIT 1;

    IF existing_workspace_id IS NOT NULL THEN
        -- Workspace exists — nothing to do, user shares it
        RETURN NEW;
    END IF;

    -- First user ever — create workspace and backfill
    INSERT INTO workspaces (owner_id, name)
    VALUES (NEW.id, 'Civ Robotics')
    RETURNING id INTO new_workspace_id;

    UPDATE epc_discoveries SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    UPDATE chat_conversations SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    UPDATE chat_messages SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    UPDATE entities SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    UPDATE epc_engagements SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    UPDATE research_attempts SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    UPDATE agent_memory SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    UPDATE research_scratch SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;

    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION handle_new_user() TO supabase_auth_admin;
GRANT INSERT ON workspaces TO supabase_auth_admin;
GRANT UPDATE ON epc_discoveries, chat_conversations, chat_messages, entities,
    epc_engagements, research_attempts, agent_memory, research_scratch TO supabase_auth_admin;
GRANT SELECT ON allowed_emails TO supabase_auth_admin;
GRANT DELETE ON auth.users TO supabase_auth_admin;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- 3. Update workspaces RLS — any authenticated user can read
DROP POLICY IF EXISTS "Owner can read own workspace" ON workspaces;
CREATE POLICY "Authenticated read workspaces" ON workspaces
    FOR SELECT USING (auth.role() = 'authenticated');

-- 4. Drop unique index on workspaces(owner_id) — shared model allows multiple users
DROP INDEX IF EXISTS idx_workspaces_owner;

-- 5. Update tenant table RLS — any authenticated user can read (shared workspace)
DROP POLICY IF EXISTS "Workspace read epc_discoveries" ON epc_discoveries;
CREATE POLICY "Authenticated read epc_discoveries" ON epc_discoveries
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Workspace read chat_conversations" ON chat_conversations;
CREATE POLICY "Authenticated read chat_conversations" ON chat_conversations
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Workspace read chat_messages" ON chat_messages;
CREATE POLICY "Authenticated read chat_messages" ON chat_messages
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Workspace read entities" ON entities;
CREATE POLICY "Authenticated read entities" ON entities
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Workspace read epc_engagements" ON epc_engagements;
CREATE POLICY "Authenticated read epc_engagements" ON epc_engagements
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Workspace read research_attempts" ON research_attempts;
CREATE POLICY "Authenticated read research_attempts" ON research_attempts
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Workspace read agent_memory" ON agent_memory;
CREATE POLICY "Authenticated read agent_memory" ON agent_memory
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Workspace read research_scratch" ON research_scratch;
CREATE POLICY "Authenticated read research_scratch" ON research_scratch
    FOR SELECT USING (auth.role() = 'authenticated');

-- 6. RLS on allowed_emails — service role only
ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON allowed_emails
    FOR ALL USING (auth.role() = 'service_role');
