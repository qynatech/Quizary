from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.ai_generation import AiGeneration
from app.models.answer import Answer
from app.models.form import Form
from app.models.image import Image
from app.models.question import Question
from app.models.question_option import QuestionOption
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminBulkDeleteRequest,
    AdminBulkStatusRequest,
    AdminUserListResponse,
    AdminUserResponse,
    AdminPermanentDeleteRequest,
    AdminUserRoleUpdate,
    AdminUserStatusUpdate,
    AdminStatsResponse,
    RegistrationStatusResponse,
    RegistrationStatusUpdate,
)
from app.services.settings import registration_is_open, set_registration_open
from app.utils import _delete_file, now_wib

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return AdminStatsResponse(
        total_users=db.query(User).filter(User.is_active.is_(True), User.deleted_at.is_(None)).count(),
        total_submissions=db.query(Submission).count(),
        total_forms=db.query(Form).count(),
        total_ai_generations=db.query(AiGeneration).count(),
    )


def _user_response(user: User) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role.value if user.role else UserRole.user.value,
        is_active=user.is_active,
        deleted_at=user.deleted_at,
        created_at=user.created_at,
    )


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User tidak ditemukan")
    return user


def _protect_self(user_id: int, admin: User) -> None:
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Akun admin sendiri tidak dapat diubah atau dihapus")


def _protect_last_admin(db: Session, user: User) -> None:
    if user.role != UserRole.admin or not user.is_active:
        return
    active_admins = db.query(User).filter(User.role == UserRole.admin, User.is_active.is_(True), User.deleted_at.is_(None)).count()
    if active_admins <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Minimal satu admin aktif harus tersisa")


def _protect_bulk_admin_removal(db: Session, users: list[User]) -> None:
    active_admins = db.query(User).filter(User.role == UserRole.admin, User.is_active.is_(True), User.deleted_at.is_(None)).count()
    removing_active_admins = sum(
        1 for user in users if user.role == UserRole.admin and user.is_active and user.deleted_at is None
    )
    if removing_active_admins >= active_admins:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Minimal satu admin aktif harus tersisa")


