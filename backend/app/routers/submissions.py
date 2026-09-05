import random
import re
import secrets
import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status, UploadFile, File
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_optional_user
from app.models.answer import Answer
from app.models.answer_option import AnswerOption
from app.models.form import Form, FormStatus, SubmissionLimit
from app.models.question import Question, QuestionType, Section
from app.models.question_option import QuestionOption
from app.models.submission import Submission, SubmissionStatus
from app.models.submission_question_order import SubmissionQuestionOrder
from app.models.submission_option_order import SubmissionOptionOrder
from app.models.user import User
from app.ratelimit import limit_submission_create
from app.services.grading import grade_submission, max_score_for
from app.services.session_expiry import display_deadline, is_expired, auto_submit_expired_for_form, finalize_locked
from app.utils import now_wib, fmt_dt, file_url, _delete_file, UPLOAD_DIR, MAX_ANSWER_FILE_BYTES, write_limited
from app.schemas.submissions import (
    SubmissionCreateRequest,
    SubmissionCreateResponse,
    QuestionWithOptions,
    OptionPublic,
    AutosaveRequest,
    PasswordCheckRequest,
    SubmitResponse,
    TabExitRequest,
    SubmissionDetailResponse,
    SavedAnswer,
    SubmissionListItem,
    SubmissionListResponse,
)

router = APIRouter(tags=["submissions"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _now():
    return now_wib()


def _get_sub_or_404(sub_id: int, db: Session) -> Submission:
    sub = db.get(Submission, sub_id)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return sub


def _get_question_for_submission(question_id: int, sub: Submission, db: Session) -> Question:
    q = db.get(Question, question_id)
    if not q or q.form_id != sub.form_id or q.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found in this submission",
        )
    return q


def _validate_option_ids(option_ids: list[int], question: Question) -> None:
    valid = {o.id for o in question.options}
    for oid in option_ids:
        if oid not in valid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Option {oid} not found in this question",
            )


TEXT_LIMITS = {
    QuestionType.short_answer: 500,
    QuestionType.essay: 5000,
}

def _validate_date_time(question: Question, value: str) -> None:
    """Format ketat untuk tipe date/time — cegah input liar dari responden."""
    if question.type == QuestionType.date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Format tanggal harus YYYY-MM-DD",
        )
    if question.type == QuestionType.time and not re.fullmatch(r"\d{2}:\d{2}", value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Format waktu harus HH:MM",
        )
    if question.type == QuestionType.datetime and not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Format datetime harus YYYY-MM-DDTHH:MM",
        )


def _validate_text_length(question: Question, value: str) -> None:
    limit = TEXT_LIMITS.get(question.type)
    if limit and len(value) > limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Jawaban melebihi batas {limit} karakter ({len(value)}/{limit})",
        )


# ── POST /submissions/{id}/answers/{question_id}/file ─────────────────────────
# Upload jawaban file (tipe file_upload). File disimpan di uploads/answer_files/.

ALLOWED_ANSWER_EXT = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".png", ".jpg", ".jpeg", ".zip",
}


@router.post("/submissions/{submission_id}/answers/{question_id}/file")
def upload_answer_file(
    submission_id: int,
    question_id: int,
    file: UploadFile = File(...),
    request: Request = None,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    # request di-inject otomatis oleh FastAPI (tipe Request selalu diisi)
    sub = _get_sub_or_404(submission_id, db)
    _verify_submission_access(sub, request, user, db, x_submission_token)
    if sub.status == SubmissionStatus.locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ujian dikunci — menunggu keputusan pengawas")
    if sub.status != SubmissionStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pengerjaan sudah selesai")

    question = _get_question_for_submission(question_id, sub, db)
    if question.type != QuestionType.file_upload:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File hanya bisa diunggah untuk soal bertipe file upload",
        )

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_ANSWER_EXT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tipe file tidak diizinkan (pdf, doc, xls, ppt, txt, csv, gambar, zip)",
        )

    # Hapus file jawaban lama supaya tidak menumpuk
    answer = db.query(Answer).filter(
        Answer.submission_id == sub.id,
        Answer.question_id == question_id,
    ).first()
    if answer and answer.answer_file:
        _delete_file(answer.answer_file)

    fname = f"answer_{uuid.uuid4().hex}{ext}"
    fdir = Path(UPLOAD_DIR) / "answer_files"
    fdir.mkdir(parents=True, exist_ok=True)
    fpath = fdir / fname
    write_limited(file.file, str(fpath), MAX_ANSWER_FILE_BYTES)

    if not answer:
        answer = Answer(submission_id=sub.id, question_id=question_id, created_at=now_wib())
        db.add(answer)
        db.flush()
    answer.answer_file = f"answer_files/{fname}"
    answer.updated_at = now_wib()
    db.commit()
    return {"answer_file": file_url(request, answer.answer_file), "filename": file.filename or fname}


