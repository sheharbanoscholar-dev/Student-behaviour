"""
Export: session CSV, behaviors CSV.
"""
from pathlib import Path
import csv
import io

from flask import Blueprint, Response

from models import db, Session, BehaviorLog
from auth_utils import require_auth, get_current_user, require_role

bp = Blueprint("export", __name__, url_prefix="/export")


def _session_scope_ok(session_obj, user):
    if user.role in ("admin", "management"):
        return True
    return session_obj.teacher_id == user.id


@bp.route("/sessions/<int:session_id>/csv", methods=["GET"])
@require_auth
@require_role("admin", "management", "teacher")
def export_session_csv(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s or not _session_scope_ok(s, user):
        return Response('{"detail":"Session not found"}', status=404, mimetype="application/json")
    logs = BehaviorLog.query.filter_by(session_id=session_id).order_by(BehaviorLog.time_sec).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["session_id", "frame", "time_sec", "student_name", "behavior", "confidence", "duration_sec"])
    for log in logs:
        writer.writerow([
            log.session_id,
            log.frame or "",
            log.time_sec,
            log.student_name,
            log.behavior,
            log.confidence or "",
            log.duration_sec or "",
        ])
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=session_{session_id}_metrics.csv"},
    )


@bp.route("/sessions/<int:session_id>/behaviors/csv", methods=["GET"])
@require_auth
def export_session_behaviors_csv(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s or not _session_scope_ok(s, user):
        return Response('{"detail":"Session not found"}', status=404, mimetype="application/json")
    logs = BehaviorLog.query.filter_by(session_id=session_id).order_by(BehaviorLog.time_sec).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["frame", "time_sec", "student_name", "behavior", "confidence", "duration_sec"])
    for log in logs:
        writer.writerow([
            log.frame or "",
            log.time_sec,
            log.student_name,
            log.behavior,
            log.confidence or "",
            log.duration_sec or "",
        ])
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=session_{session_id}_behaviors.csv"},
    )
