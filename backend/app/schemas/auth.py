import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

# Password hanya ASCII printable tanpa spasi (0x21-0x7E): huruf, angka,
# karakter spesial boleh; spasi, emoji, ikon non-ASCII ditolak.
_PASSWORD_RE = re.compile(r"^[!-~]+$")
_PASSWORD_MSG = "Password may only contain letters, numbers, and special characters"


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=5, max_length=150, pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
    # bcrypt hanya memproses 72 byte pertama — batasi di sini supaya tidak 500.
    password: str = Field(min_length=8, max_length=72)
    password_confirmation: str

    @field_validator("password")
    @classmethod
    def password_charset(cls, v: str) -> str:
        if not _PASSWORD_RE.fullmatch(v):
            raise ValueError(_PASSWORD_MSG)
        return v

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirmation:
            raise ValueError("password_confirmation does not match password")
        return self


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=150, pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
    password: str = Field(min_length=1, max_length=72)


class OtpVerifyRequest(BaseModel):
    email: str = Field(min_length=5, max_length=150, pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class OtpResendRequest(BaseModel):
    email: str = Field(min_length=5, max_length=150, pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool = True
    # avatar is always a full URL (resolved by the router before returning)
    avatar: Optional[str] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    token: str
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=150, pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


class VerifyResetRequest(BaseModel):
    email: str = Field(min_length=5, max_length=150, pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResetPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=150, pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=72)
    password_confirmation: str

    @field_validator("password")
    @classmethod
    def password_charset(cls, v: str) -> str:
        if not _PASSWORD_RE.fullmatch(v):
            raise ValueError(_PASSWORD_MSG)
        return v

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirmation:
            raise ValueError("password_confirmation does not match password")
        return self


class PasswordUpdateRequest(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)
    new_password_confirmation: str

    @field_validator("new_password")
    @classmethod
    def new_password_charset(cls, v: str) -> str:
        if not _PASSWORD_RE.fullmatch(v):
            raise ValueError(_PASSWORD_MSG)
        return v

    @model_validator(mode="after")
    def passwords_match_and_different(self):
        if self.new_password != self.new_password_confirmation:
            raise ValueError("new_password_confirmation does not match new_password")
        if self.old_password == self.new_password:
            raise ValueError("New password must be different from old password")
        return self
