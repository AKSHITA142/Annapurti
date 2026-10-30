"""phase1 initial schema

Revision ID: 001_phase1_initial_schema
Revises: 
Create Date: 2026-10-31 00:22:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_phase1_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('city', sa.String(length=100), nullable=False, server_default='Ahmedabad'),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lng', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # receiver_profiles
    op.create_table(
        'receiver_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('accepted_categories', sa.JSON(), nullable=False),
        sa.Column('daily_intake_capacity', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('remaining_capacity', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('operating_hours_start', sa.String(length=10), nullable=False, server_default='09:00'),
        sa.Column('operating_hours_end', sa.String(length=10), nullable=False, server_default='21:00'),
        sa.Column('has_vehicle', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('priority_class', sa.String(length=50), nullable=False, server_default='standard'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_receiver_profiles_id'), 'receiver_profiles', ['id'], unique=False)

    # food_listings
    op.create_table(
        'food_listings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('provider_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('veg', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('unit', sa.String(length=50), nullable=False, server_default='meals'),
        sa.Column('lot_size', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('total_lots', sa.Integer(), nullable=False),
        sa.Column('available_lots', sa.Integer(), nullable=False),
        sa.Column('reserved_lots', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('collected_lots', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('delivered_lots', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('closed_lots', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('prepared_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('safe_deadline', sa.DateTime(timezone=True), nullable=False),
        sa.Column('storage_requirement', sa.String(length=50), nullable=False, server_default='ambient'),
        sa.Column('pickup_lat', sa.Float(), nullable=False),
        sa.Column('pickup_lng', sa.Float(), nullable=False),
        sa.Column('pickup_window_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('pickup_window_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('delivery_mode_offered', sa.String(length=50), nullable=False, server_default='sender_vehicle'),
        sa.Column('delivery_contribution_type', sa.String(length=50), nullable=False, server_default='free'),
        sa.Column('contribution_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['provider_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_food_listings_id'), 'food_listings', ['id'], unique=False)

    # donation_requests
    op.create_table(
        'donation_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('listing_id', sa.Integer(), nullable=False),
        sa.Column('receiver_id', sa.Integer(), nullable=False),
        sa.Column('requested_lots', sa.Integer(), nullable=False),
        sa.Column('allocated_lots', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('reservation_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['listing_id'], ['food_listings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_donation_requests_id'), 'donation_requests', ['id'], unique=False)

    # vehicles
    op.create_table(
        'vehicles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False, server_default='van'),
        sa.Column('capacity_lots', sa.Integer(), nullable=False),
        sa.Column('service_radius_km', sa.Float(), nullable=False, server_default='15.0'),
        sa.Column('available_from', sa.String(length=10), nullable=False, server_default='08:00'),
        sa.Column('available_to', sa.String(length=10), nullable=False, server_default='22:00'),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('is_simulated', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_cold_storage', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vehicles_id'), 'vehicles', ['id'], unique=False)

    # delivery_jobs
    op.create_table(
        'delivery_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vehicle_id', sa.Integer(), nullable=True),
        sa.Column('request_ids', sa.JSON(), nullable=False),
        sa.Column('route', sa.JSON(), nullable=False),
        sa.Column('planned_start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('planned_end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='planned'),
        sa.Column('otp_code', sa.String(length=6), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_delivery_jobs_id'), 'delivery_jobs', ['id'], unique=False)

    # delivery_confirmations
    op.create_table(
        'delivery_confirmations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('receiver_id', sa.Integer(), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('otp_entered', sa.String(length=6), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['delivery_jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_delivery_confirmations_id'), 'delivery_confirmations', ['id'], unique=False)

    # utilization_reports
    op.create_table(
        'utilization_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.Integer(), nullable=False),
        sa.Column('receiver_id', sa.Integer(), nullable=False),
        sa.Column('reported_distributed_lots', sa.Integer(), nullable=False),
        sa.Column('people_served', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('photo_url', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['request_id'], ['donation_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_utilization_reports_id'), 'utilization_reports', ['id'], unique=False)

    # decision_log
    op.create_table(
        'decision_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('step', sa.String(length=50), nullable=False),
        sa.Column('decision', sa.String(length=50), nullable=False),
        sa.Column('reason_code', sa.String(length=50), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_decision_log_id'), 'decision_log', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('decision_log')
    op.drop_table('utilization_reports')
    op.drop_table('delivery_confirmations')
    op.drop_table('delivery_jobs')
    op.drop_table('vehicles')
    op.drop_table('donation_requests')
    op.drop_table('food_listings')
    op.drop_table('receiver_profiles')
    op.drop_table('users')
