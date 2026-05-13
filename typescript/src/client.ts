/**
 * Base HTTP client for chaos trace.
 *
 * Handles config resolution, the fire-and-forget metadata POST to
 * /api/agents/report, and the synchronous /api/agents/intent call.
 * The Anthropic and OpenAI wrappers call into these helpers.
 */

const DEFAULT_API_URL = 'https://api.chaostrace.com'
export const SDK_VERSION = '0.1.0'

export interface ChaosTraceConfig {
  apiKey: string
  apiUrl: string
  callerTag?: string
  timeoutMs: number
}

export interface IntentVerdictReason {
  code: string
  message: string
  policy_id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface IntentVerdict {
  correlation_id: string
  decision: 'allow' | 'warn' | 'deny'
  reasons: IntentVerdictReason[]
  context: Record<string, unknown>
  evaluated_at?: string
  duplicate: boolean
}

export interface ChaosTraceClientOptions {
  chaostraceApiKey?: string
  chaostraceApiUrl?: string
  callerTag?: string
  chaostraceRunId?: string
}

export interface CheckIntentOptions {
  chaostraceApiKey?: string
  chaostraceApiUrl?: string
  agentId: string
  runId: string
  system: string
  object: string
  action: 'create' | 'update' | 'delete' | 'send' | 'other'
  recordId?: string
  fields?: Array<{
    name: string
    from?: unknown
    to?: unknown
    from_hash?: string
    to_hash?: string
  }>
  volume?: { record_count: number }
  model?: string
  confidence?: number
  rationale?: string
  timeoutMs?: number
}

export function resolveConfig(
  apiKey: string | undefined,
  apiUrl: string | undefined,
  callerTag: string | undefined,
  timeoutMs = 5000,
): ChaosTraceConfig {
  const key =
    apiKey ??
    (typeof process !== 'undefined' ? process.env?.CHAOSTRACE_API_KEY : undefined)
  if (!key) {
    throw new Error(
      'chaos trace API key is required. Pass chaostraceApiKey: ... or set CHAOSTRACE_API_KEY env var.',
    )
  }
  const envUrl =
    typeof process !== 'undefined' ? process.env?.CHAOSTRACE_API_URL : undefined
  const url = (apiUrl ?? envUrl ?? DEFAULT_API_URL).replace(/\/$/, '')
  return { apiKey: key, apiUrl: url, callerTag, timeoutMs }
}

export function postReportAsync(
  config: ChaosTraceConfig,
  payload: Record<string, unknown>,
): void {
  // Fire-and-forget; never blocks the caller, never throws.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  fetch(`${config.apiUrl}/api/agents/report`, {
    method: 'POST',
    headers: {
      'X-API-Key': config.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': `chaostrace-typescript/${SDK_VERSION}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch(() => {
      // Telemetry failure must never affect the customer's code path.
    })
    .finally(() => clearTimeout(timeout))
}

export async function checkIntent(options: CheckIntentOptions): Promise<IntentVerdict> {
  const config = resolveConfig(
    options.chaostraceApiKey,
    options.chaostraceApiUrl,
    undefined,
    options.timeoutMs ?? 5000,
  )
  const correlationId = newCorrelationId()

  const intentBlock: Record<string, unknown> = {
    system: options.system,
    object: options.object,
    record_id: options.recordId,
    action: options.action,
    fields: options.fields ?? [],
  }
  if (options.volume !== undefined) intentBlock.volume = options.volume

  const body: Record<string, unknown> = {
    spec_version: '1.0',
    correlation_id: correlationId,
    agent_id: options.agentId,
    run_id: options.runId,
    decided_at: nowIso(),
    intent: intentBlock,
  }
  if (options.model !== undefined) body.model = options.model
  if (options.confidence !== undefined) body.confidence = options.confidence
  if (options.rationale) {
    body.rationale_hash = 'sha256:' + (await sha256Hex(options.rationale))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${config.apiUrl}/api/agents/intent`, {
      method: 'POST',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': `chaostrace-typescript/${SDK_VERSION}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(
        `chaos trace /intent returned ${response.status}: ${await response.text()}`,
      )
    }
    const data = (await response.json()) as Partial<IntentVerdict>
    return {
      correlation_id: data.correlation_id ?? correlationId,
      decision: (data.decision ?? 'allow') as IntentVerdict['decision'],
      reasons: data.reasons ?? [],
      context: data.context ?? {},
      evaluated_at: data.evaluated_at,
      duplicate: Boolean(data.duplicate),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newRunId(): string {
  return `run_${Date.now()}_${randomHex(6)}`
}

export function newCallId(): string {
  return `call_${Date.now()}_${randomHex(6)}`
}

export function newCorrelationId(): string {
  return `intent_${Date.now()}_${randomHex(6)}`
}

function randomHex(len: number): string {
  const bytes = new Uint8Array(Math.ceil(len / 2))
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len)
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
