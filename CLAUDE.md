# CLAUDE.md

Guidance for AI coding agents working in this repository. This repo is public.

## What this is

The official chaos trace SDK: drop-in wrappers that report AI-agent activity to the chaos trace API.

- `python/` — the `chaostrace` package (wraps the Anthropic and OpenAI Python clients)
- `typescript/` — the `@chaostrace/sdk` package (wraps the Anthropic and OpenAI TypeScript clients)

## Rules

- The JSON contract — the spec_version'd agent report and intent payloads — is the source of truth, and this SDK implements it. Never change payload shapes without a spec_version bump.
- The product name is always lowercase: "chaos trace". Never capitalize it.
- Keep the Python and TypeScript implementations in lockstep: a behavior added to one must be added to the other in the same change.
- Keep examples consistent across `README.md`, `docs/integration-guide.md`, and the per-language READMEs.

## Known TODOs

- 429 / Retry-After handling on both the report and intent paths (currently missing).
- Report-path errors are currently swallowed; surface them (at minimum via opt-in debug logging) instead of failing silently.
