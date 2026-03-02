-- EPC Discoveries: stores agent research results for EPC contractor identification
CREATE TABLE IF NOT EXISTS epc_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    epc_contractor TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('confirmed', 'likely', 'possible', 'unknown')),
    sources JSONB NOT NULL DEFAULT '[]',
    reasoning TEXT,
    related_leads JSONB DEFAULT '[]',
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected')),
    agent_log JSONB DEFAULT '[]',
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active (non-rejected) discovery per project
CREATE UNIQUE INDEX idx_epc_discoveries_active_project
    ON epc_discoveries (project_id)
    WHERE review_status != 'rejected';

-- Lookup indexes
CREATE INDEX idx_epc_discoveries_project_id ON epc_discoveries (project_id);
CREATE INDEX idx_epc_discoveries_review_status ON epc_discoveries (review_status);
CREATE INDEX idx_epc_discoveries_confidence ON epc_discoveries (confidence);

-- Reuse existing trigger function
CREATE TRIGGER epc_discoveries_updated_at
    BEFORE UPDATE ON epc_discoveries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS: public read, service-role write
ALTER TABLE epc_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read epc_discoveries" ON epc_discoveries
    FOR SELECT USING (true);

CREATE POLICY "Service role write epc_discoveries" ON epc_discoveries
    FOR ALL USING (auth.role() = 'service_role');
