"""add answer_key to questions

Revision ID: 42ff6803b92a
Revises: c8d9e0f1a2b3
Create Date: 2026-09-05

Kunci jawaban untuk essay/short_answer pada quiz (owner-only,
tidak pernah ke payload publik). Nullable — data lama tetap valid.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '42ff6803b92a'
down_revision: Union[str, Sequence[str], None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('questions', sa.Column('answer_key', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('questions', 'answer_key')
