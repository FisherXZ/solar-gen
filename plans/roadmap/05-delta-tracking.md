# 05 — Delta Tracking

**Status:** Draft

---

## What It Is

Every scrape run produces a snapshot of the ISO queue. Delta tracking diffs consecutive snapshots to detect what changed — and classifies those changes by signal strength.

We already upsert on `(iso_region, queue_id)` and have `updated_at`. But we don't record *what* changed. Delta tracking adds a `project_events` table that logs field-level changes with timestamps.

## Why It Matters

A static list of 2,000 solar projects is overwhelming. Delta tracking answers: "What happened this week that I should care about?"

- A project advancing from "Feasibility Study" → "System Impact Study" is a **progression signal** — it's becoming more real
- A project that's been in "Feasibility Study" for 3 years is probably dead
- A capacity increase from 200MW to 350MW means the project grew — more robots needed
- A status change to "Withdrawn" means stop wasting time on it
- A new expected COD that moved closer means construction is accelerating

## Signal Tier Classification

Not all changes are equal. We classify into 3 tiers:

### Tier 1: Critical (immediate attention)

These are buy signals — something happened that makes this lead significantly more actionable.

| Change | Why It's Critical |
|--------|------------------|
| Status: study phase → active/approved | Project cleared a major hurdle |
| Status: any → withdrawn/suspended | Stop pursuing this lead |
| EPC identified (from discovery agent) | Lead is now actionable — we know who to call |
| New project enters queue at >100MW | Large project just appeared |
| Expected COD moved significantly closer | Construction timeline accelerated |

### Tier 2: Notable (review weekly)

Meaningful changes that affect lead quality but don't require immediate action.

| Change | Why It's Notable |
|--------|-----------------|
| MW capacity increased >20% | Project is growing |
| MW capacity decreased >20% | Project may be scaling back |
| Expected COD changed | Timeline shift — revalidate |
| Developer/entity name changed | Possible ownership transfer |
| Project appeared in EIA-860 (cross-ref match) | Significant progression signal |

### Tier 3: Informational (background)

Changes worth logging but not surfacing proactively.

| Change | Why It's Informational |
|--------|----------------------|
| Minor capacity adjustment (<20%) | Normal refinement |
| County/state correction | Data cleanup |
| Queue date correction | Administrative |
| Raw data field changes | For audit trail |

## Database Schema

### `project_events` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| project_id | UUID (FK) | References `projects` table |
| event_type | TEXT | "status_change", "capacity_change", "cod_change", "new_entry", "withdrawal", "epc_identified", "cross_ref_match" |
| signal_tier | INT | 1, 2, or 3 |
| field_name | TEXT | Which field changed |
| old_value | TEXT | Previous value (cast to text) |
| new_value | TEXT | New value (cast to text) |
| change_pct | FLOAT | For numeric fields — percentage change |
| source | TEXT | What triggered this event ("scrape_run", "epc_agent", "manual") |
| scrape_run_id | UUID (FK) | Nullable — links to `scrape_runs` if triggered by a scrape |
| created_at | TIMESTAMP | When the change was detected |

**Indexes:**
- `(project_id, created_at DESC)` — project timeline
- `(signal_tier, created_at DESC)` — tier-filtered event feed
- `(event_type, created_at DESC)` — type-filtered queries

## Implementation Approach

### In the Scraper Pipeline

```python
# Pseudocode — added to the upsert step

def upsert_with_delta(new_row, existing_row):
    if existing_row is None:
        # New project — log "new_entry" event
        insert(new_row)
        log_event(project_id, "new_entry", tier=classify_new_entry(new_row))
        return

    # Compare tracked fields
    tracked_fields = ["status", "mw_capacity", "expected_cod", "developer", "fuel_type"]
    for field in tracked_fields:
        old_val = existing_row[field]
        new_val = new_row[field]
        if old_val != new_val:
            tier = classify_change(field, old_val, new_val)
            log_event(project_id, f"{field}_change", tier, old_val, new_val)

    upsert(new_row)
```

### Classification Logic

```python
def classify_change(field, old_val, new_val):
    if field == "status":
        if is_progression(old_val, new_val):
            return 1  # Critical
        if new_val in ["Withdrawn", "Suspended"]:
            return 1  # Critical
        return 2  # Notable

    if field == "mw_capacity":
        pct_change = abs(new_val - old_val) / old_val
        if pct_change > 0.20:
            return 2  # Notable
        return 3  # Informational

    if field == "expected_cod":
        # COD moved closer by >6 months = critical
        # COD moved by <6 months = notable
        delta_months = month_diff(old_val, new_val)
        if delta_months < -6:  # moved closer
            return 1
        return 2

    return 3  # Default: informational
```

[TBD: Define `is_progression()` — need to map each ISO's status values to a progression order. E.g., for MISO: Phase 1 → Phase 2 → Phase 3 → IA Executed → Under Construction]

## Frontend: How to Surface Deltas

### 1. Event Feed on Dashboard

A "What Changed" section on the main dashboard — chronological feed of Tier 1 and Tier 2 events from the past 7 days.

```
[CRITICAL] Sunflower Solar (ERCOT, 250MW)
Status changed: Feasibility Study → System Impact Study
2 days ago

[CRITICAL] New project: Desert Star Solar (CAISO, 180MW, Riverside County CA)
1 day ago

[NOTABLE] Big Sky Solar (MISO, 300MW)
Capacity increased: 300MW → 420MW (+40%)
3 days ago
```

### 2. Change Badges on Table Rows

In the projects table, show a small badge on rows that changed recently:
- Red dot for Tier 1 changes
- Yellow dot for Tier 2 changes
- Tooltip shows what changed

### 3. Project Timeline (Detail Page)

On the project detail page, show a vertical timeline of all events for that project:

```
2026-03-01  Entered ERCOT queue (250MW, Travis County TX)
2026-06-15  Status: Feasibility Study → System Impact Study
2026-09-01  Capacity: 250MW → 300MW
2026-11-15  Matched to EIA-860 (Plant ID 67890, coords: 30.12, -97.45)
2027-01-10  EPC identified: McCarthy (via developer press release)
```

## Open Questions

- [TBD] How far back should we retain events? Forever (for the knowledge graph) or rolling window (for performance)?
- [TBD] Should delta detection trigger the EPC discovery agent? E.g., "project just moved to active status → auto-research EPC"
- [TBD] Status value mapping across ISOs — each ISO uses different terminology for study phases. Need a normalization table.
