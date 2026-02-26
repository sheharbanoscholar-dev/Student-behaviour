"""
Flask API for classroom behavior analytics & dashboard.
- API v1: /api/v1 (auth, classrooms, subjects, users, mappings, sessions, behaviors, analytics, export).
- Legacy: /api (behavior-log from CSV for backward compatibility).
"""
import csv
import os
from pathlib import Path
from collections import defaultdict

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge

from models import db

# Optional: OpenAPI / Swagger docs at /apidocs
try:
    from flasgger import Swagger
    FLASGGER_AVAILABLE = True
except ImportError:
    FLASGGER_AVAILABLE = False

# --------------- Paths ---------------
BASE_DIR = Path(__file__).resolve().parent
BEHAVIOR_LOG_CSV = BASE_DIR / "behavior_log.csv"
SQLITE_DB = BASE_DIR / "classroom_api.db"


def create_app():
    app = Flask(__name__)
    secret = os.environ.get("FLASK_SECRET_KEY", "change-me-in-production")
    app.config["SECRET_KEY"] = secret
    # So JWT encode (login) and decode (sessions) use same key in this process (fixes decode_failed)
    from auth_utils import set_jwt_secret
    set_jwt_secret(secret)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", f"sqlite:///{SQLITE_DB}")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB for video upload

    # Allowed origins for CORS (must match exactly what the browser sends)
    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
    ]
    CORS(
        app,
        origins=CORS_ORIGINS,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        supports_credentials=True,
        intercept_exceptions=True,  # Add CORS to 500/error responses so browser shows real error
    )

    def _cors_headers():
        """Build CORS headers for the current request origin (so browser accepts the response)."""
        origin = request.environ.get("HTTP_ORIGIN") if request else None
        allow_origin = None
        if origin:
            if origin in CORS_ORIGINS:
                allow_origin = origin
            elif "localhost" in origin or "127.0.0.1" in origin:
                allow_origin = origin
        if not allow_origin:
            # Fallback for dev when Origin is missing or unexpected (e.g. some proxies)
            allow_origin = "http://localhost:3000"
        return {
            "Access-Control-Allow-Origin": allow_origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        }

    @app.before_request
    def handle_preflight():
        """Respond to OPTIONS (CORS preflight) with 200 and CORS headers so browser allows the actual request."""
        if request.method == "OPTIONS":
            resp = make_response("", 200)
            for k, v in _cors_headers().items():
                resp.headers[k] = v
            return resp
        return None

    db.init_app(app)
    with app.app_context():
        db.create_all()

    # --------------- API v1 ---------------
    from api.auth import bp as auth_bp
    from api.classrooms import bp as classrooms_bp
    from api.subjects import bp as subjects_bp
    from api.users import bp as users_bp
    from api.mappings import bp as mappings_bp
    from api.sessions import bp as sessions_bp
    from api.behaviors import bp as behaviors_bp
    from api.analytics import bp as analytics_bp
    from api.export import bp as export_bp
    from api.internal import bp as internal_bp

    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(classrooms_bp, url_prefix="/api/v1/classrooms")
    app.register_blueprint(subjects_bp, url_prefix="/api/v1/subjects")
    app.register_blueprint(users_bp, url_prefix="/api/v1/users")
    app.register_blueprint(mappings_bp, url_prefix="/api/v1/mappings")
    app.register_blueprint(sessions_bp, url_prefix="/api/v1/sessions")
    app.register_blueprint(behaviors_bp, url_prefix="/api/v1/sessions")
    # Analytics session + dashboard routes on app so they are always registered (avoids 404)
    from auth_utils import require_auth, get_current_user
    from models import Session
    from sqlalchemy.orm import joinedload
    from api.analytics import (
        session_summary,
        session_metrics,
        dashboard_subjects,
        dashboard_teachers,
        dashboard_students,
    )

    @app.route("/api/v1/analytics/dashboard/subjects", methods=["GET"])
    @require_auth
    def analytics_dashboard_subjects_route():
        return dashboard_subjects()

    @app.route("/api/v1/analytics/dashboard/teachers", methods=["GET"])
    @require_auth
    def analytics_dashboard_teachers_route():
        return dashboard_teachers()

    @app.route("/api/v1/analytics/dashboard/students", methods=["GET"])
    @require_auth
    def analytics_dashboard_students_route():
        return dashboard_students()

    @app.route("/api/v1/analytics/sessions/<int:session_id>/key-moments", methods=["GET"])
    @require_auth
    def key_moments_route(session_id):
        user = get_current_user()
        s = Session.query.options(joinedload(Session.mapping)).filter_by(id=session_id).first()
        if not s:
            return jsonify({"detail": "Session not found"}), 404
        if user.role not in ("admin", "management") and s.teacher_id != user.id:
            if not (s.mapping_id and s.mapping and s.mapping.teacher_id == user.id):
                return jsonify({"detail": "Forbidden"}), 403
        return jsonify([]), 200

    @app.route("/api/v1/analytics/sessions/<int:session_id>/summary", methods=["GET"])
    @require_auth
    def analytics_summary_route(session_id):
        return session_summary(session_id)

    @app.route("/api/v1/analytics/sessions/<int:session_id>/metrics", methods=["GET"])
    @require_auth
    def analytics_metrics_route(session_id):
        return session_metrics(session_id)

    app.register_blueprint(analytics_bp, url_prefix="/api/v1")
    app.register_blueprint(export_bp, url_prefix="/api/v1")
    app.register_blueprint(internal_bp, url_prefix="/api/v1")

    # So we can confirm the right app is running (e.g. GET /api/v1 → JSON)
    @app.route("/api/v1", methods=["GET"])
    def api_v1_info():
        return jsonify({
            "api": "v1",
            "message": "Classroom Behavior API",
            "auth_login": "POST /api/v1/auth/login",
        }), 200

    def _add_cors_to_response(resp):
        """Add CORS to every response so browser never sees 'No Access-Control-Allow-Origin'."""
        try:
            for k, v in _cors_headers().items():
                resp.headers[k] = v
        except Exception:
            pass
        return resp

    @app.after_request
    def ensure_cors_on_all_responses(resp):
        """Ensure every response has CORS (including 500)."""
        return _add_cors_to_response(resp)

    @app.errorhandler(404)
    def handle_404(e):
        """Return JSON 404 for /api/v1 so frontend can tell this is the right server."""
        if request.path.startswith("/api/v1"):
            return jsonify({
                "detail": "Not found",
                "code": "NOT_FOUND",
                "path": request.path,
                "message": "Classroom Behavior API is running; this route does not exist.",
            }), 404
        return e.get_response() if hasattr(e, "get_response") else make_response("<h1>404 Not Found</h1>", 404)

    @app.errorhandler(500)
    def handle_500(e):
        """Return JSON 500 with CORS so frontend sees the error instead of 'CORS policy'."""
        app.logger.exception("Unhandled 500: %s", e)
        body = {"detail": "Internal server error", "code": "INTERNAL_SERVER_ERROR"}
        if app.debug:
            body["debug"] = str(e)
        resp = make_response(jsonify(body), 500)
        resp.headers["Content-Type"] = "application/json"
        return _add_cors_to_response(resp)

    @app.errorhandler(RequestEntityTooLarge)
    def handle_413(e):
        """Return JSON 413 with CORS so upload CORS errors show real message (e.g. file too large)."""
        body = {
            "detail": "File too large",
            "code": "PAYLOAD_TOO_LARGE",
            "message": "Request body exceeds maximum allowed size (100 MB).",
        }
        resp = make_response(jsonify(body), 413)
        resp.headers["Content-Type"] = "application/json"
        return _add_cors_to_response(resp)

    # --------------- OpenAPI / Swagger (optional) ---------------
    if FLASGGER_AVAILABLE:
        Swagger(app, template={
            "info": {
                "title": "Classroom Behavior Analytics API",
                "version": "2.0.0",
                "description": "REST API for classroom behavior & dashboard. See FLASK_API_BEHAVIOR.md for full behavior.",
            },
            "basePath": "/",
            "schemes": ["http", "https"],
        })

    # --------------- Root & health ---------------
    @app.route("/")
    def index():
        return jsonify({
            "message": "Classroom Behavior Analytics API",
            "version": "2.0.0",
            "v1": "/api/v1",
            "legacy": "/api (behavior-log, students, behaviors, analytics)",
        })

    @app.route("/health")
    def health_root():
        return jsonify({"status": "ok"}), 200

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route("/api/v1/health")
    def health_v1():
        return jsonify({"status": "ok"}), 200

    # --------------- Legacy CSV-based endpoints (backward compatibility) ---------------
    def load_behavior_log():
        if not BEHAVIOR_LOG_CSV.exists():
            return []
        rows = []
        with open(BEHAVIOR_LOG_CSV, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                row["frame"] = int(row.get("frame", 0))
                row["time_sec"] = float(row.get("time_sec", 0))
                row["confidence"] = float(row.get("confidence", 0))
                rows.append(row)
        return rows

    @app.route("/api/behavior-log")
    def get_behavior_log():
        data = load_behavior_log()
        student_name = request.args.get("student_name", "").strip()
        behavior = request.args.get("behavior", "").strip()
        try:
            time_min = float(request.args.get("time_min", 0))
        except (TypeError, ValueError):
            time_min = 0
        try:
            time_max = float(request.args.get("time_max", float("inf")))
        except (TypeError, ValueError):
            time_max = float("inf")
        try:
            limit = min(int(request.args.get("limit", 100)), 1000)
        except (TypeError, ValueError):
            limit = 100
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0
        if student_name:
            data = [r for r in data if r.get("student_name") == student_name]
        if behavior:
            data = [r for r in data if r.get("behavior") == behavior]
        data = [r for r in data if time_min <= r["time_sec"] <= time_max]
        total = len(data)
        data = data[offset : offset + limit]
        return jsonify({"items": data, "total": total, "limit": limit, "offset": offset})

    @app.route("/api/students")
    def get_students():
        data = load_behavior_log()
        students = sorted(set(r.get("student_name", "") for r in data if r.get("student_name")))
        return jsonify({"students": students})

    @app.route("/api/behaviors")
    def get_behaviors():
        data = load_behavior_log()
        behaviors = sorted(set(r.get("behavior", "") for r in data if r.get("behavior")))
        return jsonify({"behaviors": behaviors})

    @app.route("/api/analytics/summary")
    def get_summary():
        data = load_behavior_log()
        student_name = request.args.get("student_name", "").strip()
        behavior = request.args.get("behavior", "").strip()
        if student_name:
            data = [r for r in data if r.get("student_name") == student_name]
        if behavior:
            data = [r for r in data if r.get("behavior") == behavior]
        by_behavior = defaultdict(int)
        by_student = defaultdict(int)
        for r in data:
            by_behavior[r.get("behavior", "unknown")] += 1
            by_student[r.get("student_name", "unknown")] += 1
        return jsonify({
            "total_entries": len(data),
            "unique_students": len(by_student),
            "by_behavior": dict(by_behavior),
            "by_student": dict(by_student),
        })

    @app.route("/api/analytics/by-student")
    def get_analytics_by_student():
        data = load_behavior_log()
        student_name = request.args.get("student_name", "").strip()
        if student_name:
            data = [r for r in data if r.get("student_name") == student_name]
        result = defaultdict(lambda: {"behaviors": defaultdict(int), "time_min": None, "time_max": None, "total_entries": 0})
        for r in data:
            name = r.get("student_name", "unknown")
            result[name]["behaviors"][r.get("behavior", "unknown")] += 1
            t = r["time_sec"]
            if result[name]["time_min"] is None or t < result[name]["time_min"]:
                result[name]["time_min"] = t
            if result[name]["time_max"] is None or t > result[name]["time_max"]:
                result[name]["time_max"] = t
            result[name]["total_entries"] += 1
        out = {name: {"behaviors": dict(v["behaviors"]), "time_min_sec": v["time_min"], "time_max_sec": v["time_max"], "total_entries": v["total_entries"]} for name, v in result.items()}
        return jsonify({"students": out})

    @app.route("/api/analytics/by-behavior")
    def get_analytics_by_behavior():
        data = load_behavior_log()
        group_by = request.args.get("group_by", "").strip().lower()
        if group_by == "student":
            result = defaultdict(lambda: defaultdict(int))
            for r in data:
                result[r.get("behavior", "unknown")][r.get("student_name", "unknown")] += 1
            return jsonify({"by_behavior": {b: dict(s) for b, s in result.items()}})
        by_behavior = defaultdict(int)
        for r in data:
            by_behavior[r.get("behavior", "unknown")] += 1
        return jsonify({"by_behavior": dict(by_behavior)})

    @app.route("/api/analytics/time-distribution")
    def get_time_distribution():
        data = load_behavior_log()
        try:
            bucket_sec = float(request.args.get("bucket_sec", 60))
        except (TypeError, ValueError):
            bucket_sec = 60
        if bucket_sec <= 0:
            bucket_sec = 60
        result = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
        for r in data:
            t = r["time_sec"]
            bucket = int(t // bucket_sec) * bucket_sec
            result[bucket][r.get("student_name", "unknown")][r.get("behavior", "unknown")] += 1
        out = [{"time_sec": k, "students": {s: dict(b) for s, b in v.items()}} for k, v in sorted(result.items())]
        return jsonify({"buckets": out, "bucket_sec": bucket_sec})

    return app


app = create_app()


# --------------- Seed default admin (optional, for first run) ---------------
def seed_admin():
    with app.app_context():
        from models import User
        if User.query.filter_by(email="admin@example.com").first():
            return
        u = User(email="admin@example.com", full_name="Admin", role="admin")
        u.set_password("admin123")
        db.session.add(u)
        db.session.commit()
        print("Seeded admin@example.com / admin123")


if __name__ == "__main__":
    seed_admin()
    # Confirm login route is registered (so 404 = wrong server on port 5000)
    rules = [r.rule for r in app.url_map.iter_rules() if "login" in r.rule]
    print("Classroom Behavior API: login route registered:", rules)
    app.run(host="0.0.0.0", port=5000, debug=True)
