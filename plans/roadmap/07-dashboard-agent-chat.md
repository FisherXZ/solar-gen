# 07 — Dashboard & Agent Chat Interface

**Status:** Draft — technical implementation will be a separate document

---

## Philosophy

The dashboard is not a data browser — it's an **insights surface**. It should answer "what should I do today?" not "here's 2,000 rows."

Two modes of interaction:

1. **Dashboard views** — Curated, high-impact visualizations that show actionable information at a glance. These are designed, not configured. The user doesn't build custom reports — we surface what matters.

2. **Agent chat** — The primary way to explore data deeply. Instead of building 50 filter combinations, the user asks: "Show me all 200MW+ projects in Texas where we don't know the EPC yet" or "Which developers have used Blattner in the last 2 years?"

## Dashboard: Core Views

### Main Dashboard (the landing page)

What a sales rep sees when they open the tool:

```
┌─────────────────────────────────────────────────────────┐
│  STATS CARDS                                            │
│  [Total Projects] [Total MW] [EPCs Found] [New This Wk] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  HOT LEADS (top 10 actionable leads)                    │
│  Projects where: EPC known, score > 70, status active   │
│  Each row: name, developer, EPC, MW, state, COD, score  │
│  Click → project detail page                            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  WHAT CHANGED (delta feed — last 7 days)                │
│  Tier 1 and Tier 2 events, most recent first            │
│  Each item: project name, what changed, when            │
│  Click → project detail page                            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  AGENT CHAT                                             │
│  [ Ask about your leads...                          ]   │
│                                                         │
│  Suggested queries:                                     │
│  "New solar projects this week"                         │
│  "Projects in TX without a known EPC"                   │
│  "Which EPCs are most active in ERCOT?"                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### All Projects (table view — exists in Phase 1, enhanced)

The full filterable table. Enhancements over Phase 1:

- Delta badges (red/yellow dots for recent changes)
- EPC column (populated by discovery agent)
- Geocode indicator (exact vs. approximate)
- Quick-action buttons: "Research EPC" (triggers agent), "View Details"
- Bulk export (CSV)

### Map View (requires geocoding)

Interactive map showing geocoded projects. Features:

- Color-coded by lead score or project stage
- Cluster view at high zoom levels (especially for county-centroid projects)
- Click a pin → project summary popup → link to detail page
- Filter overlay (same filters as table view)
- [TBD: Map library — Mapbox GL JS or Leaflet]

### Project Detail Page

Deep dive on a single project. All enrichment data in one place:

```
┌─────────────────────────────────────────────────┐
│  PROJECT: Sunflower Solar                       │
│  250MW | ERCOT | Travis County, TX              │
│  Score: 92 | Status: Active                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  KEY FACTS                                      │
│  Developer: Lightsource bp                      │
│  EPC: McCarthy (confirmed — 2 sources)          │
│  Expected COD: 2027-06                          │
│  Queue Date: 2024-01-15                         │
│  Coordinates: 30.12, -97.45 (EIA-860)           │
│                                                 │
│  DATA SOURCES                                   │
│  ✓ ISO Queue (ERCOT J-1234)                     │
│  ✓ EIA-860 (Plant ID 67890)                     │
│  ✓ FERC LGIA (filed 2025-03)                    │
│  ✗ State permit (not found)                     │
│                                                 │
│  EVENT TIMELINE                                 │
│  2024-01 — Entered queue                        │
│  2024-09 — Status → System Impact Study         │
│  2025-03 — FERC LGIA filed                      │
│  2025-06 — Matched to EIA-860                   │
│  2025-11 — EPC identified (McCarthy)            │
│                                                 │
│  EPC DISCOVERY SOURCES                          │
│  • Developer PR (2025-11-01): "Lightsource bp   │
│    selects McCarthy for 250MW TX solar project"  │
│  • McCarthy website: listed in portfolio         │
│                                                 │
│  KNOWLEDGE GRAPH CONTEXT                        │
│  Lightsource bp → McCarthy: 3 other TX projects │
│  McCarthy active in TX: 8 projects, 2.1GW       │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Developer Profile Page

View a developer's full portfolio and EPC relationships:

- All projects by this developer (from our database)
- Known EPC relationships (from knowledge graph)
- Regional presence (which states they're active in)
- Recent activity (new queue entries, status changes)

### EPC Profile Page

View an EPC contractor's portfolio:

- All known projects by this EPC
- Which developers they work with
- Regional presence
- Size range they typically handle

## Agent Chat Interface

### What It Answers

The agent has access to all data in the system and can answer natural language queries:

**Lead discovery:**
- "What new solar projects entered queues this week?"
- "Show me all 200MW+ projects in Texas"
- "Which projects are in system impact study or later?"

**EPC intelligence:**
- "Who is the EPC for the Sunflower Solar project?"
- "Which EPCs are most active in ERCOT?"
- "Has Lightsource bp ever worked with Mortenson?"
- "Research the EPC for project X" (triggers the EPC discovery agent)

**Market analysis:**
- "How many MW of solar are in CAISO's queue by status?"
- "Which states have the most new projects this quarter?"
- "Show me the trend of queue entries over the last 12 months"

**Workflow:**
- "Show me my hot leads for this week"
- "What changed in the last 3 days?"
- "Export all Texas projects with known EPCs to CSV"

### What It Doesn't Do (Phase 1 of chat)

- Doesn't modify data (read-only in initial release)
- Doesn't send emails or Slack messages
- Doesn't integrate with CRM directly
- [TBD: when to add write capabilities]

### Technical Architecture (High-Level Only)

Full technical design will be a separate document. At a high level:

```
User query (natural language)
  → Claude API with tool use
  → Tools available:
      - query_projects(filters) → project rows
      - query_events(filters) → delta events
      - query_knowledge_graph(developer?, epc?) → relationships
      - get_project_detail(id) → full project record
      - research_epc(project_id) → trigger EPC discovery agent
      - aggregate(metric, group_by, filters) → stats
  → Structured response rendered in chat UI
```

[TBD: Separate document for agent chat technical implementation — model selection, streaming, tool schemas, prompt engineering, cost management, conversation history]

## Information Architecture Summary

```
Dashboard (landing page)
├── Stats Cards
├── Hot Leads
├── What Changed (delta feed)
└── Agent Chat

All Projects (table)
├── Filterable, sortable
├── Delta badges
├── Export

Map View
├── Geocoded projects
├── Filter overlay

Project Detail (/project/:id)
├── Key facts
├── Data source indicators
├── Event timeline
├── EPC discovery sources
├── Knowledge graph context

Developer Profile (/developer/:id)
├── Portfolio
├── EPC relationships
├── Regional presence

EPC Profile (/epc/:id)
├── Portfolio
├── Developer relationships
├── Regional presence
```
