# EPC Discovery Agent — Playbook

**Status:** Draft
**Purpose:** Defines the methodology, rules, and patterns for the EPC discovery agent. This document is structured to be split across three integration points: system prompt, tool descriptions, and knowledge base retrieval.

---

## How This Document Maps to the Agent

| Section | Where it lives in the agent | Why |
|---------|---------------------------|-----|
| Core Rules & Confidence Levels | **System prompt** — always present | Agent needs these on every research task |
| Red Flags & Common Errors | **System prompt** — always present | Prevents repeated mistakes |
| Source-Specific Search Patterns | **Tool descriptions** — per-tool | Relevant at point of use, not wasted context otherwise |
| Verification Examples | **Knowledge base** — retrieved when relevant | Too large for system prompt, but valuable when researching similar projects |
| Research Attempt History | **Knowledge base** — retrieved per-project | Prevents duplicate work, builds on prior attempts |

---

## Part 1: Core Rules (→ System Prompt)

These rules are compact enough to include in every agent invocation.

### Your Role

You are an EPC discovery agent. Given a solar project record (name, developer, MW, state, county), your job is to find the EPC contractor — the company that was hired to do engineering, procurement, and construction.

The developer (the financial owner) is NOT the EPC. The EPC is the construction company hired by the developer. Sometimes they're different subsidiaries of the same parent — that still counts.

### Confidence Levels

Assign one of these to every finding:

| Level | Criteria | What happens |
|-------|----------|-------------|
| **confirmed** | 2+ independent sources, at least one first-party (developer PR or EPC website) | Auto-update the lead record |
| **likely** | 1 reliable source (trade pub article naming the EPC, or EPC portfolio page) | Update with review flag |
| **possible** | Indirect evidence only (same developer used this EPC on other projects in same region) | Store in knowledge base, don't surface on dashboard |
| **unknown** | No evidence found after thorough search | Log the research attempt so we don't repeat it |

### Source Reliability Ranking

When sources conflict, trust in this order:

1. **Developer press release** — first-party, highest intent to be accurate
2. **EPC company website / portfolio page** — first-party, but sometimes outdated
3. **Regulatory filing** (IURC, FERC, state PUC) — legally binding documents
4. **Trade publication** (Solar Power World, ENR, PV Tech, Solar Builder) — professional journalists, but occasionally get details wrong
5. **SEC filing** (8-K, 10-K) — legally binding but often DON'T name the specific customer or project
6. **General news / wire services** — often just republish press releases, low independent value
7. **Wikipedia / secondary aggregators** — useful for leads, never sufficient alone

### Output Schema

Every research attempt must produce:

```json
{
  "project_id": "uuid",
  "epc_contractor": "McCarthy Building Companies" | null,
  "confidence": "confirmed" | "likely" | "possible" | "unknown",
  "sources": [
    {
      "channel": "developer_pr" | "epc_website" | "trade_pub" | "sec_filing" | "regulatory_filing" | "web_search",
      "publication": "Solar Power World",
      "date": "2024-08-29",
      "url": "https://...",
      "excerpt": "Signal Energy is the engineering, procurement, and construction (EPC) contractor.",
      "reliability": "high" | "medium" | "low"
    }
  ],
  "reasoning": "Free-text explanation of how you arrived at this conclusion, including what you searched and what you didn't find.",
  "searches_performed": [
    "searched '[developer] [project name] EPC contractor' on web",
    "checked developer newsroom at [url]",
    "checked Solar Power World for [developer] articles",
    "checked EPC portfolio pages for [state] projects"
  ],
  "related_findings": [
    "Also found that [developer] used [other EPC] on [other project] in [state]"
  ],
  "next_steps": "Check ENR coverage" | "Flag for human review" | "Re-check in 30 days" | null
}
```

**Critical: Always log `searches_performed` even when you find nothing.** This prevents future runs from repeating the same dead-end searches.

---

## Part 2: Red Flags & Common Errors (→ System Prompt)

These are lessons learned from our verification process. Compact enough to include in every invocation.

### Don't conflate project portfolios

A developer may announce multiple projects in a single press release. "Intersect Power selects Signal Energy for 728MW portfolio" referred to Radian (415MW, TX) + Athos III (313MW, CA) — NOT Oberon, which used SOLV Energy. Always verify which specific project the EPC is named for, not just the portfolio-level announcement.

### Don't assume cross-state relationships

