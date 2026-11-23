"""Monitoring worker: `python -m app.worker` (use `--once` to run a single tick and exit).

Several workers can run in parallel: due searches are claimed with
SELECT ... FOR UPDATE SKIP LOCKED, so each search runs on exactly one worker.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal

from app.container import build_container
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.services.scheduler import MonitorScheduler

logger = logging.getLogger("app.worker")


async def run(once: bool = False) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    container = build_container(settings)
    scheduler = MonitorScheduler(container.pipeline, settings)
    if container.search_provider is None:
        logger.warning("SERPER_API_KEY is not set: searches will end with status no_provider")
    if container.llm is None:
        logger.warning("No LLM API key set: results are stored without LLM filtering")
    else:
        logger.info("LLM provider: %s (%s)", container.llm.provider, container.llm.model)
    if container.verifier is not None and container.verify_llm is not None:
        logger.info("Page verification: on (%s)", container.verify_llm.model)
    try:
        if once:
            ran = await scheduler.tick()
            logger.info("Single tick finished (%d searches)", ran)
            return
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, stop.set)
            except (NotImplementedError, RuntimeError):  # Windows
                signal.signal(sig, lambda *_: loop.call_soon_threadsafe(stop.set))
        scheduler.start()
        await stop.wait()
        logger.info("Shutting down worker")
    finally:
        scheduler.shutdown()
        await container.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Consulens monitoring worker")
    parser.add_argument("--once", action="store_true", help="run one scheduler tick and exit")
    args = parser.parse_args()
    asyncio.run(run(once=args.once))


if __name__ == "__main__":
    main()
