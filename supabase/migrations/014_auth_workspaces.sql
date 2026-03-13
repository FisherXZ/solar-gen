-- Auth & Workspaces: per-user data isolation with OAuth
-- Projects and scrape_runs stay globally readable (public reference data).
-- User-generated tables get workspace_id for tenant scoping.

-- ============================================================
-- 1. WORKSPACES
-- ============================================================

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Workspace',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_workspaces_owner ON workspaces (owner_id);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own workspace" ON workspaces
    FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Service role full access workspaces" ON workspaces
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 2. ADD workspace_id TO TENANT-SCOPED TABLES
-- ============================================================

ALTER TABLE epc_discoveries ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE chat_conversations ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE chat_messages ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE entities ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE epc_engagements ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE research_attempts ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE agent_memory ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE research_scratch ADD COLUMN workspace_id UUID REFERENCES workspaces(id);

-- Indexes for workspace filtering
CREATE INDEX idx_epc_discoveries_workspace ON epc_discoveries (workspace_id);
CREATE INDEX idx_chat_conversations_workspace ON chat_conversations (workspace_id);
CREATE INDEX idx_chat_messages_workspace ON chat_messages (workspace_id);
CREATE INDEX idx_entities_workspace ON entities (workspace_id);
CREATE INDEX idx_epc_engagements_workspace ON epc_engagements (workspace_id);
CREATE INDEX idx_research_attempts_workspace ON research_attempts (workspace_id);
CREATE INDEX idx_agent_memory_workspace ON agent_memory (workspace_id);
CREATE INDEX idx_research_scratch_workspace ON research_scratch (workspace_id);

-- ============================================================
-- 3. AUTO-PROVISION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_workspace_id UUID;
    is_first_workspace BOOLEAN;
BEGIN
    -- Check if this is the very first workspace
    SELECT NOT EXISTS (SELECT 1 FROM workspaces) INTO is_first_workspace;

    -- Create workspace for the new user
    INSERT INTO workspaces (owner_id, name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Workspace'))
    RETURNING id INTO new_workspace_id;

    -- If first-ever workspace, backfill all existing NULL workspace_id rows
    IF is_first_workspace THEN
        UPDATE epc_discoveries SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
        UPDATE chat_conversations SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
        UPDATE chat_messages SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
        UPDATE entities SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
        UPDATE epc_engagements SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
        UPDATE research_attempts SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
        UPDATE agent_memory SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
        UPDATE research_scratch SET workspace_id = new_workspace_id WHERE workspace_id IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 4. REPLACE RLS POLICIES ON TENANT-SCOPED TABLES
-- ============================================================

-- Helper: check if user owns the workspace
-- Used in RLS policies below

-- --- epc_discoveries ---
DROP POLICY IF EXISTS "Public read epc_discoveries" ON epc_discoveries;
CREATE POLICY "Workspace read epc_discoveries" ON epc_discoveries
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );
-- Keep service_role write (already exists)

-- --- chat_conversations ---
DROP POLICY IF EXISTS "Public read chat_conversations" ON chat_conversations;
CREATE POLICY "Workspace read chat_conversations" ON chat_conversations
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );

-- --- chat_messages ---
DROP POLICY IF EXISTS "Public read chat_messages" ON chat_messages;
CREATE POLICY "Workspace read chat_messages" ON chat_messages
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );

-- --- entities ---
DROP POLICY IF EXISTS "Public read entities" ON entities;
CREATE POLICY "Workspace read entities" ON entities
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );

-- --- epc_engagements ---
DROP POLICY IF EXISTS "Public read epc_engagements" ON epc_engagements;
CREATE POLICY "Workspace read epc_engagements" ON epc_engagements
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );

-- --- research_attempts ---
DROP POLICY IF EXISTS "Public read research_attempts" ON research_attempts;
CREATE POLICY "Workspace read research_attempts" ON research_attempts
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );

-- --- agent_memory ---
DROP POLICY IF EXISTS "Public read agent_memory" ON agent_memory;
CREATE POLICY "Workspace read agent_memory" ON agent_memory
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );

-- --- research_scratch ---
DROP POLICY IF EXISTS "Public read" ON research_scratch;
CREATE POLICY "Workspace read research_scratch" ON research_scratch
    FOR SELECT USING (
        workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    );

-- ============================================================
-- 5. PROJECTS + SCRAPE_RUNS remain unchanged (global/public read)
-- ============================================================
-- No changes needed — their existing policies stay as-is.