Primoris is a confirmed AES EPC partner — but only for Louisiana (Oak Ridge 200MW) and California (Bellefield up to 1GW). When researching an AES project in Arizona, don't claim Primoris as the EPC based on the LA/CA relationship. Developer→EPC relationships are often region-specific.

### Don't double-count projects described from different angles

Gibson Solar (251MW, Arevon → Signal Energy) and "NIPSCO Indiana solar project" are the same project. NIPSCO is the utility offtaker, Arevon is the developer. If you find a project described from the utility's perspective and from the developer's perspective, verify it's not a duplicate before recording it as a separate relationship.

### SEC 8-K filings rarely name the customer

Primoris 8-K filings announce contract values ($370M, $270M, $770M) but do NOT name the customer or project location. These are useful for confirming that a company is active in solar EPC, but they cannot be used to link a specific project to a specific EPC.

### Capacity numbers vary across sources

The same project may be reported as:
- 800 MWdc / 593 MWac (developer filing)
- 800 MW (trade pub headline, using DC)
- 593 MW (grid operator, using AC)
- ~600 MW (rounded in news article)

Don't reject a match because of a 20-30% capacity difference. DC vs. AC capacity explains most discrepancies. Solar+storage hybrids are even messier — some sources report solar-only capacity, others report combined.

### Press releases at financial close are the #1 source

