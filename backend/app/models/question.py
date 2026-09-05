from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Enum as SAEnum, ForeignKey, Index
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class QuestionType(str, enum.Enum):
    multiple_choice = "multiple_choice"
    checkbox = "checkbox"
    dropdown = "dropdown"
    short_answer = "short_answer"
    essay = "essay"
    password = "password"
    date = "date"
    time = "time"
    datetime = "datetime"
    file_upload = "file_upload"


class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    form_id = Column(Integer, ForeignKey("forms.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(150), nullable=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), nullable=True)

    questions = relationship("Question", back_populates="section")

    __table_args__ = (
        Index("idx_sections_form", "form_id"),
    )


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    form_id = Column(Integer, ForeignKey("forms.id", ondelete="CASCADE"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)
    type = Column(SAEnum(QuestionType), nullable=False)
    question_text = Column(Text, nullable=False)
    points = Column(Integer, default=0)
    is_scored = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False, index=True)
    order_index = Column(Integer, default=0)
    is_required = Column(Boolean, default=True)
    # Grup soal ber-cerita bersama (wacana). NULL = soal lepas. Anggota grup
    # di-shuffle sebagai satu blok; cerita ada di question_text anggota terawal.
    group_id = Column(String(36), nullable=True)
    # Jawaban benar untuk tipe password — jangan pernah ikut payload publik.
    password_keyword = Column(String(255), nullable=True)
    # Izinkan opsi "Lainnya" ([]pilihan, ketik sendiri) untuk
    # multiple_choice/checkbox. Ditampilkan ke responden hanya bila true.
    allow_other = Column(Boolean, default=False)
    # Kunci jawaban untuk essay/short_answer pada quiz — owner-only seperti
    # password_keyword, tidak pernah ikut payload publik/responden.
    answer_key = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    form = relationship("Form", back_populates="questions")
    section = relationship("Section", back_populates="questions")
    options = relationship("QuestionOption", back_populates="question", cascade="all, delete-orphan")
    images = relationship("Image", back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_questions_form", "form_id"),
    )
