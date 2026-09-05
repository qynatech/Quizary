from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.form import FlexDatetime, _title_has_text
from app.schemas.question import QuestionCreate

HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"


class AiSettings(BaseModel):
    shuffle_questions: bool = False
    shuffle_options: bool = False
    timer_minutes: Optional[int] = Field(None, ge=1, le=1440)
    require_login: bool = False
    submission_limit: str = "unlimited"
    # non-file extras (diatur AI via prompt, tanpa upload)
    show_leaderboard: bool = False
    is_restricted: bool = False
    show_in_history: bool = True
    reveal_score: bool = True
    reveal_answers: bool = True
    display_style: str = "card"
    scoring_mode: str = "auto"
    theme_color: Optional[str] = Field(None, pattern=HEX_COLOR)
    thank_you_message: Optional[str] = Field(None, max_length=2000)
    starts_at: Optional[FlexDatetime] = None
    ends_at: Optional[FlexDatetime] = None

    @model_validator(mode="after")
    def validate_enums(self):
        if self.submission_limit not in ("unlimited", "once"):
            raise ValueError("submission_limit harus 'unlimited' atau 'once'")
        if self.display_style not in ("card", "quiz"):
            raise ValueError("display_style harus 'card' atau 'quiz'")
        if self.scoring_mode not in ("auto", "manual"):
            raise ValueError("scoring_mode harus 'auto' atau 'manual'")
        if self.starts_at and self.ends_at and self.starts_at >= self.ends_at:
            raise ValueError("starts_at harus sebelum ends_at")
        return self


class AiSectionAccept(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    questions: list[QuestionCreate] = Field(min_length=1, max_length=50)


class AiAcceptRequest(BaseModel):
    title: str = Field(min_length=1, max_length=1000)
    description: Optional[str] = Field(None, max_length=5000)
    type: str = "form"
    settings: AiSettings = AiSettings()
    sections: list[AiSectionAccept] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_title(self):
        _title_has_text(self.title)
        return self

    @model_validator(mode="after")
    def validate_enums(self):
        if self.type not in ("form", "quiz"):
            raise ValueError("type harus 'form' atau 'quiz'")
        return self


class AiDraftOption(BaseModel):
    option_text: str
    is_correct: bool


class AiDraftQuestion(BaseModel):
    type: str
    question_text: str
    is_required: bool = True
    points: int = 0
    options: list[AiDraftOption] = []
    password_keyword: Optional[str] = None
    # Kunci jawaban (creator yang isi saat review — AI tidak menebak) dan
    # flag opsi "Lainnya" (true hanya bila user memintanya di prompt).
    answer_key: Optional[str] = None
    allow_other: bool = False


class AiDraftSection(BaseModel):
    title: str
    questions: list[AiDraftQuestion]


class AiDraftSettings(BaseModel):
    shuffle_questions: bool = False
    shuffle_options: bool = False
    timer_minutes: Optional[int] = None
    require_login: bool = False
    submission_limit: str = "unlimited"
    show_leaderboard: bool = False
    is_restricted: bool = False
    show_in_history: bool = True
    reveal_score: bool = True
    reveal_answers: bool = True
    display_style: str = "card"
    scoring_mode: str = "auto"
    theme_color: Optional[str] = None
    thank_you_message: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class AiGenerateResponse(BaseModel):
    draft: dict
    model: str = ""
    remaining: int
    limit: int
    ignored: list[str] = []


class AiQuotaResponse(BaseModel):
    limit: int
    used: int
    remaining: int


class AiAcceptResponse(BaseModel):
    id: int
    message: str
