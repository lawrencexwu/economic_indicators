"""
ISM Manufacturing and Services PMI scraper.
Target: https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/
Uses Playwright + stealth to bypass ISM's JavaScript CAPTCHA (auto-submits after ~7s).
Module-level cache avoids re-launching Chromium for each subindex indicator.
"""

import logging
import re
from datetime import date
from datetime import datetime

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)

BASE_URL = (
    "https://www.ismworld.org/supply-management-news-and-reports"
    "/reports/ism-pmi-reports"
)
MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# indicator_id -> (survey_type, summary_row_label, subindex_table_label_or_None)
# survey_type "pmi" = manufacturing, "services" = non-manufacturing
INDICATOR_CONFIG: dict[str, tuple[str, str, str | None]] = {
    "ism_mfg":               ("pmi",      "Manufacturing PMI®",     None),
    "ism_mfg_new_orders":    ("pmi",      "New Orders",                  "New Orders"),
    "ism_mfg_production":    ("pmi",      "Production",                  "Production"),
    "ism_mfg_employment":    ("pmi",      "Employment",                  "Employment"),
    "ism_mfg_customer_inv":  ("pmi",      "Customers’ Inventories", "Customers’ Inventories"),
    "ism_mfg_prices_paid":   ("pmi",      "Prices",                      "Prices"),
    "ism_services":          ("services", "Services PMI®",          None),
    "ism_services_new_orders": ("services", "New Orders",                "New Orders"),
    "ism_services_prices_paid": ("services", "Prices",                   "Prices"),
}

# Module-level cache so we only fetch each survey page once per ETL run
_cache: dict[str, dict] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _month_date(month_str: str) -> str:
    """'Apr 2026' → '2026-04-01'"""
    dt = datetime.strptime(month_str.strip(), "%b %Y")
    return dt.strftime("%Y-%m-01")


def _normalize(s: str) -> str:
    """Normalize apostrophes/quotes for fuzzy label matching."""
    return s.replace("’", "'").replace("‘", "'").strip()


def _current_report_month_slug() -> str:
    """Return the month slug (e.g. 'april') for the most recent ISM report."""
    today = date.today()
    # Reports are released in month M for data collected in month M-1.
    month = today.month - 1
    year = today.year
    if month == 0:
        month = 12
        year -= 1
    return MONTH_NAMES[month - 1]


def _fetch_html(survey_type: str) -> BeautifulSoup:
    """
    Launch Playwright, navigate to the ISM page.
    ISM's CAPTCHA auto-submits after ~7s with a real browser fingerprint.
    Falls back one month if the first URL returns no table data.
    """
    month_slug = _current_report_month_slug()
    tried: list[str] = []

    for attempt in range(2):
        if attempt == 1:
            # One-month fallback
            idx = MONTH_NAMES.index(month_slug)
            month_slug = MONTH_NAMES[(idx - 1) % 12]

        url = f"{BASE_URL}/{survey_type}/{month_slug}/"
        tried.append(url)
        logger.info("ISM %s: fetching %s (waiting for CAPTCHA auto-submit)", survey_type, url)

        stealth = Stealth()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=_UA,
            )
            stealth.apply_stealth_sync(ctx)
            page = ctx.new_page()
            page.goto(url, wait_until="load", timeout=25000)
            page.wait_for_timeout(7000)
            html = page.content()
            browser.close()

        soup = BeautifulSoup(html, "html.parser")
        if soup.find("table"):
            return soup

    raise RuntimeError(f"ISM {survey_type}: no table found after trying {tried}")


# ── Page parsers ──────────────────────────────────────────────────────────────

def _parse_summary_table(table) -> dict[str, dict]:
    """
    Extract current + previous month values from the first summary table.
    Manufacturing page: rows start at index 1.
    Services page: rows start at index 2 (has an extra header row).
    Returns: {normalized_label: {'current': float, 'previous': float}}
    """
    rows = table.find_all("tr")
    result: dict[str, dict] = {}

    for row in rows:
        cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
        if len(cells) < 3:
            continue
        label = _normalize(cells[0])
        try:
            current = float(cells[1])
            previous = float(cells[2])
        except ValueError:
            continue
        result[label] = {"current": current, "previous": previous}

    return result


