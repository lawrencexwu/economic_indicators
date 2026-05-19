"""
MBA Weekly Mortgage Applications scraper.
Source: Trading Economics (server-side rendered, no Cloudflare WAF).
  Purchase: https://tradingeconomics.com/united-states/mba-purchase-index
  Refi:     https://tradingeconomics.com/united-states/mba-mortgage-refinance-index

Merges fresh records with existing JSON history so Phase 2 data is preserved.
No Playwright needed — plain requests + BeautifulSoup.
"""

import json
import logging
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_TE_BASE = "https://tradingeconomics.com"
_URLS = {
    "mba_purchase": f"{_TE_BASE}/united-states/mba-purchase-index",
    "mba_refi":     f"{_TE_BASE}/united-states/mba-mortgage-refinance-index",
}
# etl/src/fetch_scrapers/ -> 4 parents up -> economic_indicators/
_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data" / "indicators"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_cache: dict | None = None


# ── HTTP ──────────────────────────────────────────────────────────────────────

def _fetch_html(url: str) -> str:
    session = requests.Session()
    session.headers.update({
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://tradingeconomics.com/",
    })
    resp = session.get(url, timeout=20)
    resp.raise_for_status()
    return resp.text


# ── Parsing ───────────────────────────────────────────────────────────────────

def _parse_records(html: str, url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")

    table = (
        soup.find("table", id="calendar1")
        or soup.find("table", {"class": lambda c: c and "table" in c})
        or soup.find("table")
    )
    if not table:
        excerpt = soup.get_text()[:500]
        logger.warning("TE MBA: no table at %s — page excerpt: %s", url, excerpt)
        raise ValueError(f"TE MBA: no table found at {url}")

    headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
    logger.info("TE MBA: columns = %s", headers)

    def _col(keywords: list[str]) -> int | None:
        for i, h in enumerate(headers):
            if any(k in h for k in keywords):
                return i
        return None

    cal_idx = _col(["calendar", "date", "release"])
    ref_idx = _col(["reference", "period"])
    act_idx = _col(["actual"])

    if act_idx is None:
        raise ValueError(f"TE MBA: no 'Actual' column — headers: {headers}")

    # Debug: log first 5 data rows to see cell structure
    all_rows = table.find_all("tr")
    logger.info("TE MBA: table has %d rows total", len(all_rows))
    for i, row in enumerate(all_rows[:6]):
        cells = row.find_all("td")
        ths = row.find_all("th")
        logger.info("TE MBA: row[%d] — %d th, %d td: %s",
                    i, len(ths), len(cells),
                    [c.get_text(strip=True)[:30] for c in (ths or cells)])

    records: list[dict] = []
    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if not cells or act_idx >= len(cells):
            continue

        act_text = cells[act_idx].get_text(strip=True)
        if not act_text:
            continue  # future release — no value yet

        # Resolve date: prefer Reference (survey week) over Calendar (release date)
        date_iso: str | None = None

        if ref_idx is not None and ref_idx < len(cells):
            ref_text = cells[ref_idx].get_text(strip=True)
            if ref_text and "/" in ref_text:
                try:
                    cal_text = (
                        cells[cal_idx].get_text(strip=True)
                        if cal_idx is not None and cal_idx < len(cells)
                        else ""
                    )
                    release_year = int(cal_text[:4]) if len(cal_text) >= 4 else datetime.now().year
                    mon_abbr, day = ref_text.split("/", 1)
                    dt = datetime.strptime(f"{mon_abbr} {day} {release_year}", "%b %d %Y")
                    # Handle Dec reference / Jan release year-rollover
                    if cal_text:
                        cal_month = int(cal_text[5:7])
                        if dt.month > cal_month and (dt.month - cal_month) > 6:
                            dt = dt.replace(year=release_year - 1)
                    date_iso = dt.strftime("%Y-%m-%d")
                except Exception as exc:
                    logger.debug("TE MBA: ref date parse failed %r: %s", ref_text, exc)

        if date_iso is None and cal_idx is not None and cal_idx < len(cells):
            cal_text = cells[cal_idx].get_text(strip=True)
            try:
                date_iso = datetime.strptime(cal_text[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
            except Exception:
                pass

        if date_iso is None:
            continue

        try:
            value = float(act_text.replace(",", ""))
            records.append({"date": date_iso, "value": value})
        except ValueError:
            continue

    logger.info("TE MBA: parsed %d records from %s", len(records), url)
    return records


# ── History merge ─────────────────────────────────────────────────────────────

def _load_existing(indicator_id: str) -> list[dict]:
    path = _DATA_DIR / f"{indicator_id}.json"
    if path.exists():
        try:
            return json.loads(path.read_text()).get("data", [])
        except Exception:
            return []
    return []


def _merge(fresh: list[dict], existing: list[dict]) -> list[dict]:
    """Overlay fresh records onto existing history; fresh takes priority by date."""
    by_date = {r["date"]: r for r in existing}
    for r in fresh:
        by_date[r["date"]] = r
    return sorted(by_date.values(), key=lambda r: r["date"], reverse=True)


# ── Cache builder ─────────────────────────────────────────────────────────────

def _build_cache() -> dict:
    cache: dict[str, list[dict]] = {}
    for ind_id, url in _URLS.items():
        fresh = _parse_records(_fetch_html(url), url)
        existing = _load_existing(ind_id)
        merged = _merge(fresh, existing)
        cache[ind_id] = merged
        logger.info(
            "TE MBA: %s — %d fresh + %d existing → %d total",
            ind_id, len(fresh), len(existing), len(merged),
        )
    return cache


# ── Public API ────────────────────────────────────────────────────────────────

def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if _cache is None:
        _cache = _build_cache()

    history = _cache.get(indicator_id, [])
    if not history:
        raise ValueError(f"TE MBA: no data for {indicator_id}")

    return {
        "current_value": history[0]["value"],
        "previous_value": history[1]["value"] if len(history) > 1 else None,
        "release_date": history[0]["date"],
        "data": history,
    }
