from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi import UploadFile, File
import os
import shutil
import uuid
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, verify_form_owner
from app.models.answer import Answer
from app.models.answer_option import AnswerOption
from app.models.form import Form
from app.models.image import Image
from app.models.question import Question, QuestionType, Section
from app.models.question_option import QuestionOption
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services.points import distribute_quiz_points
from app.utils import file_url, now_wib, write_limited, MAX_QUESTION_MEDIA_BYTES, _delete_file, UPLOAD_DIR
from app.schemas.question import (
    GroupAddRequest,
    QuestionCreate,
    QuestionGroupRequest,
    QuestionUpdate,
    ReorderRequest,
    SectionCreate,
    SectionUpdate,
    SectionReorderRequest,
    check_allow_other,
    check_answer_key,
)

router = APIRouter(tags=["questions"])

_OPTION_TYPES = ("multiple_choice", "checkbox", "dropdown")
_TEXT_TYPES = ("short_answer", "essay", "password", "date", "time", "datetime", "file_upload")
# Types yang tidak pernah dinilai otomatis (tanpa options / tanpa isi teks dinilai).
# essay keluar dari daftar: ikut dinilai bila punya answer_key (lihat grading.py).
_NO_GRADE_TYPES = ("date", "time", "datetime", "file_upload", "dropdown")
# Tipe isian yang bisa dinilai otomatis bila punya answer_key (khusus quiz).
_KEYWORD_TYPES = ("essay", "short_answer")


def _is_keyword_gradable(q_type: str, answer_key: str | None) -> bool:
    """True bila tipe isian didukung kunci dan kuncinya non-kosong."""
    return q_type in _KEYWORD_TYPES and bool((answer_key or "").strip())


def _get_question_or_404(q_id: int, db: Session) -> Question:
    q = db.query(Question).filter(Question.id == q_id, Question.is_deleted.is_(False)).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return q


def _ensure_owner(q: Question, user: User, db: Session) -> Form:
    form = db.get(Form, q.form_id)
    if not form or form.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the owner of this form")
    return form


def _image_obj(img, request: Request) -> dict | None:
    """Fix #5 — return single image object (first image only), not an array."""
    if img is None:
        return None
    return {"id": img.id, "path": file_url(request, img.path)}


def _build_question(q: Question, request: Request) -> dict:
    """
    Serialize a Question.
    Fix #5: `image` is a single object (first image) on both question and each option.
    """
    q_img = sorted(q.images, key=lambda i: i.order_index or 0)
    opts = []
    for opt in sorted(q.options, key=lambda o: o.order_index or 0):
        opt_imgs = sorted(opt.images, key=lambda i: i.order_index or 0)
        opts.append({
            "id": opt.id,
            "option_text": opt.option_text,
            "is_correct": opt.is_correct,
            "order_index": opt.order_index,
            "image": _image_obj(opt_imgs[0], request) if opt_imgs else None,
        })
    return {
        "id": q.id,
        "type": q.type.value,
        "question_text": q.question_text,
        "points": q.points,
        "is_scored": q.is_scored,
        "order_index": q.order_index,
        "is_required": q.is_required,
        "section_id": q.section_id,
        "group_id": q.group_id,
        # Keyword hanya untuk owner (endpoint ini); payload publik tidak memilikinya.
        "password_keyword": q.password_keyword if q.type.value == "password" else None,
        "answer_key": q.answer_key if q.type.value in _KEYWORD_TYPES else None,
        "allow_other": bool(q.allow_other),
        "options": opts,
        "image": _image_obj(q_img[0], request) if q_img else None,
    }


# ── GET /forms/{form_id}/questions ────────────────────────────────────────────

