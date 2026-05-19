"""
ETL orchestrator.

Usage:
    cd etl && uv run python -m src.main

For each indicator:
  - Check release calendar; skip if not due and data is fresh
  - Attempt fetch (FRED or scraper)
  - On success: write data/indicators/<id>.json, update manifest
  - On failure: log error to manifest, leave existing JSON intact
After all indicators: write data/composites/*.json
Implemented in Phase 2 (fetch) + Phase 3 (scoring) + Phase 4 (aggregation).
"""


def main():
    print("ETL not yet implemented — see Phase 2.")


if __name__ == "__main__":
    main()
