#!/usr/bin/env python3
"""
One-time script: import behavior_log.csv into the database so the dashboard shows detections.

Usage (run from the Sheharbano folder, same place as app.py):
    python ingest_session_csv.py 9

This reads uploads/sessions/9/behavior_log.csv and inserts all rows into the database.
Then open http://localhost:3000/app/sessions/9 and you will see the detections in the dashboard.
"""
import csv
import sys
from pathlib import Path

# Add project root so we can import app and models
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app import create_app
from models import db, Session, BehaviorLog

UPLOAD_DIR = BASE_DIR / "uploads" / "sessions"


def safe_float(val, default=None):
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_int(val, default=None):
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def ingest_csv(session_id: int):
    csv_path = UPLOAD_DIR / str(session_id) / "behavior_log.csv"
    if not csv_path.exists():
        print(f"ERROR: File not found: {csv_path}")
        return 0

    # Remove old rows so we don't duplicate
    deleted = BehaviorLog.query.filter_by(session_id=session_id).delete()
    db.session.commit()
    if deleted:
        print(f"Removed {deleted} old rows for session {session_id}.")

    created = 0
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                name = (row.get("student_name") or "").strip()
                behavior = (row.get("behavior") or "").strip()
                if not name or not behavior:
                    continue
                time_sec = safe_float(row.get("time_sec"), 0) or 0
                log = BehaviorLog(
                    session_id=session_id,
                    student_name=name,
                    behavior=behavior,
                    confidence=safe_float(row.get("confidence")),
                    time_sec=time_sec,
                    duration_sec=safe_float(row.get("duration_sec")),
                    frame=safe_int(row.get("frame")),
                )
                db.session.add(log)
                created += 1
                if created % 500 == 0:
                    db.session.commit()
            except (ValueError, KeyError, TypeError):
                continue
    db.session.commit()
    return created


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("Example: python ingest_session_csv.py 9")
        sys.exit(1)

    try:
        session_id = int(sys.argv[1])
    except ValueError:
        print("Session ID must be a number (e.g. 9)")
        sys.exit(1)

    app = create_app()
    with app.app_context():
        session = db.session.get(Session, session_id)
        if not session:
            print(f"ERROR: Session {session_id} not found in database.")
            sys.exit(1)
        created = ingest_csv(session_id)
        # Mark session completed so dashboard shows results
        if session.status not in ("completed", "failed"):
            session.status = "completed"
            session.session_metadata = dict(session.session_metadata or {}, **{"processing_progress": 100})
            db.session.commit()
            print(f"Session {session_id} marked as completed.")
        print(f"Done. Imported {created} detections for session {session_id}.")
        print(f"Open http://localhost:3000/app/sessions/{session_id} to see them in the dashboard.")


if __name__ == "__main__":
    main()
