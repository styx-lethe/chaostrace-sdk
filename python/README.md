# chaostrace (Python)

Drop-in SDK for chaos trace. Wraps the Anthropic and OpenAI Python clients to add governance and observability with one import change.

## Install

```bash
pip install chaostrace
```

Optional client libraries (install whichever you use):

```bash
pip install chaostrace[anthropic]   # adds anthropic
pip install chaostrace[openai]      # adds openai
pip install chaostrace[all]         # both
```

Until PyPI is set up, install directly from GitHub:

```bash
pip install git+https://github.com/styx-lethe/chaostrace-sdk.git#subdirectory=python
```

## Usage

### Anthropic

```python
from chaostrace import Anthropic

client = Anthropic(
    api_key="sk-ant-...",
    chaostrace_api_key="ct_tenant_xyz",
    caller_tag="sales-rep-bot",
)

response = client.messages.create(
    model="claude-opus-4-7",
    messages=[{"role": "user", "content": "..."}],
)
```

### OpenAI

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

### check_intent

Pre-write verdict check. Call this before your agent does a platform write:

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
    confidence=0.83,
)

# verdict.decision: 'allow' | 'warn' | 'deny'
# verdict.reasons: list of {code, message, policy_id, severity}
# verdict.correlation_id: str
# verdict.denied / .warned / .allowed: bool helpers

if verdict.denied:
    return  # chaos trace blocked this action
if verdict.warned:
    log(verdict.reasons)
proceed_with_write()
```

## Configuration

| Argument | Required | Description |
|---|---|---|
| `chaostrace_api_key` | yes | Your chaos trace tenant API key. Get one at chaostrace.com/settings. |
| `caller_tag` | recommended | A label for this client, e.g. `"sales-rep-bot"`. Surfaces in the chaos trace dashboard. |
| `chaostrace_api_url` | no | Defaults to `https://api.chaostrace.com`. Override for self-hosted. |

`CHAOSTRACE_API_KEY` and `CHAOSTRACE_API_URL` environment variables are read as fallbacks.

## Privacy

The SDK never sends prompt content, response content, or tool call arguments. It sends only metadata: model, token counts, timing, cache hit rate, your `caller_tag`. See [`docs/integration-guide.md`](../docs/integration-guide.md) for the full list.

## License

MIT.
