"""
Dallas Fed Texas Manufacturing Outlook Survey scraper.
Source: dallasfed.org — permanent historical Excel workbook (seasonally adjusted).
URL: https://www.dallasfed.org/~/media/Documents/research/surveys/tmos/documents/index_sa.xls
The file is overwritten monthly. Column 'Bact' = General Business Activity composite index.
"""

import logging

import pandas as pd

logger = logging.getLogger(__name__)

_EXCEL_URL = "https://www.dallasfed.org/~/media/Documents/research/surveys/tmos/documents/index_sa.xls"

_cache: list | None = None


def _fetch_history() -> list[dict]:
    logger.info("Dallas Fed: downloading Excel from %s", _EXCEL_URL)
    df = pd.read_excel(_EXCEL_URL, engine="openpyxl", header=0)
    df = df.dropna(subset=["Date"])

    history = []
    for _, row in df.iterrows():
        date_raw = str(row["Date"]).strip()  # e.g. "Jun-04"
        val = row.get("Bact")
        if pd.isna(val):
            continue
        try:
            ts = pd.to_datetime(date_raw, format="%b-%y")
            date_str = ts.strftime("%Y-%m-01")
            history.append({"date": date_str, "value": float(val)})
        except (ValueError, TypeError):
            continue

    history.sort(key=lambda x: x["date"], reverse=True)
    return history


def fetch(indicator_id: str, _config: dict) -> dict | None:
    global _cache
    if _cache is None:
        _cache = _fetch_history()

    if not _cache:
        raise ValueError("Dallas Fed: no data fetched")

    history = _cache
    current = history[0]["value"]
    previous = history[1]["value"] if len(history) > 1 else None
    release_date = history[0]["date"]

    return {
        "current_value": current,
        "previous_value": previous,
        "release_date": release_date,
        "data": history,
    }
