from sqlalchemy import or_

from app.models.form import Form
from app.models.question import Question, QuestionType


def distribute_quiz_points(form_id: int, db, fixed_ids: set[int] | None = None) -> None:
    """Rebalance quiz points so all scored questions total 100.

    - `fixed_ids=None` (add / delete / import / toggle-on): every scored
      question gets an equal share of the 100 pool.
    - `fixed_ids={qid}` (points edited): that question keeps its current
      points and the remaining pool is split equally among the others.
    - `is_scored=false` questions are excluded entirely (detail-only).
    - Essay questions are excluded too, unless they carry an `answer_key`:
      keyless essay is never graded (see grading.py), so allocating it points
      would inflate max_score beyond what a respondent can reach.
    """
    form = db.get(Form, form_id)
    if not form or form.type.value != "quiz" or (form.scoring_mode and form.scoring_mode.value == "manual"):
        return
    # Session runs with autoflush=False — flush pending points/is_scored/deletes
    # first so the query below sees the current state.
    db.flush()
    questions = (
        db.query(Question)
        .filter(
            Question.form_id == form_id,
            Question.is_scored.is_(True),
            Question.is_deleted.is_(False),
            Question.type.notin_([QuestionType.date, QuestionType.time, QuestionType.datetime, QuestionType.file_upload, QuestionType.dropdown]),
            or_(
                Question.type != QuestionType.essay,
                Question.answer_key.isnot(None),
            ),
        )
        .order_by(Question.order_index, Question.id)
        .all()
    )
    if not questions:
        return

    if fixed_ids:
        fixed = [q for q in questions if q.id in fixed_ids]
        others = [q for q in questions if q.id not in fixed_ids]
        if not others:
            return
        remaining = 100 - sum(q.points for q in fixed)
        if remaining <= 0:
            for q in others:
                q.points = 0
            return
        base = remaining // len(others)
        rem = remaining % len(others)
        for i, q in enumerate(others):
            q.points = base + (1 if i < rem else 0)
    else:
        base = 100 // len(questions)
        rem = 100 % len(questions)
        for i, q in enumerate(questions):
            q.points = base + (1 if i < rem else 0)
