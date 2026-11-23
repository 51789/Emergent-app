"""Background monitoring: periodically re-runs due searches according to each plan's interval."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import Settings
from app.services.pipeline import RunOutcome, SearchPipeline

logger = logging.getLogger(__name__)


class MonitorScheduler:
    def __init__(self, pipeline: SearchPipeline, settings: Settings) -> None:
        self._pipeline = pipeline
        self._settings = settings
        self._scheduler: AsyncIOScheduler | None = None

    async def tick(self) -> int:
        """Claim due searches (FOR UPDATE SKIP LOCKED) and run them. Returns how many ran."""
        ids = await self._pipeline.claim_due(self._settings.scheduler_batch_size)
        if not ids:
            return 0
        semaphore = asyncio.Semaphore(max(1, self._settings.scheduler_concurrency))

        async def _run(search_id: uuid.UUID) -> RunOutcome:
            async with semaphore:
                return await self._pipeline.execute(search_id, trigger="scheduled")

        outcomes = await asyncio.gather(*(_run(i) for i in ids))
        new_total = sum(o.new_results for o in outcomes)
        logger.info("Scheduler tick: ran %d searches, %d new results", len(ids), new_total)
        return len(ids)

    async def _safe_tick(self) -> None:
        try:
            await self.tick()
        except Exception:
            logger.exception("Scheduler tick failed")

    def start(self) -> None:
        if self._scheduler is not None:
            return
        scheduler = AsyncIOScheduler(timezone=UTC)
        scheduler.add_job(
            self._safe_tick,
            "interval",
            seconds=self._settings.scheduler_tick_seconds,
            max_instances=1,
            coalesce=True,
            next_run_time=datetime.now(UTC),
            id="monitor-tick",
        )
        scheduler.start()
        self._scheduler = scheduler
        logger.info(
            "Monitoring scheduler started (tick every %ss)", self._settings.scheduler_tick_seconds
        )

    def shutdown(self) -> None:
        if self._scheduler is not None:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None
