# @chaostrace/sdk (TypeScript / JavaScript)

Drop-in SDK for chaos trace. Wraps the Anthropic and OpenAI TypeScript clients to add governance and observability with one import change.

## Install

```bash
npm install @chaostrace/sdk
```

Install whichever client libraries you use alongside:

```bash
npm install @anthropic-ai/sdk    # if using Anthropic
npm install openai               # if using OpenAI
```

Until npm is set up, install directly from GitHub:

```bash
npm install github:styx-lethe/chaostrace-sdk
```

## Usage

### Anthropic

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

### OpenAI

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

### checkIntent

Pre-write verdict check. Call before your agent does a platform write:

```typescript
import { checkIntent } from '@chaostrace/sdk'

const verdict = await checkIntent({
  chaostraceApiKey: 'ct_tenant_xyz',
  agentId: 'sales-rep-bot',
  runId: 'run_123',
  system: 'salesforce',
  object: 'Opportunity',
  recordId: '006abc',
  action: 'update',
  fields: [{ name: 'StageName', from: 'Negotiation', to: 'Closed Won' }],
  confidence: 0.83,
})

// verdict.decision: 'allow' | 'warn' | 'deny'
// verdict.reasons: array of {code, message, policy_id, severity}

if (verdict.decision === 'deny') return
if (verdict.decision === 'warn') log(verdict.reasons)
await proceedWithWrite()
```

## Configuration

| Option | Required | Description |
|---|---|---|
| `chaostraceApiKey` | yes | Your chaos trace tenant API key. Get one at chaostrace.com/settings. |
| `callerTag` | recommended | A label for this client. Surfaces in the dashboard. |
| `chaostraceApiUrl` | no | Defaults to `https://api.chaostrace.com`. |

`CHAOSTRACE_API_KEY` and `CHAOSTRACE_API_URL` environment variables are read as fallbacks.

## Privacy

The SDK never sends prompt content, response content, or tool call arguments. It sends only metadata: model, token counts, timing, your `callerTag`. See [`docs/integration-guide.md`](../docs/integration-guide.md) for the full audit.

## License

MIT.
