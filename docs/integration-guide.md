# Integration guide

Three ways to integrate your AI agent with chaos trace, in order of friction:

1. **Drop-in SDK** — change one import, get observability. Under a minute.
2. **SDK + pre-write verdict checks** — add `check_intent` / `checkIntent` before platform writes for active governance. ~5 minutes per agent.
3. **Raw HTTPS** — call the endpoints directly if you can't or don't want to install the SDK. ~10 minutes.

Pick whichever fits your code. You can mix and match — telemetry on one client, intent checks on another.

---

## Before you start

1. A chaos trace account at [chaostrace.com](https://chaostrace.com).
2. A tenant API key from `chaostrace.com/settings`. Looks like `ct_tenant_...`.
3. An agent that uses Anthropic or OpenAI (or both).

You'll also want one stable label per agent — your `caller_tag`. Examples: `"sales-rep-bot"`, `"lead-router"`, `"clay-enrichment"`. This is how agents appear in your chaos trace dashboard.

---

## Pattern 1 — Drop-in SDK (telemetry only)

The smallest integration. Two-line change to your code, and chaos trace sees every model call you make. No verdict checks, just metadata reports.

### Python — Anthropic

Before:

```python
import anthropic
client = anthropic.Anthropic(api_key="sk-ant-...")

response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}],
)
```

After:

```python
from chaostrace import Anthropic

client = Anthropic(
    api_key="sk-ant-...",
    chaostrace_api_key="ct_tenant_xyz",
    caller_tag="sales-rep-bot",
)

response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}],
)
```

That's it. Every `messages.create()` now fires an async metadata POST to chaos trace.

### Python — OpenAI

```python
from chaostrace import OpenAI

client = OpenAI(
    api_key="sk-...",
    chaostrace_api_key="ct_tenant_xyz",
    caller_tag="lead-router",
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "..."}],
)
```

### TypeScript — Anthropic

```typescript
import { Anthropic } from '@chaostrace/sdk'

const client = new Anthropic({
  apiKey: 'sk-ant-...',
  chaostraceApiKey: 'ct_tenant_xyz',
  callerTag: 'sales-rep-bot',
})

const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '...' }],
})
```

### TypeScript — OpenAI

```typescript
import { OpenAI } from '@chaostrace/sdk'

const client = new OpenAI({
  apiKey: 'sk-...',
  chaostraceApiKey: 'ct_tenant_xyz',
  callerTag: 'lead-router',
})

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '...' }],
})
```

---

## Pattern 2 — SDK + pre-write verdict check

When your agent is about to write to a connected system (Salesforce, HubSpot, etc.), call `check_intent` / `checkIntent` first. chaos trace evaluates the action against your policies and returns `allow` / `warn` / `deny`. The verdict and your agent's eventual action are reconciled — if your agent ignores a `deny`, chaos trace surfaces it as a violation in your dashboard and via Slack.

### Python

```python
import chaostrace
from chaostrace import Anthropic

client = Anthropic(
    api_key="sk-ant-...",
    chaostrace_api_key="ct_tenant_xyz",
    caller_tag="sales-rep-bot",
)

# Agent decides what to do based on Claude's response...
ai_response = client.messages.create(
    model="claude-opus-4-7",
    messages=[{"role": "user", "content": "Update opp 006abc to Closed Won"}],
)
parsed = parse_response(ai_response)
# parsed = {"action": "update", "record_id": "006abc", "field": "StageName", "to": "Closed Won"}

# Before doing the actual platform write, ask chaos trace:
verdict = chaostrace.check_intent(
    chaostrace_api_key="ct_tenant_xyz",
    agent_id="sales-rep-bot",
    run_id="run_2026_05_13_abc",
    system="salesforce",
    object="Opportunity",
    record_id="006abc",
    action="update",
    fields=[{"name": "StageName", "from": "Negotiation", "to": "Closed Won"}],
    confidence=0.83,
    model="claude-opus-4-7",
)

if verdict.denied:
    log_blocked_action(verdict.reasons)
    return
if verdict.warned:
    log_warning(verdict.reasons)

# chaos trace allowed (or warned) — proceed with the write.
sf.update_opportunity(record_id="006abc", StageName="Closed Won")
```

### TypeScript

```typescript
import { Anthropic, checkIntent } from '@chaostrace/sdk'

const client = new Anthropic({
  apiKey: 'sk-ant-...',
  chaostraceApiKey: 'ct_tenant_xyz',
  callerTag: 'sales-rep-bot',
})

// Agent reasoning...
const aiResponse = await client.messages.create({ /* ... */ })
const parsed = parseResponse(aiResponse)

// Before the platform write:
const verdict = await checkIntent({
  chaostraceApiKey: 'ct_tenant_xyz',
  agentId: 'sales-rep-bot',
  runId: 'run_2026_05_13_abc',
  system: 'salesforce',
  object: 'Opportunity',
  recordId: '006abc',
  action: 'update',
  fields: [{ name: 'StageName', from: 'Negotiation', to: 'Closed Won' }],
  confidence: 0.83,
  model: 'claude-opus-4-7',
})

if (verdict.decision === 'deny') {
  logBlockedAction(verdict.reasons)
  return
}
if (verdict.decision === 'warn') logWarning(verdict.reasons)

await sf.updateOpportunity({ recordId: '006abc', StageName: 'Closed Won' })
```

---

## Pattern 3 — Raw HTTPS (no SDK)

If you can't install the SDK (locked-down environment, exotic language, infrastructure constraints), you can hit the endpoints directly with any HTTP client.

### Submit a report (post-hoc telemetry)

```bash
curl -X POST https://api.chaostrace.com/api/agents/report \
  -H "X-API-Key: ct_tenant_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "spec_version": "1.0",
    "agent_id": "sales-rep-bot",
    "run_id": "run_2026_05_13_abc",
    "started_at": "2026-05-13T18:04:21Z",
    "completed_at": "2026-05-13T18:04:24Z",
    "status": "completed",
    "model": "claude-opus-4-7",
    "metadata": {
      "input_tokens": 1247,
      "output_tokens": 89,
      "latency_ms": 2843
    }
  }'
```

### Get a pre-write verdict

```bash
curl -X POST https://api.chaostrace.com/api/agents/intent \
  -H "X-API-Key: ct_tenant_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "spec_version": "1.0",
    "correlation_id": "intent_1747166661000_abc123",
    "agent_id": "sales-rep-bot",
    "run_id": "run_2026_05_13_abc",
    "decided_at": "2026-05-13T18:04:22Z",
    "intent": {
      "system": "salesforce",
      "object": "Opportunity",
      "record_id": "006abc",
      "action": "update",
      "fields": [{"name": "StageName", "from": "Negotiation", "to": "Closed Won"}]
    },
    "confidence": 0.83
  }'
```

Response:

```json
{
  "correlation_id": "intent_1747166661000_abc123",
  "decision": "deny",
  "reasons": [
    {
      "code": "builtin_closed_won_protection",
      "message": "AI agents cannot transition Opportunity.StageName to 'Closed Won' ...",
      "policy_id": "builtin_closed_won_protection",
      "severity": "critical"
    }
  ],
  "context": {"matched_policy_source": "builtin"},
  "evaluated_at": "2026-05-13T18:04:22.601Z"
}
```

For full request/response contracts see [`agent-intent-spec.md`](https://github.com/styx-lethe/chaostrace-api/blob/main/docs/agent-intent-spec.md) and [`agent-report-spec.md`](https://github.com/styx-lethe/chaostrace-api/blob/main/docs/agent-report-spec.md).

---

## What gets sent — the privacy audit

Every metadata report contains:

- `agent_id` (the caller_tag you set)
- `run_id` (per-client or per-run identifier)
- `started_at`, `completed_at` (RFC 3339 timestamps)
- `status` (`completed` / `failed` / `partial` / `cancelled`)
- `model` (the model identifier you sent in the request)
- `tool_calls` (which method was called, e.g. `anthropic.messages.create`)
- `metadata` — only:
  - `framework` and `sdk_version` (chaostrace SDK identification)
  - `latency_ms`
  - Token counts: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` (Anthropic); `prompt_tokens`, `completion_tokens`, `total_tokens` (OpenAI)
  - `call_id` (per-call random identifier)

Every intent check contains the above plus:

- `intent.system`, `intent.object`, `intent.record_id`, `intent.action`
- `intent.fields[].name`, `from`, `to` — but the SDK lets you hash field values via `from_hash` / `to_hash` for customer-data fields

**The SDK never sends:** prompt content, response content, system prompt body, message body, tool call argument values containing customer data. Token counts and timing only — these are the things chaos trace needs to detect agent behavior. Content is not.

---

## Common patterns

### One client, multiple runs

By default each SDK client gets one `run_id` for its lifetime. If you want each conversation or task to be a separate run, override per-client:

```python
import time
from chaostrace import Anthropic

run_id = f"run_{int(time.time())}_abc"
client = Anthropic(
    api_key="sk-ant-...",
    chaostrace_api_key="ct_...",
    caller_tag="sales-rep-bot",
    chaostrace_run_id=run_id,
)
```

### Multiple agents in one app

Create separate clients with different `caller_tag` values:

```python
sales_bot = Anthropic(api_key="sk-ant-...", chaostrace_api_key="ct_...", caller_tag="sales-rep-bot")
support_bot = Anthropic(api_key="sk-ant-...", chaostrace_api_key="ct_...", caller_tag="support-triage")
```

Both report to chaos trace under their own labels and appear as separate rows in the agents dashboard.

### Hashing field values for privacy

When the `to` value is customer data (a name, an email, a comment), hash it before sending:

```python
import hashlib

new_email = "alice@example.com"
fields = [
    {
        "name": "Email",
        "from_hash": "sha256:" + hashlib.sha256(b"oldvalue").hexdigest(),
        "to_hash": "sha256:" + hashlib.sha256(new_email.encode()).hexdigest(),
    }
]
verdict = chaostrace.check_intent(
    chaostrace_api_key="ct_...",
    agent_id="...", run_id="...",
    system="salesforce", object="Contact", record_id="003...",
    action="update",
    fields=fields,
)
```

chaos trace can detect that the value changed (and across calls, that it kept changing or stabilized) without ever seeing the value itself.

### Fail-open vs fail-closed on intent timeouts

`checkIntent` raises on 5xx / network errors. Wrap it in try/except and decide per action class:

```python
try:
    verdict = chaostrace.check_intent(...)
    if verdict.denied:
        return
except Exception:
    # chaos trace unavailable — fail-open for low-stakes, fail-closed for high-stakes.
    if action_is_high_stakes:
        return
```

The chaos trace endpoint targets p99 < 500ms. Outages should be rare; failure handling is for resilience.

---

## Configuration reference

### Python

| Argument | Env var fallback | Default |
|---|---|---|
| `chaostrace_api_key` | `CHAOSTRACE_API_KEY` | required |
| `chaostrace_api_url` | `CHAOSTRACE_API_URL` | `https://api.chaostrace.com` |
| `caller_tag` | — | `"anthropic-client"` / `"openai-client"` |
| `chaostrace_run_id` | — | auto-generated per client |
| `timeout_seconds` (on `check_intent`) | — | `5.0` |

### TypeScript

| Option | Env var fallback | Default |
|---|---|---|
| `chaostraceApiKey` | `CHAOSTRACE_API_KEY` | required |
| `chaostraceApiUrl` | `CHAOSTRACE_API_URL` | `https://api.chaostrace.com` |
| `callerTag` | — | `"anthropic-client"` / `"openai-client"` |
| `chaostraceRunId` | — | auto-generated per client |
| `timeoutMs` (on `checkIntent`) | — | `5000` |

---

## Troubleshooting

**`chaos trace API key is required`** — set the `chaostrace_api_key` argument or the `CHAOSTRACE_API_KEY` env var.

**`401 Missing X-API-Key header` from `/api/agents/intent`** — the SDK isn't picking up your key. Check that `chaostrace_api_key` is being passed in, not the Anthropic / OpenAI key by mistake.

**`401 Invalid API key`** — the key value is wrong. Regenerate at `chaostrace.com/settings`.

**Verdicts always come back `allow`** — chaos trace's default behavior when no policy matches. Tenant-defined policies in `agent_policies` are evaluated first; built-in defaults (Closed Won protection, OwnerId warn, low-confidence warn, bulk-volume warn) catch the most common cases. To add tenant policies, see `chaostrace.com/settings/policies`.

**My agent's writes aren't showing up as violations** — Phase A reconciliation matches at field level (no record_id). If two agents write the same field within the same window, attribution can blur. Phase B record-id-precise matching is on the roadmap.

---

## Support

- Issues / bugs: [github.com/styx-lethe/chaostrace-sdk/issues](https://github.com/styx-lethe/chaostrace-sdk/issues)
- Email: support@chaostrace.com
- Docs: [chaostrace.com/docs](https://chaostrace.com/docs)
