# Conversation Sharing — Static Snapshot Links

**Date:** 2026-04-15
**Status:** Approved, ready to build
**Pattern reference:** Claude.ai `claude.ai/share/{token}`, ChatGPT `chatgpt.com/share/{id}`

## Goal

Let a user generate a public URL for any of their chat conversations so the link recipient can view the full conversation (tool cards, research timelines, source pills, markdown) as a read-only, snapshot-at-share presentation asset.

## Plain English

Add a "Share" button to the chat header. Clicking it produces a unique URL. Anyone with that URL sees a read-only view of the conversation as it existed at the moment of sharing — no live updates, no input box, no sidebar. Internal agent mechanics (scratchpad, memory ops, knowledge-base lookups) are stripped. User can revoke the link anytime. Public access, no login required for viewers.

## Decisions (locked)

| Decision | Choice | Reason |
|----------|--------|--------|
| Snapshot vs live | **Snapshot at share time** | Privacy boundary — prevents future private messages from leaking into old shared links |
| Sanitizer | **Allow-list** (new tools fail closed) | Deny-list leaks silently when new tools are added |
| RLS approach | **SECURITY DEFINER Postgres function** | RLS stays strict; function is the only public read path |
| Mid-stream sharing | **Block while agent job is active** | Least surprising; no half-rendered tool calls |
| Access audit | **Log every public fetch** | Cheap insurance if a link leaks |
| OG image | **Static Civ Robotics brand card** | Dynamic deferred; avoids content-leak in meta tags |
| Indexing | **noindex, nofollow** on share page | Research conversations shouldn't be Google-indexed |
| File attachments | **Not shown in shared view** | Matches Claude.ai |
| Auth on share page | **Public (no login)** | Matches Claude.ai individual plan behavior |

## Architecture (ASCII)

```
┌─────────────────────────┐           ┌──────────────────────┐
│ ChatInterface.tsx       │           │ agent/src/main.py    │
│  ├── ShareButton ───────┼──POST────▶│  /conv/{id}/share    │─┐
│  └── (popover: URL +    │           │  /conv/{id}/share DEL│ │
│       copy + revoke)    │◀──token───│  /share/{token} GET  │ │
└─────────────────────────┘           │  /share/{token}/log  │ │
                                      └──────────────────────┘ │
                                                               ▼
┌─────────────────────────┐                      ┌──────────────────┐
│ /share/[token]/page.tsx │◀── GET /share/X ────▶│  Postgres        │
│ (server-rendered)       │                      │  ─────────────   │
│  ├── <head>             │                      │  fn: get_shared_ │
│  │   ├── OG meta tags   │                      │   conversation() │
│  │   └── noindex        │                      │  SECURITY DEFINER│
│  ├── ChatMessage (RO)   │                      │                  │
│  │   (sanitized parts)  │                      │  chat_conv.      │
│  └── "Shared from Civ"  │                      │    share_token   │
│      footer             │                      │    shared_at     │
└─────────────────────────┘                      │                  │
                                                 │  chat_messages   │
                                                 │   (append-only)  │
                                                 │   filtered by    │
                                                 │   created_at ≤   │
                                                 │   shared_at      │
                                                 │                  │
                                                 │  chat_share_     │
                                                 │    access_log    │
                                                 └──────────────────┘
```

## Data flow

1. **Create share**: User clicks Share → frontend POSTs to `/api/conversations/{id}/share` → backend verifies caller owns conversation, generates nanoid token, sets `share_token` + `shared_at = now()`, returns `{token, url}`.
2. **View share**: Visitor loads `/share/{token}` → Next.js page server-renders → fetches from backend `GET /api/share/{token}` → backend calls SQL function `get_shared_conversation(token)` which returns conversation + messages `WHERE created_at <= shared_at` → backend sanitizes via allow-list → logs access row → returns JSON → page renders via existing `ChatMessage` component with `isStreaming={false}`.
3. **Revoke**: User clicks Stop Sharing → DELETE → backend nulls `share_token` and `shared_at` → subsequent GETs 404.
4. **Re-share**: New POST regenerates token + bumps `shared_at = now()`. Old link returns 404; new link shows conversation through current time.
5. **Block mid-stream**: `POST /share` checks `chat_events` / active job state; if an agent job is running on this conversation, returns 409 with `{"error": "wait_for_completion"}`. UI shows "Wait for the current response to finish."

## Implementation Plan

### Migration `029_chat_share_tokens.sql`

