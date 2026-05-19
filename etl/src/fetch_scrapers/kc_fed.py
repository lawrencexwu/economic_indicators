"""
Kansas City Fed Tenth District Manufacturing Survey scraper.
Source: kansascityfed.org — permanent historical Excel workbook.
The file gets a new document ID and filename each month. We discover the current URL
from the survey listing page, cache it in etl/state/kc_fed_excel_url.txt (committed
to git by CI), and fall back to the cached URL when discovery fails.
"""

import logging
import re
import subprocess
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

_LISTING_URL = "https://www.kansascityfed.org/surveys/manufacturing-survey/"
_BASE_URL = "https://www.kansascityfed.org"
_STATE_FILE = Path(__file__).parent.parent.parent / "state" / "kc_fed_excel_url.txt"
# Last-resort hardcoded fallback — updated by CI whenever discovery succeeds.
_BUILTIN_FALLBACK = "https://www.kansascityfed.org/documents/15886/2026Apr23historicalmfg.xlsx"

_cache: list | None = None


def _read_cached_url() -> str | None:
    try:
        url = _STATE_FILE.read_text().strip()
        return url if url else None
    except OSError:
        return None


def _write_cached_url(url: str) -> None:
    try:
        _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _STATE_FILE.write_text(url + "\n")
    except OSError as e:
        logger.warning("KC Fed: could not write state file (%s)", e)


def _discover_url() -> str | None:
    """Try to scrape the survey listing page for the current Excel URL.

    Uses subprocess curl — the KC Fed listing page blocks Python requests via
    TLS fingerprinting but responds normally to the system curl binary.
    """
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", "20", "-A",
             "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
             _LISTING_URL],
            capture_output=True, text=True, timeout=25,
        )
        if result.returncode == 0 and result.stdout:
            m = re.search(r'href=["\'](/documents/\d+/[^"\']+\.xlsx)["\']',
                          result.stdout, re.I)
            if m:
                return _BASE_URL + m.group(1)
    except Exception as e:
        logger.debug("KC Fed: curl discovery failed: %s", e)
    return None


def _find_excel_url() -> str:
    """Return the current Excel URL, updating the state cache when possible."""
    discovered = _discover_url()

    if discovered:
        cached = _read_cached_url()
        if discovered != cached:
            logger.info("KC Fed: new Excel URL discovered, updating cache: %s", discovered)
            _write_cached_url(discovered)
        return discovered

    # Discovery failed — fall back to cached state, then built-in constant.
    cached = _read_cached_url()
    if cached:
        logger.info("KC Fed: discovery failed, using cached URL: %s", cached)
        return cached

    logger.warning(
        "KC Fed: discovery and cache both failed, using built-in fallback. "
        "Update _BUILTIN_FALLBACK in kc_fed.py if this 404s."
    )
    return _BUILTIN_FALLBACK


def _fetch_history() -> list[dict]:
    url = _find_excel_url()
    logger.info("KC Fed: downloading Excel from %s", url)

    df = pd.read_excel(url, sheet_name=0, engine="openpyxl", header=None)

    # Row 2 = dates (columns 1+), Row 5 = Composite Index values
    dates = df.iloc[2, 1:].tolist()
    vals = df.iloc[5, 1:].tolist()

    history = []
    for d, v in zip(dates, vals):
        if pd.isna(d) or pd.isna(v):
            continue
        try:
            date_str = pd.Timestamp(d).strftime("%Y-%m-01")
            history.append({"date": date_str, "value": float(v)})
        except (ValueError, TypeError):
            continue

    history.sort(key=lambda x: x["date"], reverse=True)
    return history


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if _cache is None:
        _cache = _fetch_history()

    if not _cache:
        raise ValueError("KC Fed: no data fetched")

    history = _cache
    current = history[0]["value"]
    previous = history[1]["value"] if len(history) > 1 else None
    release_date = history[0]["date"]

    return {
        "current_value": current,
        "previous_value": previous,
        "release_date": release_date,
        "data": history,
    }