@router.get("/forms/{form_id}/questions")
def list_questions(
    request: Request,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    questions = (
        db.query(Question)
        .filter(Question.form_id == form.id, Question.is_deleted.is_(False))
        .order_by(Question.order_index)
        .all()
    )
    return {"data": [_build_question(q, request) for q in questions]}


# ── Sections (kelompok soal per halaman) ─────────────────────────────────────

def _get_section_or_404(section_id: int, db: Session) -> Section:
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section tidak ditemukan")
    return section


# ── PATCH /sections/reorder ──────────────────────────────────────────────────
# Declared BEFORE /sections/{section_id} — FastAPI matches routes in definition
# order, so "/sections/reorder" must not be captured as a path param.

@router.patch("/sections/reorder")
def reorder_sections(
    body: SectionReorderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    form = db.get(Form, body.form_id)
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    if form.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the owner of this form")

    section_ids = {row[0] for row in db.query(Section.id).filter(Section.form_id == form.id).all()}
    if set(body.orders) != section_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="orders must include exactly all sections in this form",
        )

    for idx, s_id in enumerate(body.orders):
        s = db.get(Section, s_id)
        if not s or s.form_id != body.form_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Section {s_id} not found in this form",
            )
        s.order_index = idx

    db.commit()
    return {"message": "Section order updated"}


def _section_dict(section: Section) -> dict:
    return {
        "id": section.id,
        "title": section.title,
        "order_index": section.order_index,
        "question_count": len(section.questions),
    }


