"""Keep pending real estate listings hidden while API and worker versions roll out."""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE results SET dismissed_at = now(), dismiss_reason = 'pending_verification' "
        "WHERE category = 'immobili' AND NOT verified AND dismissed_at IS NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE results SET dismissed_at = NULL, dismiss_reason = NULL "
        "WHERE category = 'immobili' AND NOT verified AND dismiss_reason = 'pending_verification'"
    )
