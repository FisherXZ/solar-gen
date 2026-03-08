# EPC Discovery Agent — Evaluation Log

Running document tracking agent accuracy, failure patterns, and improvement opportunities across batch research runs.

---

## Eval Run #1 — March 8, 2026

**Batch size:** 10 projects (top-scoring, no existing EPC)
**Model:** claude-sonnet-4-20250514
**Search tool:** Tavily
**Concurrency:** 3

### Results Summary

| # | Project | MW | ISO | EPC Found | Confidence | Verified? |
|---|---------|-----|------|-----------|------------|-----------|
| 1 | Silver Ridge Mount Signal | 600 | CAISO | Swinerton Renewable Energy | confirmed | Partial — correct for 1 of 3 phases |
| 2 | Centennial Flats | 500 | CAISO | McCarthy Building Companies | confirmed | **Correct** |
| 3 | Pelicans Jaw Hybrid Solar | 500 | CAISO | SOLV Energy | confirmed | **Correct** |
| 4 | Goldback Solar Center | 500 | CAISO | Unknown | unknown | N/A |
| 5 | 7Coffeen - 7Pana 345kV | 500 | MISO | Azimuth Energy | likely | **False positive** |
| 6 | Buffalo 345 kV Substation | 500 | MISO | Unknown | unknown | N/A |
| 7 | Ipava 138kV | 350 | MISO | Unknown | unknown | N/A |
| 8 | Jacinto - Peach Creek 230kV | 206 | MISO | Unknown | unknown | N/A |
| 9 | Francisco 345/138kV | 250 | MISO | Unknown | unknown | N/A |
| 10 | Sandborn - Worthington 161kV | 300 | MISO | Inovateus Solar | likely | **False positive** |

**Accuracy: 3/5 verified correct (2 confirmed, 1 partial). 2/5 false positives. 5/10 returned unknown.**

---

### Issue 1: "Likely" Confidence Is Unreliable

**Severity: High**

Both "likely" results were false positives. Both followed the same failure pattern:

1. Agent can't find direct EPC-to-project evidence
2. Agent finds that Company X did *some* solar work for the same utility/developer
3. Agent reports Company X as "likely" EPC
4. Agent never verifies if Company X operates at the right MW scale
5. Agent never checks if the project is even at a stage where an EPC would be selected

**Example — Azimuth Energy (7Coffeen-7Pana):**
- Agent found Azimuth Energy did 1-2.5 MW projects for Ameren
- Reported Azimuth as "likely" EPC for a 500 MW project (17x larger than anything Azimuth has ever built)
- Azimuth is a commercial-scale EPC capped at ~30 MW — they'd never build a 500 MW farm

**Example — Inovateus Solar (Sandborn-Worthington):**
- Agent found Inovateus built 1.3 MW arrays for Hoosier Energy (2015-2016)
- Reported Inovateus as "likely" EPC for a 300 MW project (230x larger)
- Inovateus's largest completed project is 188 MW — a 300 MW contract would be their biggest ever and would certainly generate a press release

**Proposed fix:** Add to system prompt: *"Before reporting 'likely' or 'possible', verify the candidate EPC has built projects of comparable scale (MW). A commercial-scale EPC (< 50 MW projects) cannot be the EPC for a 500 MW utility-scale farm. Also verify the project is far enough along (post-interconnection agreement, post-PPA) for an EPC to have been selected."*

---

### Issue 2: CAISO Scraper Misidentifies Developer

**Severity: High — affects all CAISO projects**

The CAISO queue lists the **interconnecting utility** (the transmission owner), not the project developer. Our scraper maps this field to the `developer` column.

| Project | Our "developer" | Actual role | Real developer |
|---------|----------------|-------------|----------------|
| Centennial Flats | DCRT | Transmission company (DCR Transmission) | Copia Power (Carlyle) |
| Pelicans Jaw | PGAE | Interconnecting utility (PG&E) | SB Energy (SoftBank) |
| Silver Ridge | SDGE | PPA offtaker (San Diego Gas & Electric) | Avantus / Silver Ridge Power |

This is systematic — every CAISO project likely has the wrong developer. The CAISO Excel column "Utility" means the transmission owner, not the project owner.

**Impact on agent research:** The agent searches for "[developer] [project] EPC". If the developer is wrong, the initial searches are wasted or misleading.

**Proposed fix:** Either:
- Rename the field to `interconnecting_entity` for CAISO projects and leave `developer` NULL
- Add a column `developer_source` to flag whether developer came from ISO queue (unreliable for CAISO) vs. agent research (reliable)
- Have the agent's prompt warn: *"For CAISO projects, the 'developer' field is the interconnecting utility, not the project developer. You must independently identify the actual developer."*

---

### Issue 3: MISO Queue Entry Names Are Transmission POIs, Not Project Names

**Severity: Medium**

MISO queue entries are named after transmission infrastructure (e.g., "7Coffeen - 7Pana 345kV", "Sandborn Primary - Worthington Primary 161kV"). These are **point of interconnection** names, not project names. The actual solar project likely has a different marketing name.

