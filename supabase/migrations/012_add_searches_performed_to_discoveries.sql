-- Add missing searches_performed column to epc_discoveries.
-- The code (db.store_discovery) has been writing this field since Phase 2,
-- but the column was only created on research_attempts (migration 006),
-- not on epc_discoveries (migration 004). This caused every insert to fail.

ALTER TABLE epc_discoveries ADD COLUMN IF NOT EXISTS searches_performed TEXT[] DEFAULT '{}';

-- Also ensure migration 010 columns exist (source_count, rejection_reason)
-- in case that migration was never applied.
ALTER TABLE epc_discoveries ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 0;
ALTER TABLE epc_discoveries ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- And migration 010's research_attempts changes
ALTER TABLE research_attempts ADD COLUMN IF NOT EXISTS negative_evidence JSONB DEFAULT '[]';
ALTER TABLE research_attempts DROP CONSTRAINT IF EXISTS research_attempts_outcome_check;
ALTER TABLE research_attempts ADD CONSTRAINT research_attempts_outcome_check
    CHECK (outcome IN ('found', 'not_found', 'inconclusive', 'rejected_by_reviewer'));

-- And migration 011's agent_memory table
CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('project', 'global')),
    memory_key TEXT,
    importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    conversation_id UUID,
    project_id UUID REFERENCES projects(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for agent_memory (were in migration 011 but missing here)
CREATE INDEX IF NOT EXISTS idx_agent_memory_scope ON agent_memory (scope);
CREATE INDEX IF NOT EXISTS idx_agent_memory_key ON agent_memory (memory_key) WHERE memory_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_project ON agent_memory (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_importance ON agent_memory (importance DESC);

-- Full-text search column + index
DO $$ BEGIN
    ALTER TABLE agent_memory ADD COLUMN memory_tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('english', memory)) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_agent_memory_fts ON agent_memory USING GIN (memory_tsv);

-- Critical: unique index required for upsert on_conflict="memory_key,scope"
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_key_scope ON agent_memory (memory_key, scope)
    WHERE memory_key IS NOT NULL;

-- RLS policies
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Public read agent_memory" ON agent_memory FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE POLICY "Service role write agent_memory" ON agent_memory FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS agent_memory_updated_at ON agent_memory;
CREATE TRIGGER agent_memory_updated_at
    BEFORE UPDATE ON agent_memory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Pending discoveries index from migration 010
CREATE INDEX IF NOT EXISTS idx_epc_discoveries_pending
    ON epc_discoveries (review_status, confidence)
    WHERE review_status = 'pending';
