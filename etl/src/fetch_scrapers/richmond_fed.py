"""
Richmond Fed Manufacturing Survey scraper.
Source: richmondfed.org — downloads the composite index data table.
"""

import logging
import re

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.richmondfed.org/research/regional_economy/surveys_of_business_conditions/manufacturing"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}

_cache: list | None = None


def _fetch_history() -> list[dict]:
    """Scrape composite index values from Richmond Fed manufacturing survey page."""
    r = requests.get(_BASE_URL, headers=_HEADERS, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    # Richmond Fed table: look for the "Composite Index" / "General Business Conditions" row
    history = []
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        for i, row in enumerate(rows):
            cells = row.find_all(["td", "th"])
            texts = [c.get_text(strip=True) for c in cells]
            if not texts:
                continue
            # Header row: look for date/period column
            if any(t.lower() in ("composite", "composite index", "general business conditions") for t in texts[:3]):
                # This is a header row; next rows have data
                continue
            # Data rows: first cell is date, second (or relevant column) is composite value
            if len(texts) >= 2:
                date_str = _parse_date(texts[0])
                if date_str:
                    for cell_text in texts[1:]:
                        val = _parse_float(cell_text)
                        if val is not None:
                            history.append({"date": date_str, "value": val})
                            break

    if not history:
        # Fallback: try JSON endpoint (Richmond Fed sometimes provides CSV download)
        try:
            csv_url = _BASE_URL.replace("manufacturing", "manufacturing/data")
            r2 = requests.get(csv_url + ".csv", headers=_HEADERS, timeout=15)
            if r2.ok:
                lines = r2.text.strip().split("\n")
                for line in lines[1:]:  # skip header
                    parts = line.split(",")
                    if len(parts) >= 2:
                        date_str = _parse_date(parts[0].strip().strip('"'))
                        val = _parse_float(parts[1].strip().strip('"'))
                        if date_str and val is not None:
                            history.append({"date": date_str, "value": val})
        except Exception as e:
            logger.warning("Richmond Fed CSV fallback failed: %s", e)

    history.sort(key=lambda x: x["date"], reverse=True)
    return history


def _parse_date(s: str) -> str | None:
    """Parse 'Jan 2024', '2024-01', 'Jan-24', etc. to YYYY-MM-01."""
    s = s.strip()
    months = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
              "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
    # YYYY-MM-DD or YYYY-MM
    m = re.match(r"(\d{4})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-01"
    # Mon YYYY or Mon-YY or Mon 'YY
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