**Impact on agent research:** Searching for "7Coffeen 7Pana solar EPC" returns nothing useful because no one refers to the project by its transmission POI name. The agent needs to first figure out the project's actual name or developer, then search for the EPC.

**Proposed fix:** Add to system prompt: *"MISO project names are often transmission point-of-interconnection names (e.g., 'SubstationA - SubstationB 345kV'), not the project's marketing name. Search for the developer + state + capacity to find the real project name first."*

---

### Issue 4: Multi-Phase Complexes Not Handled

**Severity: Medium**

Silver Ridge Mount Signal is a 3-phase complex with 3 different EPCs. The agent reported Swinerton as THE EPC for the whole 600 MW project, when Swinerton only built Phase 2 (200 MW). Phases 1 and 3 were built by Abengoa and Mortenson respectively.

**Impact:** Reporting a single EPC for a multi-phase complex is misleading. Civ Robotics might reach out to Swinerton about a phase they didn't build.

**Proposed fix:** Add to system prompt: *"Large solar projects (400+ MW) are often built in phases with different EPCs for each phase. If you find evidence of phased construction, report each phase's EPC separately."*

---

### Issue 5: Agent Reports Defunct Companies

**Severity: Low**

The agent reported "Swinerton Renewable Energy" as the EPC. Swinerton Renewable Energy was acquired in 2021, merged with SOLV Inc., and rebranded as **SOLV Energy** in 2022. The company no longer exists under the Swinerton name.

**Impact:** Minor — sales outreach to "Swinerton Renewable Energy" would be confusing. The correct contact is SOLV Energy.

**Proposed fix:** Could maintain a lookup table of EPC name changes / acquisitions. Or add to prompt: *"If you find an EPC, verify the company still exists under that name. Major solar EPC rebrandings: Swinerton Renewable Energy → SOLV Energy (2022), First Solar EPC → now only manufactures panels."*

---

### Issue 6: Completed Projects Not Filtered

**Severity: Low**

Silver Ridge Mount Signal has been fully operational since 2020. The agent found the EPC and reported it, but didn't flag that there's nothing to sell to — the project is done. The agent's job is to find leads for Civ Robotics, not just identify EPCs historically.

**Proposed fix:** Add to system prompt: *"If you discover the project is already completed/operational, note this prominently. Completed projects are not actionable leads — the value is in the EPC relationship for their future projects, not this one."*

---

### Issue 7: Search Depth Insufficient for "Likely" Findings

**Severity: Medium**

The agent performed 3-5 Tavily searches per project. For "confirmed" results, this was sufficient — the evidence was strong enough to surface in a few queries. For "likely" results, the agent stopped too early. A single additional search ("Azimuth Energy 500MW" or "Inovateus Solar 300MW Greene County") would have disproven both false positives.

**Proposed fix:** Add a verification loop: *"If your confidence is 'likely' or 'possible', perform at least 2 additional searches specifically trying to disprove your finding: search for '[EPC name] [capacity MW]' and '[EPC name] portfolio largest project'. If the EPC has never built at this scale, downgrade to 'unknown'."*

---

### Observations on Search Tool

**Tavily limitations noticed:**
- Tavily is good at quick factual lookups but may not surface contractor portfolio pages, subcontractor blogs (e.g., W. Bradley Electric's page confirming McCarthy), or state regulatory PDFs
- The verification agents used broader web search and found key sources Tavily likely missed
- Consider supplementing Tavily with a second search source, or switching to a broader search API for verification passes

---

### Positive Findings

- **"Confirmed" confidence is trustworthy** — both confirmed EPCs (McCarthy, SOLV Energy) were verified correct with strong evidence
- **Agent correctly returns "unknown"** when it finds no evidence — 5 projects correctly reported as unknown rather than guessing
- **Knowledge base write-back works** — discoveries were automatically stored with sources and reasoning
- **The system prompt's source reliability ranking is effective** — confirmed results came from first-party sources (EPC websites, press releases)

---

### Priority Improvements (Ranked by Impact)

| Priority | Fix | Effort | Expected Impact |
|----------|-----|--------|-----------------|
| 1 | Add MW scale verification to prompt for "likely" findings | Low | Eliminates most false positives |
| 2 | Fix CAISO developer field (it's the utility, not developer) | Low-Medium | Better search queries for all CAISO projects |
| 3 | Add verification search loop for non-confirmed findings | Low | Catches weak extrapolations |
| 4 | Add MISO POI name warning to prompt | Low | Better initial search strategy |
| 5 | Consider Opus model for high-value / high-MW projects | Low | Better reasoning on complex cases |
| 6 | Add multi-phase awareness to prompt | Low | Avoids partial/misleading EPC reports |
| 7 | Supplement Tavily with broader search | Medium | Better source coverage |
| 8 | Add EPC name change / acquisition lookup | Medium | Correct company names for outreach |

---

## Template for Future Eval Runs

```
## Eval Run #N — [Date]

**Batch size:**
**Model:**
**Changes since last run:**

### Results Summary
| # | Project | MW | ISO | EPC Found | Confidence | Verified? |

### New Issues Found

### Previously Identified Issues — Status
| Issue | Status | Notes |

### Accuracy Trend
| Run | Confirmed Accuracy | Likely Accuracy | Overall |
```