def _delete_user_files(db: Session, user: User) -> None:
    paths = [user.avatar]
    form_ids = [row[0] for row in db.query(Form.id).filter(Form.user_id == user.id).all()]
    if form_ids:
        paths.extend(row[0] for row in db.query(Form.banner_path).filter(Form.id.in_(form_ids), Form.banner_path.isnot(None)).all())
        question_ids = [row[0] for row in db.query(Question.id).filter(Question.form_id.in_(form_ids)).all()]
        option_ids = [row[0] for row in db.query(QuestionOption.id).filter(QuestionOption.question_id.in_(question_ids)).all()] if question_ids else []
        if question_ids:
            paths.extend(row[0] for row in db.query(Image.path).filter(Image.question_id.in_(question_ids)).all())
        if option_ids:
            paths.extend(row[0] for row in db.query(Image.path).filter(Image.option_id.in_(option_ids)).all())
        submission_ids = [row[0] for row in db.query(Submission.id).filter(Submission.form_id.in_(form_ids)).all()]
        if submission_ids:
            paths.extend(row[0] for row in db.query(Answer.answer_file).filter(Answer.submission_id.in_(submission_ids), Answer.answer_file.isnot(None)).all())
    user_submission_ids = [row[0] for row in db.query(Submission.id).filter(Submission.user_id == user.id).all()]
    if user_submission_ids:
        paths.extend(row[0] for row in db.query(Answer.answer_file).filter(Answer.submission_id.in_(user_submission_ids), Answer.answer_file.isnot(None)).all())
    for path in set(paths):
        _delete_file(path)


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    search: str | None = Query(default=None, min_length=1, max_length=150),
    page: int = Query(default=1, ge=1, le=100000),
    limit: int = Query(default=20, ge=1, le=100),
    include_deleted: bool = False,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if not include_deleted:
        query = query.filter(User.deleted_at.is_(None))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter((User.name.ilike(pattern)) | (User.email.ilike(pattern)))
    total = query.count()
    users = query.order_by(User.created_at.desc(), User.id.desc()).offset((page - 1) * limit).limit(limit).all()
    return AdminUserListResponse(
        items=[_user_response(user) for user in users],
        page=page,
        limit=limit,
        total=total,
        pages=(total + limit - 1) // limit,
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
def update_user_role(user_id: int, body: AdminUserRoleUpdate, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    _protect_self(user_id, admin)
    user = _get_user_or_404(db, user_id)
    if user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User yang dihapus tidak dapat diubah")
    if body.role.value == UserRole.user.value and user.role == UserRole.admin:
        _protect_last_admin(db, user)
    user.role = UserRole(body.role.value)
    user.updated_at = now_wib()
    db.commit()
    db.refresh(user)
    return _user_response(user)


@router.patch("/users/{user_id}/status", response_model=AdminUserResponse)
def update_user_status(user_id: int, body: AdminUserStatusUpdate, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    _protect_self(user_id, admin)
    user = _get_user_or_404(db, user_id)
    if user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User yang dihapus tidak dapat diaktifkan")
    if not body.is_active and user.role == UserRole.admin:
        _protect_last_admin(db, user)
    user.is_active = body.is_active
    user.updated_at = now_wib()
    db.commit()
    db.refresh(user)
    return _user_response(user)


@router.delete("/users/{user_id}")
def soft_delete_user(user_id: int, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    _protect_self(user_id, admin)
    user = _get_user_or_404(db, user_id)
    if user.deleted_at is not None:
        return {"message": "User sudah dihapus"}
    if user.role == UserRole.admin:
        _protect_last_admin(db, user)
    user.deleted_at = now_wib()
    user.is_active = False
    user.updated_at = now_wib()
    db.commit()
    return {"message": "User berhasil dihapus"}


@router.delete("/users/{user_id}/permanent")
def permanent_delete_user(user_id: int, body: AdminPermanentDeleteRequest, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    _protect_self(user_id, admin)
    user = _get_user_or_404(db, user_id)
    if body.confirmation != user.email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Konfirmasi email tidak cocok")
    if user.role == UserRole.admin:
        _protect_last_admin(db, user)
    _delete_user_files(db, user)
    form_ids = [row[0] for row in db.query(Form.id).filter(Form.user_id == user.id).all()]
    if form_ids:
        for form in db.query(Form).filter(Form.id.in_(form_ids)).all():
            db.delete(form)
    other_submissions = db.query(Submission).filter(Submission.user_id == user.id, Submission.form_id.notin_(form_ids or [0])).all() if form_ids else db.query(Submission).filter(Submission.user_id == user.id).all()
    for submission in other_submissions:
        db.delete(submission)
    db.delete(user)
    db.commit()
    return {"message": "User dan semua data terkait berhasil dihapus permanen"}


@router.patch("/users/bulk-status")
def bulk_update_status(body: AdminBulkStatusRequest, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.id.in_(body.user_ids), User.id != admin.id).all()
    if not body.is_active:
        _protect_bulk_admin_removal(db, users)
    for user in users:
        if user.deleted_at is None:
            user.is_active = body.is_active
            user.updated_at = now_wib()
    db.commit()
    return {"updated": len(users), "message": f"{len(users)} user diperbarui"}


@router.delete("/bulk/users")
def bulk_delete_users(body: AdminBulkDeleteRequest, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.id.in_(body.user_ids), User.id != admin.id).all()
    if not body.permanent:
        _protect_bulk_admin_removal(db, [user for user in users if user.deleted_at is None])
        for user in users:
            if user.deleted_at is None:
                user.deleted_at = now_wib()
                user.is_active = False
                user.updated_at = now_wib()
    else:
        _protect_bulk_admin_removal(db, users)
        for user in users:
            _delete_user_files(db, user)
            form_ids = [row[0] for row in db.query(Form.id).filter(Form.user_id == user.id).all()]
            if form_ids:
                for form in db.query(Form).filter(Form.id.in_(form_ids)).all():
                    db.delete(form)
            if form_ids:
                other_submissions = db.query(Submission).filter(Submission.user_id == user.id, Submission.form_id.notin_(form_ids)).all()
            else:
                other_submissions = db.query(Submission).filter(Submission.user_id == user.id).all()
            for submission in other_submissions:
                db.delete(submission)
            db.delete(user)
    db.commit()
    return {"deleted": len(users), "message": f"{len(users)} user berhasil dihapus"}


@router.get("/settings/registration", response_model=RegistrationStatusResponse)
def get_registration_status(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return RegistrationStatusResponse(registration_open=registration_is_open(db))


@router.patch("/settings/registration", response_model=RegistrationStatusResponse)
def update_registration_status(body: RegistrationStatusUpdate, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    set_registration_open(db, body.is_open)
    return RegistrationStatusResponse(registration_open=body.is_open)
