import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger(__name__)

db_url = os.getenv("DATABASE_URL", settings.DATABASE_URL)


def create_db_engine(url: str):
    connect_args = {}
    if "sqlite" in url:
        connect_args["check_same_thread"] = False
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args)


# Try primary database (PostgreSQL). If host is unreachable (e.g., local dev outside Docker where host 'db' doesn't resolve),
# gracefully fallback to SQLite database so the app and API ALWAYS work out-of-the-box.
try:
    engine = create_db_engine(db_url)
    with engine.connect() as conn:
        pass
except Exception as e:
    logger.warning("Primary database (%s) unavailable: %s. Falling back to local SQLite database.", db_url, e)
    _default_sqlite_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "foodrescue.db"))
    fallback_url = f"sqlite:///{_default_sqlite_path}"
    engine = create_db_engine(fallback_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