def _parse_pmi_history(tables: list) -> list[dict]:
    """Tables[1] and Tables[2] hold ~12 months of PMI composite history."""
    history: list[dict] = []
    for t in tables[1:3]:
        for row in t.find_all("tr")[1:]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) < 2 or not re.match(r"\w+ \d{4}", cells[0]):
                continue
            try:
                history.append({"date": _month_date(cells[0]), "value": float(cells[1])})
            except ValueError:
                pass
    return history


def _parse_subindex_history(tables: list) -> dict[str, list[dict]]:
    """
    Tables[3+] are per-subindex detail tables.
    Each has 4 months of data; the Index value is usually the last column.
    Returns: {normalized_table_label: [{'date':..., 'value':...}]}
    """
    result: dict[str, list[dict]] = {}

    for t in tables[3:]:
        rows = t.find_all("tr")
        if not rows:
            continue
        header = [c.get_text(strip=True) for c in rows[0].find_all(["td", "th"])]
        if not header:
            continue
        table_label = _normalize(header[0])

        # Find the 'Index' column — usually the last one
        index_col = len(header) - 1
        for i, h in enumerate(header):
            if h.lower() == "index":
                index_col = i
                break

        history: list[dict] = []
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) <= index_col:
                continue
            date_str = cells[0].get_text(strip=True)
            if not re.match(r"\w+ \d{4}", date_str):
                continue
            try:
                val = float(cells[index_col].get_text(strip=True))
                history.append({"date": _month_date(date_str), "value": val})
            except ValueError:
                pass

        if history:
            result[table_label] = history

    return result


def _parse_page(soup: BeautifulSoup) -> dict:
    tables = soup.find_all("table")
    return {
        "summary": _parse_summary_table(tables[0]),
        "pmi_history": _parse_pmi_history(tables),
        "subindex_history": _parse_subindex_history(tables),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def fetch(indicator_id: str, _config: dict) -> dict | None:
    if indicator_id not in INDICATOR_CONFIG:
        raise ValueError(f"ISM: unknown indicator {indicator_id!r}")

    survey_type, row_label, subindex_table_label = INDICATOR_CONFIG[indicator_id]

    # Fetch and cache the page (shared across all indicators of same survey_type)
    if survey_type not in _cache:
        soup = _fetch_html(survey_type)
        _cache[survey_type] = _parse_page(soup)

    data = _cache[survey_type]
    summary = data["summary"]

    norm_label = _normalize(row_label)
    if norm_label not in summary:
        available = list(summary.keys())
        raise ValueError(
            f"ISM {survey_type}: row {row_label!r} not found. "
            f"Available: {available}"
        )

    entry = summary[norm_label]
    current_val = entry["current"]
    prev_val = entry["previous"]

    # Build history list
    if subindex_table_label is None:
        # Composite PMI: use 12-month history from Tables 1+2
        history = list(data["pmi_history"])
    else:
        norm_sub = _normalize(subindex_table_label)
        history = list(data["subindex_history"].get(norm_sub, []))
        if not history:
            # Fallback: synthetic 2-point history from summary table
            slug = _current_report_month_slug()
            month_idx = MONTH_NAMES.index(slug)
            year = date.today().year
            curr_date = f"{year}-{(month_idx + 1):02d}-01"
            prev_idx = (month_idx - 1) % 12
            prev_year = year - (1 if month_idx == 0 else 0)
            prev_date = f"{prev_year}-{(prev_idx + 1):02d}-01"
            history = [
                {"date": curr_date, "value": current_val},
                {"date": prev_date, "value": prev_val},
            ]

    history.sort(key=lambda x: x["date"], reverse=True)
    release_date = history[0]["date"] if history else None

    return {
        "current_value": current_val,
        "previous_value": prev_val,
        "release_date": release_date,
        "data": history,
    }
