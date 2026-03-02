# 02 — Project Lifecycle Map

**Status:** Draft — updated 2026-03-01 with detailed source research

---

## Why This Matters

Each data source captures a solar project at a different stage of its lifecycle. Cross-referencing them reveals how far along a project is — which directly determines how actionable the lead is.

A project that only appears in an ISO queue might never get built (60-80% withdrawal rate). A project that appears in an ISO queue *and* EIA-860 *and* has a FERC interconnection agreement is almost certainly going to construction.

## The Lifecycle Timeline

```
YEARS BEFORE CONSTRUCTION →

  3-5 years         2-3 years         1-2 years         0-1 years         Operational
  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ ISO      │ ──→ │ FERC     │ ──→ │ EIA-860  │ ──→ │ EIA-860M │ ──→ │ USPVDB   │
  │ QUEUE    │     │ LGIA     │     │ (Annual) │     │ (Monthly)│     │          │
  │ ENTRY    │     │ FILING   │     │          │     │          │     │          │
  └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
  │                │                │                │                │
  │ Queue ID       │ IA signed,     │ EIA plant ID,  │ Construction   │ As-built
  │ County/State   │ capacity       │ exact lat/lng, │ month, actual  │ capacity,
  │ MW capacity    │ confirmed,     │ owner info,    │ COD, monthly   │ site polygon,
  │ Fuel type      │ legal entity   │ planned COD    │ status updates │ final specs
  │ Developer      │                │                │                │
  └────────────────┴────────────────┴────────────────┴────────────────┘

        ┌────────────────┐                    ┌────────────────┐
        │ STATE PERMITS  │                    │ NEWS / PR      │
        │                │                    │                │
        │ Parcel data,   │                    │ EPC named,     │
        │ developer,     │                    │ financial      │
        │ local approval │                    │ close, start   │
        │ (1-3 yrs out)  │                    │ date (0-2 yrs) │
        └────────────────┘                    └────────────────┘
```

---

## Data Sources in Detail

### Source 1: ISO Interconnection Queues (Phase 1 — implemented)

#### What is this in plain English?

Before you can connect a power plant to the electrical grid, you have to ask permission from the organization that manages the grid in your region. In the US, these organizations are called ISOs (Independent System Operators) or RTOs (Regional Transmission Organizations). There are 7 major ones that collectively cover most of the country.

When a solar developer submits this request, the project enters an "interconnection queue" — a public waiting list. This is the **earliest public signal** that someone plans to build a solar farm. The queue is public because the grid operator needs transparency in planning.

#### When in the project lifecycle

3-5 years before construction. Many queue entries never get built — the withdrawal rate is 60-80%. A queue entry means "someone filed paperwork to study whether they could connect here." It does NOT mean they've committed to building.

#### What data each ISO provides

Each ISO provides different fields. Here's what matters:

**MISO** (Midcontinent — covers central US from Minnesota to Louisiana):
- Format: JSON API at `misoenergy.org/api/giqueue/getprojects` — the easiest to work with
- ID system: `projectNumber` like "J4183"
- Location: county + state + `poiName` (substation name, e.g., "Buffalo 115 kV")
- Capacity: separate `summerNetMW` and `winterNetMW`
- Status: only "Active" or "Withdrawn" — very limited. Has `studyPhase` ("Phase 1", etc.) and `postGIAStatus`
- Dates: `queueDate`, `inService` (expected COD), `negInService` (negotiated COD), `withdrawnDate`
- **No coordinates.** (MISO has a separate ArcGIS map but not in the API)
- **Gotcha: `transmissionOwner` is NOT the developer.** It's the utility that owns the transmission line. MISO does not publicly expose the developer/interconnection customer name in the API. Our current scraper maps this incorrectly.

