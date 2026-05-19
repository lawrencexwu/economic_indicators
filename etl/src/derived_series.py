"""
Compute derived fiscal indicators from raw FRED source series.

Derived indicators:
  debt_to_gdp          — GFDEBTN (M$) / GDP (B$) * 100         quarterly
  interest_to_gdp      — FYOINT (B$) / GDP (B$) * 100           annual
  interest_to_receipts — FYOINT (B$) / FYRENT (B$) * 100        annual
  primary_deficit_pct  — -(FYFSD + FYOINT) / GDP * 100          annual
  fed_balance_to_gdp   — WALCL (M$) / 1000 / GDP (B$) * 100    weekly

Called from main.py after the FRED fetch loop.
"""

import json
import logging
from datetime import datetime
from pathlib import Path

from .scoring import compute_zscore_block, get_level_trend_state
from .forecast import compute_forecast

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "indicators"

# Fed balance sheet source: WALCL (Fed total assets, millions, weekly)
_WALCL_TICKER = "WALCL"


def _load(ind_id: str) -> dict | None:
    path = DATA_DIR / f"{ind_id}.json"
    if not path.exists():
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"derived_series: failed to load {ind_id}: {e}")
        return None


def _save(payload: dict) -> None:
    ind_id = payload["id"]
    path = DATA_DIR / f"{ind_id}.json"
    with open(path, "w") as f:
        json.dump(payload, f, indent=2, default=str)


def _gdp_by_year(gdp_data: list[dict]) -> dict[int, float]:
    """Build year → GDP value mapping (use the latest quarterly value for each year)."""
    result: dict[int, float] = {}
    for rec in gdp_data:
        year = int(rec["date"][:4])
        if year not in result:  # data is newest-first; first hit = latest quarter of that year
            result[year] = rec["value"]
    return result


def _gdp_by_quarter(gdp_data: list[dict]) -> dict[str, float]:
    """Build YYYY-MM → GDP value mapping for quarterly alignment."""
    return {rec["date"][:7]: rec["value"] for rec in gdp_data}


def _find_gdp_for_date(date: str, gdp_by_year: dict[int, float]) -> float | None:
    year = int(date[:4])
    # US fiscal year ends Sep 30; FY data dated Oct 1 of the following year in FRED
    # Try same year and one year back
    return gdp_by_year.get(year) or gdp_by_year.get(year - 1)


def _make_payload(
    ind_id: str,
    name: str,
    records: list[dict],
    frequency: str,
    config: dict,
    now_utc: str,
) -> dict:
    return {
        "id": ind_id,
        "name": name,
        "fred_ticker": None,
        "category": "fiscal",
        "page": "fiscal",
        "tier": config["tier"],
        "weight": config["weight"],
        "frequency": frequency,
        "source_type": "derived",
        "last_updated": now_utc,
        "current_value": records[0]["value"] if records else None,
        "previous_value": records[1]["value"] if len(records) > 1 else None,
        "data": records,
        "metadata": config.get("metadata", {}),
        "score": None,
        "next_expected_release": None,
    }


# ── Individual derived computations ──────────────────────────────────────────

def _compute_debt_to_gdp(config: dict, now_utc: str) -> dict | None:
    debt = _load("federal_debt_src")
    gdp = _load("gdp_nominal")
    if not debt or not gdp:
        logger.warning("debt_to_gdp: missing source data")
        return None

    gdp_q = _gdp_by_quarter(gdp["data"])
    gdp_y = _gdp_by_year(gdp["data"])

    records: list[dict] = []
    for rec in debt["data"]:
        date = rec["date"]
        gdp_val = gdp_q.get(date[:7])
        if gdp_val is None:
            gdp_val = _find_gdp_for_date(date, gdp_y)
        if gdp_val and gdp_val > 0:
            # GFDEBTN in millions → billions; GDP already in billions (SAAR)
            ratio = round((rec["value"] / 1000) / gdp_val * 100, 2)
            records.append({"date": date, "value": ratio})

    if not records:
        logger.warning("debt_to_gdp: no aligned records")
        return None
    records.sort(key=lambda r: r["date"], reverse=True)
    return _make_payload("debt_to_gdp", config["name"], records, "quarterly", config, now_utc)


def _compute_interest_to_gdp(config: dict, now_utc: str) -> dict | None:
    interest = _load("net_interest_src")
    gdp = _load("gdp_nominal")
    if not interest or not gdp:
        logger.warning("interest_to_gdp: missing source data")
        return None

    gdp_y = _gdp_by_year(gdp["data"])

    records: list[dict] = []
    for rec in interest["data"]:
        gdp_val = _find_gdp_for_date(rec["date"], gdp_y)
        if gdp_val and gdp_val > 0:
            # FYOINT in millions → billions; GDP already in billions (SAAR)
            ratio = round((rec["value"] / 1000) / gdp_val * 100, 2)
            records.append({"date": rec["date"], "value": ratio})

    if not records:
        logger.warning("interest_to_gdp: no aligned records")
        return None
    records.sort(key=lambda r: r["date"], reverse=True)
    return _make_payload("interest_to_gdp", config["name"], records, "annual", config, now_utc)


