"""
Challenger, Gray & Christmas monthly job cut announcements scraper.
Source: challengergray.com blog (plain requests, no JS).
Iterates both post sitemaps to build a history of monthly totals.
Returns values in thousands (e.g., 83,387 cuts → 83.387).
"""

import logging
import re

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_BASE = "https://www.challengergray.com"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

_cache: dict | None = None


def _get_report_url_dates() -> list[tuple[str, str]]:
    """
    Scan post-sitemap.xml and post-sitemap2.xml for challenger-report URLs.
    Returns list of (url, YYYY-MM-DD lastmod) tuples.
    """
    results = []
    for sitemap_path in ["/post-sitemap.xml", "/post-sitemap2.xml"]:
        try:
            r = requests.get(f"{_BASE}{sitemap_path}", headers=_HEADERS, timeout=15)
            if r.status_code != 200:
                logger.debug("Challenger: sitemap %s → %d", sitemap_path, r.status_code)
                continue
        except Exception as e:
            logger.warning("Challenger: failed to fetch %s: %s", sitemap_path, e)
            continue

        # Sitemap entries: <url><loc>…</loc><lastmod>YYYY-MM-DD</lastmod></url>
        entries = re.findall(
            r"<url>\s*<loc>(.*?)</loc>.*?<lastmod>(.*?)</lastmod>",
            r.text, re.DOTALL
        )
        for url, lastmod in entries:
            url = url.strip()
            lastmod = lastmod.strip()[:10]
            if "challenger-report" in url.lower() or "job-cut-report" in url.lower():
                # Exclude annual/year-end/calendar posts — not monthly reports
                skip_keywords = ("release-calendar", "year-end", "annual-total", "annual-report", "in-20")
                if any(k in url.lower() for k in skip_keywords):
                    continue
                results.append((url, lastmod))

    return results


def _parse_post(url: str, pub_date: str) -> dict | None:
    """
    Fetch a Challenger monthly blog post and extract the job cut count.
    Returns {'date': 'YYYY-MM-01', 'value': float_thousands} or None.
    pub_date is the sitemap lastmod (YYYY-MM-DD); used to derive the report year.
    """
    try:
        r = requests.get(url, headers=_HEADERS, timeout=15)
        r.raise_for_status()
    except Exception as e:
        logger.warning("Challenger: failed to fetch %s: %s", url, e)
        return None

    soup = BeautifulSoup(r.text, "html.parser")
    article = soup.find("article") or soup.find(class_="entry-content") or soup.find("main")
    text = article.get_text(separator=" ") if article else soup.get_text()

    # Primary pattern: "U.S.-based employers announced 83,387 job cuts in April"
    m = re.search(
        r"(?:U\.S\.[-\s]based employers|employers)[^.]*?announced\s+([\d,]+)\s+job cuts?\s+in\s+(\w+)",
        text, re.IGNORECASE,
    )
    if not m:
        # Fallback: "X,XXX job cuts in April" — require leading digit to avoid matching lone commas
        m = re.search(r"(\d[\d,]*)\s+job cuts?\s+in\s+(\w+)", text, re.IGNORECASE)
    if not m:
        logger.debug("Challenger: no job cuts pattern in %s", url[-70:])
        return None

    raw_count = int(m.group(1).replace(",", ""))
    month_name = m.group(2).lower()

    if raw_count < 100:  # sanity check — job cuts are always at least hundreds
        return None

    if month_name not in MONTH_MAP:
        return None

    month_num = MONTH_MAP[month_name]
    # A monthly report for data month M is published in M+1 or M+2.
    # If data month is more than 2 months ahead of pub month, data is from the prior year
    # (e.g., November data published in January: 11 > 1, diff=10 → year-1).
    pub_year = int(pub_date[:4])
    pub_month = int(pub_date[5:7])
    if month_num > pub_month and (month_num - pub_month) > 2:
        year = pub_year - 1
    else:
        year = pub_year

    data_date = f"{year}-{month_num:02d}-01"
    return {"date": data_date, "value": round(raw_count / 1000.0, 3)}


def _build_cache() -> dict:
    logger.info("Challenger: scanning sitemaps for monthly report URLs")
    url_dates = _get_report_url_dates()
    logger.info("Challenger: found %d candidate URLs", len(url_dates))

    history: list[dict] = []
    seen: set[str] = set()

    for url, pub_date in url_dates:
        result = _parse_post(url, pub_date)
        if result is None:
            continue
        if result["date"] not in seen:
            seen.add(result["date"])
            history.append(result)

    history.sort(key=lambda x: x["date"], reverse=True)
    return {"history": history}


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if indicator_id != "challenger_layoffs":
        raise ValueError(f"Challenger: unknown indicator {indicator_id!r}")
    if _cache is None:
        _cache = _build_cache()

    history = _cache["history"]
    if not history:
        raise ValueError("Challenger: no data fetched from any monthly report")

    return {
        "current_value": history[0]["value"],
        "previous_value": history[1]["value"] if len(history) > 1 else None,
        "release_date": history[0]["date"],
        "data": history,
    }
