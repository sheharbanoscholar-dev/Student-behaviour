"""
Admin — Users (teachers, admin, management) CRUD.
"""
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError

from models import db, User, Mapping, Session
from auth_utils import require_auth, get_current_user, require_role

bp = Blueprint("users", __name__, url_prefix="")


def _parse_skip_limit():
    try:
        skip = max(0, int(request.args.get("skip", 0)))
    except (TypeError, ValueError):
        skip = 0
    try:
        limit = min(100, max(1, int(request.args.get("limit", 20))))
    except (TypeError, ValueError):
        limit = 20
    return skip, limit


@bp.route("", methods=["GET"])
@require_auth
@require_role("admin")
def list_users():
    skip, limit = _parse_skip_limit()
    role = (request.args.get("role") or "").strip() or None
    q = User.query.order_by(User.id)
    if role:
        q = q.filter_by(role=role)
    total = q.count()
    items = q.offset(skip).limit(limit).all()
    return jsonify([u.to_dict(include_email=True) for u in items]), 200


@bp.route("/teachers", methods=["GET"])
@require_auth
def list_teachers():
    skip, limit = _parse_skip_limit()
    q = User.query.filter_by(role="teacher", is_active=True).order_by(User.id)
    items = q.offset(skip).limit(limit).all()
    return jsonify([u.to_dict(include_email=True) for u in items]), 200


@bp.route("", methods=["POST"])
@require_auth
@require_role("admin")
def create_user():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password")
    full_name = (body.get("full_name") or "").strip() or None
    role = (body.get("role") or "teacher").strip().lower()
    if role not in ("admin", "management", "teacher"):
        return jsonify({"detail": "role must be admin, management, or teacher"}), 400
    if not email:
        return jsonify({"detail": "email is required"}), 400
    if not password:
        return jsonify({"detail": "password is required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"detail": "User with this email already exists"}), 409
    u = User(email=email, full_name=full_name, role=role)
    u.set_password(password)
    db.session.add(u)
    db.session.commit()
    return jsonify(u.to_dict(include_email=True)), 201


@bp.route("/<int:user_id>", methods=["GET"])
@require_auth
@require_role("admin")
def get_user(user_id):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify({"detail": "User not found"}), 404
    return jsonify(u.to_dict(include_email=True)), 200


@bp.route("/<int:user_id>", methods=["PATCH"])
@require_auth
@require_role("admin")
def update_user(user_id):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify({"detail": "User not found"}), 404
    body = request.get_json(silent=True) or {}
    if "full_name" in body:
        u.full_name = (body["full_name"] or "").strip() or None
    if "role" in body and body["role"] is not None:
        r = (body["role"] or "").strip().lower()
        if r in ("admin", "management", "teacher"):
            u.role = r
    if "is_active" in body:
        u.is_active = bool(body["is_active"])
    if "password" in body and body["password"]:
        u.set_password(body["password"])
    db.session.commit()
    return jsonify(u.to_dict(include_email=True)), 200


@bp.route("/<int:user_id>", methods=["DELETE"])
@require_auth
@require_role("admin")
def delete_user(user_id):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify({"detail": "User not found"}), 404
    # Prevent delete if user is referenced (avoids 500 IntegrityError)
    mappings_count = Mapping.query.filter_by(teacher_id=u.id).count()
    sessions_count = Session.query.filter_by(teacher_id=u.id).count()
    if mappings_count or sessions_count:
        parts = []
        if mappings_count:
            parts.append(f"{mappings_count} mapping(s)")
        if sessions_count:
            parts.append(f"{sessions_count} session(s)")
        return jsonify({
            "detail": f"Cannot delete user: they are assigned to {', '.join(parts)}. Reassign or remove those first.",
            "code": "USER_IN_USE",
            "mappings_count": mappings_count,
            "sessions_count": sessions_count,
        }), 409
    try:
        db.session.delete(u)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "detail": "Cannot delete user: they are still referenced by other data (mappings or sessions).",
            "code": "USER_IN_USE",
        }), 409
    return "", 204
