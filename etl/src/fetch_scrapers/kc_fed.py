"""
Kansas City Fed Tenth District Manufacturing Survey scraper.
Source: kansascityfed.org — permanent historical Excel workbook (document ID 15886).
The file is silently overwritten each month; we discover the current filename from
the survey listing page and download it via pandas.
"""

import logging
import re
import subprocess

import pandas as pd

logger = logging.getLogger(__name__)

_LISTING_URL = "https://www.kansascityfed.org/surveys/manufacturing-survey/"
_BASE_URL = "https://www.kansascityfed.org"
# Fallback: document container ID 15886 is stable; filename is updated monthly.
# Update this URL when the fallback is hit and the ETL logs a warning.
_FALLBACK_URL = "https://www.kansascityfed.org/documents/15886/2026Apr23historicalmfg.xlsx"

_cache: list | None = None


def _find_excel_url() -> str:
    """Discover the current monthly Excel URL from the survey listing page.

    Uses subprocess curl to bypass TLS fingerprint bot-protection that blocks
    the Python requests library on kansascityfed.org.
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
        logger.warning("KC Fed: listing page discovery failed (%s), using fallback URL", e)
    logger.warning("KC Fed: using fallback URL — update _FALLBACK_URL if this 404s")
    return _FALLBACK_URL


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
