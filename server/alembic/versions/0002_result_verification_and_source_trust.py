"""result verification and source trust

Adds results.verified / verified_at (page verification) and results.source_trust
("official" | "trusted" | "other"). Existing rows become verified=false, source_trust='other'.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-23 19:25:57.360091
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "results",
        sa.Column("verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("results", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "results",
        sa.Column("source_trust", sa.String(length=16), server_default="other", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_results_source_trust"),
        "results",
        "source_trust IN ('official', 'trusted', 'other')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_results_source_trust"), "results", type_="check")
    op.drop_column("results", "source_trust")
    op.drop_column("results", "verified_at")
    op.drop_column("results", "verified")