@router.get("/forms/{form_id}/sections")
def list_sections(
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    sections = (
        db.query(Section)
        .filter(Section.form_id == form.id)
        .order_by(Section.order_index)
        .all()
    )
    return {"data": [_section_dict(s) for s in sections]}


@router.post("/forms/{form_id}/sections", status_code=201)
def create_section(
    body: SectionCreate,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    max_order = (
        db.query(Section.order_index)
        .filter(Section.form_id == form.id)
        .order_by(Section.order_index.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0
    section = Section(
        form_id=form.id,
        title=body.title,
        order_index=next_order,
        created_at=now_wib(),
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return _section_dict(section)


@router.patch("/sections/{section_id}")
def update_section(
    section_id: int,
    body: SectionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _get_section_or_404(section_id, db)
    form = db.get(Form, section.form_id)
    if not form or form.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Anda bukan pemilik form ini")
    if body.title is not None:
        section.title = body.title
    db.commit()
    db.refresh(section)
    return _section_dict(section)


@router.delete("/sections/{section_id}")
def delete_section(
    section_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _get_section_or_404(section_id, db)
    form = db.get(Form, section.form_id)
    if not form or form.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Anda bukan pemilik form ini")
    remaining = db.query(Section).filter(Section.form_id == section.form_id).count()
    if remaining <= 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tidak bisa menghapus section terakhir")
    db.delete(section)
    db.commit()
    return {"message": "Section dihapus"}


# ── POST /forms/{form_id}/questions ───────────────────────────────────────────

@router.post("/forms/{form_id}/questions", status_code=201)
def create_question(
    request: Request,
    body: QuestionCreate,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    max_order = (
        db.query(Question.order_index)
        .filter(Question.form_id == form.id, Question.is_deleted.is_(False))
        .order_by(Question.order_index.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0

    # Ensure at least one section exists — auto-create "Default" if needed.
    sections = db.query(Section).filter(Section.form_id == form.id).all()
    if not sections:
        auto = Section(form_id=form.id, title="Default", order_index=0, created_at=now_wib())
        db.add(auto)
        db.flush()
        sections = [auto]
    if body.section_id is not None:
        if not any(s.id == body.section_id for s in sections):
            raise HTTPException(status_code=422, detail="Section tidak ditemukan pada form ini")
    else:
        body.section_id = sections[0].id

    # multiple_choice hanya wajib punya tepat 1 jawaban benar untuk quiz yang
    # dinilai (count points). Form biasa / kuesioner & soal tidak dinilai bebas.
    if form.type.value == "quiz" and body.type == "multiple_choice":
        correct_count = sum(1 for o in body.options if o.is_correct)
        if correct_count != 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="multiple_choice questions must have exactly 1 correct option",
            )

    # Answer key hanya tersedia untuk quiz — di form biasa diabaikan.
    if body.answer_key is not None and form.type.value != "quiz":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Answer key hanya tersedia untuk tipe quiz",
        )
    answer_key = body.answer_key if body.type in _KEYWORD_TYPES else None

    question = Question(
        form_id=form.id,
        type=QuestionType(body.type),
        question_text=body.question_text,
        allow_other=body.allow_other if body.type in ("multiple_choice", "checkbox") else False,
        # Auto mode allocates from the 100-point pool after insert; manual mode
        # preserves the creator's per-question value. Non-graded types always 0;
        # essay/short_answer tanpa kunci juga 0 (belum bisa dinilai).
        points=(0 if (form.type.value == "quiz" and (form.scoring_mode is None or form.scoring_mode.value == "auto")) or body.type in _NO_GRADE_TYPES or (body.type in _KEYWORD_TYPES and not (answer_key or "").strip()) else body.points),
        is_scored=body.is_scored,
        is_required=body.is_required,
        section_id=body.section_id,
        password_keyword=body.password_keyword if body.type == "password" else None,
        answer_key=answer_key,
        order_index=next_order,
        created_at=now_wib(),
    )
    db.add(question)
    db.flush()

    for i, opt in enumerate(body.options):
        db.add(QuestionOption(
            question_id=question.id,
            option_text=opt.option_text,
            is_correct=opt.is_correct,
            order_index=i,
        ))

    distribute_quiz_points(form.id, db)
    db.commit()
    db.refresh(question)
    return _build_question(question, request)


# ── PUT /questions/{question_id} ──────────────────────────────────────────────

@router.put("/questions/{question_id}")
def update_question(
    request: Request,
    body: QuestionUpdate,
    question_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _get_question_or_404(question_id, db)
    form = _ensure_owner(question, user, db)

    update_data = body.model_dump(exclude_unset=True)
    options_data = update_data.pop("options", None)

    if update_data.get("section_id") is not None:
        section = db.get(Section, update_data["section_id"])
        if not section or section.form_id != question.form_id:
            raise HTTPException(status_code=422, detail="Section tidak ditemukan pada form ini")

    # Determine the effective type after this update
    new_type_str = update_data.get("type") or question.type.value

    # Switching to (or staying on) password type needs a keyword somewhere —
    # body payload or already stored on the question.
    if new_type_str == "password":
        effective_kw = update_data.get("password_keyword") or question.password_keyword
        if not (effective_kw or "").strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password questions require a password_keyword",
            )

    # Answer key & flag Lainnya divalidasi terhadap tipe efektif
    # (payload atau tersimpan).
    if "answer_key" in update_data:
        try:
            check_answer_key(update_data["answer_key"], new_type_str)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )
        if update_data.get("answer_key") is not None and form.type.value != "quiz":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Answer key hanya tersedia untuk tipe quiz",
            )
    if "allow_other" in update_data:
        try:
            check_allow_other(update_data["allow_other"], new_type_str)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )
    # Menyalakan penilaian essay/short_answer wajib disertai kunci (payload
    # atau yang sudah tersimpan) — kalau tidak, toggle tak bisa menyala.
    if (
        new_type_str in _KEYWORD_TYPES
        and update_data.get("is_scored") is True
        and not (update_data.get("answer_key", question.answer_key) or "").strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Isi answer key terlebih dahulu untuk mengaktifkan penilaian soal ini",
        )

    # Fix #4 — non-empty options with a text type is invalid; an empty list is
    # allowed and simply means "clear options" (e.g. switching MC → short_answer).
    if options_data:
        if new_type_str in _TEXT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question type '{new_type_str}' cannot have options",
            )

    # Fix #4 — if switching to a text type, options must be explicitly cleared in DB
    if "type" in update_data:
        new_type = QuestionType(update_data.pop("type"))
        # Switching FROM option type TO text type → delete all existing options,
        # but never options already chosen by respondents (would corrupt answers).
        if new_type.value in _TEXT_TYPES and question.type.value in _OPTION_TYPES:
            for opt in list(question.options):
                if db.query(AnswerOption).filter(AnswerOption.option_id == opt.id).count() > 0:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Opsi \"{opt.option_text}\" tidak dapat dihapus karena sudah dipilih peserta",
                    )
            for opt in list(question.options):
                db.delete(opt)
            db.flush()
        # Switching FROM text type TO option type but no options provided → error
        if new_type.value in _OPTION_TYPES and question.type.value in _TEXT_TYPES and not options_data:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Switching to '{new_type.value}' requires at least 1 option in this request",
            )
        question.type = new_type
        # Tinggalkan tipe isian berkunci → kunci ikut dibersihkan
        if new_type.value not in _KEYWORD_TYPES and "answer_key" not in update_data:
            question.answer_key = None
        # Tinggalkan MC/checkbox → flag Lainnya ikut dibersihkan
        if new_type.value not in ("multiple_choice", "checkbox") and "allow_other" not in update_data:
            question.allow_other = False

    # Toggle is_scored: off → force 0 points; on (no explicit points) → rejoin pool
    was_scored = question.is_scored
    if "is_scored" in update_data:
        if update_data["is_scored"] is False:
            update_data["points"] = 0
        elif "points" not in update_data:
            update_data["points"] = 0

    # Quiz pool = 100 (distribute_quiz_points). A fixed points value > 100
    # would zero out every other scored question — reject instead.
    # Essay tanpa kunci tidak dinilai (seperti tipe non-graded) — pengecualian
    # batas maupun pemaksaan 0 tidak berlaku untuknya.
    _keyless_essay = (
        question.type.value == "essay"
        and not _is_keyword_gradable(
            question.type.value, update_data.get("answer_key", question.answer_key)
        )
    )
    if question.type.value not in _NO_GRADE_TYPES and not _keyless_essay and update_data.get("points", 0) > 100:
        form_type = db.get(Form, question.form_id)
        if form_type and form_type.type.value == "quiz":
            raise HTTPException(status_code=422, detail="Poin per soal maksimal 100")

    # Non-graded types never carry points (grade_answer returns None/0) —
    # essay tanpa kunci ikut dipaksa 0 karena belum bisa dinilai.
    if question.type.value in _NO_GRADE_TYPES or _keyless_essay:
        update_data["points"] = 0

    for field, value in update_data.items():
        if value is None:
            continue  # jangan tulis NULL ke kolom NOT NULL (mis. points)
        setattr(question, field, value)

    question.updated_at = now_wib()

    # Handle options update (only for option-type questions)
    if options_data is not None:
        existing_ids = {o.id for o in question.options}
        seen_ids: set[int] = set()
        new_opts = []

        for opt_dict in options_data:
            opt_id = opt_dict.get("id")
            if opt_id:
                if opt_id in existing_ids:
                    seen_ids.add(opt_id)
                    opt = db.get(QuestionOption, opt_id)
                    if opt_dict.get("option_text") is not None:
                        opt.option_text = opt_dict["option_text"]
                    if opt_dict.get("is_correct") is not None:
                        opt.is_correct = opt_dict["is_correct"]
                else:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Option {opt_id} not found in this question",
                    )
            else:
                new_opts.append(opt_dict)

        for opt in list(question.options):
            if opt.id not in seen_ids:
                if db.query(AnswerOption).filter(AnswerOption.option_id == opt.id).count() > 0:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Opsi \"{opt.option_text}\" tidak dapat dihapus karena sudah dipilih peserta",
                    )
                db.delete(opt)

        db.flush()
        remaining = db.query(QuestionOption).filter(QuestionOption.question_id == question.id).count()
        for i, opt_dict in enumerate(new_opts):
            db.add(QuestionOption(
                question_id=question.id,
                option_text=opt_dict.get("option_text", ""),
                is_correct=opt_dict.get("is_correct", False),
                order_index=remaining + i,
            ))

        # Fix #3 carry-over — re-validate mc has exactly 1 correct after update
        # (hanya untuk quiz yang dinilai; form biasa/kuesioner & soal tidak
        # dinilai boleh tanpa jawaban benar)
        db.flush()
        if new_type_str == "multiple_choice" and form.type.value == "quiz" and question.is_scored:
            correct_count = db.query(QuestionOption).filter(
                QuestionOption.question_id == question.id,
                QuestionOption.is_correct == True,  # noqa: E712
            ).count()
            if correct_count != 1:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="multiple_choice questions must have exactly 1 correct option",
                )

    if question.is_scored and not was_scored:
        distribute_quiz_points(question.form_id, db)
    elif question.is_scored:
        distribute_quiz_points(question.form_id, db, fixed_ids={question.id})
    else:
        distribute_quiz_points(question.form_id, db)
    db.commit()
    db.refresh(question)
    return _build_question(question, request)