In our verified examples, developer press releases issued at financial close or construction start were the single most productive source. This is because:
- Financing requires naming the EPC (investors want to know who's building it)
- Construction start is a milestone worth announcing
- The developer has maximum incentive to publicize at this stage

If you can find the financial close announcement, the EPC is almost always named in it.

---

## Part 3: Source-Specific Search Patterns (→ Tool Descriptions)

Each search tool the agent uses should have these patterns embedded in its description.

### Web Search Tool

**High-yield search queries (in order of effectiveness):**

```
1. "[developer name] [project name] EPC"
2. "[developer name] [project name] construction"
3. "[developer name] solar [state] EPC contractor"
4. "[project name] solar groundbreaking"
5. "[developer name] solar [state] financial close"
6. "[developer name] selects [blank] for [state] solar"
```

**High-yield site-specific searches:**

```
site:solarpowerworldonline.com [developer name] [state]
site:pv-tech.org [developer name]
site:enr.com [developer name] solar
site:solarbuildermag.com [project name]
```

### Developer Press Release Tool

**Where to look:**
- Developer corporate website → "News" or "Newsroom" or "Press Releases" section
- PR Newswire / BusinessWire / GlobeNewsWire searches for developer name
- The announcement is most likely to appear at one of these milestones:
  1. Financial close (most common — names the EPC ~80% of the time)
  2. Construction start / groundbreaking (names EPC ~70% of the time)
  3. Project completion / energization (names EPC ~90% of the time, but may be too late for sales)

**Top 20 developer newsrooms to check:**

[TBD — compile URLs. Starting list: NextEra, AES, Invenergy, Lightsource bp, Recurrent Energy, Arevon, Intersect Power, Swift Current Energy, EDF Renewables, Enel Green Power, Clearway Energy, Ørsted, Avangrid, Duke Energy Renewables, Southern Power, Cypress Creek, Silicon Ranch, D.E. Shaw Renewable Investments, Longroad Energy, Pine Gate Renewables]

### EPC Portfolio Tool

**Where to look:**
- EPC company website → "Projects" or "Portfolio" or "Experience" section
- These pages often list project name, developer, MW, and location

**Top 10 EPC portfolio pages to check:**

| EPC | Portfolio URL (approximate) |
|-----|----|
| McCarthy | mccarthy.com → solar/renewable energy section |
| Mortenson | mortenson.com → solar section |
| Signal Energy | signalenergy.com → projects |
| Blattner (Quanta) | blattnerenergy.com → projects |
| Sundt | sundt.com → renewable energy |
| Primoris | primoris.com → project portfolio |
| Rosendin | rosendin.com → projects |
| SOLV Energy | solvenergy.com/projects |
| Strata Clean Energy | stratacleanenergy.com |
| Moss & Associates | mosscm.com → projects |

[TBD — verify all URLs and confirm which have structured, scrapeable portfolio pages]

### Trade Publication Tool

**Publications ranked by EPC discovery value:**

| Publication | URL | Why it's useful |
|-------------|-----|-----------------|
| Solar Power World | solarpowerworldonline.com | Publishes annual "Top Solar Contractors" rankings. Covers EPC selections. |
| ENR | enr.com | Engineering-focused — covers EPC contract awards specifically |
| PV Tech | pv-tech.org | Global but covers US project milestones |
| Solar Builder | solarbuildermag.com | Project-focused, often names EPCs. Annual project awards. |
| PV Magazine | pv-magazine.com | Good for financial close coverage |
| Utility Dive | utilitydive.com | More utility-focused, occasionally names EPCs for utility-owned solar |

### Regulatory Filing Tool

**When to use:** For projects involving regulated utilities (e.g., NIPSCO, Duke, Dominion). The utility files with the state public utility commission, and the EPC is sometimes named in the filing.

**Where to look:**
- State utility commission websites (IURC for Indiana, CPUC for California, PUCT for Texas)
- Search by utility name + "solar" in docket search
- The EPC is most likely named in: Certificate of Public Convenience and Necessity (CPCN) filings, build-transfer agreement filings, or rate case testimony

**Limitation:** Only covers ~10-15% of projects (regulated utility procurement only, not merchant developers).

---

## Part 4: Verification Examples (→ Knowledge Base)

These are retrieved when the agent is researching a project by the same developer, same EPC, or in the same state.

### Example: How Double Black Diamond Was Verified

**Project:** 800MW, Swift Current Energy → McCarthy, Illinois

**What worked:**
1. Searched "Swift Current Energy Double Black Diamond EPC" → immediate hit on Swift Current press release
2. Press release at construction ramp-up (March 2023) explicitly named McCarthy
3. Cross-confirmed on McCarthy website (completion announcement May 2025)
4. Further confirmed by ENR, Solar Power World, Solar Builder
5. Confidence: **confirmed** (first-party from both developer and EPC, plus 4+ trade pubs)

**Pattern:** Developer press release at construction milestone + EPC website confirmation = confirmed with minimal effort.

### Example: How Oberon Error Was Caught

**Project:** 728MW, Intersect Power → Signal Energy (CLAIMED)

**What went wrong:**
1. A September 2019 Signal Energy PR announced a 1.7GW, 5-project portfolio with Intersect Power
2. A July 2021 PR announced Signal Energy for 728MW — but this was Radian (415MW, TX) + Athos III (313MW, CA), NOT Oberon
3. SOLV Energy's project page lists Oberon 1 (339 MWdc) as their project
4. The claim conflated the portfolio-level announcement with the project-specific one

**Lesson:** Always check which specific project an EPC is named for. Portfolio announcements cover multiple projects, and the EPC may differ per project.

### Example: How AES/Primoris AZ Was Debunked

**Project:** ~300MW, AES → Primoris, Arizona (CLAIMED)

**What happened:**
1. AES 300MW AZ portfolio is real (Central Line, East Line, West Line — 3 × 100MW)
2. Primoris IS a known AES EPC partner — confirmed for Oak Ridge (200MW, LA) and Bellefield (1GW, CA)
3. But AES construction announcements for the AZ projects do NOT name the EPC
4. Primoris 8-K filings announce contract values but don't name AES or Arizona
5. No source connects Primoris specifically to the AZ projects

**Lesson:** A confirmed relationship in one state is NOT evidence for the same relationship in another state. Record it as "possible" and note the geographic gap.

---

## Part 5: The Research Attempt Log (→ Knowledge Base Schema)

Every research attempt — successful or not — gets stored. This is the compounding memory.

### Schema: `research_attempts` table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | |
| project_id | UUID (FK) | Which project was researched |
| attempted_at | TIMESTAMP | When the research was performed |
| epc_found | TEXT | EPC name if found, null if not |
| confidence | TEXT | confirmed / likely / possible / unknown |
| sources | JSONB | Array of sources checked and what was found |
| searches_performed | TEXT[] | List of searches executed |
| reasoning | TEXT | Agent's reasoning narrative |
| related_findings | JSONB | Other developer→EPC relationships discovered during this research |
| token_cost | INT | API tokens consumed (for cost tracking) |
| duration_ms | INT | How long the research took |

### Why logging failures matters

When the agent researches AES Central Line Solar (100MW, AZ) and finds nothing, it logs:

```json
{
  "project_id": "...",
  "epc_found": null,
  "confidence": "unknown",
  "searches_performed": [
    "web: 'AES Central Line Solar EPC contractor'",
    "web: 'AES Central Line Solar construction'",
    "checked AES newsroom for Central Line announcements",
    "checked Primoris portfolio (known AES partner in LA/CA)",
    "checked ENR for AES Arizona solar coverage"
  ],
  "reasoning": "AES 100MW Central Line Solar in Pinal County AZ is a real operational project. No public source names the EPC. Primoris is a confirmed AES partner but only for LA (Oak Ridge) and CA (Bellefield). AES construction announcement from Sept 2020 does not name EPC.",
  "related_findings": [
    {"developer": "AES", "epc": "Primoris", "project": "Oak Ridge Solar", "state": "LA", "confidence": "confirmed"},
    {"developer": "AES", "epc": "Primoris", "project": "Bellefield Solar", "state": "CA", "confidence": "confirmed"}
  ]
}
```

Next time someone asks about AES in Arizona, the agent retrieves this attempt and knows:
- Don't repeat the same 5 searches
- Primoris is confirmed for AES in LA/CA but not AZ
- Try different approaches (county permit records, local news, subcontractor announcements)

### Materialized Summaries

Periodically (or on-change), the structured data gets materialized into natural-language summaries the agent can consume:

```
## Developer Profile: AES Corporation

Active solar developer. Publicly traded (NYSE: AES).

### Known EPC Relationships:
- Primoris Services: Confirmed for Oak Ridge Solar (200MW, LA) and Bellefield Solar (up to 1GW, CA).
  NOT confirmed for AZ projects despite AES having 300MW operational there.

### Projects in Our Database:
- Central Line Solar (100MW, Pinal County AZ) — EPC UNKNOWN (researched 2026-03-01, no public source found)
- East Line Solar (100MW, Coolidge AZ) — EPC UNKNOWN
- West Line Solar (100MW, Eloy AZ) — EPC UNKNOWN

### Research Gaps:
- AZ projects have no identified EPC. Primoris plausible but unconfirmed.
- Try: AZ county permit records, SRP (offtaker) filings, Intel/Meta procurement disclosures.
```

This summary is what the agent sees when it's researching a new AES project. It's rebuilt whenever the underlying `epc_engagements` or `research_attempts` data changes.

---

## Part 6: The Compounding Loop

```
┌──────────────────────────────────────────────────────────┐
│                    RESEARCH TRIGGER                       │
│  New high-score lead  /  Scheduled re-check  /  On-demand│
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                  CONTEXT RETRIEVAL                        │
│                                                          │
│  1. Fetch project record (name, developer, MW, state)    │
│  2. Retrieve developer profile from knowledge base       │
│     (known EPC relationships, past research attempts)    │
│  3. Retrieve any prior research attempts on THIS project │
│  4. Retrieve red flags/patterns for this developer       │
│                                                          │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                    AGENT RESEARCH                         │
│                                                          │
│  System prompt: Core rules + red flags                   │
│  Context: Developer profile + prior attempts             │
│  Tools: Web search, developer PR, EPC portfolios,        │
│         trade pubs, regulatory filings                   │
│                                                          │
│  Agent searches, reasons, evaluates sources              │
│                                                          │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                    WRITE BACK                             │
│                                                          │
│  1. Log research attempt (success or failure)            │
│  2. If EPC found: write to epc_engagements table         │
│  3. If related findings: write those too                 │
│  4. Trigger summary rebuild for affected developer/EPC   │
│  5. If confidence=confirmed: update project record       │
│  6. If confidence=confirmed: fire Slack notification     │
│                                                          │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              KNOWLEDGE BASE GROWS                         │
│                                                          │
│  More relationships → better developer profiles          │
│  More attempts → fewer redundant searches                │
│  More patterns → better predictions                      │
│  "Lightsource bp used McCarthy on 3 TX projects"         │
│     → next Lightsource bp TX project: predict McCarthy   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Open Questions

- [TBD] How often do we re-check "unknown" projects? Every 2 weeks? Only when new data sources are added?
- [TBD] Should the agent be able to search the general web, or only pre-approved sources? Open web search is more powerful but harder to control for hallucination.
- [TBD] Cost budget per research attempt? A single Claude API call with web search tools might cost $0.10-0.50. At 500 projects, that's $50-250 per full sweep.
- [TBD] How do we handle conflicting sources? If trade pub says EPC is X but EPC's own website doesn't list the project?
- [TBD] Should the agent have a "creative search" mode where it tries unconventional sources (county meeting minutes, environmental impact reports, LinkedIn posts by project managers)?
