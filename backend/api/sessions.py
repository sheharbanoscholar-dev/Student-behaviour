"""
Sessions: CRUD, video upload, start/stop live.
After upload, runs pipeline in subprocess; progress is read from a file so the UI updates reliably.
"""
import csv
import os
import subprocess
import sys
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app

from models import db, Session, User, Mapping, BehaviorLog
from auth_utils import require_auth, get_current_user, require_role, error_response

bp = Blueprint("sessions", __name__, url_prefix="")

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "sessions"
PIPELINE_SCRIPT = BASE_DIR / "run_pipeline.py"
PROGRESS_FILENAME = "progress.txt"


def _read_progress_file(session_id: int):
    # Returns int 0-100 or None
    """Read progress 0-100 from uploads/sessions/<id>/progress.txt. Returns None if missing/invalid."""
    path = UPLOAD_DIR / str(session_id) / PROGRESS_FILENAME
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8").strip()
        pct = int(raw)
        return max(0, min(100, pct))
    except (ValueError, OSError):
        return None


def _safe_float(val, default=None):
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val, default=None):
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


BATCH_INGEST_SIZE = 500


def _ingest_behaviors_from_csv(session_id: int, csv_path: Path):
    """Read behavior_log.csv and insert BehaviorLog rows so analytics/summary have data."""
    if not csv_path.exists():
        current_app.logger.info("CSV not found for session_id=%s: %s", session_id, csv_path)
        return 0
    created = 0
    try:
        current_app.logger.info("Starting CSV ingest for session_id=%s from %s", session_id, csv_path)
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    name = (row.get("student_name") or "").strip()
                    behavior = (row.get("behavior") or "").strip()
                    if not name or not behavior:
                        continue
                    time_sec = _safe_float(row.get("time_sec"), 0)
                    if time_sec is None:
                        time_sec = 0
                    log = BehaviorLog(
                        session_id=session_id,
                        student_name=name,
                        behavior=behavior,
                        confidence=_safe_float(row.get("confidence")),
                        time_sec=time_sec,
                        duration_sec=_safe_float(row.get("duration_sec")),
                        frame=_safe_int(row.get("frame")),
                    )
                    db.session.add(log)
                    created += 1
                    if created % BATCH_INGEST_SIZE == 0:
                        db.session.commit()
                except (ValueError, KeyError, TypeError) as e:
                    current_app.logger.debug("CSV row skip session_id=%s: %s", session_id, e)
                    continue
        if created:
            db.session.commit()
            current_app.logger.info("Ingested %s behavior rows for session_id=%s from CSV", created, session_id)
    except Exception as e:
        current_app.logger.warning("CSV ingest failed for session_id=%s: %s", session_id, e, exc_info=True)
        try:
            db.session.rollback()
        except Exception:
            pass
    return created


def _mark_completed_if_pipeline_done(session_id: int):
    """When progress file is 100%, mark session completed (so UI leaves 'Processing...'). Ingest from CSV if present."""
    s = db.session.get(Session, session_id)
    if not s or s.status not in ("processing", "pending_processing"):
        return
    file_pct = _read_progress_file(session_id)
    if file_pct is None or file_pct < 99:  # treat 99+ as done so UI never stays stuck
        return
    csv_path = UPLOAD_DIR / str(session_id) / "behavior_log.csv"
    # Ingest behaviors from CSV if it exists (subprocess may not have called API)
    if csv_path.exists():
        existing = BehaviorLog.query.filter_by(session_id=session_id).count()
        if existing == 0:
            _ingest_behaviors_from_csv(session_id, csv_path)
    # Mark completed whenever progress is 100% so UI never stays stuck on "Processing..."
    s.status = "completed"
    s.session_metadata = dict((s.session_metadata or {}), **{"processing_progress": 100})
    db.session.commit()
    current_app.logger.info("Session %s marked completed (progress file 100%%)", session_id)


