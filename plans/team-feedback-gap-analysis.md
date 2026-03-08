# Team Feedback — Gap Analysis & Implementation Plan

_Generated 2026-03-07_
_Updated 2026-03-08 — all HIGH and MEDIUM items complete_

---

## HIGH PRIORITY

### 1. Global Year Filter (COD 2026–2027) — DONE

**Implemented:** COD year min/max dropdowns added to `FilterBar.tsx`. Applied in both Projects tab (`Dashboard.tsx`) and EPC Research tab (`EpcDiscoveryDashboard.tsx`). Hardcoded date range removed.

---

### 2. Project Details Page — DONE

**Implemented:** `/projects/[id]` SSR detail page with project info grid, location with Google Maps link, EPC discovery section with sources, Research button to trigger agent, Data Source section showing provenance, and collapsible raw data viewer. Project names in `ProjectsTable` are clickable links.

---

### 3. Global Search Bar — DONE

**Implemented:** Search in `FilterBar.tsx` and `Dashboard.tsx` now matches on `project_name`, `developer`, `epc_company`, `county`, and `state`. EPC Research tab search covers the same fields plus `queue_id`.

---

### 4. Project Status Tracking — DONE

**Implemented:** `construction_status` column added via migration `007_add_construction_status.sql`. Values: `unknown`, `pre_construction`, `under_construction`, `completed`, `cancelled`. Color-coded pill in `ProjectsTable`, filter dropdown in `FilterBar`.

---

### 5. EPC Table Improvements — DONE

**Implemented:** Complete redesign of the EPC Research tab. Replaced two-panel layout (ProjectPicker + ResearchPanel) with a single table where research results are inline. Columns: Project, EPC Contractor, Confidence, Status, Action. Rows expand to show reasoning + sources + accept/reject buttons. Filter tabs show counts. Research button shows green "Done" state with hover-to-re-research.

---

## MEDIUM PRIORITY

### 6. Data Freshness Indicator — DONE

**Implemented:** Per-ISO freshness card in `StatsCards` showing last scrape date per ISO with green/amber/red staleness dot (green ≤7d, amber ≤14d, red >14d).

---

### 7. Data Source Transparency — DONE

**Implemented:** "Data Source" section added to project detail page (`/projects/[id]`). Shows the project's data origin (ISO queue or GEM Tracker) with description, and EPC Discovery Agent as a second source when research exists.

---

## LOWER PRIORITY

### 8. EPC Chat Repositioning — DONE

**Implemented:** Navigation moved from horizontal top bar to collapsible sidebar. Chat renamed from "EPC Chat" to "Agent" and moved to `/agent`. Projects and EPC Table merged into a single "Pipeline" page with tabs. Old `/epc-discovery` routes deleted. NavBar component deleted.

---

## FUTURE CONSIDERATIONS

### 9. EPC Probability Scoring — NOT STARTED

**Gap:** `lead_score` field exists on `projects` (INTEGER 0–100) but is always 0. No scoring logic implemented.

**Depends on:** Knowledge base being populated with enough data to score meaningfully.

### 10. Automated Alerts for Status Changes — NOT STARTED

**Gap:** No change detection or notification system. Data is scraped but not diffed.

**Depends on:** Delta tracking infrastructure (Phase 4 in roadmap).

---

## Summary

| # | Item | Status |
|---|------|--------|
| 1 | Global Year Filter | **Done** |
| 2 | Project Details Page | **Done** |
| 3 | Global Search Bar | **Done** |
| 4 | Project Status Tracking | **Done** |
| 5 | EPC Table Improvements | **Done** |
| 6 | Data Freshness Indicator | **Done** |
| 7 | Data Source Transparency | **Done** |
| 8 | Chat Repositioning | **Done** |
| 9 | EPC Probability Scoring | Future — needs KB data |
| 10 | Automated Alerts | Future — needs delta tracking |

**8 of 10 items complete.** Remaining 2 are future considerations with unmet prerequisites.
