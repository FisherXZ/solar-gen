# 01 — Product Vision

**Status:** Draft

---

## The Problem

Civ Robotics sells autonomous layout robots to solar farm EPC contractors. Their sales team needs to know about utility-scale solar projects *before* ground breaks — ideally 6-18 months out — so they can reach the EPC contractor while equipment decisions are still being made.

Today, this intelligence gathering is manual: trade show conversations, industry newsletters, word of mouth. Projects slip through. Competitors get there first.

## What We're Building

A lead generation platform that continuously discovers upcoming utility-scale solar projects, identifies who is building them (the EPC contractor, not just the financial developer), and delivers actionable intelligence to the sales team.

**Three layers:**

1. **Data Ingestion** — Scrape ISO interconnection queues, EIA filings, FERC records, state permits, and industry news. Cross-reference across sources to build a unified project timeline.

2. **EPC Discovery & Knowledge Graph** — The core differentiator. For each project, use a combination of news scraping, SEC filings, developer website analysis, and AI-powered research to identify the EPC contractor. Over time, build a knowledge graph of developer-to-EPC relationships that enables prediction even before a contract is announced.

3. **Intelligence Delivery** — A dashboard with an agent chat interface as the primary way to explore data. Slack/email alerts for high-signal events. CRM integration to push enriched leads directly to the sales workflow.

## What Makes This Different

- **Not just a scraper** — Scrapers give you a data dump. We cross-reference multiple data sources to track a project's progression and surface it at the right moment.
- **EPC discovery** — No public database maps solar projects to their EPC contractors. Our knowledge graph is the moat.
- **Agent-first interface** — Salespeople don't want to configure filters. They want to ask "What new 200MW+ projects appeared in Texas this month and who's likely building them?"

## Target User

Solar robotics sales reps at Civ Robotics. Eventually, this could serve any company selling to utility-scale solar EPCs (tracker manufacturers, module suppliers, civil contractors).

## Success Metrics

- [TBD — confirm with Liav] Percentage of >100MW projects where we identify the EPC before competitors
- [TBD] Time from project queue entry to EPC identification
- [TBD] Number of qualified leads delivered per month
- [TBD] Sales pipeline influenced by platform-sourced leads
