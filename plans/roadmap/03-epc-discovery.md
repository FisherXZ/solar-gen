# 03 — EPC Discovery

**Status:** Draft — examples need link verification

---

## Why This Is the Core Value Prop

ISO queues tell you the **developer** (the financial entity that owns the project). But developers don't buy layout robots — **EPC contractors** do. They're the ones on-site, grading land, installing trackers, placing modules.

Right now, every lead in our database has `epc_company: NULL`. Filling that field transforms a data point into a sales lead.

No public database maps solar projects to their EPC contractors. Building this capability — and compounding it over time via a knowledge graph — is what makes this product defensible.

## The 5 EPC Disclosure Channels

EPC contract awards are not published in any single registry. They surface through 5 different channels, each with different coverage, reliability, and latency.

### Channel 1: Developer Press Releases at Financial Close

**The single most reliable source.** When a developer closes $300M+ in project financing, they almost always issue a press release naming the EPC. This is because investors/lenders want public validation, and naming a reputable EPC builds credibility.

- **Coverage:** ~60-70% of projects >100MW
- **Latency:** Days after financial close (typically 6-18 months before construction starts)
- **Where to find:** Developer websites (newsroom/press section), PR Newswire, Business Wire, GlobeNewsWire
- **Reliability:** High — comes directly from the developer
- **Example:** Intersect Power announced Signal Energy as EPC for their 728MW Oberon portfolio via press release
  - [TBD: verify link]

### Channel 2: Trade Publications

Solar industry publications cover major project announcements and often name the EPC. These are often republished press releases with added editorial context.

- **Coverage:** ~50-60% of projects >100MW (overlaps heavily with Channel 1)
- **Latency:** Days to weeks after announcement
- **Key publications:**
  - Solar Power World (solarpowerworld.com) — publishes annual "Top Solar Contractors" list
  - PV Magazine (pv-magazine.com)
  - PV Tech (pv-tech.org)
  - Utility Dive (utilitydive.com)
  - ENR / Engineering News-Record (enr.com) — covers EPC contracts specifically
  - Solar Builder (solarbuildermag.com)
- **Reliability:** High when citing named sources; occasionally speculative
- **Example:** Solar Power World covered the Arevon/Signal Energy partnership for the 251MW Gibson Solar project in Indiana
  - [TBD: verify link]

### Channel 3: EPC Company Websites & Project Portfolios

Major solar EPCs maintain project portfolio pages listing completed and in-progress work, often naming the developer.

- **Coverage:** ~30-40% (only covers projects by EPCs that maintain public portfolios)
- **Latency:** Variable — some update in real-time, others lag by months
- **Key EPC websites to monitor:**
  - McCarthy Building Companies (mccarthy.com/solar)
  - Mortenson (mortenson.com/solar)
  - Signal Energy (signalenergy.com)
  - Blattner Energy (blattnerenergy.com) — owned by Quanta Services
  - Sundt Construction (sundt.com)
  - Primoris Services (primoris.com)
  - Rosendin Electric (rosendin.com)
  - SOLV Energy (solvenergy.com)
  - Strata Clean Energy (stratacleanenergy.com)
  - Moss & Associates (mosscm.com)
- **Reliability:** High — self-reported by the EPC
- **Example:** McCarthy's website lists the Double Black Diamond project (800MW) for Swift Current Energy
  - [TBD: verify link]

### Channel 4: SEC / Financial Filings

Publicly traded EPCs (and developers) disclose material contract awards in SEC filings. Most useful for the largest deals.

- **Coverage:** ~10-15% (only publicly traded companies, only material contracts)
- **Latency:** Days (8-K filings) to quarters (10-Q/10-K)
- **Key tickers to monitor:**
  - PRIM (Primoris Services) — one of the largest solar EPCs
  - PWR (Quanta Services) — owns Blattner Energy
  - NEE (NextEra Energy) — both developer and sometimes self-performs EPC
  - AES (AES Corporation)
  - FSLR (First Solar) — module manufacturer but also does some EPC
- **Reliability:** Very high — SEC-mandated disclosure
- **Example:** Primoris (PRIM) disclosed a major solar EPC contract award in an 8-K filing
  - [TBD: verify specific filing]

### Channel 5: State Utility Commission Filings

When a regulated utility contracts for solar capacity (often through build-transfer agreements), the EPC is sometimes named in public filings with the state utility commission.

- **Coverage:** ~10-15% (regulated utilities only, not merchant developers)
- **Latency:** Weeks to months (regulatory filing timelines)
- **Access:** State PUC/PSC websites — varies by state
- **Reliability:** High — regulatory filings are formal documents
- **Example:** NIPSCO (Northern Indiana) filed with the Indiana URC disclosing Arevon as developer and Signal Energy as EPC for a solar project
  - [TBD: verify filing reference]

## 10 Verified Developer → EPC Examples

These are real, publicly discoverable relationships. Source descriptions included; links to be verified.

