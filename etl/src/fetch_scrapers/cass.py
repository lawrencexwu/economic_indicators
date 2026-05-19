"""
Cass Freight Index (Shipments) scraper.
Source: cassinfo.com monthly transportation index pages (JS-rendered, Playwright).
Uses one browser session to navigate through the last 12 monthly reports.
URL pattern: /freight-audit-payment/cass-transportation-indexes/{month-name}-{year}
"""

import logging
import re
from datetime import date

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)

_BASE = "https://www.cassinfo.com/freight-audit-payment/cass-transportation-indexes"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]

_cache: dict | None = None


def _monthly_url_dates(n_months: int = 12) -> list[tuple[str, str]]:
    """
    Generate (url, YYYY-MM-01) pairs for the last n_months.
    Starts 1 month back (Cass publishes previous-month data mid-month).
    """
    today = date.today()
    results = []
    for i in range(1, n_months + 2):
        month = today.month - i
        year = today.year
        while month <= 0:
            month += 12
            year -= 1
        month_name = MONTH_NAMES[month - 1]
        url = f"{_BASE}/{month_name}-{year}"
        date_str = f"{year}-{month:02d}-01"
        results.append((url, date_str))
    return results


def _parse_shipments(html: str) -> float | None:
    """
    Extract the Cass Freight Index - Shipments current value.
    Looks for table row containing 'Shipments' under a 'Cass Freight Index' header.
    The index value is a decimal around 1.0 (e.g., 1.011).
    """
    soup = BeautifulSoup(html, "html.parser")

    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if not cells:
                continue
            label = cells[0].lower()
            if "shipment" in label:
                for cell in cells[1:]:
                    try:
                        val = float(cell)
                        if 0.3 <= val <= 2.0:
                            return val
                    except ValueError:
                        pass

    # Text fallback: look for "Shipments" near a 3-decimal index value
    text = soup.get_text(separator=" ")
    m = re.search(r"Shipments[^.]{0,80}?(\d+\.\d{3})\b", text, re.IGNORECASE)
    if m:
        val = float(m.group(1))
        if 0.3 <= val <= 2.0:
            return val

    return None


def _build_cache() -> dict:
    url_dates = _monthly_url_dates(12)
    history: list[dict] = []

    stealth = Stealth()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=_UA,
        )
        stealth.apply_stealth_sync(ctx)
        page = ctx.new_page()

        for url, date_str in url_dates:
            try:
                logger.info("Cass: fetching %s", url)
                response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
                if response and response.status == 404:
                    logger.debug("Cass: 404 for %s, skipping", url)
                    continue
                # Wait for the data table to be present in the DOM
                try:
                    page.wait_for_selector("table", timeout=15000)
                except Exception:
                    logger.warning("Cass: table not found within 15s on %s", url)
                html = page.content()
                val = _parse_shipments(html)
                if val is not None:
                    history.append({"date": date_str, "value": val})
                    logger.info("Cass: %s → %.3f", date_str, val)
                else:
                    logger.warning("Cass: could not parse value from %s", url)
            except Exception as e:
                logger.warning("Cass: error on %s: %s", url, e)

        browser.close()

    history.sort(key=lambda x: x["date"], reverse=True)
    if not history:
        raise ValueError("Cass: no data parsed from any monthly page")

    return {"history": history}


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if indicator_id != "cass_freight":
        raise ValueError(f"Cass: unknown indicator {indicator_id!r}")
    if _cache is None:
        _cache = _build_cache()

    history = _cache["history"]
    if not history:
        raise ValueError("Cass: no data fetched")

    return {
        "current_value": history[0]["value"],
        "previous_value": history[1]["value"] if len(history) > 1 else None,
        "release_date": history[0]["date"],
        "data": history,
    }
