#!/usr/bin/env python3
"""Parse Yahoo Finance chart JSON and write a static quote snapshot for GitHub Pages."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def _read_input(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: update_quote.py <yahoo-json-path> <out-json-path>", file=sys.stderr)
        raise SystemExit(2)

    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    body = _read_input(in_path)
    result = body.get("chart", {}).get("result")
    if not result:
        raise SystemExit("Yahoo payload missing chart.result")

    meta = result[0].get("meta") or {}
    price = meta.get("regularMarketPrice")
    if price is None:
        raise SystemExit("Yahoo payload missing regularMarketPrice")

    latest_price = float(price)
    prev_raw = meta.get("chartPreviousClose", meta.get("previousClose", latest_price))
    previous_close = float(prev_raw)
    change_percent = (latest_price - previous_close) / previous_close * 100.0

    rm_time = meta.get("regularMarketTime")
    if isinstance(rm_time, int):
        ny_dt = datetime.fromtimestamp(rm_time, tz=ZoneInfo("America/New_York"))
        cn_dt = ny_dt.astimezone(ZoneInfo("Asia/Shanghai"))
        ny_display = ny_dt.strftime("%Y-%m-%d %H:%M %Z")
        cn_display = cn_dt.strftime("%Y-%m-%d %H:%M %Z")
    else:
        ny_display = ""
        cn_display = ""

    snapshot = {
        "symbol": str(meta.get("symbol", "SPY")),
        "source": "yahoo",
        "updatedAt": datetime.now(tz=ZoneInfo("UTC")).isoformat(),
        "latestPrice": round(latest_price, 2),
        "previousClose": round(previous_close, 2),
        "changePercent": round(change_percent, 4),
        "regularMarketTime": rm_time,
        "displayNy": ny_display,
        "displayCn": cn_display,
        "note": "由 GitHub Actions 在部署前拉取并写入；非浏览器直连行情源。",
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
