"""
Auth: login, refresh, me.
"""
from flask import Blueprint, request, jsonify

from models import db, User
from auth_utils import require_auth, get_current_user, encode_token, error_response

bp = Blueprint("auth", __name__, url_prefix="")


@bp.route("/login", methods=["POST", "OPTIONS"])
def login():
    # Let CORS preflight succeed with 200 (browser requires OK status)
    if request.method == "OPTIONS":
        return "", 200
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not email or not password:
        return error_response("email and password required", 400, "VALIDATION_ERROR")
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return error_response("Invalid email or password", 401, "UNAUTHORIZED")
    if not user.is_active:
        return error_response("Account is disabled", 403, "FORBIDDEN")
    access_token = encode_token(user.id)
    return jsonify({
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict(include_email=True),
    }), 200


@bp.route("/refresh", methods=["POST"])
def refresh():
    # Optional: implement refresh tokens; for now return 501 or reuse login
    return error_response("Use /auth/login to obtain a new token", 501, "NOT_IMPLEMENTED")


@bp.route("/me", methods=["GET"])
@require_auth
def me():
    user = get_current_user()
    return jsonify(user.to_dict(include_email=True)), 200
