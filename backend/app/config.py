"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://soc:soc_s3cur3_pwd@localhost:5432/soc_analytics"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # SDP
    SDP_BASE_URL: str = "https://sdp-ioc.mtm.id:8050"
    SDP_API_KEY: str = ""

    # AI
    CLAUDE_API_KEY: str = ""

    # Sync
    SYNC_INTERVAL_MINUTES: int = 3
    SDP_CONCURRENT_REQUESTS: int = 5
    SDP_PAGE_SIZE: int = 100
    MTTD_SLA_SECONDS: int = 900  # 15 minutes

    # App
    LOG_LEVEL: str = "INFO"
    APP_TITLE: str = "SOC Analytics Dashboard API"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3500,http://localhost:5173,http://178.128.222.1:3500,http://178.128.222.1:3000,*"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