```sql
-- Share tokens on conversations
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS shared_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_share_token
  ON chat_conversations (share_token)
  WHERE share_token IS NOT NULL;

-- Access audit log (append-only)
CREATE TABLE IF NOT EXISTS chat_share_access_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token     TEXT        NOT NULL,
  conversation_id UUID        NOT NULL,
  accessed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash         TEXT,          -- sha256(ip + daily_salt), not raw IP
  user_agent      TEXT
);

CREATE INDEX idx_share_access_token ON chat_share_access_log (share_token, accessed_at DESC);

-- Public read function (SECURITY DEFINER — bypasses RLS safely)
CREATE OR REPLACE FUNCTION get_shared_conversation(p_token TEXT)
RETURNS TABLE (
  conversation_id UUID,
  title           TEXT,
  shared_at       TIMESTAMPTZ,
  message_id      UUID,
  role            TEXT,
  content         TEXT,
  parts           JSONB,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.title,
    c.shared_at,
    m.id,
    m.role,
    m.content,
    m.parts,
    m.created_at
  FROM chat_conversations c
  JOIN chat_messages m ON m.conversation_id = c.id
  WHERE c.share_token = p_token
    AND c.shared_at IS NOT NULL
    AND m.created_at <= c.shared_at
  ORDER BY m.created_at ASC;
$$;

-- Only allow calling via function; don't grant direct table access
REVOKE ALL ON FUNCTION get_shared_conversation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shared_conversation(TEXT) TO anon, authenticated;

-- Access log: service-role only write, nobody can read from client
ALTER TABLE chat_share_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON chat_share_access_log
  FOR ALL USING (auth.role() = 'service_role');
```

### Backend — `agent/src/main.py`

New endpoints (insert near existing `/api/conversations/*` handlers):

```python
# POST /api/conversations/{id}/share
#   - Verify caller owns conversation (existing auth pattern)
#   - Check no active agent job (existing /status check)
#   - Generate nanoid(21) token
#   - UPDATE chat_conversations SET share_token=?, shared_at=now() WHERE id=?
#   - Return {"token": "...", "url": "https://.../share/..."}

# DELETE /api/conversations/{id}/share
#   - Verify caller owns conversation
#   - UPDATE chat_conversations SET share_token=NULL, shared_at=NULL WHERE id=?
#   - Return 204

# GET /api/share/{token}  (PUBLIC, no auth)
#   - Call get_shared_conversation(token) via service-role client
#   - If empty result → 404 {"error": "not_found"}
#   - Sanitize messages via allow-list
#   - Log access (hash IP with daily salt, capture UA)
#   - Return {"conversation": {...}, "messages": [...]}
```

### Sanitizer — new file `agent/src/share_sanitizer.py`

```python
SHAREABLE_TOOLS = frozenset({
    "web_search",
    "web_search_broad",
    "fetch_page",
    "search_projects",
    "search_projects_with_epc",
    "research_epc",
    "report_findings",
    "get_discoveries",
    "request_discovery_review",
    "request_guidance",
    "notify_progress",
    "batch_research_epc",
    "export_csv",
})

def sanitize_parts(parts: list[dict]) -> list[dict]:
    """Allow-list filter: drop non-shareable tools, strip internal-only fields."""
    out = []
    for p in parts:
        ptype = p.get("type", "")
        tool_name = p.get("toolName") or (ptype[5:] if ptype.startswith("tool-") else None)

        # Text / file parts pass through (file attachments handled at a higher layer)
        if ptype == "text":
            out.append(p)
            continue

        # Tool parts: must be in allow-list
        if tool_name and tool_name in SHAREABLE_TOOLS:
            out.append(_strip_internal_fields(p))
            continue

        # Skip everything else (internal tools, reasoning, step-start, file, etc.)
    return out

def _strip_internal_fields(part: dict) -> dict:
    """Remove _-prefixed keys from tool input; truncate stack traces in output."""
    clean = dict(part)
    if isinstance(clean.get("input"), dict):
        clean["input"] = {k: v for k, v in clean["input"].items() if not k.startswith("_")}
    if isinstance(clean.get("output"), dict) and "error" in clean["output"]:
        # Preserve error flag, drop stack trace
        err = clean["output"].get("error")
        if isinstance(err, str) and "Traceback" in err:
            clean["output"] = {**clean["output"], "error": "An error occurred"}
    return clean
```

### Frontend — new files

**`frontend/src/components/chat/ShareButton.tsx`** (new)
- Icon button in chat header
- Opens popover with: share URL (copy button), "Stop sharing" button
- State: `unshared | sharing | shared | revoking`
- 409 response → toast "Wait for the current response to finish"

**`frontend/src/app/share/[token]/page.tsx`** (new — server component)
- `generateMetadata()`: OG title = conversation title (fallback "Shared conversation"), OG description = static "A research conversation from Civ Robotics", OG image = `/og-share.png`
- `<meta name="robots" content="noindex, nofollow" />`
- Fetches via backend `/api/share/{token}` (server-side fetch, no client JS needed for render)
- 404 path renders a friendly "This conversation is no longer shared" page
- Renders existing `<ChatMessage>` with `isStreaming={false}` for every message
- No sidebar, no input box, no file attachments
- Footer: "Shared from Civ Robotics" + wordmark

**`frontend/src/components/chat/ChatInterface.tsx`** (edit)
- Add `<ShareButton conversationId={conversationId} isJobActive={isLoading} />` to header
- Only render when `conversationId` exists

