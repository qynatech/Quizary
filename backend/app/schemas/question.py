import re
from typing import Optional

from pydantic import BaseModel, Field, model_validator


QUESTION_TYPE_PATTERN = r"^(multiple_choice|checkbox|dropdown|short_answer|essay|password|date|time|datetime|file_upload)$"
NO_OPTION_TYPES = ("short_answer", "essay", "password", "date", "time", "datetime", "file_upload")
# Tipe yang boleh mengaktifkan opsi "Lainnya" (ketik sendiri).
OTHER_TYPES = ("multiple_choice", "checkbox")


def check_allow_other(allow_other: bool | None, q_type: str | None) -> None:
    """Validasi flag Lainnya. q_type=None berarti tipe tak diketahui
    (partial update) — lolos, router melengkapi dengan tipe efektif dari DB."""
    if not allow_other:
        return
    if q_type is not None and q_type not in OTHER_TYPES:
        raise ValueError("Opsi lainnya hanya untuk multiple choice atau checkbox")
# Tipe isian yang bisa dinilai otomatis bila punya answer_key (khusus quiz).
KEYWORD_TYPES = ("essay", "short_answer")
MAX_KEYWORDS = 10
MAX_KEYWORD_LEN = 100

_WS_RE = re.compile(r"\s+")


def normalize_answer_text(v: str | None) -> str:
    """Normalisasi untuk pencocokan kunci: trim, lowercase, rapatkan spasi."""
    return _WS_RE.sub(" ", (v or "").strip().lower())


def parse_answer_key(raw: str | None) -> list[str]:
    """Pecah answer_key mentah ('jakarta; DKI Jakarta' / baris baru) jadi
    daftar kunci ternormalisasi, tanpa item kosong."""
    if not raw:
        return []
    return [k for k in (normalize_answer_text(p) for p in re.split(r"[;\n]+", raw)) if k]


def check_answer_key(answer_key: str | None, q_type: str | None) -> None:
    """Validasi answer_key terhadap tipe soal. Raise ValueError bila invalid.
    Dipakai validator Pydantic dan router (yang tahu tipe efektif saat update).
    q_type=None berarti tipe tak diketahui (partial update) — hanya format dicek."""
    if answer_key is None:
        return
    if q_type is not None and q_type not in KEYWORD_TYPES:
        raise ValueError("Answer key hanya untuk tipe essay atau short answer")
    keys = parse_answer_key(answer_key)
    if not keys:
        raise ValueError("Answer key tidak boleh kosong")
    if len(keys) > MAX_KEYWORDS:
        raise ValueError(f"Answer key maksimal {MAX_KEYWORDS} kunci")
    if any(len(k) > MAX_KEYWORD_LEN for k in keys):
        raise ValueError(f"Setiap kunci maksimal {MAX_KEYWORD_LEN} karakter")


class OptionCreate(BaseModel):
    option_text: str = Field(min_length=1, max_length=2000)
    is_correct: bool = False


class OptionUpdate(BaseModel):
    id: Optional[int] = None
    option_text: Optional[str] = Field(None, min_length=0, max_length=2000)
    is_correct: Optional[bool] = None


class OptionResponse(BaseModel):
    id: int
    option_text: str
    is_correct: bool
    order_index: int
    images: list[dict] = []

    model_config = {"from_attributes": True}


class ImageResponse(BaseModel):
    id: int
    path: str
    order_index: int = 0

    model_config = {"from_attributes": True}


