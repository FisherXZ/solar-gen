# 10 — Open Items for Liav

**Status:** Draft — accumulating questions as we design

---

## Must-Answer Before Phase 2 (EPC Discovery)

### 1. EPC Examples Validation
We've identified 10 developer→EPC relationships from public sources. Before building the discovery agent, we need Liav to:
- Review the 10 examples (see [03-epc-discovery.md](03-epc-discovery.md)) and confirm they match his industry knowledge
- Add any examples he already knows from Civ Robotics' sales experience
- Confirm: are these the types of EPCs Civ Robotics would sell to? (Are there EPCs that are too small / too large / wrong specialization?)

### 2. Target EPC Profile
- What size EPC is the ideal customer? (Top 5 national firms? Mid-size regional? Both?)
- Are there EPCs that are already Civ Robotics customers? (We should flag their projects as highest priority)
- Are there EPCs that have explicitly declined? (So we don't waste time surfacing them)

### 3. Target Project Size
- Current filter: >20 MW. Is this the right minimum?
- Is there a sweet spot for robot deployments? (e.g., 100-500MW projects are ideal, <50MW isn't worth it)
- Does project type matter? (Ground-mount vs. rooftop is already filtered, but what about fixed-tilt vs. tracker?)

### 4. Which ISOs/Regions Matter Most?
- Phase 1 covers ERCOT, CAISO, MISO. Which ISOs should we add next?
- Are there states or regions where Civ Robotics has existing deployments or sales presence? (These should be prioritized)
- Any regions to exclude? (e.g., if Civ Robotics doesn't operate in certain states)

## Must-Answer Before Phase 3 (Agent Chat)

### 5. What Does Liav Ask About Leads Today?
- When evaluating a potential project, what questions does the sales team ask?
- What information makes a lead "actionable" vs. "interesting but not ready"?
- This shapes the agent chat's suggested queries and the project detail page layout

### 6. Sales Workflow
- What happens after the sales team identifies a promising lead? (Cold call? Email? Introduction through network?)
- How far in advance of construction start do they need to engage? (6 months? 12 months? 18 months?)
- This determines when we surface leads and how aggressively we alert

## Must-Answer Before Phase 6 (CRM + Notifications)

### 7. CRM System
- Which CRM does Civ Robotics use? (Salesforce, HubSpot, other?)
- What fields/objects map to a solar project lead?
- Who manages the CRM? (In case we need admin access for integration)

### 8. Communication Channels
- Does the team use Slack? If so, which channel for sales intelligence?
- Who should receive email digests?
- Are there other tools in the sales workflow we should integrate with?

## Nice-to-Answer (Any Time)

### 9. Lead Scoring Criteria
- Beyond MW and status, what makes a lead "hot" in Liav's experience?
- Are there developer names that are known good/bad signals? (e.g., "Developer X always finishes their projects" or "Developer Y has a 90% withdrawal rate")
- Is EPC reputation a factor? (e.g., "If McCarthy is the EPC, we know they'll buy robots" vs. "If EPC Z is involved, they do everything in-house")

### 10. Competitive Landscape
- Are there competitors who offer similar lead intelligence for solar?
- What does the sales team use today for project discovery? (Just word of mouth, or any existing tools/databases?)
- Are there paid databases (e.g., Wood Mackenzie, S&P Global) that Civ Robotics subscribes to? (We should understand what they provide to avoid duplicating and to identify gaps)

### 11. Success Definition
- How would Liav measure whether this tool is valuable after 3 months?
- What's the minimum number of qualified leads per month that would make this worthwhile?
- Is there a specific deal or project type that, if we caught it early enough, would justify the entire tool?

---

## How to Use This Document

This is a living list. As we build and learn, new questions will be added. After each conversation with Liav, answered items should be:
1. Marked as answered with his response
2. The relevant roadmap section updated with his input
3. Removed from the open items list (or moved to an "Answered" section at the bottom)