def _trigger_pipeline_after_upload(session_id: int, video_full_path: str):
    """Start pipeline as subprocess; it writes progress to a file so GET session can return it."""
    csv_path = str(UPLOAD_DIR / str(session_id) / "behavior_log.csv")
    progress_file = str(UPLOAD_DIR / str(session_id) / PROGRESS_FILENAME)
    if not PIPELINE_SCRIPT.exists():
        current_app.logger.warning("run_pipeline.py not found, skipping pipeline")
        return
    api_base = os.environ.get("API_BASE_URL", "").strip() or (request.url_root.rstrip("/") if request else "")
    if not api_base:
        try:
            api_base = (current_app.config.get("API_BASE_URL") or "").strip() or "http://127.0.0.1:5000"
        except Exception:
            api_base = "http://127.0.0.1:5000"
    secret = os.environ.get("INTERNAL_SECRET", "") or os.environ.get("FLASK_INTERNAL_SECRET", "change-internal-secret")
    cmd = [
        sys.executable,
        str(PIPELINE_SCRIPT),
        "--video", video_full_path,
        "--output-csv", csv_path,
        "--session-id", str(session_id),
        "--api-base-url", api_base,
        "--internal-secret", secret,
        "--progress-file", progress_file,
    ]
    try:
        subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=subprocess.DEVNULL,
            stderr=None,
            start_new_session=True,
        )
        current_app.logger.info("Pipeline started subprocess for session_id=%s progress_file=%s", session_id, progress_file)
    except Exception as e:
        current_app.logger.warning("Pipeline start failed: %s", e)


def _session_scope_ok(session_obj, user):
    if user.role in ("admin", "management"):
        return True
    if session_obj.teacher_id == user.id:
        return True
    # Session is for a class they're assigned to (mapping.teacher_id)
    if session_obj.mapping_id and session_obj.mapping and session_obj.mapping.teacher_id == user.id:
        return True
    return False


def _parse_page_limit():
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = min(100, max(1, int(request.args.get("limit", 20))))
    except (TypeError, ValueError):
        limit = 20
    return page, limit


def _safe_int_arg(name, default=None):
    """Parse optional int query arg without raising (avoids 500 on invalid values)."""
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _safe_form_int(name, default=None):
    """Parse optional int from request.form (avoids 500 when frontend sends '')."""
    raw = request.form.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


@bp.route("", methods=["GET"])
@require_auth
def list_sessions():
    try:
        user = get_current_user()
        page, limit = _parse_page_limit()
        session_type = (request.args.get("session_type") or "").strip() or None
        status = (request.args.get("status") or "").strip() or None
        classroom_id = _safe_int_arg("classroom_id")
        teacher_id = _safe_int_arg("teacher_id")

        q = Session.query
        if user.role not in ("admin", "management"):
            # Teachers see: sessions they created (teacher_id) OR sessions for their assigned classes (mapping.teacher_id)
            q = q.outerjoin(Mapping, Session.mapping_id == Mapping.id).filter(
                db.or_(
                    Session.teacher_id == user.id,
                    db.and_(
                        Session.mapping_id.isnot(None),
                        Mapping.teacher_id == user.id,
                    ),
                )
            )
        if session_type:
            q = q.filter_by(session_type=session_type)
        if status:
            q = q.filter_by(status=status)
        if classroom_id is not None:
            q = q.filter_by(classroom_id=classroom_id)
        if teacher_id is not None:
            q = q.filter_by(teacher_id=teacher_id)
        q = q.order_by(Session.id.desc())
        total = q.count()
        items = q.offset((page - 1) * limit).limit(limit).all()
        out = [s.to_dict(nested=False) for s in items]
        return jsonify({
            "items": out,
            "total": total,
            "page": page,
            "limit": limit,
        }), 200
    except Exception as e:
        current_app.logger.exception("GET /sessions failed: %s", e)
        # Return 200 with empty list so CORS is applied and frontend can load; error is in server log
        limit = _safe_int_arg("limit", 50)
        if limit is None or limit < 1:
            limit = 50
        return jsonify({
            "items": [],
            "total": 0,
            "page": 1,
            "limit": limit,
        }), 200