**ERCOT** (Texas):
- Format: Excel file with a 30-row header skip, sheet "Project Details - Large Gen"
- ID system: `INR` (Interconnection Request Number)
- Location: county (always Texas), `POI Location` (substation), `CDR Reporting Zone`
- Capacity: single `Capacity (MW)` field
- Fuel codes: 3-letter codes — SOL (Solar), WIN (Wind), GAS, MWH (Battery)
- **ERCOT is the richest for tracking progression.** It has milestone date columns:
  - `Screening Study Started` / `Complete`
  - `FIS Requested` / `Approved` (Full Interconnection Study)
  - `IA Signed` — **the key field.** If this has a date, the Interconnection Agreement is executed.
  - `Approved for Energization` / `Approved for Synchronization`
- ERCOT has no explicit "Status" column. Status is derived from which milestones have dates.

**CAISO** (California):
- Format: Excel with 3 sheets: active queue, completed projects, withdrawn projects
- ID system: `Queue Position` (numeric)
- Location: county + state + `Station or Transmission Line` + `Utility` (PG&E, SCE, SDG&E)
- Capacity: very detailed — `MW-1`, `MW-2`, `MW-3` (per technology for hybrids), `MW Total`, `Net MWs to Grid`
- Fuel: `Type-1`, `Type-2`, `Type-3` and `Fuel-1`, `Fuel-2`, `Fuel-3` (supports hybrid classification like Solar+Storage)
- Status: Active / Withdrawn / Completed (determined by which sheet)
- Dates: `Queue Date`, `Proposed On-line Date`, `Current On-line Date`
- **No IA dates in the queue report.** CAISO publishes interconnection agreements separately.

**PJM** (largest US ISO — covers mid-Atlantic, parts of Midwest):
- Format: Excel with multiple tabs: "Description", "Phases & Agreements", "Dates"
- ID system: alphanumeric like "AF2-021"
- Location: county + state + `Transmission Owner`
- Capacity: `MW Capacity` (summer), `MW Energy` (winter), `MFO` (Maximum Facility Output)
- **PJM has the richest status tracking of any ISO:**
  - `Status` field values: Active → Engineering and Procurement → Under Construction → In Service → Withdrawn/Deactivated
  - "Engineering and Procurement" means the IA is signed but construction hasn't started — this is a very strong signal
  - "Under Construction" means exactly what it says
  - Separate fields for: Feasibility Study Status, System Impact Study Status, Facilities Study Status
  - `ISA/GIA` field + status — explicitly tracks interconnection agreement execution
  - `Construction Service Agreement` field + status

#### What ISOs DON'T tell us

- **No coordinates.** Not a single ISO provides lat/lng in their queue data. All give county + state at best, plus a substation name.
- **No EPC contractor.** Ever. The queue tracks the developer (interconnection customer), not who they hire to build.
- **Limited developer info in some ISOs.** MISO doesn't even expose the developer name publicly.
- **No construction progress.** Except PJM which has "Under Construction" status.

#### Current coverage and what to add next

| ISO | Coverage | Solar Market | Priority |
|-----|----------|-------------|----------|
| ERCOT | Phase 1 (done) | Huge — TX is #1 US solar market | Done |
| CAISO | Phase 1 (done) | Huge — CA is #2 | Done |
| MISO | Phase 1 (done) | Large and growing (Midwest) | Done |
| PJM | Not yet | Large, very rich data format | **High — next to add** |
| SPP | Not yet | Growing (Southern Plains) | Medium |
| ISO-NE | Not yet | Smaller solar market | Lower |
| NYISO | Not yet | Moderate, growing | Lower |

---

### Source 2: FERC eLibrary (Interconnection Agreements)

#### What is this in plain English?

After a solar project completes the interconnection study process (feasibility study → system impact study → facilities study), the developer and the grid operator negotiate a contract called a Large Generator Interconnection Agreement (LGIA). This contract spells out exactly how the project will connect to the grid, who pays for what upgrades, and when.

The grid operator is required to **file this signed contract with FERC** (the Federal Energy Regulatory Commission). FERC is the federal agency that regulates wholesale electricity markets. Once FERC accepts the agreement, it becomes legally binding.

This filing is a **very strong signal.** A project with a signed, FERC-filed LGIA has:
- Completed all technical studies
- Negotiated and signed a binding agreement
- Committed to specific capacity and timeline
- Put up security deposits

#### When in the project lifecycle