def _compute_interest_to_receipts(config: dict, now_utc: str) -> dict | None:
    interest = _load("net_interest_src")
    receipts = _load("federal_receipts_src")
    if not interest or not receipts:
        logger.warning("interest_to_receipts: missing source data")
        return None

    receipts_by_year: dict[int, float] = {}
    for rec in receipts["data"]:
        year = int(rec["date"][:4])
        if year not in receipts_by_year:
            receipts_by_year[year] = rec["value"]

    records: list[dict] = []
    for rec in interest["data"]:
        year = int(rec["date"][:4])
        rcpt = receipts_by_year.get(year) or receipts_by_year.get(year - 1)
        if rcpt and rcpt > 0:
            ratio = round(rec["value"] / rcpt * 100, 2)
            records.append({"date": rec["date"], "value": ratio})

    if not records:
        logger.warning("interest_to_receipts: no aligned records")
        return None
    records.sort(key=lambda r: r["date"], reverse=True)
    return _make_payload("interest_to_receipts", config["name"], records, "annual", config, now_utc)


def _compute_primary_deficit(config: dict, now_utc: str) -> dict | None:
    surplus = _load("federal_surplus_src")   # FYFSD: negative = deficit
    interest = _load("net_interest_src")     # FYOINT: positive
    gdp = _load("gdp_nominal")
    if not surplus or not interest or not gdp:
        logger.warning("primary_deficit_pct: missing source data")
        return None

    interest_by_year: dict[int, float] = {}
    for rec in interest["data"]:
        year = int(rec["date"][:4])
        if year not in interest_by_year:
            interest_by_year[year] = rec["value"]

    gdp_y = _gdp_by_year(gdp["data"])

    records: list[dict] = []
    for rec in surplus["data"]:
        year = int(rec["date"][:4])
        intcost = interest_by_year.get(year) or interest_by_year.get(year - 1)
        gdp_val = _find_gdp_for_date(rec["date"], gdp_y)
        if intcost is not None and gdp_val and gdp_val > 0:
            # FYFSD and FYOINT both in millions → divide by 1000 for billions; GDP in billions (SAAR)
            # primary_surplus = FYFSD + FYOINT (add back interest to get ex-interest balance)
            # primary_deficit (positive = bad) = -(FYFSD + FYOINT)
            primary_deficit = -((rec["value"] + intcost) / 1000)
            pct = round(primary_deficit / gdp_val * 100, 2)
            records.append({"date": rec["date"], "value": pct})

    if not records:
        logger.warning("primary_deficit_pct: no aligned records")
        return None
    records.sort(key=lambda r: r["date"], reverse=True)
    return _make_payload("primary_deficit_pct", config["name"], records, "annual", config, now_utc)


def _compute_fed_balance_to_gdp(config: dict, now_utc: str) -> dict | None:
    walcl = _load("fed_balance_sheet")   # WALCL: millions, weekly
    gdp = _load("gdp_nominal")
    if not walcl or not gdp:
        logger.warning("fed_balance_to_gdp: missing source data")
        return None

    gdp_q = _gdp_by_quarter(gdp["data"])
    gdp_y = _gdp_by_year(gdp["data"])

    records: list[dict] = []
    for rec in walcl["data"]:
        date = rec["date"]
        gdp_val = gdp_q.get(date[:7])
        if gdp_val is None:
            # Find nearest quarter (search within ±3 months)
            year_month = date[:7]
            year, month = int(year_month[:4]), int(year_month[5:7])
            for delta in range(4):
                m = month - delta
                y = year
                while m <= 0:
                    m += 12
                    y -= 1
                key = f"{y:04d}-{m:02d}"
                if key in gdp_q:
                    gdp_val = gdp_q[key]
                    break
            if gdp_val is None:
                gdp_val = _find_gdp_for_date(date, gdp_y)
        if gdp_val and gdp_val > 0:
            # WALCL in millions → billions; GDP in billions (SAAR)
            ratio = round((rec["value"] / 1000) / gdp_val * 100, 2)
            records.append({"date": date, "value": ratio})

    if not records:
        logger.warning("fed_balance_to_gdp: no aligned records")
        return None
    records.sort(key=lambda r: r["date"], reverse=True)
    return _make_payload("fed_balance_to_gdp", config["name"], records, "weekly", config, now_utc)


# ── Orchestrator ─────────────────────────────────────────────────────────────

_DERIVED_COMPUTATIONS = {
    "debt_to_gdp": _compute_debt_to_gdp,
    "interest_to_gdp": _compute_interest_to_gdp,
    "interest_to_receipts": _compute_interest_to_receipts,
    "primary_deficit_pct": _compute_primary_deficit,
    "fed_balance_to_gdp": _compute_fed_balance_to_gdp,
}


def compute_all_derived(indicators_config: list[dict], now_utc: str) -> tuple[list[str], list[str]]:
    """
    Compute all derived indicators.
    Returns (succeeded_ids, failed_ids).
    """
    config_by_id = {ind["id"]: ind for ind in indicators_config}
    succeeded: list[str] = []
    failed: list[str] = []

    for ind_id, compute_fn in _DERIVED_COMPUTATIONS.items():
        config = config_by_id.get(ind_id)
        if config is None:
            logger.warning(f"derived: no config found for {ind_id}, skipping")
            failed.append(ind_id)
            continue

        try:
            payload = compute_fn(config, now_utc)
            if payload is None:
                failed.append(ind_id)
                continue

            # Compute z-score and forecast for the derived indicator
            zscore = compute_zscore_block(config, payload)
            payload["zscore"] = zscore
            payload["level_trend_state"] = get_level_trend_state(zscore)
            payload["forecast"] = compute_forecast(config, payload)

            _save(payload)
            logger.info(
                f"✓  {ind_id}  (derived)  "
                f"{payload.get('current_value')}  [{payload.get('data', [{}])[0].get('date', '?')}]"
            )
            succeeded.append(ind_id)
        except Exception as exc:
            logger.error(f"✗  {ind_id}  (derived): {exc}")
            failed.append(ind_id)

    return succeeded, failed
