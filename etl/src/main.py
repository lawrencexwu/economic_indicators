"""
ETL orchestrator.

Usage (from etl/ directory):
    uv run python -m src.main

For each indicator in indicators.yaml:
  - Skip if source_type == scraper (scrapers run via their own modules)
  - Skip if data is fresh per release_calendar freshness_hours
  - Fetch from FRED
  - Write data/indicators/<id>.json
  - On failure: log error, leave existing JSON intact

After all indicators:
  - Write data/manifest.json with timestamps + error list
"""

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

from .fetch_fred import get_fred_client, fetch_series, series_to_records
from .fetch_scrapers import ism, nahb, mba, nfib, challenger, cass, aar

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent.parent          # economic_indicators/
DATA_INDICATORS = ROOT / "data" / "indicators"
MANIFEST_PATH = ROOT / "data" / "manifest.json"
CONFIG_DIR = Path(__file__).parent.parent / "config"


# ─── Config loaders ──────────────────────────────────────────────────────────

def load_indicators() -> list[dict]:
    with open(CONFIG_DIR / "indicators.yaml") as f:
        return yaml.safe_load(f)["indicators"]


def load_release_calendar() -> dict:
    with open(CONFIG_DIR / "release_calendar.yaml") as f:
        return yaml.safe_load(f)["patterns"]


def freshness_hours_for(indicator_id: str, calendar: dict) -> int:
    """Return how many hours of freshness are allowed before re-fetching."""
    for pattern in calendar.values():
        if indicator_id in pattern.get("indicators", []):
            return pattern.get("freshness_hours", 24)
    return 24  # conservative default


# ─── JSON I/O ────────────────────────────────────────────────────────────────

def load_existing(indicator_id: str) -> dict | None:
    path = DATA_INDICATORS / f"{indicator_id}.json"
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            return None
    return None


def write_indicator(indicator_id: str, payload: dict) -> None:
    path = DATA_INDICATORS / f"{indicator_id}.json"
    with open(path, "w") as f:
        json.dump(payload, f, indent=2, default=str)


# ─── Freshness check ─────────────────────────────────────────────────────────

def is_fresh(existing: dict | None, max_age_hours: int) -> bool:
    if existing is None:
        return False
    last_updated = existing.get("last_updated")
    if not last_updated:
        return False
    try:
        last_dt = datetime.fromisoformat(last_updated)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
        return age_hours < max_age_hours
    except Exception:
        return False


# ─── Scraper dispatch ─────────────────────────────────────────────────────────

SCRAPER_MAP = {
    "ism": ism.fetch,
    "nahb": nahb.fetch,
    "mba": mba.fetch,
    "nfib": nfib.fetch,
    "challenger": challenger.fetch,
    "cass": cass.fetch,
    "aar": aar.fetch,
}


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s  %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )

    indicators = load_indicators()
    calendar = load_release_calendar()
    now_utc = datetime.now(timezone.utc).isoformat()

    fred = get_fred_client()

    succeeded: list[str] = []
    failed: list[dict] = []
    skipped: list[str] = []

    for ind in indicators:
        ind_id: str = ind["id"]
        source: str = ind.get("source_type", "fred")
        max_age: int = freshness_hours_for(ind_id, calendar)
        existing = load_existing(ind_id)

        # ── Freshness skip ────────────────────────────────────────────
        if is_fresh(existing, max_age):
            logger.info(f"⏭  {ind_id}  (fresh, skipping)")
            skipped.append(ind_id)
            continue

        # ── FRED fetch ────────────────────────────────────────────────
        if source == "fred":
            ticker = ind.get("fred_ticker")
            if not ticker:
                logger.warning(f"⚠  {ind_id}  no fred_ticker, skipping")
                skipped.append(ind_id)
                continue

            try:
                series = fetch_series(fred, ticker, ind.get("history_years", 10))
                records = series_to_records(series)

                payload = {
                    "id": ind_id,
                    "name": ind["name"],
                    "fred_ticker": ticker,
                    "category": ind.get("category", ""),
                    "page": ind.get("page", ""),
                    "tier": ind["tier"],
                    "weight": ind["weight"],
                    "frequency": ind.get("frequency", "monthly"),
                    "source_type": "fred",
                    "last_updated": now_utc,
                    "current_value": records[0]["value"] if records else None,
                    "previous_value": records[1]["value"] if len(records) > 1 else None,
                    "data": records,
                    "metadata": ind.get("metadata", {}),
                    "score": None,
                }

                write_indicator(ind_id, payload)
                logger.info(
                    f"✓  {ind_id}  ({ticker})  "
                    f"{records[0]['value']}  [{records[0]['date']}]"
                )
                succeeded.append(ind_id)

            except Exception as exc:
                logger.error(f"✗  {ind_id}  ({ticker}):  {exc}")
                failed.append({"id": ind_id, "ticker": ticker, "error": str(exc)})
                # Leave existing JSON intact — don't overwrite good data with nothing

        # ── Scraper fetch ─────────────────────────────────────────────
        elif source == "scraper":
            scraper_key = ind.get("scraper")
            fetch_fn = SCRAPER_MAP.get(scraper_key)
            if fetch_fn is None:
                logger.warning(f"⚠  {ind_id}  scraper={scraper_key!r} not found")
                skipped.append(ind_id)
                continue

            try:
                scraped = fetch_fn(ind_id, ind)
                if scraped is None:
                    raise ValueError("scraper returned None")

                # Merge scraped data with static indicator metadata
                payload = {
                    "id": ind_id,
                    "name": ind["name"],
                    "fred_ticker": None,
                    "category": ind.get("category", ""),
                    "page": ind.get("page", ""),
                    "tier": ind["tier"],
                    "weight": ind["weight"],
                    "frequency": ind.get("frequency", "monthly"),
                    "source_type": "scraper",
                    "last_updated": now_utc,
                    "metadata": ind.get("metadata", {}),
                    "score": None,
                    **scraped,
                }

                write_indicator(ind_id, payload)
                logger.info(
                    f"✓  {ind_id}  (scraped)  "
                    f"{payload.get('current_value')}  [{payload.get('release_date', '?')}]"
                )
                succeeded.append(ind_id)

            except Exception as exc:
                logger.error(f"✗  {ind_id}  (scraper={scraper_key}):  {exc}")
                failed.append({"id": ind_id, "scraper": scraper_key, "error": str(exc)})

        else:
            logger.warning(f"⚠  {ind_id}  unknown source_type={source!r}, skipping")
            skipped.append(ind_id)

    # ── Write manifest ────────────────────────────────────────────────────────
    manifest = {
        "last_run": now_utc,
        "n_succeeded": len(succeeded),
        "n_failed": len(failed),
        "n_skipped": len(skipped),
        "errors": failed,
        "indicators": {
            ind_id: {"status": "ok", "last_updated": now_utc}
            for ind_id in succeeded
        },
    }

    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)

    divider = "=" * 60
    print(f"\n{divider}")
    print(
        f"ETL complete:  {len(succeeded)} ok  |  "
        f"{len(failed)} failed  |  {len(skipped)} skipped"
    )
    if failed:
        print("\nFailed indicators:")
        for err in failed:
            src = err.get("ticker") or err.get("scraper", "?")
            print(f"  {err['id']} ({src}): {err['error']}")
    print(divider)


if __name__ == "__main__":
    main()
