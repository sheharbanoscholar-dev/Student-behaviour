"""
Admin — Classrooms CRUD.
"""
from flask import Blueprint, request, jsonify

from models import db, Classroom, Mapping, Student
from auth_utils import require_auth, get_current_user, require_role, error_response

bp = Blueprint("classrooms", __name__, url_prefix="")


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
def list_classrooms():
    skip, limit = _parse_skip_limit()
    q = Classroom.query.order_by(Classroom.id)
    total = q.count()
    items = q.offset(skip).limit(limit).all()
    return jsonify([c.to_dict() for c in items]), 200


@bp.route("", methods=["POST"])
@require_auth
@require_role("admin", "management")
def create_classroom():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return error_response("name is required", 400, "VALIDATION_ERROR")
    c = Classroom(
        name=name,
        description=body.get("description") or None,
        capacity=body.get("capacity"),
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


@bp.route("/<int:classroom_id>", methods=["GET"])
@require_auth
def get_classroom(classroom_id):
    c = db.session.get(Classroom, classroom_id)
    if not c:
        return error_response("Classroom not found", 404, "NOT_FOUND")
    return jsonify(c.to_dict()), 200


@bp.route("/<int:classroom_id>", methods=["PATCH"])
@require_auth
@require_role("admin", "management")
def update_classroom(classroom_id):
    c = db.session.get(Classroom, classroom_id)
    if not c:
        return error_response("Classroom not found", 404, "NOT_FOUND")
    body = request.get_json(silent=True) or {}
    if "name" in body and body["name"] is not None:
        c.name = (body["name"] or "").strip() or c.name
    if "description" in body:
        c.description = body["description"]
    if "capacity" in body:
        c.capacity = body["capacity"] if body["capacity"] is not None else None
    db.session.commit()
    return jsonify(c.to_dict()), 200


@bp.route("/<int:classroom_id>", methods=["DELETE"])
@require_auth
@require_role("admin", "management")
def delete_classroom(classroom_id):
    c = db.session.get(Classroom, classroom_id)
    if not c:
        return error_response("Classroom not found", 404, "NOT_FOUND")
    db.session.delete(c)
    db.session.commit()
    return "", 204


@bp.route("/<int:classroom_id>/mappings", methods=["GET"])
@require_auth
def list_classroom_mappings(classroom_id):
    c = db.session.get(Classroom, classroom_id)
    if not c:
        return error_response("Classroom not found", 404, "NOT_FOUND")
    skip, limit = _parse_skip_limit()
    q = Mapping.query.filter_by(classroom_id=classroom_id).order_by(Mapping.id)
    total = q.count()
    items = q.offset(skip).limit(limit).all()
    return jsonify([m.to_dict(nested=True) for m in items]), 200


@bp.route("/<int:classroom_id>/students", methods=["GET"])
@require_auth
def list_classroom_students(classroom_id):
    """List pre-registered students for a classroom. Query: skip, limit."""
    c = db.session.get(Classroom, classroom_id)
    if not c:
        return error_response("Classroom not found", 404, "NOT_FOUND")
    skip, limit = _parse_skip_limit()
    q = Student.query.filter_by(classroom_id=classroom_id).order_by(Student.id)
    items = q.offset(skip).limit(limit).all()
    return jsonify([s.to_dict() for s in items]), 200


@bp.route("/<int:classroom_id>/students", methods=["POST"])
@require_auth
@require_role("admin", "management")
def create_classroom_student(classroom_id):
    """Add a pre-registered student to the classroom. Body: name (required), identifier (optional)."""
    c = db.session.get(Classroom, classroom_id)
    if not c:
        return error_response("Classroom not found", 404, "NOT_FOUND")
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return error_response("name is required", 400, "VALIDATION_ERROR")
    student = Student(
        classroom_id=classroom_id,
        name=name,
        identifier=(body.get("identifier") or "").strip() or None,
    )
    db.session.add(student)
    db.session.commit()
    return jsonify(student.to_dict()), 201