# ── GET /questions/{question_id}/active-count ──────────────────────────────────
# Pre-flight check: berapa submission in_progress yang mungkin terpengaruh
# oleh penghapusan soal ini. Frontend pakai sebelum delete untuk modal warning.

@router.get("/questions/{question_id}/active-count")
def get_active_count(
    question_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _get_question_or_404(question_id, db)
    _ensure_owner(question, user, db)
    count = db.query(Submission).filter(
        Submission.form_id == question.form_id,
        Submission.status == SubmissionStatus.in_progress,
    ).count()
    return {"active_count": count}


# ── DELETE /questions/{question_id} ───────────────────────────────────────────

@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _get_question_or_404(question_id, db)
    _ensure_owner(question, user, db)
    question.is_deleted = True
    db.commit()
    return {"message": "Question deleted"}


# ── POST /questions/{question_id}/duplicate ───────────────────────────────────
# Duplikasi penuh 1 soal tepat di bawah soal asal: konten rich-text, settings
# (type/points/is_scored/is_required/section/group/password_keyword), opsi,
# dan file gambar (disalin di disk ke nama baru — bukan shared path, supaya
# hapus salah satu tidak merenggut yang lain). File yatim dilewati.

@router.post("/questions/{question_id}/duplicate", status_code=201)
def duplicate_question(
    request: Request,
    question_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    src = _get_question_or_404(question_id, db)
    _ensure_owner(src, user, db)

    new_order = (src.order_index or 0) + 1
    db.query(Question).filter(
        Question.form_id == src.form_id,
        Question.is_deleted.is_(False),
        Question.order_index >= new_order,
    ).update({Question.order_index: Question.order_index + 1}, synchronize_session=False)

    copy = Question(
        form_id=src.form_id,
        section_id=src.section_id,
        type=src.type,
        question_text=src.question_text,
        points=src.points,
        is_scored=src.is_scored,
        is_required=src.is_required,
        group_id=src.group_id,
        password_keyword=src.password_keyword,
        answer_key=src.answer_key,
        allow_other=src.allow_other,
        order_index=new_order,
        created_at=now_wib(),
    )
    db.add(copy)
    db.flush()

    opt_map: dict[int, QuestionOption] = {}
    for opt in sorted(src.options, key=lambda o: o.order_index or 0):
        new_opt = QuestionOption(
            question_id=copy.id,
            option_text=opt.option_text,
            is_correct=opt.is_correct,
            order_index=opt.order_index,
        )
        db.add(new_opt)
        db.flush()
        opt_map[opt.id] = new_opt

    def _copy_file(rel: str | None) -> str | None:
        if not rel:
            return None
        full = os.path.join(UPLOAD_DIR, rel.lstrip("/"))
        if not os.path.isfile(full):
            return None
        ext = os.path.splitext(rel)[1].lower()
        subdir = os.path.dirname(rel) or "question-images"
        new_rel = f"{subdir}/{uuid.uuid4().hex}{ext}"
        os.makedirs(os.path.join(UPLOAD_DIR, subdir), exist_ok=True)
        shutil.copy2(full, os.path.join(UPLOAD_DIR, new_rel.lstrip("/")))
        return new_rel

    for img in sorted(src.images, key=lambda i: i.order_index or 0):
        new_path = _copy_file(img.path)
        if new_path:
            db.add(Image(question_id=copy.id, path=new_path, order_index=img.order_index, created_at=now_wib()))

    for opt in sorted(src.options, key=lambda o: o.order_index or 0):
        for img in sorted(opt.images, key=lambda i: i.order_index or 0):
            new_path = _copy_file(img.path)
            if new_path:
                db.add(Image(option_id=opt_map[opt.id].id, path=new_path, order_index=img.order_index, created_at=now_wib()))

    distribute_quiz_points(src.form_id, db)
    db.commit()
    db.refresh(copy)
    return _build_question(copy, request)


# ── POST /forms/{form_id}/questions/bulk-active-count ─────────────────────────
# Pre-flight: beri tahu frontend berapa submission aktif sebelum bulk delete.

@router.post("/forms/{form_id}/questions/bulk-active-count")
def bulk_active_count(
    form_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    form = db.get(Form, form_id)
    if not form or form.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    count = db.query(Submission).filter(
        Submission.form_id == form_id,
        Submission.status == SubmissionStatus.in_progress,
    ).count()
    return {"active_count": count}


# ── POST /forms/{form_id}/questions/bulk-delete ───────────────────────────────

@router.post("/forms/{form_id}/questions/bulk-delete")
def bulk_delete_questions(
    form_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    form = db.get(Form, form_id)
    if not form or form.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    ids = body.get("question_ids", [])
    if not ids:
        raise HTTPException(status_code=422, detail="question_ids is required")

    db.query(Question).filter(
        Question.id.in_(ids), Question.form_id == form_id, Question.is_deleted.is_(False)
    ).update({Question.is_deleted: True}, synchronize_session=False)
    db.commit()
    return {"message": f"{len(ids)} question(s) deleted"}


# ── PATCH /questions/reorder ──────────────────────────────────────────────────

@router.patch("/questions/reorder")
def reorder_questions(
    body: ReorderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    form = db.get(Form, body.form_id)
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    if form.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the owner of this form")

    form_ids = {row[0] for row in db.query(Question.id).filter(Question.form_id == form.id, Question.is_deleted.is_(False)).all()}
    if set(body.orders) != form_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="orders must include exactly all questions in this form",
        )

    for idx, q_id in enumerate(body.orders):
        q = db.get(Question, q_id)
        if not q or q.form_id != body.form_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Question {q_id} not found in this form",
            )
        q.order_index = idx

    db.commit()
    return {"message": "Question order updated"}


# ── Grup soal ber-cerita bersama (wacana) ────────────────────────────────────
# Soal satu grup di-shuffle sebagai satu blok utuh; cerita ada di teks soal
# pertama (order_index terkecil). Anggota grup wajib satu section.

@router.post("/forms/{form_id}/questions/group")
def group_questions(
    body: QuestionGroupRequest,
    request: Request,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    questions = (
        db.query(Question)
        .filter(Question.id.in_(body.question_ids), Question.form_id == form.id, Question.is_deleted.is_(False))
        .all()
    )
    if len(questions) != len(body.question_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Soal tidak ditemukan pada form ini",
        )

    section_ids = {q.section_id for q in questions}
    if len(section_ids) != 1 or None in section_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Semua soal harus berada dalam section yang sama",
        )

    gid = str(uuid.uuid4())
    for q in questions:
        q.group_id = gid
    db.commit()
    return {
        "message": "Soal berhasil dikelompokkan",
        "data": [_build_question(q, request) for q in questions],
    }


@router.post("/forms/{form_id}/questions/group/{group_id}/questions")
def add_questions_to_group(
    form_id: int,
    group_id: str,
    body: GroupAddRequest,
    request: Request,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    # ponytail: 1 query untuk cek grup, 1 query untuk soal baru — tanpa N+1
    members = db.query(Question).filter(
        Question.form_id == form.id, Question.group_id == group_id, Question.is_deleted.is_(False)
    ).all()
    if not members:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grup tidak ditemukan")
    group_section = members[0].section_id
    to_add = db.query(Question).filter(
        Question.id.in_(body.question_ids), Question.form_id == form.id, Question.is_deleted.is_(False)
    ).all()
    if len(to_add) != len(body.question_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Soal tidak ditemukan pada form ini")
    for q in to_add:
        if q.group_id == group_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Soal {q.id} sudah ada di grup ini")
        if q.group_id is not None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Soal sudah tergabung di grup lain — keluarkan dulu")
        if q.section_id != group_section:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Semua soal harus berada dalam section yang sama dengan grup")
    for q in to_add:
        q.group_id = group_id
    db.commit()
    return {"message": f"{len(to_add)} soal ditambahkan ke grup", "data": [_build_question(q, request) for q in to_add]}


@router.delete("/forms/{form_id}/questions/group/{group_id}")
def ungroup_questions(
    form_id: int,
    group_id: str,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    members = (
        db.query(Question)
        .filter(Question.form_id == form.id, Question.group_id == group_id, Question.is_deleted.is_(False))
        .all()
    )
    if not members:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grup tidak ditemukan",
        )
    for q in members:
        q.group_id = None
    db.commit()
    return {"message": "Grup soal dihapus"}


@router.delete("/forms/{form_id}/questions/group/{group_id}/questions/{question_id}")
def remove_question_from_group(
    form_id: int,
    group_id: str,
    question_id: int,
    form: Form = Depends(verify_form_owner),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Question)
        .filter(Question.id == question_id, Question.form_id == form.id, Question.is_deleted.is_(False))
        .first()
    )
    if not q or q.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Soal tidak ada dalam grup ini",
        )
    q.group_id = None
    db.commit()
    return {"message": "Soal dikeluarkan dari grup"}


_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp3", ".wav", ".m4a", ".ogg", ".aac", ".webm"}


def _store_image(file: UploadFile, subdir: str) -> str:
    """Save an image or audio upload and return relative path. `file` must be non-null."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=422, detail="Unsupported file format, use image (JPG/PNG/GIF/WEBP) or audio (MP3/WAV/M4A/OGG/AAC/WEBM)")
    # ponytail: early reject jika size diketahui — hindari upload lama sebelum ditolak
    if getattr(file, "size", None) is not None and file.size > MAX_QUESTION_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail=f"Ukuran file terlalu besar ({file.size / (1024*1024):.1f}MB). Maksimal 10MB untuk gambar/audio soal")
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOAD_DIR, subdir, filename)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    write_limited(file.file, dest, MAX_QUESTION_MEDIA_BYTES)
    return f"{subdir}/{filename}"


def _replace_image(owner, subdir: str, file: UploadFile, db: Session, request: Request):
    """Upload (and replace) the single media (image/audio) for an owner (Question or QuestionOption)."""
    old = sorted(owner.images, key=lambda i: i.order_index or 0)
    new_path = _store_image(file, subdir)
    for img in old:
        _delete_file(img.path)
        db.delete(img)
    db.add(Image(question_id=owner.id if isinstance(owner, Question) else None,
                 option_id=owner.id if isinstance(owner, QuestionOption) else None,
                 path=new_path, order_index=0, created_at=now_wib()))
    db.commit()
    return file_url(request, new_path)


# ── Delete images ─────────────────────────────────────────────────────────────

@router.delete("/questions/{question_id}/image")
def delete_question_image(
    question_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _get_question_or_404(question_id, db)
    _ensure_owner(question, user, db)
    imgs = sorted(question.images, key=lambda i: i.order_index or 0)
    if not imgs:
        raise HTTPException(status_code=404, detail="Gambar tidak ditemukan")
    for img in imgs:
        _delete_file(img.path)
        db.delete(img)
    db.commit()
    return {"message": "Gambar soal dihapus"}


@router.delete("/questions/{question_id}/option/{option_id}/image")
def delete_option_image(
    question_id: int,
    option_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _get_question_or_404(question_id, db)
    _ensure_owner(question, user, db)
    opt = db.get(QuestionOption, option_id)
    if not opt or opt.question_id != question_id:
        raise HTTPException(status_code=404, detail="Option not found in this question")
    imgs = sorted(opt.images, key=lambda i: i.order_index or 0)
    if not imgs:
        raise HTTPException(status_code=404, detail="Gambar tidak ditemukan")
    for img in imgs:
        _delete_file(img.path)
        db.delete(img)
    db.commit()
    return {"message": "Gambar opsi dihapus"}


# ── Upload images ─────────────────────────────────────────────────────────────

@router.post("/questions/{question_id}/option/{option_id}/image", status_code=201)
def upload_option_image(
    question_id: int,
    option_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _get_question_or_404(question_id, db)
    _ensure_owner(question, user, db)
    opt = db.get(QuestionOption, option_id)
    if not opt or opt.question_id != question_id:
        raise HTTPException(status_code=404, detail="Option not found in this question")
    url = _replace_image(opt, "options", file, db, request)
    return {"message": "Option image uploaded", "image": {"path": url}}


@router.post("/questions/{question_id}/image", status_code=201)
def upload_question_image(
    question_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = _get_question_or_404(question_id, db)
    _ensure_owner(question, user, db)
    url = _replace_image(question, "questions", file, db, request)
    return {"message": "Question image uploaded", "image": {"path": url}}
