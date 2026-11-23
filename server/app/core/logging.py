from __future__ import annotations

import logging


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=level.upper(),
            format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        )
    else:
        root.setLevel(level.upper())
    # Never log request bodies/headers from HTTP client libraries.
    logging.getLogger("httpx").setLevel(logging.WARNING)
