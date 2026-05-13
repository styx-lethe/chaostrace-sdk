"""chaos trace SDK — governance and observability for AI agents.

Drop-in replacement for Anthropic and OpenAI client libraries that adds
metadata reporting and optional pre-write verdict checks.

Quick start:

    from chaostrace import Anthropic

    client = Anthropic(
        api_key="sk-ant-...",
        chaostrace_api_key="ct_tenant_xyz",
        caller_tag="my-agent",
    )

    # Then use it exactly like the real anthropic.Anthropic client.

See https://github.com/styx-lethe/chaostrace-sdk for full docs.
"""
from ._client import check_intent, IntentVerdict, IntentVerdictReason, ChaosTraceConfig


def __getattr__(name):
    # Lazy imports — the customer might only have one of Anthropic / OpenAI
    # installed. Importing chaostrace shouldn't fail if they don't have the other.
    if name == "Anthropic":
        from ._anthropic import Anthropic
        return Anthropic
    if name == "OpenAI":
        from ._openai import OpenAI
        return OpenAI
    raise AttributeError(f"module 'chaostrace' has no attribute {name!r}")


__version__ = "0.1.0"

__all__ = [
    "Anthropic",
    "OpenAI",
    "check_intent",
    "IntentVerdict",
    "IntentVerdictReason",
    "ChaosTraceConfig",
]
