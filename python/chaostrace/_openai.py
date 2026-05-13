"""OpenAI client wrapper that reports metadata to chaos trace.

Same pattern as the Anthropic wrapper: subclass the real client and
override chat.completions.create() to fire a metadata report after
each call.
"""
import time
from typing import Any, Optional

try:
    import openai as _openai
except ImportError as exc:
    raise ImportError(
        "chaos trace's OpenAI wrapper requires the openai package. "
        "Install it with: pip install openai"
    ) from exc

from ._client import (
    SDK_VERSION,
    _new_call_id,
    _new_run_id,
    _now_iso,
    _post_report_async,
    _resolve_config,
)


class OpenAI(_openai.OpenAI):
    """Drop-in replacement for openai.OpenAI."""

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
        self._chaostrace_run_id = chaostrace_run_id or _new_run_id()
        self._wrap_chat_completions_create()

    def _wrap_chat_completions_create(self) -> None:
        original_create = self.chat.completions.create
        config = self._chaostrace_config
        run_id = self._chaostrace_run_id
        tag = config.caller_tag or "openai-client"

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
                            "tool": "openai.chat.completions.create",
                            "outcome": "succeeded",
                            "decided_at": _now_iso(),
                        }
                    ],
                    "outputs": [],
                    "metadata": {
                        "framework": "chaostrace-python",
                        "sdk_version": SDK_VERSION,
                        "latency_ms": elapsed_ms,
                        "prompt_tokens": getattr(usage, "prompt_tokens", None) if usage else None,
                        "completion_tokens": getattr(usage, "completion_tokens", None) if usage else None,
                        "total_tokens": getattr(usage, "total_tokens", None) if usage else None,
                        "call_id": _new_call_id(),
                    },
                }
                _post_report_async(config, payload)
            except Exception:
                pass

            return response

        self.chat.completions.create = wrapped_create  # type: ignore[method-assign]
