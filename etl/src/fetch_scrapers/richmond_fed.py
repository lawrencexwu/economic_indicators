"""
Richmond Fed Fifth District Manufacturing Survey scraper.
Source: richmondfed.org — composite index embedded in page as hidden CSV.
"""

import csv
import io
import logging
import re

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_URL = "https://www.richmondfed.org/region_communities/regional_data_analysis/business_surveys/manufacturing"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}

_cache: list | None = None


def _fetch_history() -> list[dict]:
    r = requests.get(_URL, headers=_HEADERS, timeout=30)
    r.raise_for_status()

    # Data is in a hidden <pre id="data-chart_local"> element as CSV
    soup = BeautifulSoup(r.text, "html.parser")
    pre = soup.find("pre", id="data-chart_local")
    if pre is None:
        raise ValueError("Richmond Fed: could not find data-chart_local element")

    csv_text = pre.get_text(strip=True)
    reader = csv.DictReader(io.StringIO(csv_text))

    history = []
    for row in reader:
        date_str = row.get("Date", "").strip()
        val_str = row.get("Composite Index", "").strip()
        if not date_str or not val_str:
            continue
        try:
            # Date is already YYYY-MM-DD format
            if re.match(r"\d{4}-\d{2}-\d{2}", date_str):
                date_out = date_str[:10]
            else:
                continue
            val = float(val_str)
            history.append({"date": date_out, "value": val})
        except (ValueError, KeyError):
            continue

    history.sort(key=lambda x: x["date"], reverse=True)
    return history


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if _cache is None:
        logger.info("Richmond Fed: fetching manufacturing survey data")
        _cache = _fetch_history()

    if not _cache:
        raise ValueError("Richmond Fed: no data fetched")

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
