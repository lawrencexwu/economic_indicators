"""Z-score computation for economic indicators.

Called by main.py after each indicator's data is fetched.
Enriches the payload with a `zscore` block and `level_trend_state` string.

Transform types (set per indicator in indicators.yaml):
  "level" — z-score the raw level (stationary series: spreads, PMIs, rates)
  "yoy"   — z-score the YoY fractional change (trending series: price indices,
             payrolls, loan volumes, etc.)
  "raw"   — z-score the raw value without transformation (already in change form:
             GDP growth rate, AAR YoY carloads)

Window:
  "10y"  — rolling 10-year window (default)
  "full" — full available history (recession-leading indicators)
"""

import statistics
from datetime import datetime, timezone

# YoY lag periods per frequency (how many data points = 1 year)
_YOY_PERIODS: dict[str, int] = {
    "daily": 252,
    "weekly": 52,
    "quarterly": 4,
    "monthly": 12,
}

# Trend lag periods per frequency (3-month equivalent)
_TREND_LAG: dict[str, int] = {
    "daily": 65,
    "weekly": 13,
    "quarterly": 1,
    "monthly": 3,
}

# 10-year window size per frequency (number of data points)
_WINDOW_10Y: dict[str, int] = {
    "daily": 2520,
    "weekly": 520,
    "quarterly": 40,
    "monthly": 120,
}


def _extract_values(data: list[dict]) -> list[float]:
    return [d["value"] for d in data if d.get("value") is not None]


def _yoy_series(values: list[float], n: int) -> list[float]:
    """Compute YoY fractional changes, newest first.

    result[i] = values[i] / values[i+n] - 1
    Skips entries where the base is zero.
    """
    result = []
    for i in range(len(values) - n):
        base = values[i + n]
        if base != 0:
            result.append(values[i] / base - 1)
    return result


def compute_zscore_block(ind_config: dict, payload: dict) -> dict | None:
    """Compute z-score metrics for one indicator.

    Returns a dict ready to embed as payload["zscore"], or None when
    there is not enough history to compute a meaningful result.
    """
    transform: str = ind_config.get("zscore_transform", "level")
    window: str = ind_config.get("zscore_window", "10y")
    frequency: str = payload.get("frequency", "monthly")
    data: list[dict] = payload.get("data", [])

    raw_values = _extract_values(data)
    if len(raw_values) < 4:
        return None

    yoy_n = _YOY_PERIODS.get(frequency, 12)

    # Apply transform → level_values is what we actually z-score
    if transform == "yoy":
        if len(raw_values) <= yoy_n:
            return None
        level_values = _yoy_series(raw_values, yoy_n)
        if len(level_values) < 4:
            return None
    else:  # "level" or "raw"
        level_values = raw_values

    # Determine rolling window size
    n_window_10y = _WINDOW_10Y.get(frequency, 120)
    n_window = n_window_10y if window == "10y" else len(level_values)
    n_window = min(n_window, len(level_values))
    window_values = level_values[:n_window]

    if len(window_values) < 2:
        return None

    mean = statistics.mean(window_values)
    std = statistics.stdev(window_values)

    level_z = 0.0 if std == 0 else (level_values[0] - mean) / std

    # Trend z-score: 3-month (or frequency-equivalent) change vs its own distribution
    lag = _TREND_LAG.get(frequency, 3)
    trend_z = 0.0
    trend_value_used = None

    if lag < len(level_values):
        trend_delta = level_values[0] - level_values[lag]
        trend_value_used = round(trend_delta, 6)

        trend_history = [
            level_values[i] - level_values[i + lag]
            for i in range(min(n_window, len(level_values) - lag))
        ]
        if len(trend_history) >= 2:
            t_mean = statistics.mean(trend_history)
            t_std = statistics.stdev(trend_history)
            if t_std != 0:
                trend_z = (trend_delta - t_mean) / t_std

    return {
        "level_z": round(level_z, 3),
        "level_mean": round(mean, 6),
        "level_std": round(std, 6),
        "level_value_used": round(level_values[0], 6),
        "trend_z": round(trend_z, 3),
        "trend_value_used": trend_value_used,
        "window": window,
        "transform": transform,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def get_level_trend_state(zscore_block: dict | None) -> str:
    """Classify indicator into one of five states.

    States:
      Strong       — above avg AND accelerating
      Peaking      — above avg BUT decelerating (turning point signal)
      Neutral      — near historical average (|level_z| ≤ 0.5)
      Recovering   — below avg BUT accelerating (turning point signal)
      Deteriorating — below avg AND decelerating
    """
    if not zscore_block:
        return "Neutral"

    lz = zscore_block.get("level_z", 0.0)
    tz = zscore_block.get("trend_z", 0.0)

    if abs(lz) <= 0.5:
        return "Neutral"
    if lz > 0.5 and tz > 0.5:
        return "Strong"
    if lz > 0.5 and tz < -0.5:
        return "Peaking"
    if lz < -0.5 and tz < -0.5:
        return "Deteriorating"
    if lz < -0.5 and tz > 0.5:
        return "Recovering"
    return "Neutral"  # Level significant but trend in neutral band