class QuestionCreate(BaseModel):
    type: str = Field(pattern=QUESTION_TYPE_PATTERN)
    question_text: str = Field(min_length=1, max_length=5000)
    points: int = Field(default=1, ge=0, le=999)
    is_scored: bool = True
    is_required: bool = True
    section_id: Optional[int] = None
    password_keyword: Optional[str] = Field(None, min_length=1, max_length=255)
    answer_key: Optional[str] = Field(None, min_length=1, max_length=500)
    allow_other: bool = False
    options: list[OptionCreate] = []

    @model_validator(mode="after")
    def validate_options(self):
        if self.type in ("multiple_choice", "checkbox", "dropdown") and not self.options:
            raise ValueError("multiple_choice, checkbox and dropdown questions require at least 1 option")
        if self.type in NO_OPTION_TYPES and self.options:
            raise ValueError("this question type must not have options")
        if self.type == "password" and not (self.password_keyword or "").strip():
            raise ValueError("password questions require a password_keyword")
        check_answer_key(self.answer_key, self.type)
        check_allow_other(self.allow_other, self.type)
        return self

    @model_validator(mode="after")
    def default_is_scored(self):
        # ponytail: non-gradable types have no correct answer — is_scored must be False,
        # kecuali essay/short_answer yang punya answer_key (bisa dinilai otomatis)
        if self.type in NO_OPTION_TYPES and not (
            self.type in KEYWORD_TYPES and (self.answer_key or "").strip()
        ):
            self.is_scored = False
        return self


class QuestionUpdate(BaseModel):
    type: Optional[str] = Field(None, pattern=QUESTION_TYPE_PATTERN)
    question_text: Optional[str] = Field(None, min_length=1, max_length=5000)
    points: Optional[int] = Field(None, ge=0, le=999)
    is_scored: Optional[bool] = None
    is_required: Optional[bool] = None
    section_id: Optional[int] = None
    password_keyword: Optional[str] = Field(None, min_length=1, max_length=255)
    answer_key: Optional[str] = Field(None, min_length=1, max_length=500)
    allow_other: Optional[bool] = None
    options: Optional[list[OptionUpdate]] = None

    @model_validator(mode="after")
    def validate_options(self):
        q_type = self.type
        opts = self.options
        if q_type is not None and opts is not None:
            if q_type in ("multiple_choice", "checkbox", "dropdown") and len(opts) == 0:
                raise ValueError("multiple_choice, checkbox and dropdown questions require at least 1 option")
            if q_type in NO_OPTION_TYPES and len(opts) > 0:
                raise ValueError("this question type must not have options")
        # answer_key/allow_other hanya bisa divalidasi penuh di sini bila type
        # ikut dikirim; router melengkapi dengan tipe efektif dari DB
        check_answer_key(self.answer_key, self.type)
        check_allow_other(self.allow_other, self.type)
        return self

    @model_validator(mode="after")
    def coerce_is_scored_on_no_option_type(self):
        # ponytail: if type changes to non-gradable, force is_scored=False —
        # kecuali essay/short_answer yang dikirim bersama answer_key
        if self.type in NO_OPTION_TYPES and not (
            self.type in KEYWORD_TYPES and (self.answer_key or "").strip()
        ):
            self.is_scored = False
        return self


class QuestionResponse(BaseModel):
    id: int
    type: str
    question_text: str
    points: int
    is_scored: bool = True
    order_index: int
    is_required: bool
    section_id: Optional[int] = None
    group_id: Optional[str] = None
    password_keyword: Optional[str] = None
    answer_key: Optional[str] = None
    options: list[OptionResponse] = []
    images: list[dict] = []

    model_config = {"from_attributes": True}


class QuestionGroupRequest(BaseModel):
    question_ids: list[int] = Field(min_length=2)

    @model_validator(mode="after")
    def validate_question_ids(self):
        if len(set(self.question_ids)) != len(self.question_ids):
            raise ValueError("question_ids must not contain duplicates")
        return self


class GroupAddRequest(BaseModel):
    question_ids: list[int] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_question_ids(self):
        if len(set(self.question_ids)) != len(self.question_ids):
            raise ValueError("question_ids must not contain duplicates")
        return self


class SectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)


class SectionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)


class SectionReorderRequest(BaseModel):
    form_id: int
    orders: list[int] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_orders(self):
        if not self.orders:
            raise ValueError("orders must not be empty")
        return self


class SectionResponse(BaseModel):
    id: int
    title: str
    order_index: int
    question_count: int = 0

    model_config = {"from_attributes": True}


class QuestionListResponse(BaseModel):
    data: list[QuestionResponse]


# Fix #5 — simplified reorder: just a list of IDs in desired order
class ReorderRequest(BaseModel):
    form_id: int
    orders: list[int] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_orders(self):
        if not self.orders:
            raise ValueError("orders must not be empty")
        return self


class MessageResponse(BaseModel):
    message: str
    id: int | None = None
