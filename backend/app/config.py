from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "FoodRescue-AI"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+psycopg2://foodrescue:foodrescue@db:5432/foodrescue_db"
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
