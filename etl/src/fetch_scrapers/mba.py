"""
MBA Weekly Mortgage Applications scraper.
Source: MBA newsroom at mba.org (Cloudflare-protected; uses Playwright+stealth).
Parses the most recent weekly survey press release for Purchase and Refi indices.
Note: mba.org uses Cloudflare, which may block certain IPs. If blocked, the
scraper raises an exception and the ETL leaves existing JSON intact.
"""

import logging
import re
from datetime import date, timedelta

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)

_BASE = "https://www.mba.org"
_NEWSROOM = f"{_BASE}/news-and-research/newsroom/news"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# Weekly survey is released every Wednesday. Keep 2 Playwright sessions.
_cache: dict | None = None  # {purchase: [...], refi: [...]}


# ── HTML helpers ──────────────────────────────────────────────────────────────

def _fetch_html(url: str, wait_ms: int = 4000) -> str:
    stealth = Stealth()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=_UA,
        )
        stealth.apply_stealth_sync(ctx)
        page = ctx.new_page()
        logger.info("MBA: fetching %s", url)
        page.goto(url, wait_until="networkidle", timeout=30000)
        if wait_ms:
            page.wait_for_timeout(wait_ms)
        html = page.content()
        browser.close()
    return html


def _cloudflare_blocked(html: str) -> bool:
    return "Attention Required" in html or "cf-error-overview" in html or len(html) < 3000


# ── URL discovery ─────────────────────────────────────────────────────────────

def _candidate_dates() -> list[date]:
    """Return recent Wednesdays (MBA release day) to try as press release dates."""
    today = date.today()
    candidates = []
    d = today
    for _ in range(8):
        if d.weekday() == 2:  # Wednesday
            candidates.append(d)
        d -= timedelta(days=1)
    return candidates


def _press_release_url_from_newsroom(html: str) -> str | None:
    """Scrape the newsroom listing page for the latest weekly survey URL."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        text = a.get_text(strip=True).lower()
        href = a["href"]
        if href.startswith("/"):
            href = _BASE + href
        # Accept any link that mentions mortgage + application pointing to a news article.
        # MBA changed titles over time — don't require "weekly survey" phrase.
        if "mortgage" in text and "application" in text and "/news/" in href:
            return href
    return None


# ── Parsing ───────────────────────────────────────────────────────────────────

def _release_date_from_url(url: str) -> str | None:
    """Extract YYYY-MM-DD from MBA press release URL."""
    m = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", url)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return None


def _parse_article(html: str, release_date: str) -> dict | None:
    """
    Parse purchase and refi index from MBA press release article HTML.
    Expected text patterns:
      'Purchase Index ... decreased/increased X percent to 123.4'
      'Refinance Index ... fell/rose X percent to 234.5'
    """
    soup = BeautifulSoup(html, "html.parser")
    article = soup.find("article") or soup.find(class_="field-body") or soup.find("main")
    text = article.get_text(separator=" ") if article else soup.get_text()

    def _find_index(name: str) -> float | None:
        patterns = [
            rf"{name}[^.]*?(?:decreased|increased|fell|rose|remained|was)[^.]*?to\s+(\d{{3,}}(?:\.\d+)?)",
            rf"{name}[^.]*?(?:at|of)\s+(\d{{3,}}(?:\.\d+)?)",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return float(m.group(1))
        return None

    purchase = _find_index("Purchase Index")
    refi = _find_index("Refinance Index")

    if purchase is None and refi is None:
        return None

    return {
        "date": release_date,
        "purchase": purchase,
        "refi": refi,
    }


# ── Cache builder ─────────────────────────────────────────────────────────────

def _build_cache() -> dict:
    # 1. Fetch newsroom listing page
    newsroom_html = _fetch_html(_NEWSROOM)
    if _cloudflare_blocked(newsroom_html):
        raise RuntimeError(
            "MBA: Cloudflare blocked access to mba.org. "
            "This may work in GitHub Actions with a different IP."
        )

    # 2. Find latest weekly survey URL
    article_url = _press_release_url_from_newsroom(newsroom_html)
    if article_url is None:
        raise RuntimeError("MBA: could not find weekly survey link in newsroom listing")

    release_date = _release_date_from_url(article_url) or date.today().isoformat()

    # 3. Fetch and parse the article
    article_html = _fetch_html(article_url)
    if _cloudflare_blocked(article_html):
        raise RuntimeError(f"MBA: Cloudflare blocked article {article_url}")

    parsed = _parse_article(article_html, release_date)
    if parsed is None:
        raise ValueError(f"MBA: could not parse purchase/refi index from {article_url}")

    purchase_point = {"date": parsed["date"], "value": parsed["purchase"]}
    refi_point = {"date": parsed["date"], "value": parsed["refi"]}

    return {
        "purchase": [purchase_point] if parsed["purchase"] is not None else [],
        "refi": [refi_point] if parsed["refi"] is not None else [],
    }


# ── Public API ────────────────────────────────────────────────────────────────

def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if _cache is None:
        _cache = _build_cache()

    if indicator_id == "mba_purchase":
        history = _cache["purchase"]
    elif indicator_id == "mba_refi":
        history = _cache["refi"]
    else:
        raise ValueError(f"MBA: unknown indicator {indicator_id!r}")

    if not history:
        raise ValueError(f"MBA: no data for {indicator_id} (scraper returned no value)")

    current = history[0]["value"]
    release_date = history[0]["date"]

    return {
        "current_value": current,
        "previous_value": None,
        "release_date": release_date,
        "data": history,
    }