@router.delete("/submissions/{submission_id}/answers/{question_id}/file")
def delete_answer_file(
    submission_id: int,
    question_id: int,
    request: Request = None,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Remove the respondent's uploaded file from both storage and Answer."""
    sub = _get_sub_or_404(submission_id, db)
    _verify_submission_access(sub, request, user, db, x_submission_token)
    if sub.status == SubmissionStatus.locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ujian dikunci — menunggu keputusan pengawas")
    if sub.status != SubmissionStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pengerjaan sudah selesai")

    question = _get_question_for_submission(question_id, sub, db)
    if question.type != QuestionType.file_upload:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Soal ini bukan tipe file upload")

    answer = db.query(Answer).filter(
        Answer.submission_id == sub.id,
        Answer.question_id == question_id,
    ).first()
    if not answer or not answer.answer_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File jawaban tidak ditemukan")

    _delete_file(answer.answer_file)
    answer.answer_file = None
    answer.updated_at = _now()
    db.commit()
    return {"message": "File jawaban dihapus", "question_id": question_id}


def _missing_required(sub: Submission, form: Form, db: Session) -> list[str]:
    """Return question texts of required questions left unanswered (FR-10)."""
    questions = db.query(Question).filter(
        Question.form_id == form.id,
        Question.is_required == True,  # noqa: E712
        Question.is_deleted.is_(False),
    ).all()
    if not questions:
        return []

    q_map = {q.id: q for q in questions}
    answers = db.query(Answer).filter(
        Answer.submission_id == sub.id,
        Answer.question_id.in_([q.id for q in questions]),
    ).all()

    missing: list[str] = []
    for a in answers:
        q = q_map.get(a.question_id)
        if not q:
            continue
        text = re.sub(r"<[^>]+>", "", q.question_text).strip() or "Soal"
        if q.type in (QuestionType.multiple_choice, QuestionType.checkbox, QuestionType.dropdown):
            if not a.selected_options and not (a.answer_text or "").strip():
                missing.append(text)
        elif q.type == QuestionType.file_upload:
            if not a.answer_file:
                missing.append(text)
        elif a.answer_text is None or not a.answer_text.strip():
            missing.append(text)

    answered_ids = {a.question_id for a in answers}
    for q in questions:
        if q.id not in answered_ids:
            missing.append(re.sub(r"<[^>]+>", "", q.question_text).strip() or "Soal")
    return missing


def _image_obj(img, request: Request) -> dict | None:
    """Single image object (first image only) — same shape as questions router."""
    if img is None:
        return None
    return {"id": img.id, "path": file_url(request, img.path)}


def _build_questions_response(sub_id: int, request: Request, db: Session, include_deleted: bool = False) -> list[QuestionWithOptions]:
    """
    Ordered questions for a submission — respects per-submission shuffle.
    Does NOT expose is_correct (security boundary for respondents).
    """
    qs_filter = [SubmissionQuestionOrder.submission_id == sub_id]
    if not include_deleted:
        qs_filter.append(Question.is_deleted.is_(False))
    ordered_qs = (
        db.query(Question)
        .join(SubmissionQuestionOrder, SubmissionQuestionOrder.question_id == Question.id)
        .filter(*qs_filter)
        .order_by(SubmissionQuestionOrder.order_index)
        .all()
    )

    # Soal baru yang ditambahkan creator setelah sesi dimulai ikut tampil di
    # preview responden. Di bawah, list final disortir per section (stable) —
    # urutan snapshot dalam section tetap utuh, tapi soal baru/terpindah
    # selalu mendarat di blok section-nya, bukan nempel di ekor array.
    sub = db.get(Submission, sub_id)
    seen_ids = {q.id for q in ordered_qs}
    new_filter = [Question.form_id == sub.form_id, ~Question.id.in_(seen_ids)]
    if not include_deleted:
        new_filter.append(Question.is_deleted.is_(False))
    new_qs = (
        db.query(Question)
        .filter(*new_filter)
        .order_by(Question.order_index)
        .all()
    )
    ordered_qs = ordered_qs + new_qs

    section_rank = {
        s.id: idx for idx, s in enumerate(
            db.query(Section).filter(Section.form_id == sub.form_id).order_by(Section.order_index).all()
        )
    }
    # None / section terhapus → paling belakang. Stable sort = urutan snapshot
    # dalam section (termasuk hasil shuffle) tidak tersentuh.
    ordered_qs.sort(key=lambda q: section_rank.get(q.section_id, len(section_rank)))

    result = []
    for idx, q in enumerate(ordered_qs):
        if q.type in (QuestionType.multiple_choice, QuestionType.checkbox, QuestionType.dropdown):
            opt_order = {
                soo.option_id: soo.order_index
                for soo in db.query(SubmissionOptionOrder).filter(
                    SubmissionOptionOrder.submission_id == sub_id,
                    SubmissionOptionOrder.option_id.in_([o.id for o in q.options]),
                ).all()
            }
            opts = sorted(q.options, key=lambda o: opt_order.get(o.id, o.order_index or 0))
        else:
            opts = []

        q_img = sorted(q.images, key=lambda i: i.order_index or 0)
        result.append(QuestionWithOptions(
            id=q.id,
            type=q.type.value,
            question_text=q.question_text,
            order_index=idx,
            is_required=q.is_required,
            section_id=q.section_id,
            group_id=q.group_id,
            allow_other=bool(q.allow_other),
            image=_image_obj(q_img[0], request) if q_img else None,
            options=[
                OptionPublic(
                    id=o.id,
                    option_text=o.option_text,
                    order_index=i,
                    image=_image_obj(sorted(o.images, key=lambda im: im.order_index or 0)[0], request) if o.images else None,
                )
                for i, o in enumerate(opts)
            ],
        ))
    return result


# ── POST /submissions ─────────────────────────────────────────────────────────

@router.post("/submissions", status_code=201)
def create_submission(
    body: SubmissionCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    _rl: None = Depends(limit_submission_create),
):
    """
    Start a new submission session and receive all questions ordered for this session.

    If the user/IP already has an in-progress session for this form, the existing
    session is RESUMED instead of creating a duplicate — so refreshing the page or
    navigating away and coming back will always restore the same session with the
    same question order and already-saved answers.
    """
    form = db.get(Form, body.form_id)
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    is_owner = bool(user and form.user_id == user.id)
    # Publik hanya untuk published. Creator tetap bisa preview form draft/closed.
    if form.status != FormStatus.published and not is_owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    if form.require_login and not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required to access this form")

    now = _now()
    # Owner hanya bebas dari jadwal ketika preview form draft/closed (status
    # non-published). Form published terikat starts_at/ends_at untuk semua user.
    is_preview = is_owner and form.status != FormStatus.published
    ends = form.ends_at
    if not is_preview and ends and now > ends:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Form is closed")

    starts = form.starts_at
    if not is_preview and starts and now < starts:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Form is not opened")

    ip = request.client.host if request.client else None

    # ── Resume existing in-progress session ──────────────────────────────────
    # Instead of returning 409, we hand back the existing session so the
    # respondent can continue after a refresh/navigation without losing progress.
    # Saat user login, session anonim (user_id NULL) dari IP yang sama juga
    # di-resume & di-claim agar tidak ter-orphan setelah login.
    in_progress_q = db.query(Submission).filter(
        Submission.form_id == form.id,
        Submission.status.in_([SubmissionStatus.in_progress, SubmissionStatus.locked]),
    )
    if user:
        in_progress_q = in_progress_q.filter(
            or_(
                Submission.user_id == user.id,
                and_(Submission.user_id.is_(None), Submission.ip_address == ip),
            )
        )
    elif ip:
        in_progress_q = in_progress_q.filter(Submission.ip_address == ip)

    sections = [
        {"id": s.id, "title": s.title}
        for s in db.query(Section).filter(Section.form_id == form.id).order_by(Section.order_index).all()
    ]

    existing = in_progress_q.order_by(Submission.created_at.asc()).first()
    if existing:
        # Claim session anonim ke user login supaya tidak ter-orphan.
        if user and existing.user_id is None:
            existing.user_id = user.id
            if not existing.respondent_name:
                existing.respondent_name = user.name
            if not existing.respondent_email:
                existing.respondent_email = user.email
            db.commit()
        # Edge-case: the existing session may have already expired server-side.
        if is_expired(existing, form):
            existing.status = SubmissionStatus.auto_submitted
            existing.submitted_at = now
            total_score, max_score = grade_submission(db, existing, form)
            db.commit()
            # Return data, bukan exception — client bisa langsung tampilkan
            # skor tanpa perlu fetch ulang.
            return {
                "submission_id": existing.id,
                "status": "expired",
                "message": "Sesi sebelumnya telah kedaluwarsa dan otomatis dinilai",
                "score": total_score,
                "max_score": max_score,
            }

        # Return the existing session with the same question order — idempotent resume.
        return SubmissionCreateResponse(
            submission_id=existing.id,
            access_token=existing.access_token,
            status=existing.status.value,
            started_at=fmt_dt(existing.started_at),
            expired_at=fmt_dt(display_deadline(existing, form)),
            questions=_build_questions_response(existing.id, request, db),
            sections=sections,
            resumed=True,
        )

    # ── Check submission_limit=once ───────────────────────────────────────────
    # Identitas respondent = akun, bukan IP (rantai setting: once → require_login).
    # Submission anonim dari IP yang sama TIDAK dihitung untuk user yang login,
    # karena sebuah submission anonim tidak dapat diatribusikan ke akun tertentu
    # dan IP yang dibagi (NAT/dev 127.0.0.1) akan memblokir akun baru secara salah.
    if form.submission_limit == SubmissionLimit.once and not is_owner:
        done_q = db.query(Submission).filter(
            Submission.form_id == form.id,
            Submission.status.in_([SubmissionStatus.submitted, SubmissionStatus.auto_submitted, SubmissionStatus.cheating]),
        )
        if user:
            done_q = done_q.filter(Submission.user_id == user.id)
        elif ip:
            done_q = done_q.filter(Submission.ip_address == ip)
        if done_q.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already submitted this form")

    # ── Create new session ────────────────────────────────────────────────────
    sub = Submission(
        form_id=form.id,
        user_id=user.id if user else None,
        access_token=secrets.token_urlsafe(32),
        respondent_name=body.respondent_name or (user.name if user else None),
        respondent_email=body.respondent_email or (user.email if user else None),
        ip_address=ip,
        status=SubmissionStatus.in_progress,
        started_at=now,
        created_at=now,
    )
    db.add(sub)
    db.flush()

    questions = (
        db.query(Question)
        .filter(Question.form_id == form.id, Question.is_deleted.is_(False))
        .order_by(Question.order_index)
        .all()
    )
    # Section = unit urutan untuk SEMUA form (bukan hanya shuffle): snapshot
    # selalu section-berurutan supaya konsumen array (quiz mode, export) tidak
    # melihat soal nyasar di ekor. Shuffle mengacak blok DI DALAM section saja.
    # Grup soal ber-cerita tetap satu blok utuh. ponytail: O(n²) scan;
    # ribuan soal baru ganti dict-pass.
    def _blocks(items: list[Question]) -> list[list[Question]]:
        seen_groups: set[str] = set()
        blocks: list[list[Question]] = []
        for q in items:  # sudah urut order_index
            if q.group_id and q.group_id in seen_groups:
                continue
            if q.group_id:
                seen_groups.add(q.group_id)
                blocks.append(sorted(
                    (x for x in items if x.group_id == q.group_id),
                    key=lambda x: x.order_index,
                ))
            else:
                blocks.append([q])
        return blocks

    section_ids = [row.id for row in db.query(Section.id).filter(Section.form_id == form.id).order_by(Section.order_index).all()]

    def _ordered_by_section(items: list[Question], do_shuffle: bool) -> list[Question]:
        by_section: dict = {}
        for q in items:  # sudah urut order_index
            by_section.setdefault(q.section_id, []).append(q)

        result: list[Question] = []
        for sid in section_ids:
            bucket = by_section.pop(sid, None)
            if not bucket:
                continue
            blocks = _blocks(bucket)
            if do_shuffle:
                random.shuffle(blocks)
            result.extend(m for block in blocks for m in block)
        for leftover in by_section.values():  # soal tanpa section / section terhapus
            blocks = _blocks(leftover)
            if do_shuffle:
                random.shuffle(blocks)
            result.extend(m for block in blocks for m in block)
        return result

    if form.shuffle_questions:
        questions = _ordered_by_section(questions, do_shuffle=True)
    else:
        questions = _ordered_by_section(questions, do_shuffle=False)

    for idx, q in enumerate(questions):
        db.add(SubmissionQuestionOrder(submission_id=sub.id, question_id=q.id, order_index=idx))
        if form.shuffle_options and q.type in (QuestionType.multiple_choice, QuestionType.checkbox, QuestionType.dropdown):
            opts = list(q.options)
            random.shuffle(opts)
            for oi, opt in enumerate(opts):
                db.add(SubmissionOptionOrder(submission_id=sub.id, option_id=opt.id, order_index=oi))

    db.commit()
    db.refresh(sub)

    return SubmissionCreateResponse(
        submission_id=sub.id,
        access_token=sub.access_token,
        started_at=fmt_dt(sub.started_at),
        expired_at=fmt_dt(display_deadline(sub, form)),
        questions=_build_questions_response(sub.id, request, db),
        sections=sections,
        resumed=False,
    )


# ── PATCH /submissions/{id}/autosave ─────────────────────────────────────────

def _verify_submission_access(
    sub: Submission,
    request: Request,
    user: User | None,
    db: Session,
    session_token: str | None = None,
) -> None:
    form = db.get(Form, sub.form_id)
    if form and user and form.user_id == user.id:
        return
    if sub.user_id and user and sub.user_id == user.id:
        return
    # Token sesi: bukti kepemilikan utama untuk responden anonim.
    if session_token and sub.access_token and secrets.compare_digest(session_token, sub.access_token):
        return
    client_ip = request.client.host if request.client else None
    if sub.ip_address and client_ip and sub.ip_address == client_ip:
        return
    if sub.user_id is None:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


@router.patch("/submissions/{submission_id}/autosave")
def autosave(
    submission_id: int,
    body: AutosaveRequest,
    request: Request,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    sub = _get_sub_or_404(submission_id, db)
    _verify_submission_access(sub, request, user, db, x_submission_token)
    form = db.get(Form, sub.form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if form.require_login and not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required to access this form")

    if sub.status == SubmissionStatus.locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ujian dikunci — menunggu keputusan pengawas")
    if sub.status != SubmissionStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Submission already completed")

    if is_expired(sub, form):
        sub.status = SubmissionStatus.auto_submitted
        sub.submitted_at = _now()
        grade_submission(db, sub, form)
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Submission time has expired")

    question = _get_question_for_submission(body.question_id, sub, db)
    if body.option_ids:
        _validate_option_ids(body.option_ids, question)
    if body.answer_text is not None:
        if question.type == QuestionType.file_upload:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Soal file upload dijawab melalui unggah file",
            )
        _validate_date_time(question, body.answer_text)
        _validate_text_length(question, body.answer_text)

    answer = db.query(Answer).filter(
        Answer.submission_id == sub.id,
        Answer.question_id == body.question_id,
    ).first()
    if not answer:
        answer = Answer(submission_id=sub.id, question_id=body.question_id, created_at=_now())
        db.add(answer)
        db.flush()

    if body.option_ids is not None:
        db.query(AnswerOption).filter(AnswerOption.answer_id == answer.id).delete()
        for oid in body.option_ids:
            db.add(AnswerOption(answer_id=answer.id, option_id=oid))
        # Teks "Lainnya" boleh menumpang bersama opsi — hanya bila soalnya
        # MC/checkbox dengan flag allow_other. Selain itu teks dibuang
        # (perilaku lama) atau ditolak bila diisi (fail-closed).
        if body.answer_text:
            if question.type not in (QuestionType.multiple_choice, QuestionType.checkbox) or not question.allow_other:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Soal ini tidak mengizinkan jawaban lainnya",
                )
            if len(body.answer_text) > 500:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Jawaban lainnya maksimal 500 karakter",
                )
            answer.answer_text = body.answer_text
        else:
            answer.answer_text = None
    elif body.answer_text is not None:
        answer.answer_text = body.answer_text
        db.query(AnswerOption).filter(AnswerOption.answer_id == answer.id).delete()

    answer.updated_at = _now()
    db.commit()
    return {"message": "Answer saved", "question_id": body.question_id}


