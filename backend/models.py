"""
SQLAlchemy models for Classroom Behavior & Dashboard API.
"""
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash


def _safe_isoformat(value):
    """Return ISO string for datetime; avoid 500 if DB returns string or other type."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship, backref

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(255), nullable=True)
    role = db.Column(db.String(50), nullable=False, default="teacher")  # admin, management, teacher
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self, include_email=True):
        d = {
            "id": self.id,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": _safe_isoformat(self.created_at),
            "updated_at": _safe_isoformat(self.updated_at),
        }
        if include_email:
            d["email"] = self.email
        return d


class Classroom(db.Model):
    __tablename__ = "classrooms"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    capacity = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "capacity": self.capacity,
            "created_at": _safe_isoformat(self.created_at),
            "updated_at": _safe_isoformat(self.updated_at),
        }


class Student(db.Model):
    """Pre-registered student in a classroom (optional roster)."""
    __tablename__ = "students"
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, ForeignKey("classrooms.id"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    identifier = db.Column(db.String(255), nullable=True)  # e.g. roll number, student id
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    classroom = relationship("Classroom", backref=backref("students", cascade="all, delete-orphan"))

    def to_dict(self):
        return {
            "id": self.id,
            "classroom_id": self.classroom_id,
            "name": self.name,
            "identifier": self.identifier,
            "created_at": _safe_isoformat(self.created_at),
            "updated_at": _safe_isoformat(self.updated_at),
        }


class Subject(db.Model):
    __tablename__ = "subjects"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "created_at": _safe_isoformat(self.created_at),
            "updated_at": _safe_isoformat(self.updated_at),
        }


class Mapping(db.Model):
    __tablename__ = "mappings"
    __table_args__ = (UniqueConstraint("classroom_id", "subject_id", name="uq_classroom_subject"),)
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, ForeignKey("classrooms.id"), nullable=False)
    subject_id = db.Column(db.Integer, ForeignKey("subjects.id"), nullable=False)
    teacher_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    classroom = relationship("Classroom", backref="mappings")
    subject = relationship("Subject", backref="mappings")
    teacher = relationship("User", backref="mappings")

    def to_dict(self, nested=False):
        d = {
            "id": self.id,
            "classroom_id": self.classroom_id,
            "subject_id": self.subject_id,
            "teacher_id": self.teacher_id,
            "created_at": _safe_isoformat(self.created_at),
        }
        if nested:
            if self.classroom:
                d["classroom"] = self.classroom.to_dict()
            if self.subject:
                d["subject"] = self.subject.to_dict()
            if self.teacher:
                d["teacher"] = self.teacher.to_dict(include_email=True)
        return d


class Session(db.Model):
    __tablename__ = "sessions"
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    session_type = db.Column(db.String(50), nullable=False)  # live | recorded
    stream_url = db.Column(db.String(512), nullable=True)
    video_path = db.Column(db.String(512), nullable=True)
    is_active = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(50), default="draft")  # draft, pending_processing, processing, ready, live, ended, completed, failed
    error_message = db.Column(db.Text, nullable=True)  # set when status=failed
    classroom_id = db.Column(db.Integer, ForeignKey("classrooms.id"), nullable=True)
    subject_id = db.Column(db.Integer, ForeignKey("subjects.id"), nullable=True)
    mapping_id = db.Column(db.Integer, ForeignKey("mappings.id"), nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    ended_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    session_metadata = db.Column(db.JSON, nullable=True)  # e.g. processing_progress (0-100)

    teacher = relationship("User", backref="sessions")
    classroom = relationship("Classroom", backref="sessions")
    subject = relationship("Subject", backref="sessions")
    mapping = relationship("Mapping", backref="sessions")
    behavior_logs = relationship("BehaviorLog", backref="session", cascade="all, delete-orphan")

    def to_dict(self, nested=False):
        d = {
            "id": self.id,
            "teacher_id": self.teacher_id,
            "title": self.title,
            "description": self.description,
            "session_type": self.session_type,
            "stream_url": self.stream_url,
            "video_path": self.video_path,
            "is_active": self.is_active,
            "status": self.status,
            "error_message": self.error_message,
            "classroom_id": self.classroom_id,
            "subject_id": self.subject_id,
            "mapping_id": self.mapping_id,
            "started_at": _safe_isoformat(self.started_at),
            "ended_at": _safe_isoformat(self.ended_at),
            "duration_seconds": self.duration_seconds,
            "created_at": _safe_isoformat(self.created_at),
            "updated_at": _safe_isoformat(self.updated_at),
            "metadata": self.session_metadata if isinstance(self.session_metadata, dict) else (self.session_metadata or {}),
        }
        if nested:
            if self.teacher:
                d["teacher"] = self.teacher.to_dict(include_email=True)
            if self.classroom:
                d["classroom"] = self.classroom.to_dict()
            if self.subject:
                d["subject"] = self.subject.to_dict()
            if self.mapping:
                d["mapping"] = self.mapping.to_dict(nested=True)
        return d


class BehaviorLog(db.Model):
    __tablename__ = "behavior_logs"
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, ForeignKey("sessions.id"), nullable=False)
    student_name = db.Column(db.String(255), nullable=False)
    behavior = db.Column(db.String(100), nullable=False)
    confidence = db.Column(db.Float, nullable=True)
    time_sec = db.Column(db.Float, nullable=False)
    duration_sec = db.Column(db.Float, nullable=True)
    frame = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "student_name": self.student_name,
            "behavior": self.behavior,
            "confidence": self.confidence,
            "time_sec": self.time_sec,
            "duration_sec": self.duration_sec,
            "frame": self.frame,
        }
