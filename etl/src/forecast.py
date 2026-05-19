"""
Short-horizon forecasting for economic indicators.
Uses statsforecast SeasonalNaive (primary) or Naive (fallback).

Output format:
  {
    "model": "SeasonalNaive",
    "horizon": 3,
    "values": [{"date": "YYYY-MM-DD", "mean": X, "lo80": X, "hi80": X, "lo95": X, "hi95": X}, ...],
    "computed_at": "ISO"
  }
"""

import logging
from datetime import datetime, timezone

import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import Naive, SeasonalNaive

logger = logging.getLogger(__name__)

_HORIZON: dict[str, int] = {
    "daily": 5,
    "weekly": 4,
    "monthly": 3,
    "quarterly": 2,
    "annual": 1,
}
_SEASON_LENGTH: dict[str, int] = {
    "daily": 5,
    "weekly": 52,
    "monthly": 12,
    "quarterly": 4,
    "annual": 1,
}
_FREQ_MAP: dict[str, str] = {
    "daily": "B",
    "weekly": "W",
    "monthly": "MS",
    "quarterly": "QS",
    "annual": "YS",
}


def _next_dates(last_date_str: str, freq: str, n: int) -> list[str]:
    """Generate n real future dates after last_date_str based on frequency."""
    last_dt = pd.Timestamp(last_date_str)
    try:
        if freq == "monthly":
            start = last_dt + pd.DateOffset(months=1)
            future = pd.date_range(start=start, periods=n, freq="MS")
        elif freq == "quarterly":
            start = last_dt + pd.DateOffset(months=3)
            future = pd.date_range(start=start, periods=n, freq="QS")
        elif freq == "annual":
            start = last_dt + pd.DateOffset(years=1)
            future = pd.date_range(start=start, periods=n, freq="YS")
        elif freq == "weekly":
            start = last_dt + pd.DateOffset(weeks=1)
            future = pd.date_range(start=start, periods=n, freq="W")
        else:  # daily
            start = last_dt + pd.DateOffset(days=1)
            future = pd.date_range(start=start, periods=n, freq="B")
        return [d.strftime("%Y-%m-%d") for d in future]
    except Exception:
        start = last_dt + pd.DateOffset(months=1)
        future = pd.date_range(start=start, periods=n, freq="MS")
        return [d.strftime("%Y-%m-%d") for d in future]


def _run(df: pd.DataFrame, model, freq_pd: str, horizon: int, level: list[int]) -> pd.DataFrame | None:
    try:
        sf = StatsForecast(models=[model], freq=freq_pd, verbose=False)
        return sf.forecast(df=df, h=horizon, level=level)
    except Exception as exc:
        logger.debug(f"statsforecast error: {exc}")
        return None


def compute_forecast(ind_config: dict, payload: dict) -> dict | None:
    """
    Compute a short-horizon forecast for an indicator.
    Returns a forecast block dict or None if insufficient data or error.
    """
    data = payload.get("data", [])
    if not data:
        return None

    freq = ind_config.get("frequency", "monthly")
    horizon = _HORIZON.get(freq, 3)
    season_length = _SEASON_LENGTH.get(freq, 12)
    freq_pd = _FREQ_MAP.get(freq, "MS")
    min_seasonal = season_length * 2  # need 2 full seasons for SeasonalNaive

    # Collect valid values oldest-first
    values = [r["value"] for r in reversed(data) if r.get("value") is not None]
    if len(values) < max(horizon + 2, 4):
        return None

    ind_id = ind_config["id"]
    n = len(values)

    # Synthetic date range avoids FRED date-irregularity problems
    df = pd.DataFrame({
        "unique_id": [ind_id] * n,
        "ds": pd.date_range(start="2000-01-01", periods=n, freq=freq_pd),
        "y": values,
    })

    use_seasonal = n >= min_seasonal and season_length > 1
    if use_seasonal:
        fcst = _run(df, SeasonalNaive(season_length=season_length), freq_pd, horizon, [80, 95])
        model_name = "SeasonalNaive"
        if fcst is None:
            fcst = _run(df, Naive(), freq_pd, horizon, [80, 95])
            model_name = "Naive"
    else:
        fcst = _run(df, Naive(), freq_pd, horizon, [80, 95])
        model_name = "Naive"

    if fcst is None or fcst.empty:
        logger.warning(f"forecast {ind_id}: no forecast produced")
        return None

    fcst = fcst[fcst["unique_id"] == ind_id].sort_values("ds").reset_index(drop=True)

    # Map real future dates from the last actual data point (data is newest-first)
    last_date = data[0]["date"]
    future_dates = _next_dates(last_date, freq, horizon)

    def _get(row: pd.Series, col: str) -> float:
        return float(row[col]) if col in row.index else float(row.iloc[-1])

    out: list[dict] = []
    for i in range(min(len(fcst), len(future_dates))):
        row = fcst.iloc[i]
        mean_v = _get(row, model_name)
        out.append({
            "date": future_dates[i],
            "mean": round(mean_v, 4),
            "lo80": round(_get(row, f"{model_name}-lo-80"), 4),
            "hi80": round(_get(row, f"{model_name}-hi-80"), 4),
            "lo95": round(_get(row, f"{model_name}-lo-95"), 4),
            "hi95": round(_get(row, f"{model_name}-hi-95"), 4),
        })

    if not out:
        return None

    return {
        "model": model_name,
        "horizon": horizon,
        "values": out,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
