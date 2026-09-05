import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, verify_form_owner
from app.models.form import Form, FormStatus, FormType, SubmissionLimit, ScoringMode
from app.models.form_category import FormCategory
from app.models.question import Question, QuestionType, Section
from app.models.question_option import QuestionOption
from app.models.image import Image
from app.models.submission import Submission
from app.models.answer import Answer
from app.models.user import User
from app.services.points import distribute_quiz_points
from app.utils import file_url, fmt_dt, now_wib, _delete_file
from app.schemas.form import (
    BatchPointsUpdate,
    FormBulkCategoryRequest,
    FormBulkDeleteRequest,
    FormCreate,
    FormListItem,
    FormListResponse,
    FormPublishRequest,
    FormPublishResponse,
    FormUpdate,
)

router = APIRouter(tags=["forms"])


def _generate_short_code(db: Session) -> str:
    # token_urlsafe(8) ≈ 64 bit entropy — mencegah enumerasi kode form
    # (draft tetap rahasia lewat keamanan kode, bukan auth).
    while True:
        code = secrets.token_urlsafe(8).replace("-", "A").replace("_", "B").upper()
        if not db.query(Form).filter(Form.short_code == code).first():
            return code


def _parse_enum(val: str, enum_cls, field_name: str):
    try:
        return enum_cls(val)
    except ValueError:
        valid = [e.value for e in enum_cls]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be one of: {', '.join(valid)}",
        )


def _apply_setting_chain(update_data: dict, form: Form) -> dict:
    """Auto-coerce dependent settings so the creator never has to babysit them:
    is_restricted=true  ⇒ submission_limit='once'
    submission_limit='once' ⇒ require_login=true
    """
    if update_data.get("is_restricted", form.is_restricted):
        update_data["submission_limit"] = "once"
    if update_data.get("submission_limit", form.submission_limit) == "once":
        update_data["require_login"] = True
    return update_data


def _ensure_publishable(form: Form, db: Session) -> None:
    """A form can only be published if it has at least 1 question.
    Quiz forms wajib punya timer (per menit) sebelum bisa dipublikasikan."""
    if db.query(Question).filter(Question.form_id == form.id, Question.is_deleted.is_(False)).count() == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Form must have at least 1 question before publishing",
        )
    if form.type == FormType.quiz and not form.timer_seconds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quiz harus memiliki waktu pengerjaan (timer) sebelum dipublikasikan",
        )


def _verify_category(db: Session, category_id: int | None, user_id: int) -> FormCategory | None:
    if category_id is None:
        return None
    cat = db.get(FormCategory, category_id)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kategori tidak ditemukan")
    if cat.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Anda bukan pemilik kategori ini")
    return cat


def _form_dict(form: Form, request: Request, db: Session | None = None) -> dict:
    """Serialize a Form ORM object to a dict with datetime strings and full banner URL."""
    cat = None
    if form.category_id:
        try:
            # try relationship if session still open
            if hasattr(form, "category") and form.category:
                cat = {"id": form.category.id, "name": form.category.name, "color": form.category.color}
            elif db is not None:
                c = db.get(FormCategory, form.category_id)
                if c:
                    cat = {"id": c.id, "name": c.name, "color": c.color}
            else:
                cat = {"id": form.category_id, "name": None, "color": None}
        except Exception:
            cat = {"id": form.category_id, "name": None, "color": None}
        # ensure we never return name=None if we could fetch
        if cat and cat.get("name") is None and db is not None:
            c = db.get(FormCategory, form.category_id)
            if c:
                cat = {"id": c.id, "name": c.name, "color": c.color}
    return {
        "id": form.id,
        "title": form.title,
        "description": form.description,
        "type": form.type.value,
        "display_style": form.display_style.value if form.display_style else "card",
        "status": form.status.value,
        "short_code": form.short_code,
        "require_login": form.require_login,
        "theme_color": form.theme_color,
        "banner_path": file_url(request, form.banner_path),
        "thank_you_message": form.thank_you_message,
        "timer_seconds": form.timer_seconds,
        "starts_at": fmt_dt(form.starts_at),
        "ends_at": fmt_dt(form.ends_at),
        "shuffle_questions": form.shuffle_questions,
        "shuffle_options": form.shuffle_options,
        "submission_limit": form.submission_limit.value,
        "show_leaderboard": form.show_leaderboard,
        "is_restricted": form.is_restricted,
        "show_in_history": form.show_in_history,
        "reveal_score": form.reveal_score,
        "reveal_answers": form.reveal_answers,
        "scoring_mode": form.scoring_mode.value if form.scoring_mode else "auto",
        "category_id": form.category_id,
        "category": cat,
        "created_at": fmt_dt(form.created_at),
        "updated_at": fmt_dt(form.updated_at),
    }


