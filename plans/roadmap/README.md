# Solar Lead Gen Agent — Full Product Roadmap

**Date:** 2026-03-01
**Status:** Draft — will be refined iteratively

---

## What This Is

A roadmap for turning the Phase 1 ISO queue scraper + dashboard into a full lead generation platform for Civ Robotics. The core thesis: ISO queues tell you *what* projects exist, but the real value is discovering *who builds them* (EPC contractors) and delivering actionable intelligence to the sales team.

## Document Structure

Sections are ordered conceptually (each builds on the previous). **Implementation priority** is different — see [09-implementation-phases.md](09-implementation-phases.md) for the build order.

| # | Section | Description |
|---|---------|-------------|
| 1 | [Product Vision](01-product-vision.md) | What we're building, for whom, what makes it different |
| 2 | [Project Lifecycle Map](02-project-lifecycle-map.md) | How data sources correlate across a project's lifecycle |
| 3 | [EPC Discovery](03-epc-discovery.md) | **Core value prop** — finding the EPC contractor for each project |
| 4 | [Knowledge Graph](04-knowledge-graph.md) | Developer-to-EPC relationship database that compounds over time |
| 5 | [Delta Tracking](05-delta-tracking.md) | Detecting and classifying changes between scrape runs |
| 6 | [Geocoding Cascade](06-geocoding-cascade.md) | Tiered approach to finding project coordinates |
| 7 | [Dashboard & Agent Chat](07-dashboard-agent-chat.md) | Frontend architecture: insights dashboard + natural language interface |
| 8 | [Notifications & Integrations](08-notifications-integrations.md) | Slack, email, CRM push |
| 9 | [Implementation Phases](09-implementation-phases.md) | Sequenced build plan with dependencies |
| 10 | [Open Items for Liav](10-open-items-liav.md) | Questions that need answers before we proceed on certain phases |

## Implementation Priority

The build order prioritizes **EPC discovery** and the **knowledge graph** over infrastructure improvements like delta tracking and geocoding. Rationale: a lead with a known EPC is actionable today; a lead with better coordinates is not.

```
Phase 1 (done):  ISO queues + basic dashboard
     ↓
Phase 2:         EPC discovery agent + knowledge graph
     ↓
Phase 3:         Agent chat interface on dashboard
     ↓
Phase 4:         Delta tracking + more ISOs
     ↓
Phase 5:         EIA-860 cross-referencing + geocoding
     ↓
Phase 6:         Notifications + CRM integration
     ↓
Phase 7:         Advanced scoring (with Liav)
```

## Related Documents

- [Phase 1 Plan](../2026-03-01-phase1-iso-queue-ingestion-dashboard.md) — the foundation this roadmap builds on
- Agent Chat Technical Design — TBD (separate document)
