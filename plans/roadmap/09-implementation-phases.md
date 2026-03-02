# 09 — Implementation Phases

**Status:** Draft

---

## Guiding Principle

Prioritize by **lead actionability**. A lead with a known EPC is a sales conversation. A lead with better coordinates is a prettier map pin. EPC discovery and the knowledge graph come before infrastructure improvements.

## Phase 1: ISO Queue Ingestion + Basic Dashboard (DONE)

**Status:** Implemented (2026-03-01)

**What was built:**
- 3 ISO queue scrapers (ERCOT, CAISO, MISO) — direct fetchers (gridstatus had Python 3.13 compatibility issues)
- Supabase database with `projects` and `scrape_runs` tables
- Next.js dashboard with filterable table, stats cards, filter bar
- GitHub Actions weekly cron
- Basic lead scoring heuristic

**Outcome:** ~500+ solar projects ingested across 3 ISOs. Dashboard functional. All projects have `epc_company: NULL`.

**Reference:** [Phase 1 Plan](../2026-03-01-phase1-iso-queue-ingestion-dashboard.md)

---

## Phase 2: EPC Discovery Agent + Knowledge Graph Foundation

**Priority:** HIGHEST — this is the core value proposition

**Depends on:** Phase 1

**What to build:**

### 2A: Knowledge Graph Schema + Seeding
- Create `developers`, `epc_contractors`, `epc_engagements` tables in Supabase
- Manually seed with the 10 verified developer→EPC examples
- Pre-populate the top 20 developers and top 10 EPCs with metadata (website, newsroom URL, etc.)
- See [04-knowledge-graph.md](04-knowledge-graph.md)

### 2B: EPC Discovery Agent (MVP)
- Build a Claude-powered agent that takes a project record and attempts to find the EPC
- MVP tools: web search + knowledge graph lookup
- Output: EPC name, confidence level, source citations
- Run manually at first (triggered from dashboard or CLI), not automated
- See [03-epc-discovery.md](03-epc-discovery.md)

### 2C: Trade Publication Monitoring
- Automated scraper for Solar Power World, PV Magazine (the two highest-signal trade pubs)
- Extract: project name, developer, EPC, MW, state
- Match to existing projects in our database
- Feed confirmed relationships into knowledge graph
- See [03-epc-discovery.md](03-epc-discovery.md) — Channel 2

### 2D: Developer Press Release Monitoring
- Monitor newsroom pages of top 10 developers (start small)
- Extract EPC mentions from press releases
- Feed into knowledge graph
- See [03-epc-discovery.md](03-epc-discovery.md) — Channel 1

**Outcome:** For high-priority leads (>100MW, active status), we can identify the EPC ~60% of the time. Knowledge graph has 30+ confirmed relationships.

**Estimated scope:** [TBD — this is the biggest phase, may need sub-phasing]

---

## Phase 3: Dashboard Enhancements + Agent Chat (MVP)

**Priority:** HIGH — makes the data usable

**Depends on:** Phase 2 (need EPC data and knowledge graph to query)

**What to build:**

### 3A: Hot Leads Section
- Top 10-15 leads where EPC is known, score > 70, status active
- Prominent placement above the full table
- See [07-dashboard-agent-chat.md](07-dashboard-agent-chat.md)

### 3B: Project Detail Page
- Full project view with all enrichment data
- EPC discovery sources and confidence
- Knowledge graph context (other projects by same developer/EPC)
- See [07-dashboard-agent-chat.md](07-dashboard-agent-chat.md)

### 3C: Agent Chat (MVP)
- Chat interface on dashboard
- Read-only queries against projects, knowledge graph, events
- Suggested queries for discoverability
- [TBD: Separate technical design document]

### 3D: "Research EPC" Button
- On each project row and project detail page
- Triggers the EPC discovery agent on demand
- Shows results in a panel or updates the record

**Outcome:** Sales reps have a workflow: see hot leads → click into detail → chat for deeper questions → trigger research for unknowns.

---

## Phase 4: Delta Tracking + More ISOs

**Priority:** MEDIUM — improves existing data quality and coverage

**Depends on:** Phase 1

**What to build:**

### 4A: Delta Tracking System
- `project_events` table
- Modify scraper pipeline to detect and log changes
- Signal tier classification (critical / notable / informational)
- See [05-delta-tracking.md](05-delta-tracking.md)

### 4B: Delta Feed on Dashboard
- "What Changed" section on main dashboard
- Change badges on table rows
- Event timeline on project detail page

### 4C: More ISOs
- Add PJM (largest US ISO by capacity)
- Add SPP (Southern Plains)
- Add ISO-NE, NYISO as capacity allows
- Same scraper pattern — extend base class, add to cron
- [TBD: Prioritize by solar market size, not just ISO size. PJM has massive capacity but solar is a smaller share than ERCOT/CAISO]

