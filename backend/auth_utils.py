"""
JWT auth helpers for API v1.
"""
import os
from functools import wraps

import jwt
from flask import request, jsonify, has_request_context
from flask import current_app

from models import db, User


def error_response(detail, status_code=400, code=None):
    """Return JSON error with optional machine-readable code. Example: NOT_FOUND, VALIDATION_ERROR."""
    body = {"detail": detail}
    if code:
        body["code"] = code
    return jsonify(body), status_code


# Single JWT secret for this process; set by create_app() so encode and decode always match.
_JWT_SECRET = os.environ.get("FLASK_SECRET_KEY", "change-me-in-production")


def set_jwt_secret(secret):
    """Call from create_app() so JWT uses the same secret in this process."""
    global _JWT_SECRET
    _JWT_SECRET = secret


def _get_secret():
    """Use process-level secret so decode never fails after login (no current_app dependency)."""
    return _JWT_SECRET


ALGORITHM = "HS256"
_last_decode_error = None  # Set on decode failure for debug_reason in 401


def encode_token(user_id, extra=None):
    # PyJWT requires "sub" to be a string (RFC 7519); we parse back to int in get_current_user
    payload = {"sub": str(user_id), "type": "access"}
    if extra:
        payload.update(extra)
    secret = _get_secret()
    out = jwt.encode(payload, secret, algorithm=ALGORITHM)
    return out if isinstance(out, str) else out.decode("utf-8")


def decode_token(token):
    global _last_decode_error
    _last_decode_error = None
    if not token or not isinstance(token, str):
        return None
    token = token.strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=[ALGORITHM])
        return payload
    except jwt.InvalidTokenError as e:
        _last_decode_error = str(e)  # e.g. "Signature verification failed"
        try:
            from flask import current_app
            if current_app.debug or os.environ.get("FLASK_DEBUG"):
                current_app.logger.warning("JWT decode failed: %s (token_len=%s)", e, len(token))
        except Exception:
            pass
        return None


def get_current_user():
    """From Authorization: Bearer <token> return User or None."""
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    user = db.session.get(User, user_id)
    return user


def _auth_fail_reason():
    """Return a short reason for auth failure (for debugging)."""
    auth = request.headers.get("Authorization")
    if not auth:
        return "no_Authorization_header"
    if not auth.startswith("Bearer "):
        return "header_not_Bearer"
    token = auth[7:].strip()
    if not token:
        return "empty_token"
    payload = decode_token(token)
    if not payload:
        return _last_decode_error or "decode_failed"
    if payload.get("type") != "access":
        return "type_not_access"
    user_id = payload.get("sub")
    if user_id is None:
        return "no_sub"
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return "sub_not_int"
    if db.session.get(User, user_id) is None:
        return "user_not_in_db"
    return "unknown"


def require_auth(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        user = get_current_user()
        if not user:
            reason = _auth_fail_reason()
            return jsonify({
                "detail": "Authentication required",
                "code": "UNAUTHORIZED",
                "debug_reason": reason,
            }), 401
        if not user.is_active:
            return error_response("Account is disabled", 403, "FORBIDDEN")
        return f(*args, **kwargs)
    return wrapped


def require_role(*roles):
    """Decorator: require current user to have one of the given roles."""
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            user = get_current_user()
            if not user:
                return error_response("Authentication required", 401, "UNAUTHORIZED")
            if not user.is_active:
                return error_response("Account is disabled", 403, "FORBIDDEN")
            if user.role not in roles:
                return error_response("Insufficient permissions", 403, "FORBIDDEN")
            return f(*args, **kwargs)
        return wrapped
    return decorator
