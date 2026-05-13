"""Anthropic client wrapper that reports metadata to chaos trace.

Subclasses anthropic.Anthropic so all standard client APIs work
unchanged. Overrides messages.create() to capture metadata and POST
to /api/agents/report after the response returns (asynchronously, never
blocking the customer's code path).
"""
import time
from typing import Any, Optional

try:
    import anthropic as _anthropic
except ImportError as exc:
    raise ImportError(
        "chaos trace's Anthropic wrapper requires the anthropic package. "
        "Install it with: pip install anthropic"
    ) from exc

from ._client import (
    SDK_VERSION,
    _new_call_id,
    _new_run_id,
    _now_iso,
    _post_report_async,
    _resolve_config,
)


class Anthropic(_anthropic.Anthropic):
    """Drop-in replacement for anthropic.Anthropic.

    All standard Anthropic SDK functionality is preserved. Each call to
    messages.create() additionally fires an async metadata report to
    chaos trace — content is never sent, only timing, model, token
    counts, and the caller_tag you set.
    """

    def __init__(
        self,
        *args: Any,
        chaostrace_api_key: Optional[str] = None,
        chaostrace_api_url: Optional[str] = None,
        caller_tag: Optional[str] = None,
        chaostrace_run_id: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._chaostrace_config = _resolve_config(
            chaostrace_api_key, chaostrace_api_url, caller_tag
        )
        # One run_id per client lifetime by default. Customers who want
        # to group calls into discrete runs can override per-client.
        self._chaostrace_run_id = chaostrace_run_id or _new_run_id()
        self._wrap_messages_create()

    def _wrap_messages_create(self) -> None:
        original_create = self.messages.create
        config = self._chaostrace_config
        run_id = self._chaostrace_run_id
        tag = config.caller_tag or "anthropic-client"

        def wrapped_create(*args: Any, **kwargs: Any) -> Any:
            started = time.monotonic()
            response = original_create(*args, **kwargs)
            elapsed_ms = int((time.monotonic() - started) * 1000)

            try:
                usage = getattr(response, "usage", None)
                model = kwargs.get("model") or getattr(response, "model", None) or "unknown"
                payload = {
                    "spec_version": "1.0",
                    "agent_id": tag,
                    "run_id": run_id,
                    "started_at": _now_iso(),
                    "completed_at": _now_iso(),
                    "status": "completed",
                    "model": model,
                    "tool_calls": [
                        {
                            "tool": "anthropic.messages.create",
                            "outcome": "succeeded",
                            "decided_at": _now_iso(),
                        }
                    ],
                    "outputs": [],
                    "metadata": {
                        "framework": "chaostrace-python",
                        "sdk_version": SDK_VERSION,
                        "latency_ms": elapsed_ms,
                        "input_tokens": getattr(usage, "input_tokens", None) if usage else None,
                        "output_tokens": getattr(usage, "output_tokens", None) if usage else None,
                        "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", None) if usage else None,
                        "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", None) if usage else None,
                        "call_id": _new_call_id(),
                    },
                }
                _post_report_async(config, payload)
            except Exception:
                # Telemetry failure must never affect the customer's code path.
                pass

            return response

        self.messages.create = wrapped_create  # type: ignore[method-assign]
