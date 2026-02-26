"""
Dashboard & analytics: session metrics, summary, key-moments, overall, students, teachers, classrooms, trends, alerts.
"""
from collections import defaultdict
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify

from models import db, Session, BehaviorLog, User, Classroom, Mapping, Subject

from auth_utils import require_auth, get_current_user

bp = Blueprint("analytics", __name__, url_prefix="/analytics")

ACTIVE_BEHAVIORS = {"reading", "writing", "looking_board", "looking_at_board", "hand_raising"}
INACTIVE_BEHAVIORS = {"sleeping", "mobile_use", "looking_away"}


def _is_active(b):
    return (b or "").strip().lower() in ACTIVE_BEHAVIORS


def _is_inactive(b):
    return (b or "").strip().lower() in INACTIVE_BEHAVIORS


def _session_scope_ok(session_obj, user):
    if user.role in ("admin", "management"):
        return True
    if session_obj.teacher_id == user.id:
        return True
    if session_obj.mapping_id and session_obj.mapping and session_obj.mapping.teacher_id == user.id:
        return True
    return False


def _sessions_query(user, session_id=None, classroom_id=None, teacher_id=None, from_date=None, to_date=None):
    q = Session.query
    if user.role not in ("admin", "management"):
        q = q.outerjoin(Mapping, Session.mapping_id == Mapping.id).filter(
            db.or_(
                Session.teacher_id == user.id,
                db.and_(
                    Session.mapping_id.isnot(None),
                    Mapping.teacher_id == user.id,
                ),
            )
        )
    if session_id is not None:
        q = q.filter_by(id=session_id)
    if classroom_id is not None:
        q = q.filter_by(classroom_id=classroom_id)
    if teacher_id is not None:
        q = q.filter_by(teacher_id=teacher_id)
    if from_date is not None:
        q = q.filter(Session.created_at >= from_date)
    if to_date is not None:
        q = q.filter(Session.created_at <= to_date)
    return q


def _parse_dates():
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    fd = None
    td = None
    if from_date:
        try:
            fd = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        except Exception:
            pass
    if to_date:
        try:
            td = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
        except Exception:
            pass
    return fd, td


def _session_minutes_from_logs(session, logs):
    """Return session duration in minutes. Uses session.duration_seconds if set, else derives from behavior logs (recorded sessions often have duration_seconds=None)."""
    if session.duration_seconds and session.duration_seconds > 0:
        return session.duration_seconds / 60.0
    if not logs:
        return 0.0
    end_sec = max((log.time_sec or 0) + float(log.duration_sec or 0) for log in logs)
    return end_sec / 60.0


# ----- Session-level -----

