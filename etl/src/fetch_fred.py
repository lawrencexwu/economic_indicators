"""
FRED API client.
Fetches a time series, returns standardized list of {date, value} records.
"""

import logging
import os
from datetime import date
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fredapi import Fred

logger = logging.getLogger(__name__)

_fred_client: Fred | None = None


def get_fred_client() -> Fred:
    global _fred_client
    if _fred_client is not None:
        return _fred_client

    env_path = Path(__file__).parent.parent / ".env.local"
    load_dotenv(dotenv_path=env_path, override=False)

    api_key = os.getenv("FRED_API_KEY")
    if not api_key:
        raise ValueError(
            "FRED_API_KEY not set. Add it to etl/.env.local or set it as an env var."
        )
    _fred_client = Fred(api_key=api_key)
    return _fred_client


def fetch_series(fred: Fred, ticker: str, history_years: int = 10) -> pd.Series:
    """
    Fetch a FRED series going back `history_years` years.
    Returns a pandas Series with a DatetimeIndex, NaNs dropped.
    Raises ValueError if the series comes back empty.
    """
    start = f"{date.today().year - history_years}-01-01"
    series = fred.get_series(ticker, observation_start=start)

    if series is None or len(series.dropna()) == 0:
        raise ValueError(f"Empty series returned for ticker {ticker!r}")

    return series.dropna()


def series_to_records(series: pd.Series) -> list[dict]:
    """
    Convert a pandas Series (DatetimeIndex) to a list of
    [{"date": "YYYY-MM-DD", "value": float}, ...], sorted newest-first.
    """
    sorted_series = series.sort_index(ascending=False)
    records = []
    for idx, val in sorted_series.items():
        records.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "value": round(float(val), 6),
            }
        )
    return records
