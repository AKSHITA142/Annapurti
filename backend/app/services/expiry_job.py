import logging
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from app.db import SessionLocal
from app.services.inventory import InventoryService

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def run_expiry_check() -> int:
    """Scheduled task to clean up expired reservations."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        count = InventoryService.expire_stale_reservations(db, now=now)
        if count > 0:
            db.commit()
            logger.info("Expired %d stale reservations at %s", count, now.isoformat())
        return count
    except Exception as e:
        db.rollback()
        logger.error("Error running expiry check: %s", str(e))
        return 0
    finally:
        db.close()


def start_expiry_scheduler(interval_seconds: int = 60) -> None:
    """Starts the background scheduler to periodically check for expired reservations."""
    if not scheduler.running:
        scheduler.add_job(
            run_expiry_check,
            "interval",
            seconds=interval_seconds,
            id="stale_reservation_expiry",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("Reservation expiry scheduler started (interval: %ds)", interval_seconds)


def stop_expiry_scheduler() -> None:
    """Stops the background scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Reservation expiry scheduler stopped")