@bp.route("/sessions/<int:session_id>/metrics", methods=["GET"])
@require_auth
def session_metrics(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s or not _session_scope_ok(s, user):
        return jsonify({"detail": "Session not found"}), 404
    limit = min(500, max(1, int(request.args.get("limit", 60))))
    logs = BehaviorLog.query.filter_by(session_id=session_id).order_by(BehaviorLog.time_sec).all()
    by_minute = defaultdict(lambda: {"active": 0, "inactive": 0, "mobile_use": 0, "total": 0})
    for log in logs:
        dur = float(log.duration_sec or 0)
        if dur <= 0:
            continue
        minute_index = int(log.time_sec // 60)
        by_minute[minute_index]["total"] += dur
        if _is_active(log.behavior):
            by_minute[minute_index]["active"] += dur
        elif _is_inactive(log.behavior):
            by_minute[minute_index]["inactive"] += dur
            if (log.behavior or "").strip().lower() == "mobile_use":
                by_minute[minute_index]["mobile_use"] += dur
    out = []
    for mi in sorted(by_minute.keys())[:limit]:
        d = by_minute[mi]
        total = d["total"]
        if total <= 0:
            ar, ir, mr = 0, 0, 0
        else:
            ar = d["active"] / total
            ir = d["inactive"] / total
            mr = d["mobile_use"] / total
        engagement = ar  # simple: engagement = active ratio
        out.append({
            "session_id": session_id,
            "minute_index": mi,
            "timestamp": mi * 60,
            "total_detections": total,
            "attentive_count": d["active"],
            "inactive_count": d["inactive"],
            "mobile_use_count": d["mobile_use"],
            "attentive_ratio": round(ar, 4),
            "inactive_ratio": round(ir, 4),
            "mobile_use_ratio": round(mr, 4),
            "engagement_score": round(engagement, 4),
        })
    return jsonify(out), 200


@bp.route("/sessions/<int:session_id>/summary", methods=["GET"])
@require_auth
def session_summary(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s or not _session_scope_ok(s, user):
        return jsonify({"detail": "Session not found"}), 404
    logs = BehaviorLog.query.filter_by(session_id=session_id).order_by(BehaviorLog.time_sec).all()
    by_minute = defaultdict(lambda: {"active": 0, "inactive": 0, "mobile_use": 0})
    for log in logs:
        dur = float(log.duration_sec or 0)
        if dur <= 0:
            continue
        mi = int(log.time_sec // 60)
        if _is_active(log.behavior):
            by_minute[mi]["active"] += dur
        elif _is_inactive(log.behavior):
            by_minute[mi]["inactive"] += dur
            if (log.behavior or "").strip().lower() == "mobile_use":
                by_minute[mi]["mobile_use"] += dur
    total_minutes = len(by_minute) or 1
    total_active = sum(d["active"] for d in by_minute.values())
    total_inactive = sum(d["inactive"] for d in by_minute.values())
    total_mobile = sum(d["mobile_use"] for d in by_minute.values())
    total_sec = total_active + total_inactive
    if total_sec <= 0:
        avg_engagement = 0
        avg_attentive = 0
        avg_inactive = 0
        avg_mobile = 0
    else:
        avg_engagement = total_active / total_sec
        avg_attentive = total_active / total_sec
        avg_inactive = total_inactive / total_sec
        avg_mobile = total_mobile / total_sec
    # Build timeline for charts: one row per minute with engagement/ratios
    timeline = []
    engagement_scores = []
    for mi in sorted(by_minute.keys()):
        d = by_minute[mi]
        total = d["active"] + d["inactive"]
        if total <= 0:
            ar, ir, mr = 0, 0, 0
        else:
            ar = d["active"] / total
            ir = d["inactive"] / total
            mr = d["mobile_use"] / total
        engagement_scores.append(ar)
        timeline.append({
            "minute": mi,
            "engagement_score": round(ar, 4),
            "attentive_ratio": round(ar, 4),
            "inactive_ratio": round(ir, 4),
            "mobile_use_ratio": round(mr, 4),
        })
    # Simple engagement drops: consecutive minutes where score drops by at least 0.2
    engagement_drops_count = 0
    for i in range(1, len(engagement_scores)):
        if engagement_scores[i] < engagement_scores[i - 1] - 0.2:
            engagement_drops_count += 1
    return jsonify({
        "id": session_id,
        "session_id": session_id,
        "total_minutes": total_minutes,
        "avg_engagement_score": round(avg_engagement, 4),
        "max_engagement_score": round(max(engagement_scores), 4) if engagement_scores else 0,
        "min_engagement_score": round(min(engagement_scores), 4) if engagement_scores else 0,
        "avg_attentive_ratio": round(avg_attentive, 4),
        "avg_inactive_ratio": round(avg_inactive, 4),
        "avg_mobile_use_ratio": round(avg_mobile, 4),
        "total_key_moments": 0,
        "engagement_drops_count": engagement_drops_count,
        "mobile_use_spikes_count": 0,
        "high_engagement_count": sum(1 for e in engagement_scores if e >= 0.7),
        "timeline": timeline,
    }), 200


@bp.route("/sessions/<int:session_id>/key-moments", methods=["GET"])
@require_auth
def session_key_moments(session_id):
    from sqlalchemy.orm import joinedload
    user = get_current_user()
    s = Session.query.options(joinedload(Session.mapping)).filter_by(id=session_id).first()
    if not s:
        return jsonify({"detail": "Session not found"}), 404
    # Same access as session detail: creator or assigned via mapping (admin/management see all)
    if not _session_scope_ok(s, user):
        return jsonify({"detail": "Forbidden"}), 403
    moment_type = (request.args.get("moment_type") or "").strip() or None
    severity = (request.args.get("severity") or "").strip() or None
    # Placeholder: could derive from metrics (drops/spikes)
    return jsonify([]), 200


# ----- Dashboard -----

@bp.route("/dashboard/overall", methods=["GET"])
@require_auth
def dashboard_overall():
    user = get_current_user()
    session_id = request.args.get("session_id", type=int)
    classroom_id = request.args.get("classroom_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)
    from_date, to_date = _parse_dates()

    q = _sessions_query(user, session_id=session_id, classroom_id=classroom_id, teacher_id=teacher_id, from_date=from_date, to_date=to_date)
    sessions = q.all()
    total_active = 0.0
    total_inactive = 0.0
    total_minutes = 0.0
    for s in sessions:
        logs = BehaviorLog.query.filter_by(session_id=s.id).all()
        total_minutes += _session_minutes_from_logs(s, logs)
        for log in logs:
            dur = float(log.duration_sec or 0)
            if dur <= 0:
                continue
            if _is_active(log.behavior):
                total_active += dur
            elif _is_inactive(log.behavior):
                total_inactive += dur
    total = total_active + total_inactive
    if total <= 0:
        engagement_pct = 0
        active_ratio = 0
        inactive_ratio = 0
    else:
        engagement_pct = 100 * total_active / total
        active_ratio = total_active / total
        inactive_ratio = total_inactive / total
    period = "session" if session_id else ("class" if classroom_id else ("teacher" if teacher_id else "global"))
    return jsonify({
        "engagement_percentage": round(engagement_pct, 2),
        "active_ratio": round(active_ratio, 4),
        "inactive_ratio": round(inactive_ratio, 4),
        "total_sessions": len(sessions),
        "total_minutes": round(total_minutes, 1),
        "period": period,
    }), 200


@bp.route("/dashboard/students", methods=["GET"])
@require_auth
def dashboard_students():
    user = get_current_user()
    session_id = request.args.get("session_id", type=int)
    classroom_id = request.args.get("classroom_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)
    from_date, to_date = _parse_dates()
    limit = min(200, max(1, int(request.args.get("limit", 50))))
    q = _sessions_query(user, session_id=session_id, classroom_id=classroom_id, teacher_id=teacher_id, from_date=from_date, to_date=to_date)
    session_ids = [s.id for s in q.all()]
    if not session_ids:
        return jsonify([]), 200
    logs = BehaviorLog.query.filter(BehaviorLog.session_id.in_(session_ids)).all()
    by_student = defaultdict(lambda: {"active": 0, "inactive": 0, "behaviors": defaultdict(float), "session_ids": set()})
    for log in logs:
        dur = float(log.duration_sec or 0)
        if dur <= 0:
            continue
        name = log.student_name or "Unknown"
        by_student[name]["session_ids"].add(log.session_id)
        if _is_active(log.behavior):
            by_student[name]["active"] += dur
        elif _is_inactive(log.behavior):
            by_student[name]["inactive"] += dur
        by_student[name]["behaviors"][log.behavior] = by_student[name]["behaviors"].get(log.behavior, 0) + dur
    out = []
    for name, data in list(by_student.items())[:limit]:
        total = data["active"] + data["inactive"]
        if total <= 0:
            ar, ir = 0, 0
        else:
            ar = data["active"] / total
            ir = data["inactive"] / total
        out.append({
            "student_name": name,
            "session_id": list(data["session_ids"])[0] if len(data["session_ids"]) == 1 else None,
            "classroom_id": None,
            "teacher_id": None,
            "active_ratio": round(ar, 4),
            "inactive_ratio": round(ir, 4),
            "engagement_score": round(ar, 4),
            "total_duration_sec": round(total, 1),
            "behaviors_breakdown": dict(data["behaviors"]),
        })
    return jsonify(out), 200


@bp.route("/dashboard/subjects", methods=["GET"])
@require_auth
def dashboard_subjects():
    """Subject-wise interaction: aggregate engagement by subject (from sessions with subject_id / mapping)."""
    user = get_current_user()
    subject_id = request.args.get("subject_id", type=int)
    from_date, to_date = _parse_dates()
    limit = min(100, max(1, int(request.args.get("limit", 20))))
    q = Session.query.filter(Session.subject_id.isnot(None))
    if user.role not in ("admin", "management"):
        q = q.outerjoin(Mapping, Session.mapping_id == Mapping.id).filter(
            db.or_(
                Session.teacher_id == user.id,
                db.and_(
                    Session.mapping_id.isnot(None),
                    Mapping.teacher_id == user.id,
                ),
            )
        )
    if subject_id is not None:
        q = q.filter_by(subject_id=subject_id)
    if from_date:
        q = q.filter(Session.created_at >= from_date)
    if to_date:
        q = q.filter(Session.created_at <= to_date)
    sessions = q.all()
    by_subject = defaultdict(lambda: {"active": 0, "inactive": 0, "sessions": 0, "minutes": 0})
    for s in sessions:
        sid = s.subject_id
        logs = BehaviorLog.query.filter_by(session_id=s.id).all()
        by_subject[sid]["sessions"] += 1
        by_subject[sid]["minutes"] += _session_minutes_from_logs(s, logs)
        for log in logs:
            dur = float(log.duration_sec or 0)
            if dur <= 0:
                continue
            if _is_active(log.behavior):
                by_subject[sid]["active"] += dur
            elif _is_inactive(log.behavior):
                by_subject[sid]["inactive"] += dur
    out = []
    for sid, data in list(by_subject.items())[:limit]:
        subj = db.session.get(Subject, sid)
        total = data["active"] + data["inactive"]
        if total <= 0:
            ar, ir = 0, 0
        else:
            ar = data["active"] / total
            ir = data["inactive"] / total
        out.append({
            "subject_id": sid,
            "subject_name": (subj.name if subj else str(sid)),
            "sessions_count": data["sessions"],
            "avg_engagement_score": round(ar, 4),
            "avg_active_ratio": round(ar, 4),
            "avg_inactive_ratio": round(ir, 4),
            "total_minutes": round(data["minutes"], 1),
        })
    return jsonify(out), 200


@bp.route("/dashboard/teachers", methods=["GET"])
@require_auth
def dashboard_teachers():
    user = get_current_user()
    teacher_id = request.args.get("teacher_id", type=int)
    classroom_id = request.args.get("classroom_id", type=int)
    from_date, to_date = _parse_dates()
    limit = min(100, max(1, int(request.args.get("limit", 20))))
    q = Session.query
    if user.role not in ("admin", "management"):
        q = q.filter_by(teacher_id=user.id)
    if teacher_id is not None:
        q = q.filter_by(teacher_id=teacher_id)
    if classroom_id is not None:
        q = q.filter_by(classroom_id=classroom_id)
    if from_date:
        q = q.filter(Session.created_at >= from_date)
    if to_date:
        q = q.filter(Session.created_at <= to_date)
    sessions = q.all()
    by_teacher = defaultdict(lambda: {"active": 0, "inactive": 0, "sessions": 0, "minutes": 0})
    for s in sessions:
        logs = BehaviorLog.query.filter_by(session_id=s.id).all()
        by_teacher[s.teacher_id]["sessions"] += 1
        by_teacher[s.teacher_id]["minutes"] += _session_minutes_from_logs(s, logs)
        for log in logs:
            dur = float(log.duration_sec or 0)
            if dur <= 0:
                continue
            if _is_active(log.behavior):
                by_teacher[s.teacher_id]["active"] += dur
            elif _is_inactive(log.behavior):
                by_teacher[s.teacher_id]["inactive"] += dur
    out = []
    for tid, data in list(by_teacher.items())[:limit]:
        u = db.session.get(User, tid)
        total = data["active"] + data["inactive"]
        if total <= 0:
            ar, ir = 0, 0
        else:
            ar = data["active"] / total
            ir = data["inactive"] / total
        out.append({
            "teacher_id": tid,
            "teacher_name": (u.full_name or u.email) if u else str(tid),
            "sessions_count": data["sessions"],
            "avg_engagement_score": round(ar, 4),
            "avg_active_ratio": round(ar, 4),
            "avg_inactive_ratio": round(ir, 4),
            "total_minutes": round(data["minutes"], 1),
        })
    return jsonify(out), 200


@bp.route("/dashboard/classrooms", methods=["GET"])
@require_auth
def dashboard_classrooms():
    user = get_current_user()
    classroom_id = request.args.get("classroom_id", type=int)
    from_date, to_date = _parse_dates()
    limit = min(100, max(1, int(request.args.get("limit", 20))))
    q = Session.query.filter(Session.classroom_id.isnot(None))
    if user.role not in ("admin", "management"):
        q = q.filter_by(teacher_id=user.id)
    if classroom_id is not None:
        q = q.filter_by(classroom_id=classroom_id)
    if from_date:
        q = q.filter(Session.created_at >= from_date)
    if to_date:
        q = q.filter(Session.created_at <= to_date)
    sessions = q.all()
    by_class = defaultdict(lambda: {"active": 0, "inactive": 0, "sessions": 0, "minutes": 0, "students": set()})
    for s in sessions:
        cid = s.classroom_id
        logs = BehaviorLog.query.filter_by(session_id=s.id).all()
        by_class[cid]["sessions"] += 1
        by_class[cid]["minutes"] += _session_minutes_from_logs(s, logs)
        for log in logs:
            by_class[cid]["students"].add(log.student_name or "Unknown")
            dur = float(log.duration_sec or 0)
            if dur <= 0:
                continue
            if _is_active(log.behavior):
                by_class[cid]["active"] += dur
            elif _is_inactive(log.behavior):
                by_class[cid]["inactive"] += dur
    out = []
    for cid, data in list(by_class.items())[:limit]:
        room = db.session.get(Classroom, cid)
        total = data["active"] + data["inactive"]
        if total <= 0:
            ar, ir = 0, 0
        else:
            ar = data["active"] / total
            ir = data["inactive"] / total
        out.append({
            "classroom_id": cid,
            "classroom_name": (room.name if room else str(cid)),
            "sessions_count": data["sessions"],
            "avg_engagement_score": round(ar, 4),
            "avg_active_ratio": round(ar, 4),
            "avg_inactive_ratio": round(ir, 4),
            "total_minutes": round(data["minutes"], 1),
            "students_count": len(data["students"]),
        })
    return jsonify(out), 200


@bp.route("/dashboard/trends", methods=["GET"])
@require_auth
def dashboard_trends():
    user = get_current_user()
    session_id = request.args.get("session_id", type=int)
    classroom_id = request.args.get("classroom_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)
    from_date, to_date = _parse_dates()
    granularity = (request.args.get("granularity") or "minute").strip().lower()
    if granularity not in ("minute", "hour", "day"):
        granularity = "minute"
    limit = min(500, max(1, int(request.args.get("limit", 60))))
    q = _sessions_query(user, session_id=session_id, classroom_id=classroom_id, teacher_id=teacher_id, from_date=from_date, to_date=to_date)
    sessions = q.all()
    session_ids = [s.id for s in sessions]
    if not session_ids:
        return jsonify([]), 200
    logs = BehaviorLog.query.filter(BehaviorLog.session_id.in_(session_ids)).order_by(BehaviorLog.time_sec).all()
    buckets = defaultdict(lambda: {"active": 0, "inactive": 0})
    for log in logs:
        dur = float(log.duration_sec or 0)
        if dur <= 0:
            continue
        if granularity == "minute":
            key = int(log.time_sec // 60) * 60
        elif granularity == "hour":
            key = int(log.time_sec // 3600) * 3600
        else:
            key = int(log.time_sec // 86400) * 86400
        if _is_active(log.behavior):
            buckets[key]["active"] += dur
        elif _is_inactive(log.behavior):
            buckets[key]["inactive"] += dur
    out = []
    for key in sorted(buckets.keys())[:limit]:
        d = buckets[key]
        total = d["active"] + d["inactive"]
        if total <= 0:
            ar, ir = 0, 0
        else:
            ar = d["active"] / total
            ir = d["inactive"] / total
        out.append({
            "timestamp": key,
            "minute_index": key // 60 if granularity == "minute" else None,
            "date": key,
            "engagement_score": round(ar, 4),
            "active_ratio": round(ar, 4),
            "inactive_ratio": round(ir, 4),
            "sessions_count": None,
        })
    return jsonify(out), 200


@bp.route("/dashboard/alerts", methods=["GET"])
@require_auth
def dashboard_alerts():
    user = get_current_user()
    session_id = request.args.get("session_id", type=int)
    classroom_id = request.args.get("classroom_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)
    from_date, to_date = _parse_dates()
    min_duration_sec = max(0, int(request.args.get("min_duration_sec", 60)))
    severity = (request.args.get("severity") or "").strip() or None
    limit = min(100, max(1, int(request.args.get("limit", 50))))
    q = _sessions_query(user, session_id=session_id, classroom_id=classroom_id, teacher_id=teacher_id, from_date=from_date, to_date=to_date)
    sessions = q.all()
    session_ids = [s.id for s in sessions]
    if not session_ids:
        return jsonify([]), 200
    logs = BehaviorLog.query.filter(
        BehaviorLog.session_id.in_(session_ids),
        BehaviorLog.behavior.in_(list(INACTIVE_BEHAVIORS)),
    ).filter(BehaviorLog.duration_sec >= min_duration_sec).order_by(BehaviorLog.time_sec).all()
    session_map = {s.id: s for s in sessions}
    out = []
    for log in logs[:limit]:
        s = session_map.get(log.session_id)
        out.append({
            "session_id": log.session_id,
            "student_name": log.student_name,
            "behavior": log.behavior,
            "start_time_sec": log.time_sec,
            "duration_sec": log.duration_sec,
            "severity": "medium",
            "session_title": s.title if s else None,
            "classroom_name": (s.classroom.name if s and s.classroom else None),
        })
    return jsonify(out), 200
