/**
 * OpenAI client wrapper that reports metadata to chaos trace.
 *
 * Same pattern as the Anthropic wrapper. Construct with `new OpenAI({...})`,
 * adds chaostraceApiKey + callerTag args. Every call to
 * chat.completions.create() additionally fires an async metadata report.
 */
import {
  SDK_VERSION,
  newCallId,
  newRunId,
  nowIso,
  postReportAsync,
  resolveConfig,
} from './client.js'

function getOpenAIClass(): new (config: unknown) => unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('openai')
    const cls = mod.OpenAI ?? mod.default
    if (!cls) throw new Error('OpenAI class not found in openai package')
    return cls as new (config: unknown) => unknown
  } catch {
    throw new Error(
      "chaos trace's OpenAI wrapper requires the openai package. " +
        'Install it with: npm install openai',
    )
  }
}

export interface OpenAIOptions {
  apiKey?: string
  baseURL?: string
  chaostraceApiKey?: string
  chaostraceApiUrl?: string
  callerTag?: string
  chaostraceRunId?: string
  [key: string]: unknown
}

export class OpenAI {
  constructor(options: OpenAIOptions = {}) {
    const OpenAIClass = getOpenAIClass()
    const {
      chaostraceApiKey,
      chaostraceApiUrl,
      callerTag,
      chaostraceRunId,
      ...openaiOptions
    } = options

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inner = new OpenAIClass(openaiOptions) as any
    const config = resolveConfig(chaostraceApiKey, chaostraceApiUrl, callerTag)
    const runId = chaostraceRunId ?? newRunId()
    const tag = config.callerTag ?? 'openai-client'

    const originalCreate = inner.chat.completions.create.bind(inner.chat.completions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inner.chat.completions.create = async function (params: any): Promise<any> {
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
              tool: 'openai.chat.completions.create',
              outcome: 'succeeded',
              decided_at: nowIso(),
            },
          ],
          outputs: [],
          metadata: {
            framework: 'chaostrace-typescript',
            sdk_version: SDK_VERSION,
            latency_ms: latencyMs,
            prompt_tokens: usage.prompt_tokens ?? null,
            completion_tokens: usage.completion_tokens ?? null,
            total_tokens: usage.total_tokens ?? null,
            call_id: newCallId(),
          },
        })
      } catch {
        // Telemetry failure must never affect the customer's code path.
      }

      return response
    }

    return inner as unknown as OpenAI
  }
}
