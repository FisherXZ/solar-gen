# Production Bug Fixes — Design Spec
**Date:** 2026-04-06
**Branch:** feature/production-bug-fixes (new)

## Context

Three confirmed production-breaking bugs identified via full codebase audit:

1. `/projects` page returns 404 — multiple nav links broken
2. Contacts never appear in briefing dashboard — schema mismatch
3. "Researched" metric is inflated — missing RPC function

---

## Fix 1: `/projects` List Page

### Problem
`frontend/src/app/projects/` only contains `[id]/page.tsx`. No list page exists at `/projects`. Broken links:
- QuickNav "Pipeline" → `/projects`
- PipelineFunnel "Projects" + "Researched" chips → `/projects`
- NeedsInvestigationPanel "View all" → `/projects`

`EpcDiscoveryDashboard` component (`frontend/src/components/epc/EpcDiscoveryDashboard.tsx`) is a full project-list UI — built but never wired to any page.

### Fix
Create `frontend/src/app/projects/page.tsx` as a Next.js server component that:
1. Fetches all projects from Supabase (id, project_name, iso_region, state, mw_capacity, lead_score, queue_status)
2. Fetches all epc_discoveries (project_id, epc_contractor, confidence, review_status)
3. Passes both datasets to `EpcDiscoveryDashboard` as props

No changes to `EpcDiscoveryDashboard` itself — it already handles rendering, filtering, sorting, and linking to `/projects/[id]`.

### Interface
```
GET /projects
→ server component fetches data
→ renders <EpcDiscoveryDashboard projects={...} discoveries={...} />
```

---

## Fix 2: `entity_id` on `epc_discoveries` (contacts pipeline repair)

### Problem
`epc_discoveries` table (migration 004) has no `entity_id` column. The briefing dashboard (`frontend/src/app/briefing/page.tsx` lines 162–172) filters `d.entity_id` which is always `undefined`. The contacts panel always returns empty even when contacts exist.

`contacts` table is entity-scoped (FK to `entities.id`). The link between a discovery and an entity must go through `epc_discoveries.entity_id`.

### Fix
New migration `027_epc_discoveries_entity_id.sql`:

1. **Add column:**
   ```sql
   ALTER TABLE epc_discoveries
     ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;
   ```
   Nullable — some discoveries may not match any entity.

2. **Backfill existing rows** (case-insensitive name match):
   ```sql
   UPDATE epc_discoveries d
   SET entity_id = e.id
   FROM entities e
   WHERE lower(d.epc_contractor) = lower(e.name)
     AND d.entity_id IS NULL;
   ```

3. **Add index:**
   ```sql
   CREATE INDEX idx_epc_discoveries_entity_id ON epc_discoveries (entity_id);
   ```

4. **RPC function** (also in this migration — see Fix 3 below).

### Agent code update
In `agent/src/main.py` (or wherever discoveries are saved to Supabase): after creating/upserting an `epc_discoveries` row, look up the entity by name and write `entity_id`:
```python
entity = await db.get_entity_by_name(epc_contractor_name)
if entity:
    await db.update_discovery_entity_id(discovery_id, entity["id"])
```

`db.get_entity_by_name` should use a case-insensitive match (`ilike` or `lower()`).

### Briefing page
No changes needed — the existing query at lines 162–172 already works once `entity_id` is populated.

---

## Fix 3: Missing `count_distinct_projects_discovered` RPC

### Problem
`briefing/page.tsx` line 91 calls `supabase.rpc("count_distinct_projects_discovered")`. This function does not exist in any migration. The silent fallback uses total discovery count (not distinct projects), inflating the "Researched" funnel metric.

### Fix
Add to migration `027_epc_discoveries_entity_id.sql`:
```sql
CREATE OR REPLACE FUNCTION count_distinct_projects_discovered()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT project_id) FROM epc_discoveries;
$$;
```

No frontend changes needed — the existing fallback logic in briefing/page.tsx already handles the `typeof researchedResult.data === "number"` check correctly once the function exists.

---

## Implementation Order

1. **Migration 027** — `entity_id` column + backfill + RPC function (database-first, no downtime)
2. **`/projects` page** — create server component wrapper
3. **Agent save path** — write `entity_id` when persisting discoveries

Migration must run before agent change deploys to avoid FK lookup errors.

---

## Testing

- Navigate to `/projects` — should render project list, no 404
- Briefing dashboard "Researched" metric — should show distinct project count
- Accept a discovery for an EPC that has contacts in Supabase — briefing contacts panel should show the item
- Run a new discovery via agent — resulting row in `epc_discoveries` should have `entity_id` populated

---

## Out of Scope
- No new UI components
- No changes to `EpcDiscoveryDashboard` internals
- No changes to contacts schema or scoring tables
