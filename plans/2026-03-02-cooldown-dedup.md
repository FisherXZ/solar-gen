# Cooldown + Dedup: Prevent Duplicate EPC Research

**Date:** 2026-03-02
**Status:** Planned
**Depends on:** Phase 2a (Batch Processing)

---

## Context

Nothing currently stops the same project from being researched over and over — wasting Claude + Tavily API costs. A project researched yesterday will produce the same answer. We need a 30-day cooldown that skips recently-researched projects, a `force` flag for intentional re-research, and batch-level dedup.

There's also a latent bug: `reject_pending_discovery` only rejects pending discoveries, but the DB's partial unique index prevents two non-rejected rows per project. If we want to allow re-research of *accepted* discoveries (after cooldown or with force), we need to reject the old accepted one first too.

## Changes

### 1. `agent/src/db.py` — cooldown check + rename helper

- **Rename** `reject_pending_discovery` → `reject_active_discovery`
  - Remove the `review_status == "pending"` guard — reject ANY active (non-rejected) discovery
  - `store_discovery` calls this, so re-research of accepted projects will work
- **New function** `is_recently_researched(project_id, cooldown_days=30) -> dict | None`
  - Calls `get_active_discovery`; if it exists, parses `created_at` and checks if within `cooldown_days`
  - Returns the discovery dict if recent, `None` otherwise
  - Uses `datetime.fromisoformat()` (Python 3.11+) + `timedelta`
- **Constant** `COOLDOWN_DAYS = 30` at module level

### 2. `agent/src/models.py` — add `force` flag

- `DiscoverRequest`: add `force: bool = False`
- `BatchDiscoverRequest`: add `force: bool = False`

### 3. `agent/src/batch.py` — pass `force` through, use cooldown

- `_research_one` gains `force: bool` parameter
- **Replace** the current `already_accepted` skip with the cooldown check:
  - If `not force` and `is_recently_researched(project_id)` → skip with `reason: "recently_researched"`
  - If `force` → always proceed (store_discovery handles rejecting the old one)
- `run_batch` gains `force: bool = False`, passes it to each `_research_one`

### 4. `agent/src/main.py` — cooldown on single endpoint + batch dedup

- **`POST /api/discover`**: Replace the accepted-only 409 with:
  - If `not req.force` and `db.is_recently_researched(project_id)` → 409 with `"recently_researched"` detail
  - If `req.force` → proceed regardless
- **`POST /api/discover/batch`**:
  - Dedup `project_ids` preserving order: `list(dict.fromkeys(req.project_ids))`
  - Pass `req.force` to `run_batch`

### 5. Tests — update existing + add new

**`test_db.py`:**
- Rename `TestRejectPendingDiscovery` → `TestRejectActiveDiscovery`
- Add test: rejects accepted discovery (not just pending)
- New `TestIsRecentlyResearched` class:
  - Returns discovery if within 30 days
  - Returns None if older than 30 days
  - Returns None if no discovery exists

**`test_batch.py`:**
- Update `test_skips_accepted_discovery` → `test_skips_recently_researched` (mock `is_recently_researched` to return a discovery)
- Add: `test_force_bypasses_cooldown`
- Update `test_does_not_skip_pending_discovery` → discovery exists but is old → proceeds

**`test_main.py`:**
- Update `test_409_already_accepted` → `test_409_recently_researched`
- Add: `test_force_bypasses_cooldown`
- Add: `test_batch_dedup_project_ids`
- Update SSE skip events to use `"recently_researched"` reason

**`test_models.py`:**
- Add: `test_force_default_false` for both request models
- Add: `test_force_true` for both

## Files

| File | Action |
|------|--------|
| `agent/src/db.py` | Modify — cooldown check, rename helper |
| `agent/src/models.py` | Modify — add `force` field |
| `agent/src/batch.py` | Modify — cooldown logic, pass force |
| `agent/src/main.py` | Modify — cooldown on single, dedup on batch |
| `agent/tests/test_db.py` | Modify — cooldown tests, rename |
| `agent/tests/test_batch.py` | Modify — cooldown + force tests |
| `agent/tests/test_main.py` | Modify — cooldown + dedup tests |
| `agent/tests/test_models.py` | Modify — force field tests |

## Verification

```bash
cd agent && python -m pytest tests/ -v
```
All existing tests updated + new cooldown/dedup tests pass.
