"""Environment-driven configuration. No secrets in source; all values come from .env.

If a required piece of config is missing, the consuming component raises NotConfiguredError
(see exceptions.py) rather than falling back to mock data. This is the no-hardcoded-data spine.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Splunk instance (SDK fallback path)
    splunk_host: str = "localhost"
    splunk_port: int = 8089
    splunk_scheme: str = "https"
    splunk_username: str = "admin"
    splunk_password: str = ""
    splunk_verify: bool = False
    splunk_index: str = "botsv3"
    splunk_sandbox_index: str = "argus_sandbox"

    # HEC — write path for synthetic adversarial variants into the sandbox (Red agent)
    splunk_hec_url: str = "https://localhost:8088/services/collector/event"
    splunk_hec_token: str = ""

    # Splunk MCP Server (primary path)
    splunk_mcp_url: str = ""
    splunk_mcp_token: str = ""

    # Provider selection
    search_provider: str = "mcp"  # "mcp" | "sdk"

    # Scorer model layer (set after the SETUP.md Step 6 spike)
    scorer_backend: str = ""  # "hosted" | "local"
    scorer_hosted_endpoint: str = ""
    scorer_hosted_model: str = ""

    # Reasoning LLM (tiered for cost). Primary = Sonnet (quality/cost balance); fast = Haiku
    # (narration / cheap steps). Bump anthropic_model to claude-opus-4-8 only if a step needs it.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_model_fast: str = "claude-haiku-4-5-20251001"


settings = Settings()
