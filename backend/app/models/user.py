from sqlalchemy import Boolean, Column, Integer, String, DateTime, Enum as SAEnum
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.user)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    avatar = Column(String(255), nullable=True)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    otp_code = Column(String(64), nullable=True)
    otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    otp_attempts = Column(Integer, nullable=True)
    remember_token = Column(String(100), nullable=True)
    gemini_key_encrypted = Column(String(2000), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    forms = relationship("Form", back_populates="user")
    submissions = relationship("Submission", back_populates="user")
