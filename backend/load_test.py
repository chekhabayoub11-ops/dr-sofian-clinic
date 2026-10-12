"""
Load test: simulate N patients (default 200) booking at the same time.

Each fake patient goes through the same flow as app.js:
  1. POST /api/triage           (FastAPI service)
  2. INSERT into appointments   (Supabase — only with --supabase)

Run (API must be up: uvicorn main:app --port 8000):
    python load_test.py                     # 200 patients, triage only
    python load_test.py -n 500 -c 100       # 500 patients, 100 at a time
    python load_test.py --supabase          # also writes rows to the LIVE database

Rows written with --supabase are tagged so they can be removed later:
    delete from appointments where email like '%@loadtest.example';
"""
from __future__ import annotations

import argparse
import asyncio
import os
import random
import statistics
import time
from collections import Counter
from datetime import date, timedelta

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

FIRST = ["محمد", "أمين", "ياسين", "رضا", "كريم", "فاطمة", "مريم", "سارة", "أمينة", "نور", "خديجة", "إسماعيل"]
LAST = ["بن علي", "بوزيد", "حمدي", "زروقي", "شريف", "بلقاسم", "مراد", "عمراني", "سعيدي", "بوعلام"]
REASONS = ["consult", "gastroscopy", "colonoscopy", "followup"]
SHIFTS = ["morning", "evening"]
SYMPTOMS = [
    "", "انتفاخ خفيف بعد الأكل", "حموضة متكررة", "عندي نزيف هضمي منذ البارحة",
    "صعوبة في البلع منذ شهر", "اصفرار في العينين", "ألم حاد ومفاجئ في البطن",
    "فقدان الوزن بدون سبب", "إمساك مزمن", "douleur intense au ventre",
]


def fake_patient(i: int) -> dict:
    return {
        "full_name": f"{random.choice(FIRST)} {random.choice(LAST)} [TEST]",
        "email": f"patient{i}@loadtest.example",
        "phone": f"05{random.randint(10_000_000, 99_999_999)}",
        "age": random.randint(18, 85),
        "visit_reason": random.choice(REASONS),
        "appointment_date": (date.today() + timedelta(days=random.randint(1, 30))).isoformat(),
        "shift": random.choice(SHIFTS),
        "symptoms": random.choice(SYMPTOMS) or None,
    }


async def book(i: int, client: httpx.AsyncClient, sem: asyncio.Semaphore, args) -> dict:
    p = fake_patient(i)
    result = {"triage_ms": None, "db_ms": None, "urgency": None, "error": None}
    async with sem:
        t0 = time.perf_counter()
        try:
            r = await client.post(f"{args.api}/api/triage", json={
                "symptoms": p["symptoms"] or "", "visit_reason": p["visit_reason"], "age": p["age"],
            })
            r.raise_for_status()
            result["urgency"] = r.json()["urgency"]
        except Exception as e:
            result["error"] = f"triage: {type(e).__name__} {e}"[:120]
            return result
        result["triage_ms"] = (time.perf_counter() - t0) * 1000

        if args.supabase:
            row = {**p, "urgency": result["urgency"], "status": "pending",
                   "reference_code": f"DZ-GASTRO-{random.randint(1000, 9999)}"}
            t1 = time.perf_counter()
            for _ in range(4):  # same duplicate-code retry as app.js
                r = await client.post(f"{SUPABASE_URL}/rest/v1/appointments", json=row, headers={
                    "apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                    "Prefer": "return=minimal",
                })
                if r.status_code == 409 or "23505" in r.text:
                    row["reference_code"] = f"DZ-GASTRO-{random.randint(1000, 9999)}"
                    continue
                break
            if r.status_code >= 300:
                result["error"] = f"supabase {r.status_code}: {r.text}"[:120]
            result["db_ms"] = (time.perf_counter() - t1) * 1000
    return result


def summary(label: str, values: list[float]) -> str:
    if not values:
        return f"{label}: no data"
    v = sorted(values)
    p95 = v[max(0, int(len(v) * 0.95) - 1)]
    return (f"{label}: avg {statistics.mean(v):.0f} ms | median {statistics.median(v):.0f} ms | "
            f"p95 {p95:.0f} ms | max {v[-1]:.0f} ms")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", "--patients", type=int, default=200)
    ap.add_argument("-c", "--concurrency", type=int, default=200, help="patients booking at the same moment")
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--supabase", action="store_true", help="also INSERT rows into the live database")
    args = ap.parse_args()
    if args.supabase and not (SUPABASE_URL and SUPABASE_ANON_KEY):
        ap.error("--supabase requires SUPABASE_URL and SUPABASE_ANON_KEY environment variables")

    print(f"Simulating {args.patients} patients ({args.concurrency} at once)"
          f"{' + Supabase inserts' if args.supabase else ''}…")
    sem = asyncio.Semaphore(args.concurrency)
    limits = httpx.Limits(max_connections=args.concurrency)
    async with httpx.AsyncClient(timeout=30, limits=limits) as client:
        t0 = time.perf_counter()
        results = await asyncio.gather(*(book(i, client, sem, args) for i in range(args.patients)))
        total = time.perf_counter() - t0

    ok = [r for r in results if not r["error"]]
    errors = Counter(r["error"] for r in results if r["error"])
    print(f"\nDone in {total:.2f}s — {len(ok)}/{args.patients} succeeded "
          f"({args.patients / total:.0f} bookings/s)")
    print(summary("Triage  ", [r["triage_ms"] for r in results if r["triage_ms"]]))
    if args.supabase:
        print(summary("Supabase", [r["db_ms"] for r in ok if r["db_ms"]]))
    print("Urgency :", dict(Counter(r["urgency"] for r in ok)))
    if errors:
        print("\nErrors:")
        for msg, count in errors.most_common(5):
            print(f"  {count}× {msg}")


if __name__ == "__main__":
    asyncio.run(main())