# ── GET /forms ────────────────────────────────────────────────────────────────

@router.get("/forms", response_model=FormListResponse)
def list_forms(
    request: Request,
    status_filter: str | None = Query(None, alias="status"),
    type_filter: str | None = Query(None, alias="type"),
    category_id: int | None = Query(None, ge=0),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Form).filter(Form.user_id == user.id)
    if status_filter:
        if status_filter not in FormStatus.__members__:
            raise HTTPException(status_code=422, detail="status must be draft, published, or closed")
        q = q.filter(Form.status == FormStatus[status_filter])
    if type_filter:
        if type_filter not in FormType.__members__:
            raise HTTPException(status_code=422, detail="type must be form or quiz")
        q = q.filter(Form.type == FormType[type_filter])
    if category_id is not None:
        # 0 means uncategorized (category_id IS NULL) — optional support via -1
        if category_id == 0:
            q = q.filter(Form.category_id.is_(None))
        else:
            # validate category belongs to user (404 if alien, but filter hides)
            cat = db.get(FormCategory, category_id)
            if not cat or cat.user_id != user.id:
                # return empty而不是 404, so filtering doesn't leak existence
                return FormListResponse(data=[], meta={"total": 0, "page": page, "per_page": per_page})
            q = q.filter(Form.category_id == category_id)

    total = q.count()
    forms = q.order_by(Form.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    # Hitungan soal per form — satu query GROUP BY, dipetakan ke card list.
    counts: dict[int, int] = {}
    cat_map: dict[int, FormCategory] = {}
    if forms:
        rows = (
            db.query(Question.form_id, func.count(Question.id))
            .filter(Question.form_id.in_([f.id for f in forms]), Question.is_deleted.is_(False))
            .group_by(Question.form_id)
            .all()
        )
        counts = {fid: n for fid, n in rows}
        cat_ids = {f.category_id for f in forms if f.category_id}
        if cat_ids:
            cats = db.query(FormCategory).filter(FormCategory.id.in_(cat_ids)).all()
            cat_map = {c.id: c for c in cats}

    return FormListResponse(
        data=[
            FormListItem.model_validate(f).model_copy(update={
                "question_count": counts.get(f.id, 0),
                "banner_path": file_url(request, f.banner_path),
                "category": {"id": cat_map[f.category_id].id, "name": cat_map[f.category_id].name, "color": cat_map[f.category_id].color} if f.category_id and f.category_id in cat_map else None,
            })
            for f in forms
        ],
        meta={"total": total, "page": page, "per_page": per_page},
    )


# ── POST /forms ───────────────────────────────────────────────────────────────

@router.post("/forms", status_code=201)
def create_form(
    request: Request,
    body: FormCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = now_wib()
    if body.category_id is not None:
        _verify_category(db, body.category_id, user.id)
    settings = _apply_setting_chain(
        {"is_restricted": body.is_restricted, "submission_limit": body.submission_limit, "require_login": body.require_login},
        Form(is_restricted=body.is_restricted, submission_limit=body.submission_limit),
    )
    form = Form(
        user_id=user.id,
        title=body.title,
        description=body.description,
        type=_parse_enum(body.type, FormType, "type"),
        require_login=settings["require_login"],
        submission_limit=_parse_enum(settings["submission_limit"], SubmissionLimit, "submission_limit"),
        show_leaderboard=body.show_leaderboard,
        is_restricted=settings["is_restricted"],
        show_in_history=body.show_in_history,
        reveal_score=body.reveal_score,
        reveal_answers=body.reveal_answers,
        scoring_mode=_parse_enum(body.scoring_mode, ScoringMode, "scoring_mode"),
        timer_seconds=body.timer_seconds,
        category_id=body.category_id,
        short_code=_generate_short_code(db),
        created_at=now,
        updated_at=now,
    )
    db.add(form)
    db.flush()
    # Section default langsung tersedia — memudahkan grup cerita & pengelompokan soal.
    db.add(Section(form_id=form.id, title="Bagian 1", order_index=0, created_at=now))
    db.commit()
    db.refresh(form)
    return _form_dict(form, request, db)


# ── DELETE /forms (bulk) ──────────────────────────────────────────────────────

def _delete_form_files(form: Form, db: Session) -> None:
    """Hapus file di disk milik 1 form (banner, gambar soal/opsi, file jawaban).
    Baris DB hilang via cascade / db.delete oleh pemanggil."""
    _delete_file(form.banner_path)
    questions = db.query(Question).filter(Question.form_id == form.id, Question.is_deleted.is_(False)).all()
    for q in questions:
        for img in db.query(Image).filter(Image.question_id == q.id).all():
            _delete_file(img.path)
        for opt in db.query(QuestionOption).filter(QuestionOption.question_id == q.id).all():
            for img in db.query(Image).filter(Image.option_id == opt.id).all():
                _delete_file(img.path)
    file_answers = (
        db.query(Answer.answer_file)
        .join(Submission, Answer.submission_id == Submission.id)
        .filter(Submission.form_id == form.id, Answer.answer_file.isnot(None))
        .all()
    )
    for (path,) in file_answers:
        _delete_file(path)


@router.delete("/forms")
def bulk_delete_forms(
    body: FormBulkDeleteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk-delete formulir milik sendiri. Id asing / tidak ada diabaikan —
    respons berisi jumlah yang benar-benar terhapus."""
    forms = db.query(Form).filter(Form.user_id == user.id, Form.id.in_(body.form_ids)).all()
    for form in forms:
        _delete_form_files(form, db)
        db.delete(form)
    db.commit()
    return {"deleted": len(forms), "message": f"{len(forms)} formulir berhasil dihapus"}


# ── PATCH /forms/category (bulk pindah kategori) ──────────────────────────────

@router.patch("/forms/category")
def bulk_move_category(
    body: FormBulkCategoryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pindahkan banyak formulir ke 1 kategori (null = keluarkan).
    Id asing / tidak ada diabaikan."""
    cat = _verify_category(db, body.category_id, user.id)
    forms = db.query(Form).filter(Form.user_id == user.id, Form.id.in_(body.form_ids)).all()
    now = now_wib()
    for form in forms:
        form.category_id = body.category_id
        form.updated_at = now
    db.commit()
    if body.category_id is None:
        return {"moved": len(forms), "message": f"{len(forms)} formulir dikeluarkan dari kategori"}
    return {"moved": len(forms), "message": f"{len(forms)} formulir dipindahkan ke {cat.name}"}


# ── GET /forms/{form_id} ──────────────────────────────────────────────────────

@router.get("/forms/{form_id}")
def get_form(request: Request, form: Form = Depends(verify_form_owner), db: Session = Depends(get_db)):
    return _form_dict(form, request, db)


# ── PUT /forms/{form_id} ──────────────────────────────────────────────────────

@router.put("/forms/{form_id}")
def update_form(
    request: Request,
    body: FormUpdate,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    update_data = _apply_setting_chain(update_data, form)
    will_publish = (
        update_data.get("status") == "published"
        and form.status.value != "published"
    )

    if "type" in update_data:
        new_type = _parse_enum(update_data["type"], FormType, "type")
        if new_type != form.type:
            form.type = new_type  # set first so helpers/distribute see the new type
            if new_type == FormType.quiz:
                # A form converted into quiz starts with the canonical 100-point
                # pool; creator can switch to manual after conversion.
                form.scoring_mode = ScoringMode.auto
                _prepare_quiz_after_form_conversion(form.id, db)
            else:
                _clear_correct_after_quiz_conversion(form.id, db)
                # Form → quiz balik: setelan khusus quiz di-nonaktifkan,
                # supaya user tidak perlu kembali ke mode quiz untuk meresetnya.
                # timer_seconds TIDAK di-reset — time limit berlaku untuk kedua tipe.
                if "show_leaderboard" not in update_data:
                    update_data["show_leaderboard"] = False
                if "is_restricted" not in update_data:
                    update_data["is_restricted"] = False

    # category validation
    if "category_id" in update_data:
        if update_data["category_id"] is not None:
            _verify_category(db, update_data["category_id"], form.user_id)

    for field, value in update_data.items():
        if field == "type":
            value = _parse_enum(value, FormType, "type")
        elif field == "status":
            value = _parse_enum(value, FormStatus, "status")
        elif field == "submission_limit":
            value = _parse_enum(value, SubmissionLimit, "submission_limit")
        elif field == "scoring_mode":
            value = _parse_enum(value, ScoringMode, "scoring_mode")
        elif field == "category_id":
            # None allowed to unset
            pass
        setattr(form, field, value)

    # Switching back to automatic allocation immediately restores the 100
    # point pool. Manual mode intentionally preserves creator-entered points.
    if (
        form.type == FormType.quiz
        and update_data.get("scoring_mode") == ScoringMode.auto
    ):
        distribute_quiz_points(form.id, db)

    if will_publish:
        _ensure_publishable(form, db)

    form.updated_at = now_wib()
    db.commit()
    db.refresh(form)
    return _form_dict(form, request, db)


def _prepare_quiz_after_form_conversion(form_id: int, db: Session) -> None:
    """form → quiz: mark the first option of each choice question as correct,
    reset all points, then auto-distribute quiz points across questions."""
    questions = (
        db.query(Question)
        .filter(Question.form_id == form_id, Question.is_deleted.is_(False))
        .order_by(Question.order_index)
        .all()
    )
    for q in questions:
        if q.type in (QuestionType.multiple_choice, QuestionType.checkbox):
            opts = sorted(q.options, key=lambda o: o.order_index or 0)
            if opts and not any(o.is_correct for o in opts):
                opts[0].is_correct = True
        q.points = 0
    distribute_quiz_points(form_id, db)


def _clear_correct_after_quiz_conversion(form_id: int, db: Session) -> None:
    """quiz → form: no correct answers are needed anymore."""
    db.query(QuestionOption).filter(
        QuestionOption.question_id.in_(
            db.query(Question.id).filter(Question.form_id == form_id, Question.is_deleted.is_(False))
        )
    ).update({"is_correct": False}, synchronize_session=False)


# ── DELETE /forms/{form_id} ───────────────────────────────────────────────────

@router.delete("/forms/{form_id}")
def delete_form(form: Form = Depends(verify_form_owner), db: Session = Depends(get_db)):
    _delete_form_files(form, db)
    db.delete(form)
    db.commit()
    return {"message": "Form and all related data have been deleted"}


# ── PATCH /forms/{form_id}/publish ────────────────────────────────────────────

@router.patch("/forms/{form_id}/publish")
def publish_form(
    body: FormPublishRequest,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    if body.status == "published":
        _ensure_publishable(form, db)

    form.status = _parse_enum(body.status, FormStatus, "status")
    form.updated_at = now_wib()
    db.commit()
    return FormPublishResponse(
        message="Form published" if form.status == FormStatus.published else "Form moved to draft",
        short_code=form.short_code,
    )


# ── PATCH /forms/{form_id}/questions/points ─────────────────────────────────

@router.patch("/forms/{form_id}/questions/points")
def batch_update_points(
    body: BatchPointsUpdate,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    if form.type != FormType.quiz:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fitur ini hanya tersedia untuk tipe quiz",
        )
    if form.scoring_mode == ScoringMode.auto:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ubah poin per soal secara manual hanya bisa di mode Manual",
        )

    from app.models.question import QuestionType
    _NO_GRADE = (QuestionType.essay, QuestionType.date, QuestionType.time, QuestionType.datetime, QuestionType.file_upload, QuestionType.dropdown)
    updated = (
        db.query(Question)
        .filter(
            Question.form_id == form.id,
            Question.is_scored.is_(True),
            Question.is_deleted.is_(False),
            Question.type.notin_(_NO_GRADE),
        )
        .update({"points": body.points}, synchronize_session=False)
    )
    db.commit()
    return {"message": f"Semua soal dinilai diatur ke {body.points} poin", "updated_count": updated}