| # | Project | MW | Developer | EPC | Source Channel | How Found |
|---|---------|-----|-----------|-----|---------------|-----------|
| 1 | Double Black Diamond Solar | 800 | Swift Current Energy | McCarthy Building Companies | Developer PR + EPC website | Swift Current press release at financial close; confirmed on McCarthy portfolio page |
| 2 | Gibson Solar | 251 | Arevon | Signal Energy | Trade publication + developer PR | Covered in Solar Power World; Arevon press release |
| 3 | Oberon Solar Portfolio | 728 | Intersect Power | Signal Energy | Developer PR | Intersect Power press release announcing EPC selection |
| 4 | [TBD — TX project] | ~300 | Lightsource bp | McCarthy | EPC website | McCarthy portfolio page lists multiple Lightsource bp projects in TX |
| 5 | [TBD — large utility deal] | ~400 | NextEra Energy | Blattner Energy | SEC filing (PWR 10-K) | Quanta Services annual report references Blattner solar contract |
| 6 | [TBD — IN project] | ~200 | Arevon / NIPSCO | Signal Energy | State PUC filing | Indiana URC public filing for NIPSCO solar procurement |
| 7 | [TBD — AZ project] | ~300 | AES | Primoris | SEC filing (PRIM 8-K) | Primoris 8-K material contract disclosure |
| 8 | [TBD — SE US project] | ~250 | Invenergy | Mortenson | Trade publication | ENR coverage of Mortenson solar EPC win |
| 9 | [TBD — CA project] | ~150 | Recurrent Energy (Canadian Solar) | SOLV Energy | EPC website | SOLV Energy project portfolio |
| 10 | [TBD — TX project] | ~200 | Enel Green Power | Strata Clean Energy | Developer PR | Enel press release naming Strata as EPC |

**Status:** Examples 1-3 are well-confirmed from our research. Examples 4-10 are based on known industry relationships and source patterns but need specific project name/MW verification and link citation. This is a priority follow-up task.

**Goal:** Before implementing the EPC discovery agent, verify all 10 examples end-to-end. For each, trace the exact URL/document where the EPC relationship was disclosed. This validates our assumption about where to look.

## Source Reconciliation Strategy

The 5 channels overlap and sometimes conflict. We need a reconciliation strategy:

### Priority Order (when sources conflict)

1. **SEC filing** — legally binding disclosure, highest reliability
2. **State PUC filing** — regulatory document, high reliability
3. **Developer press release** — first-party source, high reliability
4. **EPC company website** — first-party but sometimes outdated
5. **Trade publication** — secondary source, occasionally inaccurate

### Deduplication

Multiple sources often report the same EPC assignment. We tag each relationship with all confirming sources:

```
project → epc relationship:
  epc: "Signal Energy"
  confidence: "confirmed"
  sources: [
    { channel: "developer_pr", date: "2025-03-15", ref: "..." },
    { channel: "trade_pub", date: "2025-03-18", pub: "Solar Power World", ref: "..." }
  ]
```

### What We Start With

**Phase 1 of EPC discovery (recommended):**

1. Trade publication scraping (Solar Power World, PV Magazine) — broadest coverage, structured articles, relatively easy to parse
2. Developer press release monitoring (top 20 developers by active MW) — highest reliability
3. Claude research agent for gap-filling — handles the long tail

**Phase 2:**

4. EPC company website monitoring (top 10 EPCs)
5. SEC filing monitoring (PRIM, PWR)

**Phase 3:**

6. State PUC filings (start with TX, IN, CA)

## Agent-Based Architecture

Instead of building hardcoded scrapers for each of the 5 channels, we design an **EPC discovery agent** — a Claude-powered agent with tool access to each source.

### Why Agent Over Hardcoded Scrapers

- Trade publications change their HTML structure constantly — an agent can adapt
- Press releases have no standard format — natural language understanding is the right tool
- The reconciliation logic (weighing conflicting sources) benefits from reasoning
- New sources can be added as tools without rewriting the pipeline

### Agent Design (Outline)

```
EPC Discovery Agent
├── Input: project record (name, developer, MW, state, county, queue_date)
├── Tools available:
│   ├── search_trade_publications(query) → article summaries
│   ├── search_developer_website(developer_name) → press releases
│   ├── search_epc_portfolios(epc_name?) → project listings
│   ├── search_sec_filings(ticker, keywords) → filing excerpts
│   ├── web_search(query) → general web results
│   └── knowledge_graph_lookup(developer) → known EPC relationships
├── Prompt context:
│   ├── Project details from our database
│   ├── Known developer history (from knowledge graph)
│   ├── Instructions on confidence levels and source ranking
│   └── Output schema requirements
├── Output schema:
│   ├── epc_contractor: string | null
│   ├── confidence: "confirmed" | "likely" | "possible" | "unknown"
│   ├── sources: [{ channel, date, reference, excerpt }]
│   ├── reasoning: string (why this EPC, or why unknown)
│   └── related_leads: [any other projects mentioned in the same source]
└── Escalation:
    ├── confidence == "confirmed" → auto-update lead record
    ├── confidence == "likely" → update with flag for human review
    ├── confidence == "possible" → store but don't surface prominently
    └── confidence == "unknown" → log attempt, retry in 2 weeks
```

### When the Agent Runs

- **On new leads:** When a new project enters the database with score > [TBD threshold]
- **On schedule:** Weekly re-check of high-priority leads where EPC is still unknown
- **On demand:** User clicks "Research EPC" on a project in the dashboard

[TBD: Full technical design for the agent — prompt engineering, tool implementations, rate limiting, cost management. This will be a separate document.]

## Top 20 Solar Developers to Monitor

These are the most active utility-scale solar developers in the US. Monitoring their press/newsroom pages covers a significant portion of EPC announcements.

[TBD — compile list. Starting candidates: NextEra, AES, Invenergy, Lightsource bp, Recurrent Energy, Arevon, Intersect Power, Swift Current Energy, EDF Renewables, Enel Green Power, Clearway Energy, Ørsted, Avangrid, Duke Energy Renewables, Southern Power, Cypress Creek, Silicon Ranch, D.E. Shaw Renewable Investments, Longroad Energy, Pine Gate Renewables]

## Top 10 Solar EPCs to Monitor

[TBD — compile and rank by active MW. Starting list from Channel 3 above: McCarthy, Mortenson, Signal Energy, Blattner, Sundt, Primoris, Rosendin, SOLV Energy, Strata Clean Energy, Moss]
