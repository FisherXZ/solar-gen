# 04 — Knowledge Graph

**Status:** Draft

---

## Purpose

The knowledge graph is what turns one-off EPC lookups into compounding intelligence. Without it, every new project requires a fresh research effort. With it, we can say: "Lightsource bp has used McCarthy on their last 3 Texas projects — their new Texas project probably will too."

This is the moat. Anyone can scrape ISO queues. The developer→EPC relationship database, built over time and confirmed across multiple sources, is defensible.

## Core Entities

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│  DEVELOPER   │────────→│  EPC_ENGAGEMENT  │←────────│     EPC      │
│              │   1:N   │                  │   N:1   │              │
│ name         │         │ project_name     │         │ name         │
│ aliases[]    │         │ project_id (FK)  │         │ aliases[]    │
│ hq_state     │         │ mw_capacity      │         │ hq_state     │
│ public_ticker│         │ state            │         │ public_ticker│
│ website      │         │ year             │         │ website      │
│ dev_type     │         │ confidence       │         │ specialties[]│
│ created_at   │         │ sources[]        │         │ active_mw    │
│ updated_at   │         │ created_at       │         │ created_at   │
│              │         │ updated_at       │         │ updated_at   │
└──────────────┘         └──────────────────┘         └──────────────┘
                                │
                                │ links to
                                ▼
                         ┌──────────────────┐
                         │    PROJECT       │
                         │  (existing       │
                         │   projects table)│
                         └──────────────────┘
```

## Schema Design

### `developers` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| name | TEXT | Canonical name |
| aliases | TEXT[] | Alternative names (e.g., "Canadian Solar" / "Recurrent Energy") |
| hq_state | TEXT | |
| public_ticker | TEXT | Nullable — for SEC filing monitoring |
| website | TEXT | |
| newsroom_url | TEXT | Direct link to press/news page, for scraping |
| dev_type | TEXT | IPP, utility, yieldco, etc. |
| notes | TEXT | Free-form — agent can append context |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `epc_contractors` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| name | TEXT | Canonical name |
| aliases | TEXT[] | (e.g., "Blattner" / "Blattner Energy" / "Quanta Services - Blattner") |
| hq_state | TEXT | |
| public_ticker | TEXT | Nullable |
| website | TEXT | |
| portfolio_url | TEXT | Project portfolio page, for scraping |
| specialties | TEXT[] | ["solar", "wind", "storage", "transmission"] |
| estimated_active_mw | FLOAT | Approximate active/completed solar MW |
| notes | TEXT | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `epc_engagements` table

The core relationship table. Each row is a confirmed (or predicted) developer→EPC pairing on a specific project.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| developer_id | UUID (FK) | |
| epc_id | UUID (FK) | |
| project_id | UUID (FK) | Nullable — links to `projects` table when matched |
| project_name | TEXT | As referenced in source (may differ from our project name) |
| mw_capacity | FLOAT | As reported in source |
| state | TEXT | |
| county | TEXT | Nullable |
| year | INT | Year of engagement (contract award or construction start) |
| confidence | TEXT | "confirmed", "likely", "possible", "predicted" |
| sources | JSONB | Array of { channel, date, reference, excerpt } |
| notes | TEXT | Agent reasoning, context |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Unique constraint:** `UNIQUE(developer_id, epc_id, project_name, state)` — prevents duplicate entries for the same engagement.

## Agent-Friendly Design Principles

The knowledge graph needs to be queryable by both SQL (for the dashboard) and natural language (for the agent). Design choices:

1. **Text fields over codes** — Use "Lightsource bp" not developer ID 47. The agent reads and writes natural language. IDs are for joins, not for the agent's context window.

2. **Aliases array** — Companies go by many names. The agent needs to match "Canadian Solar" in a press release to "Recurrent Energy" in our developer table. Store all known aliases.

3. **Sources as JSONB** — Each relationship can be confirmed by multiple sources. The agent appends new sources when it finds corroborating evidence. Structure:
   ```json
   [
     {
       "channel": "developer_pr",
       "date": "2025-03-15",
       "reference": "https://...",
       "excerpt": "...selected Signal Energy as EPC..."
     },
     {
       "channel": "trade_pub",
       "date": "2025-03-18",
       "publication": "Solar Power World",
       "reference": "https://...",
       "excerpt": "..."
     }
   ]
   ```

4. **Notes field** — Free-form text where the agent can store reasoning: "This developer has historically used union-shop EPCs in the Midwest. McCarthy and Mortenson are both union shops with Midwest presence."

5. **Confidence levels** — Clear semantics:
   - `confirmed`: Multiple sources or first-party announcement
   - `likely`: Single reliable source (trade pub, EPC website)
   - `possible`: Inferred from partial information (e.g., same developer + same region as a confirmed project)
   - `predicted`: No direct evidence — based on historical developer→EPC patterns

## How the Graph Grows

```
MONTH 1:
  Manual seeding — enter the 10 verified examples
  Agent starts researching high-score leads

MONTH 2-3:
  Agent has researched ~100 leads
  ~30 confirmed EPC relationships
  ~15 developers with at least one known EPC
  Patterns emerging: "Developer X uses EPC Y in region Z"

MONTH 6:
  ~100+ confirmed relationships
  Prediction capability: for a new project by Developer X in State Y,
  the graph suggests 2-3 likely EPCs ranked by historical frequency

MONTH 12+:
  Comprehensive coverage of top 20 developers + top 10 EPCs
  Prediction accuracy measurable (compare predictions vs. confirmed)
  Graph becomes a standalone data asset
```

## Prediction Logic

When a new project has no known EPC, query the knowledge graph:

```
Input: Developer="Lightsource bp", State="TX", MW=300

Query: SELECT epc_id, COUNT(*) as project_count, AVG(mw_capacity) as avg_mw
       FROM epc_engagements
       WHERE developer_id = (developer matching "Lightsource bp")
         AND (state = 'TX' OR state IS NULL)
         AND confidence IN ('confirmed', 'likely')
       GROUP BY epc_id
       ORDER BY project_count DESC

Result:
  McCarthy — 3 projects in TX (avg 280MW) → "predicted" with high confidence
  Mortenson — 1 project in TX (200MW)    → "predicted" with lower confidence

Agent output:
  epc: "McCarthy Building Companies"
  confidence: "predicted"
  reasoning: "Lightsource bp has used McCarthy on 3 previous TX projects
              of similar scale (avg 280MW). No confirmed EPC yet for this project."
```

## Open Questions

- [TBD] Should we pre-seed the knowledge graph with historical data from USPVDB + EIA-860, even before the EPC discovery agent is running? This gives us developer→region patterns immediately.
- [TBD] How do we handle EPC subcontracting? (e.g., McCarthy as general EPC, with a specialized tracker installer as sub). Is the sub relevant to Civ Robotics?
- [TBD] Do we need a `contacts` table linked to developers and EPCs? (Names, titles, emails of key people). This would be Phase 7+ territory.
