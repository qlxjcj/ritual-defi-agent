#!/usr/bin/env python3
"""New-listing watcher for Binance Alpha.

Polls the Binance Alpha token list API, detects newly-listed tokens not
seen before, and runs alert_agent.py for each. State (seen CAs) is kept
in a JSON file so restarting the watcher does not re-fire old listings.

Usage:
  python3 watcher.py [--interval 300] [--state state.json]
  python3 watcher.py --once          # single poll, no loop
  python3 watcher.py --backfill      # treat every current listing as new
"""

import argparse
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ALPHA_LIST_URL = (
    "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/"
    "wallet/cex/alpha/all/token/list"
)
WATCHER_DIR = Path(__file__).resolve().parent
ALERT_AGENT = WATCHER_DIR / "alert_agent.py"


def fetch_alpha_list():
    req = urllib.request.Request(ALPHA_LIST_URL, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        doc = json.loads(resp.read().decode("utf-8"))
    data = doc.get("data") or []
    out = []
    for entry in data:
        ca = (entry.get("contractAddress") or "").lower()
        if not ca:
            continue
        out.append({
            "ca": ca,
            "symbol": entry.get("symbol") or entry.get("tokenSymbol") or "?",
            "name": entry.get("name") or entry.get("tokenName") or "?",
            "chain": entry.get("chainId") or entry.get("network") or "?",
            "listing_time": entry.get("listingTime"),
            "price": entry.get("price"),
        })
    return out


def load_state(path):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"seen": {}}


def save_state(path, state):
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2),
                    encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--backfill", action="store_true")
    ap.add_argument("--interval", type=int, default=300)
    ap.add_argument("--state", default=str(WATCHER_DIR / "watcher_state.json"))
    ap.add_argument("--webhook", default=None,
                    help="DAHYTA webhook URL (overrides env)")
    ap.add_argument("--token", default=None,
                    help="DAHYTA webhook bearer token (overrides env)")
    args = ap.parse_args()

    state = load_state(Path(args.state))
    while True:
        try:
            listings = fetch_alpha_list()
        except Exception as e:
            print(f"[watcher] fetch failed: {e}", file=sys.stderr)
            if args.once:
                return 1
            time.sleep(args.interval)
            continue

        new = [l for l in listings if l["ca"] not in state["seen"]]
        for listing in new:
            state["seen"][listing["ca"]] = {
                "symbol": listing["symbol"],
                "listed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "listing_time": listing["listing_time"],
            }

        if args.backfill:
            new = listings

        print(f"[watcher] {len(listings)} listings, {len(new)} new",
              file=sys.stderr)
        for listing in new:
            print(f"[watcher] NEW {listing['symbol']} "
                  f"{listing['ca'][:10]}... chain={listing['chain']}",
                  file=sys.stderr)
            if not args.backfill:
                continue
            cmd = [sys.executable, str(ALERT_AGENT), listing["ca"]]
            if args.webhook:
                cmd += ["--webhook", args.webhook]
            if args.token:
                cmd += ["--token", args.token]
            subprocess.run(cmd)

        save_state(Path(args.state), state)
        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