**Outcome:** 5-7 ISOs covered (roughly doubling project count). All projects have change history tracked.

---

## Phase 5: EIA-860 Cross-Referencing + Geocoding

**Priority:** MEDIUM — adds lifecycle progression signals and map capability

**Depends on:** Phase 4 (delta tracking needed to log cross-reference matches as events)

**What to build:**

### 5A: EIA-860 Ingestion
- Annual bulk download of EIA-860 Plant + Generator files
- Ingest planned solar generators
- Cross-reference with ISO queue projects (fuzzy matching)
- Matched projects get: exact coordinates, EIA plant ID, confirmed COD
- See [02-project-lifecycle-map.md](02-project-lifecycle-map.md)

### 5B: Geocoding Cascade
- Census county centroid as immediate fallback (can do this earlier if needed for map view)
- EIA-860 exact coordinates for matched projects
- USPVDB for operational projects
- `geocode_source` field on projects table
- See [06-geocoding-cascade.md](06-geocoding-cascade.md)

### 5C: Map View
- Interactive map with geocoded projects
- Color-coded by score or stage
- Filter overlay
- Distinguishes exact vs. approximate coordinates

**Outcome:** Every project has at least county-level coordinates. Matched projects have exact coordinates. Map view is functional.

---

## Phase 6: Notifications + CRM Integration

**Priority:** MEDIUM-LOW — makes the tool push information instead of requiring pull

**Depends on:** Phase 4 (delta events), Phase 2 (EPC data)

**What to build:**

### 6A: Slack Alerts
- Webhook for Tier 1 events (status progression, EPC identified, new large projects)
- Weekly digest message

### 6B: Email Digest
- Weekly summary email to configured recipients
- Template with new projects, status changes, EPCs found

### 6C: CRM Push
- One-way push of qualified leads to CRM
- [TBD: Which CRM — Salesforce, HubSpot]
- Dedup by project queue ID
- See [08-notifications-integrations.md](08-notifications-integrations.md)

**Outcome:** Sales reps get notified about important events without checking the dashboard. Qualified leads appear in their CRM.

---

## Phase 7: Advanced Scoring (with Liav)

**Priority:** LOW (until EPC discovery and data pipeline are mature)

**Depends on:** Phase 2, Phase 4, Phase 5

**What to build:**

### 7A: Multi-Signal Scoring Model
- Replace basic heuristic with a weighted model incorporating:
  - MW capacity
  - Number of data sources matched (ISO + EIA + FERC = higher score)
  - EPC identified (yes/no, confidence level)
  - Delta signals (progression events increase score)
  - Developer track record (from knowledge graph: developers who complete projects score higher)
  - Time to expected COD (sweet spot: 6-18 months out)

### 7B: Agent-Based Scoring (with Liav)
- Work with Liav to define what makes a "good lead" from Civ Robotics' perspective
- Build a Claude-powered scorer that considers qualitative factors
- Example: "This is a 300MW project by a developer with a track record of completing projects, using an EPC we've worked with before, in a state where we have existing deployments"

**Outcome:** Lead scores that sales reps actually trust and that correlate with conversion.

---

## Phase 8+: Future (Not Yet Planned)

Ideas that are valuable but not yet prioritized:

- **FERC eLibrary monitoring** — cross-reference for interconnection agreements
- **State permitting integration** — start with TX, CA
- **EPC company website monitoring** — automated scraping of portfolio pages
- **SEC filing monitoring** — 8-K alerts for publicly traded EPCs
- **Developer profile pages** — in the dashboard
- **EPC profile pages** — in the dashboard
- **Two-way CRM sync** — status updates from CRM back to our system
- **Agent chat write capabilities** — agent can update records, trigger actions
- **Competitive intelligence** — track which EPCs are winning the most contracts
- **Predictive analytics** — which queue projects will actually get built?

---

## Phase Dependencies (Visual)

```
Phase 1 (DONE)
  │
  ├──→ Phase 2: EPC Discovery + Knowledge Graph
  │      │
  │      ├──→ Phase 3: Dashboard + Agent Chat
  │      │      │
  │      │      └──→ Phase 6: Notifications + CRM
  │      │
  │      └──→ Phase 7: Advanced Scoring
  │
  └──→ Phase 4: Delta Tracking + More ISOs
         │
         └──→ Phase 5: EIA-860 + Geocoding
                │
                └──→ Phase 6: Notifications + CRM
```

Note: Phase 2 and Phase 4 can be worked on in parallel since they don't depend on each other.