@bp.route("", methods=["POST"])
@require_auth
def create_session():
    user = get_current_user()
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    session_type = (body.get("session_type") or "recorded").strip().lower()
    if session_type not in ("live", "recorded"):
        session_type = "recorded"
    if not title:
        return error_response("title is required", 400, "VALIDATION_ERROR")
    mapping_id = body.get("mapping_id")
    if not mapping_id:
        return error_response("mapping_id is required (select class–subject–teacher mapping)", 400, "VALIDATION_ERROR")
    mapping = db.session.get(Mapping, mapping_id)
    if not mapping:
        return error_response("Mapping not found", 404, "NOT_FOUND")
    if user.role == "teacher" and mapping.teacher_id != user.id:
        return error_response("You can only create sessions for your assigned mappings", 403, "FORBIDDEN")
    s = Session(
        teacher_id=user.id,
        title=title,
        description=body.get("description") or None,
        session_type=session_type,
        stream_url=body.get("stream_url") or None,
        classroom_id=mapping.classroom_id,
        subject_id=mapping.subject_id,
        mapping_id=mapping.id,
        status="draft",
    )
    db.session.add(s)
    db.session.commit()
    return jsonify(s.to_dict(nested=True)), 201


@bp.route("/upload", methods=["POST"])
@require_auth
@require_role("admin", "management", "teacher")
def upload_video():
    try:
        user = get_current_user()
        if "file" not in request.files:
            return error_response("file is required", 400, "VALIDATION_ERROR")
        f = request.files["file"]
        if not f.filename:
            return error_response("file is required", 400, "VALIDATION_ERROR")
        title = (request.form.get("title") or f.filename or "Uploaded video").strip()
        mapping_id = _safe_form_int("mapping_id")
        if not mapping_id:
            return error_response("mapping_id is required (select class–subject–teacher mapping)", 400, "VALIDATION_ERROR")
        mapping = db.session.get(Mapping, mapping_id)
        if not mapping:
            return error_response("Mapping not found", 404, "NOT_FOUND")
        if user.role == "teacher" and mapping.teacher_id != user.id:
            return error_response("You can only upload sessions for your assigned mappings", 403, "FORBIDDEN")

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        s = Session(
            teacher_id=user.id,
            title=title,
            description=request.form.get("description") or None,
            session_type="recorded",
            classroom_id=mapping.classroom_id,
            subject_id=mapping.subject_id,
            mapping_id=mapping.id,
            status="pending_processing",
            session_metadata={"processing_progress": 0},
        )
        db.session.add(s)
        db.session.commit()

        ext = Path(f.filename).suffix or ".mp4"
        save_dir = UPLOAD_DIR / str(s.id)
        save_dir.mkdir(parents=True, exist_ok=True)
        save_path = save_dir / ("video" + ext)
        f.save(str(save_path))
        s.video_path = f"uploads/sessions/{s.id}/video{ext}"
        db.session.commit()

        # Create progress file so first GET sees 0% even before subprocess starts
        try:
            (save_dir / PROGRESS_FILENAME).write_text("0", encoding="utf-8")
        except Exception:
            pass
        # Trigger pipeline: run in background (subprocess)
        _trigger_pipeline_after_upload(s.id, str(save_path))

        try:
            payload = s.to_dict(nested=True)
        except Exception:
            payload = s.to_dict(nested=False)
        return jsonify(payload), 201
    except Exception as e:
        current_app.logger.exception("POST /sessions/upload failed: %s", e)
        try:
            db.session.rollback()
        except Exception:
            pass
        detail = f"Upload failed: {type(e).__name__}: {e}"
        return error_response(
            detail,
            500,
            "INTERNAL_SERVER_ERROR",
        )


