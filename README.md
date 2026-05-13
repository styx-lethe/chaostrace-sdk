# chaos trace SDK

Drop-in governance and observability for AI agents that touch your business systems.

Change one import in your agent code, and chaos trace sees what your AI is doing — what it's about to do, what it actually did, and whether it matches what it told us.

## Install

**Python:**

```bash
pip install chaostrace
```

**TypeScript / JavaScript:**

```bash
npm install @chaostrace/sdk
```

## Two-line integration (Python)

```python
from chaostrace import Anthropic  # was: from anthropic import Anthropic

client = Anthropic(
    api_key="sk-ant-...",
    chaostrace_api_key="ct_tenant_xyz",  # from your chaos trace dashboard
    caller_tag="sales-rep-bot",          # name this agent
)

# Every messages.create() now reports metadata to chaos trace.
# No content is sent. Ever.
response = client.messages.create(
    model="claude-opus-4-7",
    messages=[{"role": "user", "content": "..."}],
)
```

That's it. The rest of your Anthropic code is identical.

## What chaos trace sees (and doesn't)

- ✅ caller_tag, model, token counts, cache hit rate, timing, request IDs
- ❌ Prompt content, response content, tool call arguments, system prompt body

Privacy by construction. Read [`docs/integration-guide.md`](docs/integration-guide.md) for the full audit of what's sent.

## Optional: pre-write verdict check

When your agent is about to write to a connected system (Salesforce, HubSpot), call `check_intent()` first to get a governance verdict:

```python
import chaostrace

verdict = chaostrace.check_intent(
    chaostrace_api_key="ct_tenant_xyz",
    agent_id="sales-rep-bot",
    run_id="run_123",
    system="salesforce",
    object="Opportunity",
    record_id="006abc",
    action="update",
    fields=[{"name": "StageName", "from": "Negotiation", "to": "Closed Won"}],
)

if verdict.decision == "deny":
    log(verdict.reasons)  # chaos trace says no — log and skip
    return

# Otherwise proceed with the platform write...
```

Verdicts come from policies you configure at chaostrace.com. The verdict and your agent's eventual action are reconciled — if your agent acts against a `deny`, chaos trace surfaces it in your dashboard and via Slack.

## Languages

| Language | Status | Package | Install |
|---|---|---|---|
| Python | beta | `chaostrace` | `pip install chaostrace` |
| TypeScript / JavaScript | beta | `@chaostrace/sdk` | `npm install @chaostrace/sdk` |

## Docs

- [`docs/integration-guide.md`](docs/integration-guide.md) — full examples in both Python and TypeScript, Anthropic and OpenAI, plus the raw HTTPS path
- [`python/README.md`](python/README.md) — Python-specific usage
- [`typescript/README.md`](typescript/README.md) — TypeScript-specific usage

## License

MIT.