**`public/og-share.png`** (new static asset, 1200x630)
- Civ Robotics wordmark + amber accent + "Shared Conversation"
- Generated once, committed as binary

## Test Plan

| # | Test | Type | File | Asserts |
|---|------|------|------|---------|
| 1 | `test_sanitize_allows_known_tools` | Unit (pytest) | `agent/tests/test_share_sanitizer.py` | Each tool in `SHAREABLE_TOOLS` survives the filter |
| 2 | `test_sanitize_hides_unknown_tool` | Unit | same | Fabricated `tool_xyz` → excluded |
| 3 | `test_sanitize_hides_scratchpad_remember_recall` | Unit | same | Internal tools filtered |
| 4 | `test_sanitize_strips_underscore_keys` | Unit | same | `_batch_id` removed from input |
| 5 | `test_sanitize_truncates_error_traceback` | Unit | same | `Traceback...` → `"An error occurred"` |
| 6 | `test_sanitize_passes_text_parts` | Unit | same | Text parts untouched |
| 7 | `test_share_token_is_url_safe_and_unique` | Unit | `agent/tests/test_share_endpoints.py` | 21+ chars, nanoid alphabet |
| 8 | `test_post_share_creates_token_and_timestamp` | Integration | same | Columns populated, response has URL |
| 9 | `test_post_share_rejects_while_job_active` | Integration | same | 409 when active job exists |
| 10 | `test_delete_share_clears_columns` | Integration | same | Both columns → NULL |
| 11 | `test_get_share_returns_pre_share_messages_only` | Integration | same | Insert message AFTER share → excluded from fetch |
| 12 | `test_get_share_invalid_token_404` | Integration | same | Random token → 404 |
| 13 | `test_get_share_revoked_token_404` | Integration | same | After DELETE → same token returns 404 |
| 14 | `test_get_share_logs_access` | Integration | same | Row appears in `chat_share_access_log` |
| 15 | `test_rls_function_callable_as_anon` | SQL | `supabase/tests/share_rls.sql` | `anon` role can `SELECT get_shared_conversation(t)` |
| 16 | `test_rls_anon_blocked_from_direct_table_read` | SQL | same | Anon `SELECT * FROM chat_messages` → 0 rows or error |
| 17 | `test_share_page_renders_sanitized_messages` | Frontend smoke | `frontend/src/app/share/[token]/__tests__/page.test.tsx` | Mount page, assert known tool card present, unknown absent |
| 18 | `test_share_page_no_input_box` | Frontend | same | Component tree has no `<form>` or input |
| 19 | `test_share_page_has_noindex_meta` | Frontend | same | `<meta name="robots">` present with `noindex` |
| 20 | `test_share_button_409_shows_wait_message` | Frontend | `frontend/src/components/chat/__tests__/ShareButton.test.tsx` | 409 response → toast with "finish" message |

## Failure modes

| Scenario | Current plan handles? | Mitigation |
|----------|----------------------|------------|
| Sanitizer forgets a new tool | ✅ allow-list fails closed | New tool silently hidden; expected behavior |
| Token guessing / brute force | ✅ 128-bit entropy + rate limit the GET endpoint (add to middleware) | nanoid(21) ≈ 2^126 |
| CDN caches revoked content | ⚠️ Partial | Set `Cache-Control: private, max-age=60` on share endpoint (60s staleness max) |
| Conversation deleted while shared | ✅ ON DELETE CASCADE on messages | Function returns empty → 404 |
| User shares a conversation containing old internal PII | ⚠️ Manual review risk | Sanitizer drops internal tools; PII in user text is user's responsibility |
| OG scraper (Slackbot) floods access log | ⚠️ Minor noise | Filter by UA or accept — logs are cheap |

## NOT in scope

- **Streaming replay / typewriter animation** on shared page — deferred, no demand
- **Dynamic OG image** per conversation — deferred, static card is fine
- **Team/org sharing controls** — no multi-tenant UX yet
- **"Import this conversation into my history"** (ChatGPT feature) — no need
- **PDF / Markdown export** — separate feature, defer
- **Share link expiry (TTL)** — deferred; revoke button is sufficient
- **Share link analytics dashboard** — log is captured; no UI yet
- **Comment / annotation on shared page** — deferred
- **File attachments in shared view** — explicitly excluded (Claude.ai pattern)

## What already exists

- `chat_conversations`, `chat_messages` tables (migrations 005, 022) — reused
- `ChatMessage.tsx`, `MarkdownMessage.tsx`, `ToolPart.tsx`, `ResearchTimeline.tsx`, `SourceSummaryBar.tsx` — all reused for shared view
- FastAPI handlers in `agent/src/main.py` — pattern reused for new endpoints
- Supabase service-role client (`frontend/src/lib/supabase/service.ts`) — reused for server-side share page fetch

## Open items (log only, not blocking)

- Consider snapshot refresh UI ("Update this share?") if users ask for it
- Consider self-service share dashboard (list of my shares, view counts) if usage grows
