"""admin user and registration settings

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "i4j5k6l7m8n9"
down_revision: Union[str, Sequence[str], None] = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("idx_users_active", "users", ["is_active"])
    op.create_index("idx_users_deleted_at", "users", ["deleted_at"])
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.String(length=255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_index("idx_users_deleted_at", table_name="users")
    op.drop_index("idx_users_active", table_name="users")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "is_active")
