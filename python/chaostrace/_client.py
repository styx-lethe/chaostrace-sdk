"""Base HTTP client for chaos trace.

Handles config resolution, the fire-and-forget metadata POST to
/api/agents/report, and the synchronous /api/agents/intent call.
The Anthropic and OpenAI wrappers call into these helpers.
"""
import hashlib
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import requests


DEFAULT_API_URL = "https://api.chaostrace.com"
SDK_VERSION = "0.1.0"


@dataclass
class ChaosTraceConfig:
    api_key: str
    api_url: str = DEFAULT_API_URL
    caller_tag: Optional[str] = None
    timeout_seconds: float = 5.0


@dataclass
class IntentVerdictReason:
    code: str
    message: str
    policy_id: str
    severity: str


@dataclass
class IntentVerdict:
    correlation_id: str
    decision: str
    reasons: list = field(default_factory=list)
    context: dict = field(default_factory=dict)
    evaluated_at: Optional[str] = None
    duplicate: bool = False

    @property
    def denied(self) -> bool:
        return self.decision == "deny"

    @property
    def warned(self) -> bool:
        return self.decision == "warn"

    @property
    def allowed(self) -> bool:
        return self.decision == "allow"


def _resolve_config(
    chaostrace_api_key: Optional[str],
    chaostrace_api_url: Optional[str],
    caller_tag: Optional[str],
    timeout_seconds: float = 5.0,
) -> ChaosTraceConfig:
    """Resolve config from explicit args plus environment variables."""
    api_key = chaostrace_api_key or os.environ.get("CHAOSTRACE_API_KEY")
    if not api_key:
        raise ValueError(
            "chaos trace API key is required. Pass chaostrace_api_key=... "
            "or set the CHAOSTRACE_API_KEY environment variable."
        )
    api_url = chaostrace_api_url or os.environ.get("CHAOSTRACE_API_URL") or DEFAULT_API_URL
    return ChaosTraceConfig(
        api_key=api_key,
        api_url=api_url.rstrip("/"),
        caller_tag=caller_tag,
        timeout_seconds=timeout_seconds,
    )


def _post_report_async(config: ChaosTraceConfig, payload: dict) -> None:
    """Fire-and-forget POST to /api/agents/report. Never blocks the caller, never raises."""

    def _post() -> None:
        try:
            requests.post(
                f"{config.api_url}/api/agents/report",
                headers={
                    "X-API-Key": config.api_key,
                    "Content-Type": "application/json",
                    "User-Agent": f"chaostrace-python/{SDK_VERSION}",
                },
                json=payload,
                timeout=config.timeout_seconds,
            )
        except Exception:
            # Telemetry failure must never affect the customer's code path.
            pass

    threading.Thread(target=_post, daemon=True).start()


def check_intent(
    chaostrace_api_key: Optional[str] = None,
    *,
    agent_id: str,
    run_id: str,
    system: str,
    object: str,
    action: str,
    record_id: Optional[str] = None,
    fields: Optional[list] = None,
    volume: Optional[dict] = None,
    model: Optional[str] = None,
    confidence: Optional[float] = None,
    rationale: Optional[str] = None,
    chaostrace_api_url: Optional[str] = None,
    timeout_seconds: float = 5.0,
) -> IntentVerdict:
    """Synchronous pre-write verdict check.

    Returns an IntentVerdict with .decision ('allow' | 'warn' | 'deny'),
    .reasons (list), .correlation_id (str), and .duplicate (bool).

    Raises:
        ValueError: if no API key is found.
        requests.HTTPError: on 4xx / 5xx from chaos trace.
    """
    config = _resolve_config(chaostrace_api_key, chaostrace_api_url, None, timeout_seconds)
    correlation_id = f"intent_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"

    intent_block: dict[str, Any] = {
        "system": system,
        "object": object,
        "record_id": record_id,
        "action": action,
        "fields": fields or [],
    }
    if volume is not None:
        intent_block["volume"] = volume

    body: dict[str, Any] = {
        "spec_version": "1.0",
        "correlation_id": correlation_id,
        "agent_id": agent_id,
        "run_id": run_id,
        "decided_at": _now_iso(),
        "intent": intent_block,
    }
    if model is not None:
        body["model"] = model
    if confidence is not None:
        body["confidence"] = confidence
    if rationale:
        body["rationale_hash"] = "sha256:" + hashlib.sha256(rationale.encode()).hexdigest()

    response = requests.post(
        f"{config.api_url}/api/agents/intent",
        headers={
            "X-API-Key": config.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"chaostrace-python/{SDK_VERSION}",
        },
        json=body,
        timeout=config.timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()

    return IntentVerdict(
        correlation_id=data.get("correlation_id", correlation_id),
        decision=data.get("decision", "allow"),
        reasons=data.get("reasons", []),
        context=data.get("context", {}),
        evaluated_at=data.get("evaluated_at"),
        duplicate=bool(data.get("duplicate", False)),
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_run_id() -> str:
    return f"run_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"


def _new_call_id() -> str:
    return f"call_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
