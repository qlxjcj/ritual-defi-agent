#!/usr/bin/env python3
"""Glue script: run forensic pipeline -> judge alert -> POST to DAHYTA webhook.

Usage:
  python3 alert_agent.py <0xCA> [--webhook URL] [--token TOK] [--lang zh|en]

Alert conditions (all thresholds configurable via env / --max-* flags):
  - verdict.enum == EXIT_IF_HOLDING        (pipeline's own downgrade signal)
  - quiet wallets exist and hold >= QUIET_AMT tokens total
  - >= MIN_72H_EVENTS large transfers in the last 72h wave
  - cex dispatch confirmed (dumper destinations hit CEX hot wallets)
If nothing fires, no webhook POST is made (event_id still logged).
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from uuid import uuid4

PIPELINE = Path(__file__).resolve().parent / "v06" / "forensic_pipeline.py"

# Default alert thresholds
DEFAULTS = {
    "quiet_token_threshold": 5_000_000,
    "min_72h_events": 3,
    "cex_dispatch_alert": True,
}


def deep_get(data, path):
    cur = data
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit():
            cur = cur[int(part)]
        else:
            return None
    return cur


def run_pipeline(ca, lang, out_dir):
    cmd = [sys.executable, str(PIPELINE), ca, "--lang", lang, "--out",
           str(out_dir / "skeleton.json")]
    print(f"[pipeline] {' '.join(cmd)}", file=sys.stderr)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print("[pipeline] FAILED\n--- stderr ---\n" + proc.stderr,
              file=sys.stderr)
        sys.exit(1)
    return out_dir / "skeleton.json"


def judge(sk, thresholds):
    verdict_enum = deep_get(sk, "verdict.enum")
    m6_rows = deep_get(sk, "lineage.m6.rows") or []
    n_quiet = deep_get(sk, "lineage.m6.n_quiet") or 0
    quiet_rows = [r for r in m6_rows if (r.get("dumped_pct") or 0) == 0]
    quiet_total = sum(r.get("current_balance") or 0 for r in quiet_rows)

    waves = deep_get(sk, "anomaly.waves") or []
    wave_72h = [w for w in waves if "72h" in (w.get("ts_range") or "")
                or "72" in (w.get("title") or "")]
    recent_events = sum(len(w.get("events") or []) for w in wave_72h)

    dumps = deep_get(sk, "lineage.dumper_destinations_summary") or ""
    cex_hit = thresholds["cex_dispatch_alert"] and isinstance(dumps, str) \
        and ("CEX" in dumps or "Binance" in dumps or "派发" in dumps)

    signals = []
    if verdict_enum == "EXIT_IF_HOLDING":
        signals.append("EXIT_IF_HOLDING")
    if quiet_total >= thresholds["quiet_token_threshold"]:
        signals.append(f"quiet_wallets={quiet_total:,}")
    if recent_events >= thresholds["min_72h_events"]:
        signals.append(f"72h_events={recent_events}")
    if cex_hit:
        signals.append("cex_dispatch")

    risk = 0
    if "EXIT_IF_HOLDING" in signals:
        risk = 90
    elif signals:
        risk = 60
    action_required = "alert" if signals else "none"

    payload = {
        "quiet_wallet_pct": round(quiet_total / max(deep_get(sk, "meta.total_supply") or 1, 1) * 100, 2),
        "large_transfer_72h": recent_events >= thresholds["min_72h_events"],
        "cex_dispatch_confirmed": cex_hit,
        "risk_score": risk,
        "confidence": 0.8,
    }
    return {
        "signals": signals,
        "payload": payload,
        "action_required": action_required,
        "verdict_enum": verdict_enum,
    }


def build_event(sk, judge_out, version="v06"):
    meta = deep_get(sk, "meta") or {}
    evidence = deep_get(sk, "evidence_graph") or {}
    evt = {
        "event_id": str(uuid4()),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pipeline_version": version,
        "analysis_type": "new_listing",
        "payload": {
            "locked": {
                "token_address": meta.get("contract_address"),
                "token_name": meta.get("name") or meta.get("symbol"),
                "chain": meta.get("chain"),
                "verdict_enum": judge_out.get("verdict_enum"),
            },
            "writable": judge_out["payload"],
            "evidence_graph": {
                "nodes": evidence.get("nodes") or [],
                "edges": evidence.get("edges") or [],
            },
        },
        "action_required": judge_out["action_required"],
        "action_detail": ("signals: " + ", ".join(judge_out["signals"])
                          if judge_out["signals"] else None),
    }
    return evt


def post_webhook(url, token, evt):
    body = json.dumps(evt).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except Exception as e:
        return None, str(e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ca")
    ap.add_argument("--webhook", default=os.environ.get("DAHYTA_WEBHOOK"))
    ap.add_argument("--token", default=os.environ.get("DAHYTA_TOKEN"))
    ap.add_argument("--lang", default="zh")
    ap.add_argument("--quiet-token-threshold", type=float,
                    default=DEFAULTS["quiet_token_threshold"])
    ap.add_argument("--min-72h-events", type=int,
                    default=DEFAULTS["min_72h_events"])
    ap.add_argument("--no-cex-alert", action="store_true")
    args = ap.parse_args()

    thresholds = {
        "quiet_token_threshold": args.quiet_token_threshold,
        "min_72h_events": args.min_72h_events,
        "cex_dispatch_alert": not args.no_cex_alert,
    }

    with tempfile.TemporaryDirectory() as tmp:
        skeleton = run_pipeline(args.ca, args.lang, Path(tmp))
        sk = json.loads(skeleton.read_text(encoding="utf-8"))
        result = judge(sk, thresholds)
        print(json.dumps({"signals": result["signals"],
                          "risk_score": result["payload"]["risk_score"],
                          "action_required": result["action_required"]},
                         ensure_ascii=False))

        if result["action_required"] == "none":
            print("[alert] no signals, skipped webhook", file=sys.stderr)
            return 0

        evt = build_event(sk, result)
        if not args.webhook or not args.token:
            print("[alert] signals fired but no webhook/token configured; "
                  "event saved to last_event.json", file=sys.stderr)
            Path("last_event.json").write_text(
                json.dumps(evt, ensure_ascii=False, indent=2), encoding="utf-8")
            return 2

        status, resp = post_webhook(args.webhook, args.token, evt)
        print(f"[alert] POST -> {status} {resp[:200]}", file=sys.stderr)
        return 0 if status == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
