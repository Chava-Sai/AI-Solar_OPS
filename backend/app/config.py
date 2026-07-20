from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Astra AI — SolarOps AI Assistant"
    VERSION: str = "1.0.0"
    SECRET_KEY: str = "astra-ai-ags-secret-key-2026-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

settings = Settings()
