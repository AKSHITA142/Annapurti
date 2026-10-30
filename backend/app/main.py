from typing import Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.config import settings
from app.db import SessionLocal

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Intelligent surplus food redistribution engine",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=Dict[str, Any])
def health_check() -> Dict[str, Any]:
    """Health check endpoint checking application and database status."""
    db_status = "unreachable"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "connected"
    except Exception as e:
        db_status = f"disconnected: {str(e)}"

    return {
        "status": "ok",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
    }


@app.get("/")
def root() -> Dict[str, str]:
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API. Visit /docs for documentation.",
        "health": "/health",
    }

