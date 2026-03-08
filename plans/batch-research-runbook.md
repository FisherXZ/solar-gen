# Batch EPC Research — Local Runbook

## Prerequisites

1. **Anthropic API credits** — check balance at [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing)
2. **Tavily API key** — for web search (in `agent/.env`)
3. **Supabase credentials** — service role key (in `agent/.env`)
4. **Python environment** — with `anthropic`, `supabase`, `tavily-python` installed

## Environment Setup

All commands run from `agent/` directory:

```bash
cd agent
```

The `.env` file must contain:
```
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY=tvly-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

## Step 1: Pick Projects

Query high-scoring projects without an EPC:

```bash
python -c "
import os
with open('.env') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip()

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

resp = client.table('projects').select('id, project_name, developer, state, mw_capacity, iso_region, lead_score, expected_cod').is_('epc_company', 'null').order('lead_score', desc=True).limit(20).execute()

for i, p in enumerate(resp.data, 1):
    print(f'{i:2}. {p[\"project_name\"] or \"unnamed\"} | {p[\"developer\"]} | {p[\"mw_capacity\"]}MW | {p[\"state\"]} | Score:{p[\"lead_score\"]} | COD:{p[\"expected_cod\"]}')
    print(f'    ID: {p[\"id\"]}')
"
```

## Step 2: Run Batch Discovery

Copy the project IDs you want to research into the list below and run:

```bash
python -c "
import asyncio, os

with open('.env') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip()

from src.batch import run_batch
from src.db import get_project

# === PASTE PROJECT IDS HERE ===
ids = [
    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
]
# ===============================

projects = [p for p in [get_project(pid) for pid in ids] if p]
print(f'Loaded {len(projects)} projects', flush=True)

async def on_progress(u):
    s = u.get('status')
    pid = u.get('project_id','')[:8]
    if s == 'started':
        print(f'  [{pid}] Starting: {u.get(\"project_name\",\"\")}', flush=True)
    elif s == 'completed':
        d = u.get('discovery',{})
        print(f'  [{pid}] Done: EPC={d.get(\"epc_contractor\",\"?\")} | Confidence={d.get(\"confidence\",\"?\")}', flush=True)
    elif s == 'skipped':
        print(f'  [{pid}] Skipped: {u.get(\"reason\",\"\")}', flush=True)
    elif s == 'error':
        print(f'  [{pid}] ERROR: {u.get(\"error\",\"\")[-300:]}', flush=True)

async def main():
    print('Starting batch EPC discovery (concurrency=3)...', flush=True)
    results = await run_batch(projects, on_progress, concurrency=3)
    completed = [r for r in results if r.get('status') == 'completed']
    errors = [r for r in results if r.get('status') == 'error']
    print(f'\nDone: {len(completed)} completed, {len(errors)} errors', flush=True)

asyncio.run(main())
"
```

## Step 3: Review Results

Check discoveries in the database:

```bash
python -c "
import os
with open('.env') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip()

from supabase import create_client
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

resp = client.table('epc_discoveries').select('project_id, epc_contractor, confidence, reasoning, review_status, created_at').order('created_at', desc=True).limit(20).execute()

for d in resp.data:
    print(f'{d[\"epc_contractor\"]:30s} | {d[\"confidence\"]:10s} | {d[\"review_status\"]:8s} | {d[\"created_at\"][:10]}')
    if d.get('reasoning'):
        print(f'  {d[\"reasoning\"][:120]}')
    print()
"
```

## Step 4: Accept/Reject via API or Dashboard

**Via the dashboard:** Navigate to `/epc-discovery/table`, click a project, review the discovery, accept or reject.

**Via CLI:**
```bash
# Accept a discovery (also updates project.epc_company)
curl -X PATCH http://localhost:8000/api/discover/DISCOVERY_ID/review \
  -H 'Content-Type: application/json' \
  -d '{"action": "accepted"}'

# Reject a discovery
curl -X PATCH http://localhost:8000/api/discover/DISCOVERY_ID/review \
  -H 'Content-Type: application/json' \
  -d '{"action": "rejected"}'
```

## Notes

- **Concurrency:** Default is 3 concurrent agent runs. Each run makes 3-5 Tavily searches + 1 Claude API call per iteration (up to 10 iterations). Adjust in `run_batch(..., concurrency=N)`.
- **Cost per project:** ~$0.02-0.05 in Claude API + ~$0.01 in Tavily per project (Sonnet model).
- **Skipped projects:** Projects with an already-accepted discovery are automatically skipped.
- **Knowledge base:** Results are automatically written to the KB (`entities`, `epc_engagements`, `research_attempts` tables) if migration 006 has been run.
- **Re-research:** To re-research a project, first reject the existing discovery, then run again.

## The 10 Test Projects (March 2026)

```
9671d347-5f0f-435e-b838-91dbc5eefe59  # Silver Ridge Mount Signal (600MW, CA)
5d393acd-f1ad-4cc7-9543-51f98ed99899  # Centennial Flats (500MW, AZ)
e59eab66-addc-4266-b34d-b27011569f07  # Pelicans Jaw Hybrid Solar (500MW, CA)
3a411e59-1f92-4b57-b224-4ed8e27b727e  # Goldback Solar Center (500MW, CA)
e198f1ad-3881-4a48-9a0d-931ea12ede02  # 7Coffeen - 7Pana (500MW, IL)
015faf79-1615-4ae7-a10b-21596da42bd6  # Buffalo 345 kV (500MW, ND)
833f2c37-f3f6-4914-9cfd-40556ce7be09  # Ipava 138kV (350MW, IL)
5e724065-f77d-4350-a4b1-f00054a63a1b  # Jacinto - Peach Creek (206MW, TX)
673e70e3-3dfe-4ec1-9a87-94a244706a8c  # Francisco 345/138kV (250MW, IN)
99931e24-d5a4-46dc-ab54-5129be14150a  # Sandborn - Worthington (300MW, IN)
```