2-3 years before construction. After studies complete but before construction starts. This is the moment the project goes from "being studied" to "contractually committed."

#### What's actually in the filing

The LGIA filing contains rich data — but it's buried in PDF documents, not structured data:

| Appendix | What it contains |
|----------|-----------------|
| Main body | Parties (developer, transmission provider, transmission owner), effective date, term |
| Appendix A | Physical specifications — interconnection facilities, required network upgrades |
| Appendix B | **Milestones** — In-Service Date, Initial Synchronization Date, Commercial Operation Date |
| Appendix C | Technical details — control technology, protection systems, metering |
| Appendix D | Security deposits |
| Appendix E | Network upgrade cost estimates |

#### How to access it

**FERC eLibrary** (https://elibrary.ferc.gov/) — a web-based search interface. Key details:

- **No official API.** Search is web-only. Third-party scrapers exist: `ferc-elibrary-api` (TypeScript), `FERC_DOC_TRAIL` (Python/Scrapy).
- **Search by:** docket number, keyword, date range, industry sector, document type
- **Finding solar LGIAs:** Search for docket prefix `ER` (Electric Rate) + keyword `"interconnection agreement" AND "solar"`
- **Documents are PDFs.** The actual agreement text, MW, dates, and parties are all in unstructured PDF documents. Extracting data requires PDF parsing + regex/NLP.
- **eSubscribe:** Free email notifications when new filings appear on specific dockets. Good for monitoring known projects, not for discovery.

#### Practical automation assessment

| Task | Feasibility | Notes |
|------|------------|-------|
| Discover new LGIA filings (metadata) | **Doable** | Scrape eLibrary search results for new ER docket filings with solar keywords |
| Extract project details from PDFs | **Moderate** | PDFs are electronic (not scanned), pro forma structure is standardized. Regex extraction works for key fields |
| Cross-reference to ISO queue | **Hard** | LGIA references queue ID in PDF text, not in metadata. Need to parse PDFs to find it |
| Monitor amendments/waivers | **Doable** | eSubscribe email parsing or periodic docket checks |

#### Other useful FERC filing types

Beyond initial LGIAs, these filings are relevant:

- **LGIA Amendments:** Changes to project scope, capacity, or timeline. Very common.
- **Waiver Requests:** Developer asking FERC to extend their COD deadline. Signals delays — but also signals the project is still alive (if they abandoned it, they wouldn't bother filing a waiver).
- **Market-Based Rate (MBR) Authorizations:** Developer applying to sell power at market rates. Another viability signal.
- **MBR Tariff Cancellations:** Developer giving up market authorization. Possible death signal.

#### When to integrate this

**Not Phase 2.** FERC data is valuable but high engineering cost due to PDF parsing. Best used as a Phase 5+ enrichment layer — when we already have ISO queue + EIA-860 + EPC discovery working and want to add progression signals.

However: **some ISOs already expose IA status in their queue data.** ERCOT has `IA Signed` date. PJM has `ISA/GIA Status`. For those ISOs, we get the FERC-level signal for free without touching FERC directly.

---

### Source 3: EIA Form 860 (Annual) + 860M (Monthly)

#### What is this in plain English?

The Energy Information Administration (EIA) — part of the US Department of Energy — requires every power plant in America (1MW+) to file an annual report. This includes **planned** plants, not just operating ones. If you're planning to build a 200MW solar farm, you are legally required to tell EIA about it.

This is a **government-mandated filing.** Companies can't skip it. And because it goes to a federal agency, the data is standardized, high-quality, and publicly available.

#### When in the project lifecycle

- **EIA-860 (Annual):** Captures projects 1-5 years before construction. Projects report once they're in a "planned" status — past early feasibility, moving toward construction.
- **EIA-860M (Monthly):** Captures projects 0-12 months from commercial operation. Tracks month-by-month status changes as projects go through construction and testing.

#### What's in the data

EIA-860 is released as a ZIP file with multiple Excel workbooks:

| File | What it contains | Most useful fields |
|------|-----------------|-------------------|
| `2___PlantYyyyy` | Plant-level data | **Latitude, longitude**, state, county, NERC region, ISO/RTO, balancing authority |
| `3_1_GeneratorYyyyy` | Generator-level data (3 tabs: Operable, Proposed, Retired) | **Status code, capacity MW (AC and DC), planned COD**, fuel type, prime mover code |
| `3_3_SolarYyyyy` | Solar-specific details | Panel technology, tracking type, tilt angle |
| `4___OwnerYyyyy` | Ownership data | Owner name, owner state, ownership percentage |
| `1___UtilityYyyyy` | Utility/operator info | Company name, address, regulatory status |

**Key identifiers:**
- `plant_id_eia` — unique 6-digit numeric code per facility (also called ORISPL code). **This is the universal ID** that links across EIA datasets and to USPVDB.
- `generator_id` — up to 5 alphanumeric characters, unique within a plant
- `utility_id_eia` — identifies the operating utility/company

#### EIA-860 Status Codes (critical for lead gen)

Projects in the "Proposed" tab have these status codes, representing a development progression:

| Code | Meaning | What it signals for us |
|------|---------|----------------------|
| **P** | Planned — no regulatory approvals yet | Early stage. Project is on paper. |
| **L** | Planned — regulatory approvals pending | Developer has applied for permits. More committed. |
| **T** | Planned — regulatory approvals received | All permits in hand. Pre-construction. **Strong signal.** |
| **U** | Under construction, ≤50% complete | Construction has started. **Very strong signal.** |
| **V** | Under construction, >50% complete | Over halfway done. Likely too late for first robot sale, but confirms the project. |
| **TS** | Construction complete, testing | Nearly operational. Definitely too late for first sale. |

For lead scoring: T and U are the sweet spot. L is promising. P is early but worth tracking.

#### How the annual vs. monthly data differ

| Aspect | EIA-860 (Annual) | EIA-860M (Monthly) |
|--------|-------------------|---------------------|
| Frequency | Annual (covers prior calendar year) | Monthly |
| Publication lag | ~9 months (2024 data final in Sept 2025) | ~4 weeks |
| Scope | Comprehensive — plant, generator, owner, solar-specific, environmental | Generator status and capacity only |
| Coordinates | Yes — lat/lng in Plant file | No (not in monthly) |
| Reliability | Gold standard — fully verified by EIA | Preliminary estimates, sometimes corrected later |
| Best for | Baseline data, coordinates, owner info | Tracking real-time status progression (P → L → T → U → V → TS → OP) |

#### How to access

- **Annual download:** https://www.eia.gov/electricity/data/eia860/ — ZIP file with Excel workbooks. Free.
- **Monthly download:** https://www.eia.gov/electricity/data/eia860m/ — Free.
- **Cleaned version:** PUDL (Public Utility Data Liberation) project provides EIA-860 data cleaned and normalized in Parquet/SQLite format: https://catalystcoop-pudl.readthedocs.io/
- **Browse online:** https://data.catalyst.coop/ — PUDL data viewer with SQL queries

#### Key fields for matching to ISO queues

| EIA-860 Field | ISO Queue Equivalent | Match Quality |
|---------------|---------------------|--------------|
| State / County | State / County | Good — exact match |
| `capacity_mw` | Requested MW | Good — but queue may list gross, EIA lists net |
| `energy_source_code_1` = "SUN" | Fuel type = "Solar" | Good — naming differs but maps clearly |
| `iso_rto_code` (e.g., "ERCT") | ISO region | Good — direct filter |
| `current_planned_generator_operating_date` | Expected COD | Fair — dates often shift |
| Plant name | Project name | **Poor — names often differ substantially.** A developer might call it "Project Falcon" in the queue and "Sunflower Solar LLC" in EIA filing |
| `utility_id_eia` / developer name | Developer / Interconnection Customer | Fair — corporate entity names change |

---

### Source 4: USPVDB (US Large-Scale Solar Photovoltaic Database)

#### What is this in plain English?

The USGS (US Geological Survey) and Lawrence Berkeley National Lab maintain a database of every large-scale solar farm (1MW+) that's actually been built and is operating in the US. For each facility, they've manually traced the boundaries of the solar panel arrays from satellite imagery.

**This only covers operational facilities.** If panels aren't visible in satellite imagery, the facility isn't in the database. It does NOT include planned or under-construction projects.

#### When in the project lifecycle

Post-construction only. A project appears in USPVDB after it's been operating long enough to show up in satellite imagery and for USGS to digitize it. There's a 1-2 year lag.

#### What's in the data

5,712 facilities as of version 3.0 (April 2025). Key fields:

| Field | Description |
|-------|------------|
| `case_id` | Unique USPVDB identifier |
| `eia_id` | **EIA Plant Code** — the bridge to EIA-860 data |
| `p_name` | Facility name |
| `p_state`, `p_county` | Location |
| `ylat`, `xlong` | Coordinates (NAD 83) |
| `p_year` | Year became operational |
| `p_cap_ac`, `p_cap_dc` | AC and DC capacity in MW |
| `p_tech_pri` | Panel technology type |
| `p_axis` | Tracking type (single-axis, fixed-tilt, dual-axis) |
| `p_battery` | Battery storage present? |
| `p_area` | Array footprint in square meters |
| Site polygon | GIS boundary of the panel arrays (in Shapefile/GeoJSON formats) |

**Notable: USPVDB does NOT contain developer or owner information.** You need to join with EIA-860 via `eia_id` to get that.

#### How to access

- **REST API:** `https://energy.usgs.gov/api/uspvdb/v1/projects` — supports filtering, pagination, sorting
- **Bulk download:** GeoJSON, Shapefile, or CSV at https://energy.usgs.gov/uspvdb/data/
- **Interactive viewer:** https://energy.usgs.gov/uspvdb/viewer/

#### Polygon accuracy

Polygons are manually digitized from high-resolution aerial imagery (Maxar DigitalGlobe). Boundaries are accurate to ~5 meters of the actual panel edges. 95.5% of records have the highest confidence score.

#### Value for lead generation

USPVDB is **not a lead source** — projects are already built. Its value is:

1. **Geocoding validation:** When we geocode a queue project using EIA-860 coordinates, we can validate against USPVDB polygons for completed projects.
2. **Historical conversion rates:** By matching past ISO queue entries to what eventually appeared in USPVDB, we can calculate: "What % of MISO queue entries >100MW actually get built?" This directly improves lead scoring.
3. **Knowledge graph enrichment:** Via EIA-860 join, we can see which developers built in which regions — feeding the developer→EPC prediction model.
4. **Market intelligence:** Where solar has been built before tells us where the grid infrastructure and permitting environment are proven.

---

### Source 5: State Permitting Databases

#### What is this in plain English?

Before building a solar farm, you need permits — from the county, the state environmental agency, sometimes the state energy commission. Some states publish these permits in searchable online databases.

#### When in the project lifecycle

1-3 years before construction. Permits are sought after a project has an interconnection queue position and before construction starts.

#### Reality check

This source is the hardest to use:
- **No standardization.** Every state has a different system (or no system at all).
- **High engineering cost per state.** Each one requires custom scraping logic.
- **Best data:** California (CEC open data portal), North Carolina (NC DEQ solar facility database)
- **Worst data:** Many states only have PDF permit documents with no structured database

**Recommendation:** Don't build state permit scrapers until the core pipeline (ISO + EIA + EPC discovery) is solid. Only add states where the data is structured and the solar market is large enough to justify the engineering effort.

---

### Source 6: News & Press Releases

#### What is this in plain English?

When a developer signs an EPC contractor, secures financing, or starts construction, they often announce it publicly. Trade publications cover these announcements. This is the **primary channel for discovering who the EPC contractor is.**

Covered in detail in [03-epc-discovery.md](03-epc-discovery.md).

---

## Cross-Referencing Strategy

### The Core Problem

There is no universal project ID across sources. The same solar farm might be identified as:

| Source | Identifier | Example |
|--------|-----------|---------|
| MISO queue | Queue number | "J4183" |
| ERCOT queue | INR | "24INR0567" |
| FERC filing | Docket number | "ER25-1361-000" |
| EIA-860 | Plant ID | "67890" |
| USPVDB | Case ID | "4521" |
| News article | Marketing name | "Sunflower Solar" |

A project in MISO's queue is called "J4183." The same project in EIA-860 has Plant ID 67890. The same project in a press release is called "Prairie Sun Solar." None of these IDs reference each other.

### Matching Approach

We score candidate matches across multiple signals:

| Signal | How to match | Weight | Notes |
|--------|-------------|--------|-------|
| ISO region | `iso_rto_code` in EIA-860 = our `iso_region` | Filter (must match) | Eliminates 85%+ of candidates |
| State | Exact match | Filter (must match) | |
| County | Exact match or fuzzy (handle "St." vs "Saint") | High | Some ISOs have different county spellings |
| MW capacity | Within ±20% tolerance | High | Queue lists gross MW, EIA lists net — expect 10-20% difference |
| Fuel type | Solar mapped across coding systems | Filter | SUN (EIA) = Solar (ISO) = SOL (ERCOT) |
| Developer name | Fuzzy string match (Levenshtein or token-based) | Medium | Corporate names change, LLCs differ from parent company |
| Project name | Fuzzy string match | Low | Names often differ completely across sources |
| Planned COD | Within ±24 months | Low | Dates shift frequently, but should be in same general timeframe |
| Timing logic | Queue date should precede EIA filing date | Validation | If EIA filing predates queue entry, something is wrong |

**Confidence levels:**
- **Auto-link (high confidence):** 4+ signals match, including state + county + capacity within 10%
- **Flag for review (medium):** 3 signals match, or capacity differs by 10-20%
- **Possible match (low):** 2 signals match — store the association but don't surface it prominently
- **No match:** <2 signals — leave unlinked

### The Matching Pipeline

```
For each new EIA-860 record (fuel=SUN, status=P/L/T/U/V):
  1. Filter our projects table: same ISO region + same state
  2. Score each candidate project against the EIA record
  3. If top candidate scores above auto-link threshold:
     → Link records (store EIA plant_id on our project)
     → Update coordinates from EIA Plant file
     → Log a "cross_ref_match" delta event
  4. If top candidate is medium confidence:
     → Store as pending match, flag for review
  5. If no match:
     → This EIA record might be a project we don't have yet
     → Consider creating a new project record from EIA data
```

### Specific Matching Challenges

**County name mismatches:** ISO queues and EIA may spell counties differently. "DeWitt" vs "De Witt", "St. Louis" vs "Saint Louis". Need a county name normalization table.

**Capacity discrepancies:** ISO queues report requested interconnection capacity (gross). EIA-860 reports nameplate capacity (may be net). For solar+storage hybrids, the ISO may list combined MW while EIA separates solar and storage into different generator records. Expect 10-20% differences.

**Corporate entity names:** A developer might enter the ISO queue as "Falcon Solar LLC" and file EIA-860 as "SunPower Development Company." The parent company might be the same, but the entity names are completely different. This is the hardest matching problem. The knowledge graph helps over time — once we've confirmed that "Falcon Solar LLC" is an Intersect Power entity, future matches are easier.

**Multiple generators per plant:** One EIA Plant ID can have multiple generators (e.g., a solar farm with 3 phases, each a separate generator record). One ISO queue entry might correspond to one EIA plant with multiple generators, or one phase might be a separate queue entry.

### What Cross-Referencing Unlocks

When we can link a project across multiple sources, we get a composite view:

```
Project: "Sunflower Solar"
├── ISO Queue (ERCOT INR-1234): 250 MW, Travis County TX, entered 2024-01
│   └── Status: IA Signed (2025-01) → project has binding interconnection agreement
├── EIA-860: Plant ID 67890, lat 30.12 / lng -97.45, planned COD 2027-06
│   └── Status: T (approvals received) → all permits in hand
├── News: "Developer X selects EPC Y for 250MW Texas project" (Solar Power World, 2025-11)
│   └── EPC: Y (confirmed via press release + trade pub)
└── Composite Assessment:
    ├── Lead Score: 92/100
    ├── Stage: Pre-construction (IA signed + permits received + EPC selected)
    ├── EPC: Y (confirmed, 2 sources)
    ├── Coordinates: 30.12, -97.45 (exact, from EIA-860)
    └── Action: Contact EPC Y about autonomous layout robots for 250MW TX project, COD June 2027
```

This is the difference between "there's a solar project in Texas" and "EPC Y is about to break ground on a 250MW project at these exact coordinates in June 2027."

### Data Source Comparison Matrix

| Attribute | ISO Queue | FERC LGIA | EIA-860 | EIA-860M | USPVDB |
|-----------|----------|-----------|---------|----------|--------|
| Lifecycle stage | 3-5 yrs out | 2-3 yrs out | 1-5 yrs out | 0-12 months | Operational |
| Project ID | Queue-specific | Docket number | Plant ID | Plant ID | Case ID + EIA ID |
| Coordinates | **No** | In PDF only | **Yes** (exact) | No | **Yes** (polygon) |
| Developer name | Varies by ISO | In PDF | Owner file | No | **No** (need EIA join) |
| EPC contractor | **Never** | **Never** | **Never** | **Never** | **Never** |
| Capacity | Yes | In PDF | Yes (AC+DC) | Yes | Yes (AC+DC) |
| Planned COD | Yes | In PDF | Yes | Yes (updated) | N/A (operational) |
| Status/progression | Varies by ISO | Binary (filed or not) | Rich (P/L/T/U/V/TS) | Monthly updates | N/A |
| Access method | API/Excel | Web search + PDF | Excel bulk download | Excel bulk download | API + bulk download |
| Refresh | Weekly+ | Continuous filings | Annual (~9mo lag) | Monthly (~4wk lag) | Annual (~1-2yr lag) |
| Automation ease | **Easy** | **Hard** (PDF parsing) | **Easy** | **Easy** | **Easy** |
| Coverage | All queued projects | Only IA-executed | Planned + operating >1MW | Near-COD projects | Operational only |

**Key takeaway from this matrix:** EPC contractor is available from **none** of these government/ISO sources. That's why EPC discovery (Channel 6: News/PR — see [03-epc-discovery.md](03-epc-discovery.md)) is the core differentiator. These 5 sources tell us everything about a project *except* the one thing the sales team needs most.

### Recommended Integration Order

Based on data value vs. engineering cost:

| Order | Source | Why this order |
|-------|--------|---------------|
| 1 (done) | ISO Queues (ERCOT, CAISO, MISO) | Foundation — earliest signal, easiest to scrape |
| 2 (next) | PJM Queue | Richest status data of any ISO, large market |
| 3 | EIA-860 (Annual) | Adds coordinates + EIA plant IDs + progression status. Bulk download, easy to ingest. |
| 4 | EIA-860M (Monthly) | Monthly status updates for near-COD projects |
| 5 | SPP, ISO-NE, NYISO queues | More ISOs = more coverage, same scraper pattern |
| 6 | USPVDB | Historical validation + geocoding enrichment |
| 7 | FERC eLibrary | High value but high engineering cost (PDF parsing) |
| 8 | State permits | Very high cost per state, inconsistent data |

Note: This is the data ingestion order. EPC discovery (news/PR scraping + agent) happens in parallel and is higher priority than items 3-8 — see [09-implementation-phases.md](09-implementation-phases.md).

---

## Data Quality Issue Found

During research, we identified a bug in the current MISO scraper:

- `transmissionOwner` is being mapped to `developer` — but this field is the utility that owns the transmission line (e.g., "ENTERGY ARKANSAS, LLC"), NOT the solar project developer
- `poiName` is being mapped to `project_name` — but this is the substation name (e.g., "Buffalo 115 kV"), not the project name

MISO's public API does not expose the developer/interconnection customer name. This means our MISO project records currently have incorrect developer names. This needs to be fixed — either by finding another MISO data source that includes developer names, or by flagging MISO developer fields as unreliable.

[TBD: Investigate whether MISO publishes developer names elsewhere, or whether this is only available in MISO's member portal (not public).]
