import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, verify_form_owner
from app.models.form import Form as FormModel
from app.models.image import Image
from app.models.question import Question
from app.models.question_option import QuestionOption
from app.models.user import User, UserRole
from app.crypto import decrypt_gemini_key, encrypt_gemini_key, mask_key
from app.schemas.ai import GeminiKeyPutRequest, GeminiKeySaveResponse, GeminiKeyStatusResponse
from app.schemas.auth import MessageResponse, UserResponse
from app.utils import UPLOAD_DIR, MAX_IMAGE_BYTES, file_url, now_wib, write_limited, _delete_file

router = APIRouter(tags=["profile & media"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def _user_response(user: User, request: Request) -> UserResponse:
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role.value if user.role else UserRole.user.value,
        is_active=user.is_active,
        avatar=file_url(request, user.avatar),
    )


def _save_upload(file: UploadFile, subdir: str) -> str:
    if not file.filename or not file.file:
        raise HTTPException(status_code=422, detail="Invalid file")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Unsupported file format, use JPG/PNG/GIF/WEBP")
    mime = file.content_type
    if mime and mime not in ALLOWED_MIMES:
        raise HTTPException(status_code=422, detail="Unsupported file format, use JPG/PNG/GIF/WEBP")
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOAD_DIR, subdir, filename)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    write_limited(file.file, dest, MAX_IMAGE_BYTES)
    return f"{subdir}/{filename}"


# ── PUT /me ──────────────────────────────────────────────────────────────────
@router.put("/me")
def update_profile(
    request: Request,
    name: str | None = Form(None),
    avatar: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if name is not None:
        if not name.strip():
            raise HTTPException(status_code=422, detail="Name cannot be empty")
        user.name = name
    old_avatar = user.avatar
    if avatar is not None:
        new_path = _save_upload(avatar, "avatars")
        user.avatar = new_path
    db.commit()
    db.refresh(user)
    if avatar is not None:
        _delete_file(old_avatar)
    return _user_response(user, request)


# ── POST /me/avatar ──────────────────────────────────────────────────────────
@router.post("/me/avatar")
def upload_avatar(
    request: Request,
    avatar: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a new avatar image. Old file is deleted from disk."""
    old_path = user.avatar
    new_path = _save_upload(avatar, "avatars")
    user.avatar = new_path
    db.commit()
    db.refresh(user)
    _delete_file(old_path)
    return _user_response(user, request)


# ── POST /forms/{form_id}/banner ─────────────────────────────────────────────
@router.post("/forms/{form_id}/banner")
async def upload_banner(
    request: Request,
    banner: UploadFile = File(...),
    form: FormModel = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    old_path = form.banner_path
    path = _save_upload(banner, "banners")
    form.banner_path = path
    form.updated_at = now_wib()
    db.commit()
    _delete_file(old_path)
    return {"message": "Banner uploaded", "banner_path": file_url(request, path)}


# ── DELETE /forms/{form_id}/banner ────────────────────────────────────────────
@router.delete("/forms/{form_id}/banner", response_model=MessageResponse)
def delete_banner(
    form: FormModel = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    stored_path = form.banner_path
    form.banner_path = None
    form.updated_at = now_wib()
    db.commit()
    _delete_file(stored_path)
    return MessageResponse(message="Banner dihapus")


# ── POST /questions/{question_id}/images ─────────────────────────────────────
@router.post("/questions/{question_id}/images", status_code=201)
def add_question_image(
    request: Request,
    question_id: int,
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.get(Question, question_id)
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    f = db.get(FormModel, q.form_id)
    if not f or f.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the owner of this form")

    file_path = _save_upload(image, "question-images")
    img = Image(question_id=question_id, path=file_path, created_at=now_wib())
    db.add(img)
    db.commit()
    db.refresh(img)
    return {"id": img.id, "path": file_url(request, img.path)}


# ── POST /options/{option_id}/images ─────────────────────────────────────────
@router.post("/options/{option_id}/images", status_code=201)
def add_option_image(
    request: Request,
    option_id: int,
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    opt = db.get(QuestionOption, option_id)
    if not opt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    q = db.get(Question, opt.question_id)
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    f = db.get(FormModel, q.form_id)
    if not f or f.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the owner of this form")

    file_path = _save_upload(image, "question-images")
    img = Image(option_id=option_id, path=file_path, created_at=now_wib())
    db.add(img)
    db.commit()
    db.refresh(img)
    return {"id": img.id, "path": file_url(request, img.path)}


# ── DELETE /images/{image_id} ─────────────────────────────────────────────────
@router.delete("/images/{image_id}", response_model=MessageResponse)
def delete_image(
    image_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    img = db.get(Image, image_id)
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Resolve owner
    owner_id: int | None = None
    if img.question_id:
        q = db.get(Question, img.question_id)
        if q:
            f = db.get(FormModel, q.form_id)
            owner_id = f.user_id if f else None
    elif img.option_id:
        opt = db.get(QuestionOption, img.option_id)
        if opt:
            q = db.get(Question, opt.question_id)
            if q:
                f = db.get(FormModel, q.form_id)
                owner_id = f.user_id if f else None

    if owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the owner of this image")

    stored_path = img.path
    db.delete(img)
    db.commit()
    _delete_file(stored_path)

    return MessageResponse(message="Image deleted")


# ── Gemini BYOK ────────────────────────────────────────────────────────────
@router.put("/me/gemini-key", response_model=GeminiKeySaveResponse)
def put_gemini_key(
    body: GeminiKeyPutRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.gemini_key_encrypted = encrypt_gemini_key(body.key.strip())
    db.commit()
    return GeminiKeySaveResponse(message="API key Gemini tersimpan", connected=True)


@router.get("/me/gemini-key/status", response_model=GeminiKeyStatusResponse)
def gemini_key_status(user: User = Depends(get_current_user)):
    if not user.gemini_key_encrypted:
        return GeminiKeyStatusResponse(connected=False, masked=None)
    try:
        plain = decrypt_gemini_key(user.gemini_key_encrypted)
        return GeminiKeyStatusResponse(connected=True, masked=mask_key(plain))
    except Exception:
        return GeminiKeyStatusResponse(connected=False, masked=None)


@router.delete("/me/gemini-key", response_model=GeminiKeySaveResponse)
def delete_gemini_key(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.gemini_key_encrypted = None
    db.commit()
    return GeminiKeySaveResponse(message="API key Gemini dihapus", connected=False)


# ── DELETE /options/{option_id}/images/{image_id} ──────────────────────────────
@router.delete("/options/{option_id}/images/{image_id}", response_model=MessageResponse)
def delete_option_image(
    option_id: int,
    image_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    opt = db.get(QuestionOption, option_id)
    if not opt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    q = db.get(Question, opt.question_id)
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    f = db.get(FormModel, q.form_id)
    if not f or f.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the owner of this form")

    img = db.query(Image).filter(Image.id == image_id, Image.option_id == option_id).first()
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    stored_path = img.path
    db.delete(img)
    db.commit()
    _delete_file(stored_path)

    return MessageResponse(message="Image deleted")
