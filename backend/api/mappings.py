"""
Admin — Class–Subject–Teacher mapping CRUD.
"""
from flask import Blueprint, request, jsonify

from models import db, Mapping, Classroom, Subject, User

from auth_utils import require_auth, require_role

bp = Blueprint("mappings", __name__, url_prefix="")


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
def list_mappings():
    skip, limit = _parse_skip_limit()
    classroom_id = request.args.get("classroom_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)
    q = Mapping.query
    if classroom_id is not None:
        q = q.filter_by(classroom_id=classroom_id)
    if teacher_id is not None:
        q = q.filter_by(teacher_id=teacher_id)
    q = q.order_by(Mapping.id)
    total = q.count()
    items = q.offset(skip).limit(limit).all()
    return jsonify([m.to_dict(nested=True) for m in items]), 200


@bp.route("", methods=["POST"])
@require_auth
@require_role("admin", "management")
def create_mapping():
    body = request.get_json(silent=True) or {}
    classroom_id = body.get("classroom_id")
    subject_id = body.get("subject_id")
    teacher_id = body.get("teacher_id")
    if classroom_id is None or subject_id is None or teacher_id is None:
        return jsonify({"detail": "classroom_id, subject_id, teacher_id required"}), 400
    if not db.session.get(Classroom, classroom_id):
        return jsonify({"detail": "Classroom not found"}), 404
    if not db.session.get(Subject, subject_id):
        return jsonify({"detail": "Subject not found"}), 404
    teacher = db.session.get(User, teacher_id)
    if not teacher or teacher.role != "teacher":
        return jsonify({"detail": "Teacher not found or user is not a teacher"}), 404
    existing = Mapping.query.filter_by(classroom_id=classroom_id, subject_id=subject_id).first()
    if existing:
        return jsonify({"detail": "Mapping for this classroom and subject already exists"}), 409
    m = Mapping(classroom_id=classroom_id, subject_id=subject_id, teacher_id=teacher_id)
    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict(nested=True)), 201


@bp.route("/<int:mapping_id>", methods=["GET"])
@require_auth
def get_mapping(mapping_id):
    m = db.session.get(Mapping, mapping_id)
    if not m:
        return jsonify({"detail": "Mapping not found"}), 404
    return jsonify(m.to_dict(nested=True)), 200


@bp.route("/<int:mapping_id>", methods=["PATCH"])
@require_auth
@require_role("admin", "management")
def update_mapping(mapping_id):
    m = db.session.get(Mapping, mapping_id)
    if not m:
        return jsonify({"detail": "Mapping not found"}), 404
    body = request.get_json(silent=True) or {}
    if "classroom_id" in body and body["classroom_id"] is not None:
        if not db.session.get(Classroom, body["classroom_id"]):
            return jsonify({"detail": "Classroom not found"}), 404
        m.classroom_id = body["classroom_id"]
    if "subject_id" in body and body["subject_id"] is not None:
        if not db.session.get(Subject, body["subject_id"]):
            return jsonify({"detail": "Subject not found"}), 404
        m.subject_id = body["subject_id"]
    if "teacher_id" in body and body["teacher_id"] is not None:
        teacher = db.session.get(User, body["teacher_id"])
        if not teacher or teacher.role != "teacher":
            return jsonify({"detail": "Teacher not found or user is not a teacher"}), 404
        m.teacher_id = body["teacher_id"]
    existing = Mapping.query.filter(
        Mapping.classroom_id == m.classroom_id,
        Mapping.subject_id == m.subject_id,
        Mapping.id != m.id,
    ).first()
    if existing:
        return jsonify({"detail": "Mapping for this classroom and subject already exists"}), 409
    db.session.commit()
    return jsonify(m.to_dict(nested=True)), 200


@bp.route("/<int:mapping_id>", methods=["DELETE"])
@require_auth
@require_role("admin", "management")
def delete_mapping(mapping_id):
    m = db.session.get(Mapping, mapping_id)
    if not m:
        return jsonify({"detail": "Mapping not found"}), 404
    db.session.delete(m)
    db.session.commit()
    return "", 204
