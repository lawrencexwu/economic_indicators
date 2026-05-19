"""
NAHB Housing Market Index scraper.
Source: Eye on Housing (NAHB economics blog) — eyeonhousing.org
Reads the WordPress sitemap to find all monthly HMI posts, then parses each
article for the composite HMI and Traffic of Prospective Buyers subindex.
Module-level cache avoids re-fetching for each NAHB indicator in the same run.
"""

import logging
import re

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

EOH_SITEMAP = "https://eyeonhousing.org/wp-sitemap-posts-post-1.xml"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}

# Month → YYYY-MM-01 derived from post URL pattern  (e.g. /2026/05/...)
_SLUG_KEYWORDS = ("builder-sentiment", "builder-confidence", "housing-market-index")

# Module-level cache: populated on first call to fetch()
_cache: dict | None = None  # {composite: [...], traffic: [...]}


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _extract_hmi_composite(text: str) -> float | None:
    """
    Extract the headline HMI value from article text.
    Looks for patterns like:
      '... homes increased three points to 37 in May ...'
      '... homes was 32 in September ...'
      '... homes rose one point to 40 ...'
    """
    patterns = [
        r"(?:single-family homes|new homes)[^.]*?(?:increased|fell|rose|edged|posted|remained at|was|registered|is|at)\s+(?:\w+ points? (?:to\s+))?(\d{1,2})\b",
        r"HMI[^.]*?(?:at|to|was|of|is)\s+(\d{1,2})\b",
        r"housing market index[^.]*?(?:at|to|was|of|is|registered)\s+(\d{1,2})\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = float(m.group(1))
            if 1 <= val <= 99:
                return val
    return None


def _extract_traffic(text: str) -> float | None:
    """
    Extract the Traffic of Prospective Buyers subindex.
    Looks for: '... traffic of prospective buyers ... to 25 ...'
    """
    m = re.search(
        r"traffic of prospective buyers[^.]*?(?:to|at|was|of|is)\s+(\d{1,2})\b",
        text, re.IGNORECASE
    )
    if m:
        val = float(m.group(1))
        if 1 <= val <= 99:
            return val
    # Fallback: look for "traffic" near a number
    m = re.search(r"charting traffic[^.]*?to\s+(\d{1,2})\b", text, re.IGNORECASE)
    if m:
        val = float(m.group(1))
        if 1 <= val <= 99:
            return val
    return None


def _url_to_date(url: str) -> str | None:
    """Extract YYYY-MM-01 from URL like '...eyeonhousing.org/2026/05/builder-...'"""
    m = re.search(r"/(\d{4})/(\d{2})/", url)
    if m:
        return f"{m.group(1)}-{m.group(2)}-01"
    return None


# ── Data fetching ─────────────────────────────────────────────────────────────

def _get_hmi_post_urls() -> list[str]:
    """Return all HMI-related post URLs from Eye on Housing sitemap."""
    r = requests.get(EOH_SITEMAP, headers=_HEADERS, timeout=15)
    r.raise_for_status()
    all_urls = re.findall(r"<loc>(.*?)</loc>", r.text)
    return [u for u in all_urls if any(k in u.lower() for k in _SLUG_KEYWORDS)]


def _parse_post(url: str) -> dict | None:
    """Fetch and parse a single HMI blog post. Returns {composite, traffic, date} or None."""
    date_str = _url_to_date(url)
    if not date_str:
        return None
    try:
        r = requests.get(url, headers=_HEADERS, timeout=15)
        r.raise_for_status()
    except Exception as e:
        logger.warning("NAHB: failed to fetch %s — %s", url, e)
        return None

    soup = BeautifulSoup(r.text, "html.parser")
    article = soup.find("article") or soup.find(class_="entry-content") or soup.find("main")
    text = article.get_text(separator=" ") if article else soup.get_text()

    composite = _extract_hmi_composite(text)
    traffic = _extract_traffic(text)

    if composite is None:
        logger.debug("NAHB: could not parse composite from %s", url[-60:])
        return None

    return {"date": date_str, "composite": composite, "traffic": traffic}


def _build_cache() -> dict:
    """Fetch all HMI posts and build history arrays for composite and traffic."""
    logger.info("NAHB: fetching HMI post list from Eye on Housing sitemap")
    urls = _get_hmi_post_urls()
    logger.info("NAHB: found %d HMI posts, fetching all...", len(urls))

    composite_history: list[dict] = []
    traffic_history: list[dict] = []

    for url in urls:
        result = _parse_post(url)
        if result is None:
            continue
        composite_history.append({"date": result["date"], "value": result["composite"]})
        if result["traffic"] is not None:
            traffic_history.append({"date": result["date"], "value": result["traffic"]})

    # Sort newest first
    composite_history.sort(key=lambda x: x["date"], reverse=True)
    traffic_history.sort(key=lambda x: x["date"], reverse=True)

    return {"composite": composite_history, "traffic": traffic_history}


# ── Public API ────────────────────────────────────────────────────────────────

def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if _cache is None:
        _cache = _build_cache()

    if indicator_id == "nahb_index":
        history = _cache["composite"]
    elif indicator_id == "nahb_traffic":
        history = _cache["traffic"]
    else:
        raise ValueError(f"NAHB: unknown indicator {indicator_id!r}")

    if not history:
        raise ValueError(f"NAHB: no data fetched for {indicator_id}")

    current = history[0]["value"]
    previous = history[1]["value"] if len(history) > 1 else None
    release_date = history[0]["date"]

    return {
        "current_value": current,
        "previous_value": previous,
        "release_date": release_date,
        "data": history,
    }
