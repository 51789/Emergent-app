"""Application settings.

Precedence (highest first): real environment variables, `server/.env`, `<repo root>/.env`,
defaults. The .env paths are resolved from this file's location (not the working
directory); missing files are ignored, so in Docker only environment variables are used.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = SERVER_DIR.parent
# Later files override earlier ones: server/.env wins over the repository-root .env.
ENV_FILES: tuple[Path, ...] = (REPO_ROOT / ".env", SERVER_DIR / ".env")

LLMProvider = Literal["anthropic", "openai"]
Effort = Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"]
DEFAULT_LLM_MODELS: dict[str, str] = {"anthropic": "claude-haiku-5-5", "openai": "gpt-6.2-sol"}
# Cheaper models for the per-page verification step.
DEFAULT_VERIFY_MODELS: dict[str, str] = {"anthropic": "claude-haiku-5-5", "openai": "gpt-6-luna"}
# OpenAI models that reject reasoning effort "none" with HTTP 400.
_OPENAI_NO_NONE_EFFORT = ("gpt-6.2-sol", "gpt-6.2-astra")
_ANTHROPIC_EFFORTS = ("low", "medium", "high", "xhigh", "max")


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"

    # --- Database ---------------------------------------------------------
    database_url: str = "postgresql+asyncpg://consulens:consulens@localhost:5432/consulens"
    database_pool_size: int = 10
    database_echo: bool = False

    # --- Auth -------------------------------------------------------------
    # Required: there is intentionally no default. Settings() fails fast without it.
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 30
    bcrypt_rounds: int = 12
    google_client_ids: str = ""  # comma-separated OAuth client IDs (web, iOS, Android)

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

    # --- HTTP -------------------------------------------------------------
    cors_origins: str = ""  # comma-separated; "*" allows any origin (no credentials)

    # --- LLM (Anthropic Claude or OpenAI) --------------------------------
    # auto: Anthropic if ANTHROPIC_API_KEY is set, else OpenAI if OPENAI_API_KEY is set.
    llm_provider: Literal["auto", "anthropic", "openai"] = "auto"
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    # Unset: claude-haiku-5-5 (anthropic) or gpt-6.2-sol (openai).
    llm_model: str | None = None
    # Anthropic `output_config.effort` / OpenAI `reasoning.effort`. Leave empty for the default.
    llm_effort: Effort | None = "low"
    llm_timeout_seconds: float = 90.0
    llm_max_retries: int = 2
    # Page verification model (same provider). Unset: claude-haiku-5-5 / gpt-6-luna.
    llm_verify_model: str | None = None
    llm_verify_effort: Effort | None = "low"

    # --- Page verification (fetch each new candidate page and re-check it) --
    verify_pages: bool = True
    verify_user_agent: str = "ConsulensBot/1.0"
    verify_timeout_seconds: float = 10.0
    verify_max_bytes: int = 2_000_000
    verify_max_text_chars: int = 24_000  # roughly 6-8k tokens of page text per LLM call
    verify_concurrency: int = 6
    verify_per_domain_concurrency: int = 2
    verify_robots_ttl_seconds: int = 3600

    # --- Web search provider ---------------------------------------------
    search_provider: Literal["serper"] = "serper"
    serper_api_key: str | None = None
    search_country: str = "it"
    search_results_per_query: int = 10
    search_timeout_seconds: float = 20.0

    # --- Push (Expo) ------------------------------------------------------
    expo_access_token: str | None = None
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"

    # --- Stripe -----------------------------------------------------------
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_pro_monthly: str | None = None
    stripe_price_pro_yearly: str | None = None
    stripe_price_premium_monthly: str | None = None
    stripe_price_premium_yearly: str | None = None

    # --- Monitoring scheduler --------------------------------------------
    run_scheduler_in_process: bool = False
    scheduler_tick_seconds: int = 60
    scheduler_batch_size: int = 20
    scheduler_concurrency: int = 4
    search_lease_seconds: int = 600
    manual_run_cooldown_seconds: int = 300
    error_retry_minutes: int = 30
    plan_expiry_grace_hours: int = 72

    @field_validator(
        "anthropic_api_key",
        "openai_api_key",
        "llm_model",
        "llm_verify_model",
        "llm_verify_effort",
        "serper_api_key",
        "stripe_secret_key",
        "stripe_webhook_secret",
        "llm_effort",
        "bootstrap_admin_email",
        "bootstrap_admin_password",
        "expo_access_token",
        mode="before",
    )
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("llm_provider", mode="before")
    @classmethod
    def _blank_provider_is_auto(cls, value: str | None) -> str | None:
        if value is None or (isinstance(value, str) and not value.strip()):
            return "auto"
        return value.strip().lower() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _check_llm_effort(self) -> Settings:
        """Fail fast on effort values the selected models would reject at request time."""
        provider = self.resolved_llm_provider
        checks = (
            ("LLM_EFFORT", self.resolved_llm_model, self.llm_effort),
            ("LLM_VERIFY_EFFORT", self.resolved_llm_verify_model, self.llm_verify_effort),
        )
        for name, model, effort in checks:
            if (
                provider == "openai"
                and effort == "none"
                and model
                and model.startswith(_OPENAI_NO_NONE_EFFORT)
            ):
                raise ValueError(
                    f"{name}=none is not supported by {model} (the API answers HTTP 400); "
                    "use low, medium or high"
                )
            if provider == "anthropic" and effort is not None and effort not in _ANTHROPIC_EFFORTS:
                raise ValueError(
                    f"{name}={effort} is not valid for Anthropic models; "
                    f"use one of {', '.join(_ANTHROPIC_EFFORTS)}"
                )
        return self

    @property
    def resolved_llm_provider(self) -> LLMProvider | None:
        if self.llm_provider == "anthropic":
            return "anthropic" if self.anthropic_api_key else None
        if self.llm_provider == "openai":
            return "openai" if self.openai_api_key else None
        if self.anthropic_api_key:
            return "anthropic"
        if self.openai_api_key:
            return "openai"
        return None

    @property
    def resolved_llm_model(self) -> str | None:
        provider = self.resolved_llm_provider
        if provider is None:
            return None
        return self.llm_model or DEFAULT_LLM_MODELS[provider]

    @property
    def resolved_llm_verify_model(self) -> str | None:
        provider = self.resolved_llm_provider
        if provider is None:
            return None
        return self.llm_verify_model or DEFAULT_VERIFY_MODELS[provider]

    @property
    def cors_origin_list(self) -> list[str]:
        return _split_csv(self.cors_origins)

    @property
    def google_client_id_list(self) -> list[str]:
        return _split_csv(self.google_client_ids)

    @property
    def stripe_price_map(self) -> dict[tuple[str, str], str]:
        """(plan, cycle) -> Stripe price id, only for configured prices."""
        raw = {
            ("pro", "monthly"): self.stripe_price_pro_monthly,
            ("pro", "yearly"): self.stripe_price_pro_yearly,
            ("premium", "monthly"): self.stripe_price_premium_monthly,
            ("premium", "yearly"): self.stripe_price_premium_yearly,
        }
        return {key: value for key, value in raw.items() if value}

    @property
    def llm_configured(self) -> bool:
        return self.resolved_llm_provider is not None

    @property
    def search_provider_configured(self) -> bool:
        return bool(self.serper_api_key)

    @property
    def stripe_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_webhook_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
