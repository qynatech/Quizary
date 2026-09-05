"""add allow_other to questions

Revision ID: d987230c568b
Revises: 42ff6803b92a
Create Date: 2026-09-05

Flag opsi "Lainnya" (ketik sendiri) untuk multiple_choice/checkbox.
Default False — data lama tetap valid, perilaku lama tak berubah.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd987230c568b'
down_revision: Union[str, Sequence[str], None] = '42ff6803b92a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('questions', sa.Column('allow_other', sa.Boolean(), nullable=True, server_default=sa.text('0')))


def downgrade() -> None:
    op.drop_column('questions', 'allow_other')
