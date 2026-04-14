#!/usr/bin/env python3
"""Fetch NASDAQ top-50 quotes via Yahoo Finance v8 chart API and write a static JSON snapshot."""

from __future__ import annotations

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

NASDAQ_TOP_50 = [
    "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","AVGO",
    "TSLA","COST","NFLX","AMD","ADBE","QCOM","PEP","TMUS",
    "LIN","CSCO","INTU","AMAT","ISRG","TXN","AMGN","CMCSA",
    "MU","BKNG","LRCX","HON","KLAC","ADI","PANW","ADP",
    "SBUX","MDLZ","GILD","REGN","MELI","SNPS","CDNS","VRTX",
    "PYPL","CRWD","CTAS","MAR","MRVL","ORLY","CEG","ABNB",
    "DASH","FTNT",
]

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
UA = "Mozilla/5.0 (compatible; nasdaq50-monitor/1.0)"


def fetch_one(symbol: str) -> dict | None:
    url = CHART_URL.format(symbol=symbol)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except Exception as e:
        print(f"  [WARN] {symbol}: {e}", file=sys.stderr)
        return None

    result = body.get("chart", {}).get("result")
    if not result:
        return None

    meta = result[0].get("meta", {})
    return {
        "symbol": meta.get("symbol", symbol),
        "name": meta.get("shortName", meta.get("longName", symbol)),
        "price": round(float(meta.get("regularMarketPrice", 0)), 2),
        "high52w": round(float(meta.get("fiftyTwoWeekHigh", 0)), 2),
        "low52w": round(float(meta.get("fiftyTwoWeekLow", 0)), 2),
        "dayChange": round(
            (float(meta.get("regularMarketPrice", 0)) - float(meta.get("chartPreviousClose", meta.get("previousClose", 0))))
            / max(float(meta.get("chartPreviousClose", meta.get("previousClose", 1))), 0.01)
            * 100, 4
        ),
    }


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("quotes/nasdaq50.json")

    print(f"[nasdaq50] Fetching {len(NASDAQ_TOP_50)} symbols…")
    snapshot: list[dict] = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_one, sym): sym for sym in NASDAQ_TOP_50}
        for future in as_completed(futures):
            result = future.result()
            if result:
                snapshot.append(result)

    snapshot.sort(key=lambda s: s["symbol"])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    now = datetime.now(tz=ZoneInfo("UTC")).isoformat()
    print(f"[nasdaq50] Wrote {len(snapshot)}/{len(NASDAQ_TOP_50)} quotes → {out_path}")
    print(f"[nasdaq50] Updated at {now}")


if __name__ == "__main__":
    main()
