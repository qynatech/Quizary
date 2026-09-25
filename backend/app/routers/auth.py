import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import hash_password, verify_password, create_access_token, revoke_token
from app.models.user import User
from app.otp import (
    MAX_ATTEMPTS,
    OTP_TTL_MINUTES,
    can_resend,
    generate_otp,
    hash_otp,
    send_otp_email,
    send_reset_email,
    verify_otp,
)
from app.ratelimit import limit_forgot_password, limit_login, limit_register
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    OtpResendRequest,
    OtpVerifyRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyResetRequest,
    MessageResponse,
    PasswordUpdateRequest,
    TokenResponse,
    UserResponse,
)
from app.dependencies import get_current_user, security
from app.services.settings import registration_is_open
from app.utils import file_url

logger = logging.getLogger("quizary")

router = APIRouter(tags=["auth"])


def _user_response(user: User, request: Request) -> UserResponse:
    """Build UserResponse with avatar resolved to a full URL."""
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role.value if user.role else "user",
        is_active=user.is_active,
        avatar=file_url(request, user.avatar),
    )


def _now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _issue_otp(user: User, db: Session) -> str:
    """Generate a fresh code, store its hash on the user, and return it."""
    code = generate_otp()
    user.otp_code = hash_otp(code)
    user.otp_expires_at = _now_naive() + timedelta(minutes=OTP_TTL_MINUTES)
    user.otp_attempts = 0
    db.commit()
    return code


def _clear_otp(user: User) -> None:
    user.otp_code = None
    user.otp_expires_at = None
    user.otp_attempts = None


@router.get("/registration/status")
def get_registration_status(db: Session = Depends(get_db)):
    return {"registration_open": registration_is_open(db)}


@router.post("/register", status_code=201)
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db), _rl: None = Depends(limit_register)):
    if not registration_is_open(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pendaftaran sedang ditutup")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(name=body.name, email=body.email, password=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Race: dua register email sama bersamaan — unique constraint menangkapnya.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    db.refresh(user)

    code = _issue_otp(user, db)
    try:
        send_otp_email(user.email, code)
    except Exception:
        # User sudah dibuat; kode tetap tersimpan jadi /otp/resend bisa dipakai.
        logger.exception("Failed to send OTP email to %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send the verification email. Please request a new code.",
        )
    return {"message": "A verification code has been sent to your email.", "email": user.email}


@router.post("/otp/verify")
def verify_otp_code(request: Request, body: OtpVerifyRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun user tidak aktif")
    if user.email_verified_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already verified")

    now = _now_naive()
    if not user.otp_code or not user.otp_expires_at:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="No verification code found. Request a new one.",
        )
    if now > user.otp_expires_at:
        _clear_otp(user)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Verification code has expired. Request a new one.",
        )
    if (user.otp_attempts or 0) >= MAX_ATTEMPTS:
        _clear_otp(user)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. Request a new code.",
        )
    if not verify_otp(body.code, user.otp_code):
        user.otp_attempts = (user.otp_attempts or 0) + 1
        if user.otp_attempts >= MAX_ATTEMPTS:
            _clear_otp(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code.")

    user.email_verified_at = now
    _clear_otp(user)
    db.commit()
    token = create_access_token(user.id, user.role.value if user.role else "user")
    return TokenResponse(token=token, user=_user_response(user, request))


@router.post("/otp/resend", response_model=MessageResponse)
def resend_otp(body: OtpResendRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.email_verified_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already verified")
    if not can_resend(user.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting a new code.",
        )

    code = _issue_otp(user, db)
    try:
        send_otp_email(user.email, code)
    except Exception:
        logger.exception("Failed to send OTP email to %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send the verification email. Please try again.",
        )
    return MessageResponse(message="A new verification code has been sent to your email.")


@router.post("/login")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db), _rl: None = Depends(limit_login)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email is not verified. Please verify with the OTP code sent to your email.",
        )
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun user tidak aktif")
    token = create_access_token(user.id, user.role.value if user.role else "user")
    return TokenResponse(token=token, user=_user_response(user, request))


@router.post("/logout", response_model=MessageResponse)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if credentials:
        revoke_token(db, credentials.credentials)
    return MessageResponse(message="Logged out successfully")


@router.get("/me")
def me(request: Request, user: User = Depends(get_current_user)):
    # Fix #1 — avatar returned as full URL
    return _user_response(user, request)


@router.post("/password/forgot", response_model=MessageResponse)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db), _rl: None = Depends(limit_forgot_password)):
    # Langsung 404/403 bila email tak terdaftar / belum verifikasi — user tahu OTP tak terkirim.
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email tidak terdaftar")
    if not user.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email belum diverifikasi. Silakan verifikasi dulu.",
        )
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun user tidak aktif")
    if not can_resend(user.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting a new code.",
        )
    code = _issue_otp(user, db)
    try:
        send_reset_email(user.email, code)
    except Exception:
        logger.exception("Failed to send reset email to %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send the reset email. Please try again.",
        )
    return MessageResponse(message="A reset code has been sent to your email.")


@router.post("/password/verify", response_model=MessageResponse)
def verify_reset_code(body: VerifyResetRequest, db: Session = Depends(get_db), _rl: None = Depends(limit_forgot_password)):
    """Cek OTP reset tanpa menghapus/mengganti password — dipakai modal staged UX."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.email_verified_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email is not verified. Please verify your email first.")
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun user tidak aktif")
    now = _now_naive()
    if not user.otp_code or not user.otp_expires_at:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="No reset code found. Request a new one.")
    if now > user.otp_expires_at:
        _clear_otp(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Reset code has expired. Request a new one.")
    if (user.otp_attempts or 0) >= MAX_ATTEMPTS:
        _clear_otp(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many failed attempts. Request a new code.")
    if not verify_otp(body.code, user.otp_code):
        user.otp_attempts = (user.otp_attempts or 0) + 1
        if user.otp_attempts >= MAX_ATTEMPTS:
            _clear_otp(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset code.")
    return MessageResponse(message="Code verified. You can now reset your password.")


@router.post("/password/reset", response_model=MessageResponse)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db), _rl: None = Depends(limit_forgot_password)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.email_verified_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email is not verified. Please verify your email first.")
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun user tidak aktif")
    now = _now_naive()
    if not user.otp_code or not user.otp_expires_at:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="No reset code found. Request a new one.")
    if now > user.otp_expires_at:
        _clear_otp(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Reset code has expired. Request a new one.")
    if (user.otp_attempts or 0) >= MAX_ATTEMPTS:
        _clear_otp(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many failed attempts. Request a new code.")
    if not verify_otp(body.code, user.otp_code):
        user.otp_attempts = (user.otp_attempts or 0) + 1
        if user.otp_attempts >= MAX_ATTEMPTS:
            _clear_otp(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset code.")
    # OTP valid -> ganti password dan bersih
    user.password = hash_password(body.password)
    _clear_otp(user)
    db.commit()
    return MessageResponse(message="Password has been reset. Please sign in with your new password.")


@router.put("/me/password", status_code=200, response_model=MessageResponse)
def update_password(
    body: PasswordUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.old_password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Old password is incorrect")
    user.password = hash_password(body.new_password)
    db.commit()
    return MessageResponse(message="Password updated successfully")
