/**
 * Anthropic client wrapper that reports metadata to chaos trace.
 *
 * Construct with `new Anthropic({...})` exactly like the official SDK.
 * Adds chaostraceApiKey + callerTag args. Every call to
 * messages.create() additionally fires an async metadata report —
 * content is never sent, only timing/model/token counts.
 */
import {
  SDK_VERSION,
  newCallId,
  newRunId,
  nowIso,
  postReportAsync,
  resolveConfig,
} from './client.js'

// Anthropic SDK is a peer dependency — load it lazily so chaos trace's
// OpenAI-only users don't get an error.
function getAnthropicClass(): new (config: unknown) => unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@anthropic-ai/sdk')
    const cls = mod.Anthropic ?? mod.default
    if (!cls) throw new Error('Anthropic class not found in @anthropic-ai/sdk')
    return cls as new (config: unknown) => unknown
  } catch {
    throw new Error(
      "chaos trace's Anthropic wrapper requires @anthropic-ai/sdk. " +
        'Install it with: npm install @anthropic-ai/sdk',
    )
  }
}

export interface AnthropicOptions {
  apiKey?: string
  baseURL?: string
  chaostraceApiKey?: string
  chaostraceApiUrl?: string
  callerTag?: string
  chaostraceRunId?: string
  [key: string]: unknown
}

export class Anthropic {
  // We return the wrapped underlying client from the constructor (a
  // legitimate JS pattern — `new Cls()` uses the returned object if
  // one is returned). The declared type is `Anthropic` to look like
  // a drop-in replacement; at runtime it's the real Anthropic instance
  // with messages.create wrapped.
  constructor(options: AnthropicOptions = {}) {
    const AnthropicClass = getAnthropicClass()
    const {
      chaostraceApiKey,
      chaostraceApiUrl,
      callerTag,
      chaostraceRunId,
      ...anthropicOptions
    } = options

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inner = new AnthropicClass(anthropicOptions) as any
    const config = resolveConfig(chaostraceApiKey, chaostraceApiUrl, callerTag)
    const runId = chaostraceRunId ?? newRunId()
    const tag = config.callerTag ?? 'anthropic-client'

    const originalCreate = inner.messages.create.bind(inner.messages)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inner.messages.create = async function (params: any): Promise<any> {
      const started = Date.now()
      const response = await originalCreate(params)
      const latencyMs = Date.now() - started

      try {
        const usage = (response && response.usage) || {}
        const model = params?.model || response?.model || 'unknown'
        postReportAsync(config, {
          spec_version: '1.0',
          agent_id: tag,
          run_id: runId,
          started_at: nowIso(),
          completed_at: nowIso(),
          status: 'completed',
          model,
          tool_calls: [
            {
              tool: 'anthropic.messages.create',
              outcome: 'succeeded',
              decided_at: nowIso(),
            },
          ],
          outputs: [],
          metadata: {
            framework: 'chaostrace-typescript',
            sdk_version: SDK_VERSION,
            latency_ms: latencyMs,
            input_tokens: usage.input_tokens ?? null,
            output_tokens: usage.output_tokens ?? null,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
            call_id: newCallId(),
          },
        })
      } catch {
        // Telemetry failure must never affect the customer's code path.
      }

      return response
    }

    // Return the wrapped inner client. The constructor's return value
    // overrides `this` per JS spec.
    return inner as unknown as Anthropic
  }
}
