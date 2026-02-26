"""
Per-session behavior data and student summary.
Active: reading, writing, looking_board/looking_at_board, hand_raising
Inactive: sleeping, mobile_use, looking_away
"""
from collections import defaultdict

from flask import Blueprint, request, jsonify

from models import db, Session, BehaviorLog
from auth_utils import require_auth, get_current_user

bp = Blueprint("behaviors", __name__)

ACTIVE_BEHAVIORS = {"reading", "writing", "looking_board", "looking_at_board", "hand_raising"}
INACTIVE_BEHAVIORS = {"sleeping", "mobile_use", "looking_away"}


def _is_active(behavior):
    b = (behavior or "").strip().lower()
    return b in ACTIVE_BEHAVIORS


def _is_inactive(behavior):
    b = (behavior or "").strip().lower()
    return b in INACTIVE_BEHAVIORS


def _session_scope_ok(session_obj, user):
    if user.role in ("admin", "management"):
        return True
    return session_obj.teacher_id == user.id


@bp.route("/<int:session_id>/behaviors", methods=["GET"])
@require_auth
def list_session_behaviors(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return jsonify({"detail": "Session not found"}), 404
    if not _session_scope_ok(s, user):
        return jsonify({"detail": "Forbidden"}), 403

    student_name = (request.args.get("student_name") or "").strip() or None
    behavior = (request.args.get("behavior") or "").strip() or None
    from_time = request.args.get("from_time_sec", type=float)
    to_time = request.args.get("to_time_sec", type=float)
    try:
        limit = min(1000, max(1, int(request.args.get("limit", 100))))
    except (TypeError, ValueError):
        limit = 100

    q = BehaviorLog.query.filter_by(session_id=session_id)
    if student_name:
        q = q.filter_by(student_name=student_name)
    if behavior:
        q = q.filter_by(behavior=behavior)
    if from_time is not None:
        q = q.filter(BehaviorLog.time_sec >= from_time)
    if to_time is not None:
        q = q.filter(BehaviorLog.time_sec <= to_time)
    q = q.order_by(BehaviorLog.time_sec)
    items = q.limit(limit).all()
    return jsonify([x.to_dict() for x in items]), 200


@bp.route("/<int:session_id>/behaviors", methods=["POST"])
@require_auth
def ingest_behaviors(session_id):
    """Bulk ingest behavior records (e.g. after pipeline run). Body: list of { student_name, behavior, confidence, time_sec, duration_sec?, frame? }."""
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return jsonify({"detail": "Session not found"}), 404
    if not _session_scope_ok(s, user):
        return jsonify({"detail": "Forbidden"}), 403
    body = request.get_json(silent=True)
    if not isinstance(body, list):
        return jsonify({"detail": "Body must be a list of behavior records"}), 400
    created = 0
    for row in body:
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


@bp.route("/<int:session_id>/students/summary", methods=["GET"])
@require_auth
def session_students_summary(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return jsonify({"detail": "Session not found"}), 404
    if not _session_scope_ok(s, user):
        return jsonify({"detail": "Forbidden"}), 403

    logs = BehaviorLog.query.filter_by(session_id=session_id).all()
    by_student = defaultdict(lambda: {"active_sec": 0.0, "inactive_sec": 0.0, "behaviors": defaultdict(float)})
    for log in logs:
        dur = float(log.duration_sec or 0)
        if dur <= 0:
            continue
        name = log.student_name or "Unknown"
        b = (log.behavior or "").strip().lower()
        if _is_active(log.behavior):
            by_student[name]["active_sec"] += dur
        elif _is_inactive(log.behavior):
            by_student[name]["inactive_sec"] += dur
        by_student[name]["behaviors"][log.behavior] = by_student[name]["behaviors"].get(log.behavior, 0) + dur

    out = []
    for student_name, data in by_student.items():
        total = data["active_sec"] + data["inactive_sec"]
        if total <= 0:
            active_ratio = 0.0
            inactive_ratio = 0.0
        else:
            active_ratio = data["active_sec"] / total
            inactive_ratio = data["inactive_sec"] / total
        out.append({
            "student_name": student_name,
            "active_ratio": round(active_ratio, 4),
            "inactive_ratio": round(inactive_ratio, 4),
            "total_duration_sec": round(total, 1),
            "behaviors": dict(data["behaviors"]),
        })
    return jsonify(out), 200
