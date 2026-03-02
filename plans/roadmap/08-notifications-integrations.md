# 08 — Notifications & Integrations

**Status:** Draft

---

## Principle

A dashboard people have to check is passive. The most actionable intelligence should push itself to where the sales team already works — Slack, email, and CRM.

Notifications are driven by **delta events** (see [05-delta-tracking.md](05-delta-tracking.md)). The delta tracking system classifies events by signal tier; the notification layer decides which tiers get pushed where.

## Slack Integration

### What Gets Sent

| Trigger | Channel | Format |
|---------|---------|--------|
| Tier 1 critical event (status progression, withdrawal, EPC identified) | #solar-leads | Rich message with project summary + link to dashboard |
| New project >100MW enters queue | #solar-leads | Brief message with key details |
| Weekly digest (Monday AM) | #solar-leads | Summary: new projects, status changes, EPCs found this week |
| EPC discovery agent completes (confirmed EPC) | #solar-leads | "EPC identified for [project]: [EPC name]" |

### Implementation Approach

- Slack Incoming Webhook (simplest) or Slack Bot (if we want interactivity)
- Triggered by the delta tracking system — when a Tier 1 event is logged, fire a webhook
- Weekly digest: scheduled job (GitHub Actions cron or Supabase Edge Function)

[TBD: Slack workspace details — does Civ Robotics use Slack? Confirm with Liav]

## Email Digest

### Weekly Summary Email

Sent Monday morning to configured recipients:

```
Subject: Solar Lead Gen — Week of March 1, 2026

NEW PROJECTS (12 this week):
• Desert Star Solar — 180MW — CAISO — Riverside County, CA
• Prairie Wind Solar+Storage — 350MW — MISO — McLean County, IL
• [...]

STATUS CHANGES (5 this week):
• Sunflower Solar — Feasibility Study → System Impact Study [CRITICAL]
• [...]

EPCs IDENTIFIED (2 this week):
• Sunflower Solar (250MW, TX) → McCarthy Building Companies
• [...]

HOT LEADS (score > 70, EPC known):
[Table of top leads]

→ View full dashboard: [link]
```

### Implementation Approach

- Supabase Edge Function or simple script triggered by cron
- Email via SendGrid, Resend, or AWS SES
- [TBD: Email service choice]

## CRM Integration

### Target CRMs

[TBD — confirm with Liav which CRM Civ Robotics uses]

- **Salesforce:** Most likely for an enterprise sales team. Has robust API.
- **HubSpot:** Common alternative. Also has good API.
- **Other:** Pipedrive, Close, etc.

### What Gets Pushed

When a lead meets criteria (EPC identified + score > threshold + active status), create/update a record in the CRM:

```
CRM Lead/Opportunity:
  Name: "{Project Name} — {MW}MW — {State}"
  Company: {EPC contractor}
  Source: "Solar Lead Gen Agent"
  Stage: [mapped from project status]
  Custom fields:
    - Developer: {developer name}
    - MW Capacity: {mw}
    - Expected COD: {date}
    - ISO Region: {iso}
    - Lead Score: {score}
    - Dashboard Link: {url}
```

### Sync Direction

**Phase 1: One-way push (agent → CRM)**
- New qualified leads pushed to CRM
- Updated fields synced when they change in our system

**Phase 2: Two-way sync (future)**
- CRM status updates (contacted, meeting scheduled, won/lost) sync back
- This lets us track conversion rate: what % of our leads resulted in meetings?
- Closed-loop feedback improves lead scoring

### Implementation Approach

- Salesforce: REST API or Bulk API
- HubSpot: REST API
- Triggered by: EPC confirmed + score threshold (same trigger as Slack)
- Dedup by: project queue ID or a custom external ID field

[TBD: CRM-specific details after confirming which CRM is in use]

## Notification Preferences

Eventually, users should be able to configure:

- Which states/ISOs they care about (territory-based filtering)
- Minimum MW threshold for notifications
- Which channels they want (Slack only, email only, both)
- Digest frequency (daily/weekly)

This is lower priority — start with a single configuration that works for the whole team, then add personalization later.

## Open Questions

- [TBD] Does Civ Robotics use Slack? If not, what messaging platform?
- [TBD] Which CRM? Salesforce, HubSpot, other?
- [TBD] Who receives notifications? Just sales team, or also business development / leadership?
- [TBD] Do we need a "mute this project" feature to stop notifications for leads they've decided not to pursue?
