"""
AAR Weekly Railroad Traffic scraper.
Source: aar.org/news/ listing → individual weekly press release (plain requests).
aar.org blocks direct access to /data/ and press releases with 429/403.
The news listing page is accessible; individual articles may be blocked locally
but typically work in GitHub Actions (different IP).
Returns YoY percent change in weekly carloads (indicator unit: percent_yoy).
"""

import logging
import re
from datetime import date, timedelta

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_BASE = "https://www.aar.org"
_NEWS = f"{_BASE}/news/"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {
    "User-Agent": _UA,
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": _BASE,
}

_DECREASE_WORDS = {"down", "decreased", "fell", "declined", "dropped", "lower"}

_cache: dict | None = None


def _latest_article_url() -> str | None:
    """Find the most recent weekly rail traffic press release URL from the news listing."""
    r = requests.get(_NEWS, headers=_HEADERS, timeout=15)
    if r.status_code != 200 or len(r.text) < 5000:
        raise RuntimeError(
            f"AAR: news listing returned {r.status_code} ({len(r.text)} bytes)"
        )
    soup = BeautifulSoup(r.text, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "weekly-rail-traffic" in href:
            return href if href.startswith("http") else _BASE + href
    return None


def _fetch_article(url: str) -> str:
    """Fetch a weekly traffic press release page."""
    headers = {**_HEADERS, "Referer": _NEWS}
    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code != 200 or len(r.text) < 5000:
        raise RuntimeError(
            f"AAR: article {url} returned {r.status_code} ({len(r.text)} bytes). "
            "aar.org blocks direct article access from this IP (429/Cloudflare). "
            "This scraper may work in GitHub Actions with a different IP."
        )
    return r.text


def _parse_article(html: str) -> float:
    """
    Extract YoY percent change in weekly carloads from press release text.
    Patterns: 'carloads were X, down Y.Z% ... year' or 'up Y.Z% from the same week'
    """
    soup = BeautifulSoup(html, "html.parser")
    article = soup.find("article") or soup.find(class_="entry-content") or soup.find("main")
    text = article.get_text(separator=" ") if article else soup.get_text()

    m = re.search(
        r"carloads?[^.]*?"
        r"(up|down|increased?|decreased?|fell|rose|declined?|dropped|higher|lower)\s+"
        r"(\d+(?:\.\d+)?)\s*(?:percent|%)[^.]*?(?:from|year|last\s+year|same\s+week|prior)",
        text, re.IGNORECASE,
    )
    if m:
        direction = m.group(1).lower()
        pct = float(m.group(2))
        if direction in _DECREASE_WORDS:
            pct = -pct
        return pct

    m2 = re.search(
        r"(\-?\d+(?:\.\d+)?)\s*%\s*(?:year.over.year|yoy|y/y|from\s+(?:a\s+)?year\s+ago)",
        text, re.IGNORECASE,
    )
    if m2:
        return float(m2.group(1))

    raise ValueError(
        "AAR: could not find YoY carload percent change in article text. "
        "The page structure may have changed — check aar.org/news/ manually."
    )


def _release_date_from_url(url: str) -> str | None:
    """Extract date from URL like '.../week-ending-may-9-2026/'."""
    MONTHS = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
    }
    m = re.search(r"week-ending-(\w+)-(\d+)-(\d{4})", url)
    if m:
        month_name = m.group(1).lower()
        day = int(m.group(2))
        year = int(m.group(3))
        month_num = MONTHS.get(month_name)
        if month_num:
            return f"{year}-{month_num:02d}-{day:02d}"
    return None


def _build_cache() -> dict:
    logger.info("AAR: scanning news listing for latest weekly traffic report")
    article_url = _latest_article_url()
    if article_url is None:
        raise RuntimeError("AAR: could not find weekly rail traffic link in news listing")

    logger.info("AAR: fetching article %s", article_url)
    html = _fetch_article(article_url)
    yoy_pct = _parse_article(html)

    release_date = _release_date_from_url(article_url)
    if release_date is None:
        today = date.today()
        days_since_wed = (today.weekday() - 2) % 7
        release_date = (today - timedelta(days=days_since_wed)).isoformat()

    point = {"date": release_date, "value": yoy_pct}
    return {
        "current_value": yoy_pct,
        "previous_value": None,
        "release_date": release_date,
        "data": [point],
    }


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if indicator_id != "aar_carloads":
        raise ValueError(f"AAR: unknown indicator {indicator_id!r}")
    if _cache is None:
        _cache = _build_cache()
    return _cache
