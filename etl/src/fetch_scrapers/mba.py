"""
MBA Weekly Mortgage Applications scraper.

Strategy: bypass the JS-rendered newsroom listing entirely.
MBA press release URLs follow a predictable pattern:
  /news-and-research/newsroom/news/{YYYY}/{MM}/{DD}/{slug}
where slug is one of two variants (increase/decrease).
We probe recent Wednesdays with both slugs via plain requests.HEAD,
then fetch and parse the winning article page with BeautifulSoup.
"""

import logging
import re
import requests
from datetime import date, timedelta

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_BASE = "https://www.mba.org"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_SLUGS = [
    "mortgage-applications-increase-in-latest-mba-weekly-survey",
    "mortgage-applications-decrease-in-latest-mba-weekly-survey",
]

_cache: dict | None = None


# ── Date helpers ──────────────────────────────────────────────────────────────

def _recent_wednesdays(n: int = 8) -> list[date]:
    """Return the n most recent Wednesdays (MBA release day)."""
    today = date.today()
    results: list[date] = []
    d = today
    while len(results) < n:
        if d.weekday() == 2:
            results.append(d)
        d -= timedelta(days=1)
    return results


# ── URL discovery via direct probe ────────────────────────────────────────────

def _find_article_url() -> tuple[str, str] | None:
    """
    Probe candidate Wednesday URLs with both slug variants.
    Returns (full_url, release_date_iso) for the first hit, or None.
    """
    session = requests.Session()
    session.headers["User-Agent"] = _UA

    for release_date in _recent_wednesdays(8):
        y = release_date.year
        m = f"{release_date.month:02d}"
        d = f"{release_date.day:02d}"
        for slug in _SLUGS:
            url = f"{_BASE}/news-and-research/newsroom/news/{y}/{m}/{d}/{slug}"
            try:
                resp = session.head(url, timeout=10, allow_redirects=True)
                logger.info("MBA probe %s → %d", url, resp.status_code)
                if resp.status_code == 200:
                    return url, release_date.isoformat()
            except Exception as exc:
                logger.debug("MBA probe error %s: %s", url, exc)

    return None


# ── Article parsing ───────────────────────────────────────────────────────────

def _fetch_article_html(url: str) -> str:
    session = requests.Session()
    session.headers["User-Agent"] = _UA
    resp = session.get(url, timeout=20)
    resp.raise_for_status()
    return resp.text


def _parse_article(html: str, release_date: str) -> dict | None:
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
        logger.warning("MBA: could not parse indices from article text (first 500): %s", text[:500])
        return None

    return {"date": release_date, "purchase": purchase, "refi": refi}


# ── Cache builder ─────────────────────────────────────────────────────────────

def _build_cache() -> dict:
    result = _find_article_url()
    if result is None:
        raise RuntimeError(
            "MBA: could not find press release for any of the last 8 Wednesdays. "
            "Check slug variants or release schedule."
        )

    article_url, release_date = result
    logger.info("MBA: found article at %s (%s)", article_url, release_date)

    article_html = _fetch_article_html(article_url)
    parsed = _parse_article(article_html, release_date)
    if parsed is None:
        raise ValueError(f"MBA: could not parse purchase/refi index from {article_url}")

    return {
        "purchase": [{"date": parsed["date"], "value": parsed["purchase"]}] if parsed["purchase"] is not None else [],
        "refi":     [{"date": parsed["date"], "value": parsed["refi"]}]     if parsed["refi"]     is not None else [],
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
        raise ValueError(f"MBA: no data for {indicator_id}")

    return {
        "current_value": history[0]["value"],
        "previous_value": None,
        "release_date": history[0]["date"],
        "data": history,
    }