# ── POST /submissions/{id}/questions/{question_id}/check-password ─────────────
# Gerbang section: klien tidak punya keyword (tidak pernah dikirim ke publik),
# jadi pencocokan terjadi di sini. Constant-time compare.

@router.post("/submissions/{submission_id}/questions/{question_id}/check-password")
def check_password(
    submission_id: int,
    question_id: int,
    body: PasswordCheckRequest,
    request: Request,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    sub = _get_sub_or_404(submission_id, db)
    _verify_submission_access(sub, request, user, db, x_submission_token)
    question = _get_question_for_submission(question_id, sub, db)
    if question.type != QuestionType.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question is not a password type",
        )
    keyword = question.password_keyword or ""
    valid = bool(keyword) and secrets.compare_digest(body.answer or "", keyword)
    return {"valid": valid}


# ── POST /submissions/{id}/tab-exit ──────────────────────────────────────────
# Fullscreen anti-cheat (is_restricted quiz). Client memberi grace period 5
# detik sebelum melaporkan exit yang bertahan; satu laporan terkonfirmasi
# mengunci submission server-side.

# Satu pelanggaran yang bertahan melewati grace period frontend sudah cukup
# untuk mengunci sesi. Grace period 5 detik mencegah false-positive ketika
# browser memancarkan blur/visibility/fullscreen event secara bersamaan.
CHEAT_THRESHOLD = 1


