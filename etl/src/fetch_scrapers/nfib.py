"""
NFIB Small Business Optimism Index scraper.
Source: nfib.com/surveys/small-business-economic-trends/ (JS-rendered, Playwright).
Parses the current Optimism Index value from the page text.
"""

import logging
import re
from datetime import date

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)

_URL = "https://www.nfib.com/surveys/small-business-economic-trends/"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

# Increase verbs for direction detection
_DECREASE_VERBS = {"fell", "decreased", "declined", "dropped", "lost", "edged down"}

_cache: dict | None = None


def _fetch_html() -> str:
    stealth = Stealth()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=_UA,
        )
        stealth.apply_stealth_sync(ctx)
        page = ctx.new_page()
        logger.info("NFIB: fetching %s", _URL)
        page.goto(_URL, wait_until="networkidle", timeout=30000)
        html = page.content()
        browser.close()
    return html


def _parse(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator=" ")

    if len(html) < 5000:
        raise RuntimeError(f"NFIB: page too short ({len(html)} bytes) — likely blocked")

    # "Optimism Index rose 0.1 points in April to 95.9"
    # Note: [^.]*? cannot cross the decimal in "0.1", so use explicit structure.
    m = re.search(
        r"Optimism Index\s+"
        r"(rose|fell|edged\s+up|edged\s+down|increased?|decreased?|gained|lost|declined|dropped|remained(?:\s+at)?)"
        r"\s+(?:[\d.]+\s+points?\s+)?in\s+(\w+)\s+to\s+(\d{2,3}(?:\.\d)?)",
        text, re.IGNORECASE,
    )
    if not m:
        # Fallback: "Optimism Index ... to XX.X" (value before month mention)
        m = re.search(
            r"Optimism Index\s+"
            r"(rose|fell|edged|increased?|decreased?|gained|lost|declined|dropped|remained)"
            r"[^(]{0,30}?to\s+(\d{2,3}(?:\.\d)?)",
            text, re.IGNORECASE,
        )
        if m:
            direction = m.group(1).lower().replace(" ", "")
            value = float(m.group(2))
            month_name = None
            change = None
        else:
            raise ValueError("NFIB: could not find Optimism Index value in page text")
    else:
        direction = m.group(1).lower().replace(" ", "")
        month_name = m.group(2).lower() if m.group(2) else None
        value = float(m.group(3))

        # Extract change magnitude from the same sentence
        change_m = re.search(
            r"Optimism Index\s+(?:rose|fell|edged|increased?|decreased?|gained|lost|declined|dropped)\s+"
            r"(\d+(?:\.\d)?)\s+points?",
            text, re.IGNORECASE,
        )
        change = float(change_m.group(1)) if change_m else None

    # Derive data date from month name
    today = date.today()
    if month_name and month_name in MONTH_MAP:
        month_num = MONTH_MAP[month_name]
        year = today.year if month_num <= today.month else today.year - 1
        data_date = f"{year}-{month_num:02d}-01"
    else:
        prev_month = today.month - 1 or 12
        prev_year = today.year if today.month > 1 else today.year - 1
        data_date = f"{prev_year}-{prev_month:02d}-01"

    # Derive previous value from change
    previous_value = None
    if change is not None and direction is not None:
        if any(v in direction for v in ["fell", "decreased", "declined", "dropped", "lost", "edgeddown"]):
            previous_value = round(value + change, 1)
        elif direction not in ("remainedat", "remained"):
            previous_value = round(value - change, 1)

    return {"date": data_date, "value": value, "previous_value": previous_value}


def _build_cache() -> dict:
    html = _fetch_html()
    parsed = _parse(html)

    current_point = {"date": parsed["date"], "value": parsed["value"]}
    history = [current_point]

    if parsed["previous_value"] is not None:
        y, mo, _ = map(int, parsed["date"].split("-"))
        prev_mo = mo - 1 or 12
        prev_yr = y if mo > 1 else y - 1
        prev_date = f"{prev_yr}-{prev_mo:02d}-01"
        history.append({"date": prev_date, "value": parsed["previous_value"]})

    return {
        "current_value": parsed["value"],
        "previous_value": parsed["previous_value"],
        "release_date": parsed["date"],
        "data": history,
    }


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if indicator_id != "nfib_optimism":
        raise ValueError(f"NFIB: unknown indicator {indicator_id!r}")
    if _cache is None:
        _cache = _build_cache()
    return _cache
