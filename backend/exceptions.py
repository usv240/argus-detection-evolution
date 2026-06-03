"""Project exceptions.

NotConfiguredError is the enforcement mechanism for the no-hardcoded-data rule: when a real
backend (Splunk MCP, Splunk SDK, hosted model, LLM) is not wired up, we raise this instead of
returning fabricated/mock results. The message always points to the setup gate that fixes it.
"""
from __future__ import annotations


class ArgusError(Exception):
    """Base class for all ARGUS errors."""


class NotConfiguredError(ArgusError):
    """A required real backend is not configured. Never substitute mock data."""

    def __init__(self, what: str, setup_ref: str):
        super().__init__(f"{what} is not configured. See {setup_ref}. (No mock data is used by design.)")
        self.what = what
        self.setup_ref = setup_ref


class SearchError(ArgusError):
    """A live Splunk search failed."""


class AgentError(ArgusError):
    """An agent could not complete its step."""