@router.post("/submissions/{submission_id}/tab-exit")
def report_tab_exit(
    submission_id: int,
    request: Request,
    body: TabExitRequest | None = None,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    sub = _get_sub_or_404(submission_id, db)
    _verify_submission_access(sub, request, user, db, x_submission_token)
    form = db.get(Form, sub.form_id)
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    if form.type.value != "quiz" or not form.is_restricted:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fullscreen mode is not enabled for this form")
    if sub.status == SubmissionStatus.locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ujian dikunci — menunggu keputusan pengawas")
    if sub.status != SubmissionStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Submission already completed")

    sub.tab_exit_count = (sub.tab_exit_count or 0) + 1
    sub.updated_at = _now()

    if body and body.reason:
        reasons = [r.strip() for r in (sub.cheat_reason or "").split(";") if r.strip()]
        reasons.append(body.reason.strip())
        sub.cheat_reason = "; ".join(reasons[-5:])[:255]

    if sub.tab_exit_count >= CHEAT_THRESHOLD:
        # Bukan langsung nilai 0 — kunci layar, creator yang memutuskan
        # (lanjut / finalisasi) lewat POST /forms/{id}/results/{sid}/decision.
        # Tak diputuskan 5 menit → sweep otomatis finalisasi curang.
        sub.status = SubmissionStatus.locked
        sub.updated_at = _now()
        db.commit()
        return {
            "message": "Pelanggaran terdeteksi. Ujian dikunci sementara — menunggu keputusan pengawas.",
            "status": "locked",
            "warnings_left": 0,
            "cheat_reason": sub.cheat_reason,
            "locked_at": fmt_dt(sub.updated_at),
        }

    db.commit()
    return {
        "message": "Tab exit recorded",
        "tab_exit_count": sub.tab_exit_count,
        "warnings_left": 0,
    }


# ── POST /submissions/{id}/lock ───────────────────────────────────────────────

@router.post("/submissions/{submission_id}/lock")
@router.post("/forms/{form_id}/submissions/{submission_id}/lock")
def lock_submission(
    submission_id: int,
    request: Request,
    body: TabExitRequest | None = None,
    form_id: int | None = None,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    sub = _get_sub_or_404(submission_id, db)

    if sub.status == SubmissionStatus.in_progress:
        sub.status = SubmissionStatus.locked
        sub.tab_exit_count = (sub.tab_exit_count or 0) + 1
        sub.cheat_reason = (body.reason if body else None) or "Keluar dari aplikasi (App background/inactive)"
        sub.updated_at = _now()
        db.commit()

    return {
        "message": "Submission terkunci — menunggu keputusan pengawas",
        "status": sub.status.value,
    }


# ── POST /submissions/{id}/submit ─────────────────────────────────────────────

@router.post("/submissions/{submission_id}/submit")
def submit_answers(
    submission_id: int,
    request: Request,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    sub = _get_sub_or_404(submission_id, db)
    _verify_submission_access(sub, request, user, db, x_submission_token)
    form = db.get(Form, sub.form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if form.require_login and not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required to access this form")

    if sub.status == SubmissionStatus.locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ujian dikunci — menunggu keputusan pengawas")
    if sub.status != SubmissionStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Submission already completed")

    expired = is_expired(sub, form)
    if not expired:
        # FR-10 — soal wajib harus dijawab sebelum submit final (auto-submit
        # karena waktu habis tetap diproses agar tidak kehilangan data).
        missing = _missing_required(sub, form, db)
        if missing:
            names = " • ".join(missing[:5])
            more = f" (+{len(missing) - 5} lainnya)" if len(missing) > 5 else ""
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Soal wajib belum dijawab: {names}{more}",
            )

    sub.status = SubmissionStatus.auto_submitted if expired else SubmissionStatus.submitted
    sub.submitted_at = _now()
    total_score, max_score = grade_submission(db, sub, form)
    db.commit()

    return SubmitResponse(
        message="Submission completed successfully",
        status=sub.status.value,
        score=total_score,
        max_score=max_score,
    )


# ── GET /submissions/{id} ─────────────────────────────────────────────────────

@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: int,
    request: Request,
    x_submission_token: str | None = Header(None, alias="X-Submission-Token"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    sub = _get_sub_or_404(submission_id, db)
    form = db.get(Form, sub.form_id)
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    # Fallback 5 menit: locked yang tak diputuskan creator otomatis jadi cheating —
    # dijalankan di sini supaya responden yang poll melihat status final tanpa
    # menunggu creator membuka dashboard.
    finalize_locked(db, sub, form)

    is_owner = user and form.user_id == user.id
    is_respondent = sub.user_id and user and sub.user_id == user.id
    has_session_token = bool(
        x_submission_token
        and sub.access_token
        and secrets.compare_digest(x_submission_token, sub.access_token)
    )
    # Legacy: baris tanpa access_token masih boleh via IP peer langsung,
    # agar session anonim lama tetap bisa diakses setelah login.
    client_ip = request.client.host if request.client else None
    is_same_ip = bool(sub.ip_address and client_ip and sub.ip_address == client_ip)

    if not is_owner and not is_respondent and not has_session_token and not is_same_ip and sub.user_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Ordered questions (respects per-submission shuffle stored in DB)
    # in_progress: sembunyikan soal yang dihapus creator (responden sedang mengerjakan).
    # completed: tampilkan semua termasuk yang dihapus (responden sudah menjawabnya).
    completed = sub.status in (SubmissionStatus.submitted, SubmissionStatus.auto_submitted, SubmissionStatus.cheating)
    questions = _build_questions_response(sub.id, request, db, include_deleted=completed)

    # Build a map of option_id → option_text for the whole form (used in answers)
    q_filter = [Question.form_id == form.id]
    if not completed:
        q_filter.append(Question.is_deleted.is_(False))
    all_options = db.query(QuestionOption).join(
        Question, Question.id == QuestionOption.question_id
    ).filter(*q_filter).all()
    opt_text_map = {o.id: o.option_text for o in all_options}

    # Label opsi = huruf sesuai urutan yang dilihat responden (bisa ter-shuffle
    # per-submission via SubmissionOptionOrder), fallback ke urutan editor.
    sub_opt_order = {
        soo.option_id: soo.order_index
        for soo in db.query(SubmissionOptionOrder).filter(
            SubmissionOptionOrder.submission_id == sub.id
        ).all()
    }
    opts_by_q: dict[int, list] = {}
    for o in all_options:
        opts_by_q.setdefault(o.question_id, []).append(o)
    opt_label_map: dict[int, str] = {}
    for opts in opts_by_q.values():
        opts.sort(key=lambda o: sub_opt_order.get(o.id, o.order_index or 0))
        for i, o in enumerate(opts):
            if i < 8:  # sama dengan LETTERS di frontend
                opt_label_map[o.id] = f"{'ABCDEFGH'[i]}. "

    q_map = {q.id: q for q in db.query(Question).filter(*q_filter).all()}

    # Keamanan (FR-34/7.3): jangan bocorkan is_correct/score sebelum submission selesai.
    # Toggle creator (khusus quiz): reveal_score mengontrol angka nilai final,
    # reveal_answers mengontrol review jawaban (is_correct / points per soal).
    # Creator selalu boleh melihat keduanya.
    non_quiz = form.type.value != "quiz"
    reveal_score = completed and (non_quiz or form.reveal_score or is_owner)
    reveal_answers = completed and (non_quiz or form.reveal_answers or is_owner)

    answers_data: list[SavedAnswer] = []
    for answer in db.query(Answer).filter(Answer.submission_id == sub.id).all():
        q = q_map.get(answer.question_id)
        if not q:
            continue

        selected_ids = [ao.option_id for ao in answer.selected_options]
        selected_texts = [
            opt_label_map.get(oid, "") + opt_text_map[oid]
            for oid in selected_ids if oid in opt_text_map
        ]

        # Resolve question image URL (first image if any)
        q_imgs = sorted(q.images, key=lambda i: i.order_index or 0)
        q_image_url = file_url(request, q_imgs[0].path) if q_imgs else None

        answers_data.append(SavedAnswer(
            question_id=q.id,
            question_text=q.question_text,
            question_type=q.type.value,
            question_image=q_image_url,
            selected_option_ids=selected_ids,
            answer_text=answer.answer_text,
            answer_file=file_url(request, answer.answer_file),
            selected_options=selected_texts,
            is_correct=answer.is_correct if reveal_answers else None,
            points_earned=float(answer.points_earned) if reveal_answers and answer.points_earned is not None else None,
        ))

    sections = [
        {"id": s.id, "title": s.title}
        for s in db.query(Section).filter(Section.form_id == form.id).order_by(Section.order_index).all()
    ]

    # max_score dihitung live dari soal (bukan nilai tersimpan) supaya data
    # lama yang tersimpan dengan max salah (mis. ikut poin soal non-grade)
    # langsung tampil benar tanpa menunggu regrade.
    live_max = max_score_for(
        db.query(Question).filter(Question.form_id == form.id, Question.is_deleted.is_(False)).all(),
        scoring_mode=form.scoring_mode.value if form.scoring_mode else "auto",
    )

    return SubmissionDetailResponse(
        id=sub.id,
        status=sub.status.value,
        started_at=fmt_dt(sub.started_at),
        expired_at=fmt_dt(display_deadline(sub, form)),
        score=float(sub.score) if reveal_score and sub.score is not None else None,
        max_score=float(live_max) if reveal_score else None,
        submitted_at=fmt_dt(sub.submitted_at),
        respondent_name=sub.respondent_name,
        respondent_email=sub.respondent_email,
        tab_exit_count=sub.tab_exit_count or 0,
        cheat_reason=sub.cheat_reason,
        locked_at=fmt_dt(sub.updated_at) if sub.status == SubmissionStatus.locked else None,
        questions=questions,
        sections=sections,
        answers=answers_data,
    )


# ── GET /me/submissions ───────────────────────────────────────────────────────

@router.get("/me/submissions", response_model=SubmissionListResponse)
def my_submissions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subs = (
        db.query(Submission)
        .join(Form, Submission.form_id == Form.id)
        .filter(
            Submission.user_id == user.id,
            Form.show_in_history == True,  # noqa: E712 — form yang disetel agar tidak tampil di riwayat disaring
        )
        .order_by(Submission.created_at.desc())
        .all()
    )
    data = [
        SubmissionListItem(
            id=s.id,
            form_title=re.sub(r"<[^>]*>", "", s.form.title) if s.form else "(deleted)",
            status=s.status.value,
            type=s.form.type.value if s.form else "form",
            score=float(s.score) if s.score is not None else None,
            reveal_score=s.form.reveal_score if s.form else True,
            submitted_at=fmt_dt(s.submitted_at),
        )
        for s in subs
    ]
    return SubmissionListResponse(data=data)