@bp.route("/<int:session_id>", methods=["GET"])
@require_auth
def get_session(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return error_response("Session not found", 404, "NOT_FOUND")
    if not _session_scope_ok(s, user):
        return error_response("Forbidden", 403, "FORBIDDEN")
    # If progress file says 100% and pipeline output exists, mark completed so UI leaves "Processing..." (subprocess may not have PATCHed)
    if s.status in ("processing", "pending_processing"):
        _mark_completed_if_pipeline_done(session_id)
        s = db.session.get(Session, session_id)  # reload after possible commit
    # If session is completed but has no (or few) behavior logs, try ingesting from CSV
    if s and s.status == "completed":
        existing = BehaviorLog.query.filter_by(session_id=session_id).count()
        csv_path = UPLOAD_DIR / str(session_id) / "behavior_log.csv"
        reingest = request.args.get("reingest", "").lower() in ("1", "true", "yes")
        can_reingest = user.role in ("admin", "management") or s.teacher_id == user.id
        if reingest and csv_path.exists() and can_reingest:
            # Force re-import: clear existing logs and ingest from CSV
            BehaviorLog.query.filter_by(session_id=session_id).delete()
            db.session.commit()
            created = _ingest_behaviors_from_csv(session_id, csv_path)
            current_app.logger.info("Re-ingested %s rows for session_id=%s (reingest=1)", created, session_id)
        elif existing == 0 and csv_path.exists():
            _ingest_behaviors_from_csv(session_id, csv_path)
    out = s.to_dict(nested=True)
    # When still processing, merge progress from file so UI sees updates
    if s.status in ("processing", "pending_processing"):
        file_pct = _read_progress_file(session_id)
        if file_pct is not None:
            out["metadata"] = dict(out.get("metadata") or {}, **{"processing_progress": file_pct})
    # When completed, include behavior count so frontend can show "X behaviors" or prompt Re-import if 0
    if s and s.status == "completed":
        count = BehaviorLog.query.filter_by(session_id=session_id).count()
        out["metadata"] = dict(out.get("metadata") or {}, **{"behavior_log_count": count})
    return jsonify(out), 200


@bp.route("/<int:session_id>", methods=["PATCH"])
@require_auth
def update_session(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return error_response("Session not found", 404, "NOT_FOUND")
    if not _session_scope_ok(s, user):
        return error_response("Forbidden", 403, "FORBIDDEN")
    body = request.get_json(silent=True) or {}
    if "title" in body and body["title"] is not None:
        s.title = (body["title"] or "").strip() or s.title
    if "description" in body:
        s.description = body["description"]
    if "status" in body and body["status"] is not None:
        status = (body["status"] or "").strip()
        if status in ("draft", "pending_processing", "processing", "ready", "live", "ended", "completed", "failed"):
            s.status = status
    if "error_message" in body:
        s.error_message = body["error_message"]
    db.session.commit()
    return jsonify(s.to_dict(nested=True)), 200


@bp.route("/<int:session_id>", methods=["DELETE"])
@require_auth
def delete_session(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return error_response("Session not found", 404, "NOT_FOUND")
    if not _session_scope_ok(s, user):
        return error_response("Forbidden", 403, "FORBIDDEN")
    db.session.delete(s)
    db.session.commit()
    return "", 204


@bp.route("/<int:session_id>/start-live", methods=["POST"])
@require_auth
def start_live(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return error_response("Session not found", 404, "NOT_FOUND")
    if not _session_scope_ok(s, user):
        return error_response("Forbidden", 403, "FORBIDDEN")
    from datetime import datetime
    s.session_type = "live"
    s.is_active = True
    s.status = "live"
    s.started_at = s.started_at or datetime.utcnow()
    db.session.commit()
    return jsonify(s.to_dict(nested=True)), 200


@bp.route("/<int:session_id>/stop-live", methods=["POST"])
@require_auth
def stop_live(session_id):
    user = get_current_user()
    s = db.session.get(Session, session_id)
    if not s:
        return error_response("Session not found", 404, "NOT_FOUND")
    if not _session_scope_ok(s, user):
        return error_response("Forbidden", 403, "FORBIDDEN")
    from datetime import datetime
    s.is_active = False
    s.status = "ended"
    s.ended_at = datetime.utcnow()
    if s.started_at:
        delta = s.ended_at - s.started_at
        s.duration_seconds = delta.total_seconds()
    db.session.commit()
    return jsonify(s.to_dict(nested=True)), 200
