"""
Admin — Subjects CRUD.
"""
from flask import Blueprint, request, jsonify

from models import db, Subject
from auth_utils import require_auth, require_role

bp = Blueprint("subjects", __name__, url_prefix="")


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
def list_subjects():
    skip, limit = _parse_skip_limit()
    q = Subject.query.order_by(Subject.id)
    total = q.count()
    items = q.offset(skip).limit(limit).all()
    return jsonify([s.to_dict() for s in items]), 200


@bp.route("", methods=["POST"])
@require_auth
@require_role("admin", "management")
def create_subject():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"detail": "name is required"}), 400
    s = Subject(name=name, description=body.get("description") or None)
    db.session.add(s)
    db.session.commit()
    return jsonify(s.to_dict()), 201


@bp.route("/<int:subject_id>", methods=["GET"])
@require_auth
def get_subject(subject_id):
    s = db.session.get(Subject, subject_id)
    if not s:
        return jsonify({"detail": "Subject not found"}), 404
    return jsonify(s.to_dict()), 200


@bp.route("/<int:subject_id>", methods=["PATCH"])
@require_auth
@require_role("admin", "management")
def update_subject(subject_id):
    s = db.session.get(Subject, subject_id)
    if not s:
        return jsonify({"detail": "Subject not found"}), 404
    body = request.get_json(silent=True) or {}
    if "name" in body and body["name"] is not None:
        s.name = (body["name"] or "").strip() or s.name
    if "description" in body:
        s.description = body["description"]
    db.session.commit()
    return jsonify(s.to_dict()), 200


@bp.route("/<int:subject_id>", methods=["DELETE"])
@require_auth
@require_role("admin", "management")
def delete_subject(subject_id):
    s = db.session.get(Subject, subject_id)
    if not s:
        return jsonify({"detail": "Subject not found"}), 404
    db.session.delete(s)
    db.session.commit()
    return "", 204
