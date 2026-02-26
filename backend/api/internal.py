"""
Internal API for pipeline worker: update session status and ingest behaviors.
Protected by X-Internal-Secret header (no Bearer token).
"""
import os
from flask import Blueprint, request, jsonify

from models import db, Session, BehaviorLog

bp = Blueprint("internal", __name__, url_prefix="/internal")

VALID_STATUSES = {"draft", "pending_processing", "processing", "ready", "live", "ended", "completed", "failed"}


def _check_secret():
    secret = request.headers.get("X-Internal-Secret", "") or os.environ.get("INTERNAL_SECRET", "")
    expected = os.environ.get("INTERNAL_SECRET", "change-internal-secret")
    return secret and expected and secret == expected


@bp.route("/sessions/<int:session_id>/status", methods=["PATCH"])
def update_session_status(session_id):
    """Pipeline worker: set session status, error_message, and/or metadata (e.g. processing_progress 0-100)."""
    if not _check_secret():
        return jsonify({"detail": "Forbidden"}), 403
    s = db.session.get(Session, session_id)
    if not s:
        return jsonify({"detail": "Session not found"}), 404
    body = request.get_json(silent=True) or {}
    status = (body.get("status") or "").strip()
    if status and status in VALID_STATUSES:
        s.status = status
        base = s.session_metadata or {}
        if status == "processing":
            s.session_metadata = dict(base, processing_progress=0)
        elif status in ("completed", "failed"):
            s.session_metadata = dict(base, processing_progress=100)
    if "error_message" in body:
        s.error_message = body["error_message"]
    # Merge metadata (e.g. processing_progress 0-100 for frontend progress bar)
    if "metadata" in body and isinstance(body["metadata"], dict):
        s.session_metadata = dict((s.session_metadata or {}), **body["metadata"])
    if "processing_progress" in body and isinstance(body["processing_progress"], (int, float)):
        pct = max(0, min(100, int(body["processing_progress"])))
        # Assign new dict so SQLAlchemy marks the column as modified (in-place mutation may not persist)
        s.session_metadata = dict((s.session_metadata or {}), **{"processing_progress": pct})
        try:
            from flask import current_app
            current_app.logger.info("Internal API: session_id=%s processing_progress=%s", session_id, pct)
        except Exception:
            pass
    db.session.commit()
    return jsonify(s.to_dict(nested=False)), 200


@bp.route("/sessions/<int:session_id>/behaviors", methods=["POST"])
def ingest_behaviors(session_id):
    """Pipeline worker: bulk insert behavior records for a session."""
    if not _check_secret():
        return jsonify({"detail": "Forbidden"}), 403
    s = db.session.get(Session, session_id)
    if not s:
        return jsonify({"detail": "Session not found"}), 404
    body = request.get_json(silent=True) or {}
    behaviors = body.get("behaviors")
    if not isinstance(behaviors, list):
        return jsonify({"detail": "behaviors must be an array"}), 400
    created = 0
    for row in behaviors:
        if not isinstance(row, dict):
            continue
        name = (row.get("student_name") or "").strip()
        behavior = (row.get("behavior") or "").strip()
        if not name or not behavior:
            continue
        log = BehaviorLog(
            session_id=session_id,
            student_name=name,
            behavior=behavior,
            confidence=row.get("confidence"),
            time_sec=float(row.get("time_sec", 0)),
            duration_sec=row.get("duration_sec"),
            frame=row.get("frame"),
        )
        db.session.add(log)
        created += 1
    db.session.commit()
    return jsonify({"created": created}), 201
