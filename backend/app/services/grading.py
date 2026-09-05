"""Shared quiz grading logic.

`Answer.is_correct` / `points_earned` are the only places scoring state lives.
They used to be written on ONE path (`POST /submissions/{id}/submit`); any
session auto-submitted by expiry skipped grading, leaving `is_correct` NULL —
which cascaded into zero per-question analytics and empty exports. Everything
that finishes a submission now routes through these helpers so no path can
leave a submission ungraded. `grade_answer` is also used at analytics read-time
so historical rows self-heal instead of showing stale zeros.
"""
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.answer import Answer
from app.models.form import Form
from app.models.question import Question, QuestionType
from app.models.submission import Submission
from app.schemas.question import normalize_answer_text, parse_answer_key


GRADABLE_TYPES = (
    QuestionType.multiple_choice,
    QuestionType.checkbox,
    QuestionType.password,
)

# Tipe isian yang ikut dinilai otomatis bila punya answer_key (khusus quiz).
KEYWORD_TYPES = (
    QuestionType.essay,
    QuestionType.short_answer,
)


def has_answer_key(question: Question) -> bool:
    """True bila soal isian punya kunci yang valid (non-kosong setelah parse)."""
    return question.type in KEYWORD_TYPES and bool(parse_answer_key(question.answer_key))


def max_score_for(questions, scoring_mode: str | None = None) -> float:
    """Total poin maksimal yang benar-benar bisa diraih.

    Hanya soal `is_scored` dengan tipe yang dinilai otomatis — termasuk
    essay/short_answer yang punya answer_key. Essay/date/time/file_upload
    tanpa kunci selalu 0 poin — kalau data lama membawa poin, tidak ikut
    menambah max_score (mencegah persen ≠ nilai mentah, mis. 67/102).
    """
    raw_max = float(sum(
        q.points or 0 for q in questions
        if q.is_scored and (q.type in GRADABLE_TYPES or has_answer_key(q))
    ))
    # Manual points may sum to any positive value. Public quiz score remains
    # percentage-based, matching auto mode's 100-point pool.
    if scoring_mode == "manual":
        return 100.0 if raw_max else 0.0
    return raw_max


def grade_answer(answer: Answer, question: Question):
    """Return (is_correct, points_earned) for a stored answer vs its question.

    Mirrors the original submit-time rules exactly:
      - non-gradable / unscored types -> (None, 0)
      - multiple_choice / checkbox    -> +points when selected == correct set
      - password                     -> exact keyword match
      - essay / short_answer berkunci -> +points bila salah satu kunci
        terkandung dalam jawaban (case-insensitive); tanpa kunci -> (None, 0)
    """
    # Essay/short_answer dengan answer_key: cocok-salah-satu (contains,
    # abaikan kapital). Tanpa kunci: perilaku lama (None, 0).
    if question.type in KEYWORD_TYPES:
        if not question.is_scored or not has_answer_key(question):
            return None, Decimal("0")
        text = normalize_answer_text(answer.answer_text)
        if not text:
            return False, Decimal("0")
        for key in parse_answer_key(question.answer_key):
            if key in text:
                return True, Decimal(str(question.points or 0))
        return False, Decimal("0")

    # ponytail: non-gradable types have no correct answer — 0 regardless of is_scored
    if question.type not in GRADABLE_TYPES or not question.is_scored:
        return None, Decimal("0")

    if question.type in (QuestionType.multiple_choice, QuestionType.checkbox):
        correct_ids = {o.id for o in question.options if o.is_correct}
        selected_ids = {ao.option_id for ao in answer.selected_options}
        if correct_ids and selected_ids == correct_ids:
            return True, Decimal(str(question.points or 0))
        return False, Decimal("0")

    if question.type == QuestionType.dropdown:
        return None, Decimal("0")

    # password: exact match, case-sensitive.
    if question.type == QuestionType.password:
        if question.password_keyword is not None and answer.answer_text == question.password_keyword:
            return True, Decimal(str(question.points or 0))
        return False, Decimal("0")

    return None, Decimal("0")


def grade_submission(db: Session, sub: Submission, form: Form):
    """Recompute correctness + score for every answer in a submission.

    Returns (total_score, max_score). Persists is_correct/points_earned and the
    submission totals but does NOT touch `status` or `submitted_at` — the caller
    owns the lifecycle transition (submit vs auto-submit).
    """
    questions = db.query(Question).filter(Question.form_id == form.id, Question.is_deleted.is_(False)).all()
    q_map = {q.id: q for q in questions}
    scoring_mode = form.scoring_mode.value if form.scoring_mode else "auto"
    raw_max_score = max_score_for(questions, scoring_mode=None)
    max_score = max_score_for(questions, scoring_mode=scoring_mode)
    total = 0.0

    for answer in db.query(Answer).filter(Answer.submission_id == sub.id).all():
        q = q_map.get(answer.question_id)
        if not q:
            continue
        correct, points = grade_answer(answer, q)
        answer.is_correct = correct
        answer.points_earned = points
        total += float(points)

    if scoring_mode == "manual" and raw_max_score:
        total = round(total / raw_max_score * 100, 2)
    sub.score = Decimal(str(total))
    sub.max_score = Decimal(str(max_score))
    return total, max_score
