-- Migration 027: add entity_id FK to epc_discoveries + distinct projects RPC
-- Fixes contacts panel always being empty on the briefing dashboard.
-- The entities table (migration 006) already exists; this links discoveries to it.

-- 1. Add nullable entity_id column
ALTER TABLE epc_discoveries
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;

-- 2. Backfill existing rows via case-insensitive name match
UPDATE epc_discoveries d
SET entity_id = e.id
FROM entities e
WHERE lower(d.epc_contractor) = lower(e.name)
  AND d.entity_id IS NULL;

-- 3. Index for FK lookups
CREATE INDEX IF NOT EXISTS idx_epc_discoveries_entity_id ON epc_discoveries (entity_id);

-- 4. RPC: count distinct projects that have at least one discovery
CREATE OR REPLACE FUNCTION count_distinct_projects_discovered()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT project_id) FROM epc_discoveries;
$$;
