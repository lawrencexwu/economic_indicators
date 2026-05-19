"""
Kansas City Fed Manufacturing Survey scraper.
Source: kansascityfed.org — composite index data.
"""

import logging
import re

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.kansascityfed.org/research/regional-surveys/manufacturing/"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}

_cache: list | None = None


def _fetch_history() -> list[dict]:
    """Scrape composite index values from KC Fed manufacturing survey page."""
    r = requests.get(_BASE_URL, headers=_HEADERS, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    history = []
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            texts = [c.get_text(strip=True) for c in cells]
            if len(texts) < 2:
                continue
            date_str = _parse_date(texts[0])
            if date_str:
                val = _parse_float(texts[1])
                if val is not None:
                    history.append({"date": date_str, "value": val})

    history.sort(key=lambda x: x["date"], reverse=True)
    return history


def _parse_date(s: str) -> str | None:
    s = s.strip()
    months = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
              "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
    m = re.match(r"(\d{4})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-01"
    m = re.match(r"([A-Za-z]{3})[\s\-'](\d{2,4})", s)
    if m:
        mon = months.get(m.group(1).lower())
        if mon:
            yr = m.group(2)
            year = int(yr) if len(yr) == 4 else (2000 + int(yr) if int(yr) < 50 else 1900 + int(yr))
            return f"{year}-{mon:02d}-01"
    return None


def _parse_float(s: str) -> float | None:
    s = s.strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if _cache is None:
        logger.info("KC Fed: fetching manufacturing survey data")
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
