"""create user roles

Revision ID: 2a3bbd3d21d
Revises: 213cdaf404ca
Create Date: 2015-03-24 17:21:55.148341

"""

# revision identifiers, used by Alembic.
revision = '2a3bbd3d21d'
down_revision = '213cdaf404ca'

from alembic import op
import sqlalchemy as sa


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.create_table('roles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=True),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('roles_users',
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('role_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )

    from dexter.models import Role, User, db
    for r in Role.create_defaults():
        db.session.add(r)
    db.session.commit()

    # give all current users the monitor role
    monitor = Role.query.filter(Role.name == 'monitor').one()
    for u in User.query.all():
        u.roles = [monitor]
    db.session.commit()

    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('roles_users')
    op.drop_table('roles')
    ### end Alembic commands ###
