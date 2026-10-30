SET search_path TO mealy, public;

CREATE TABLE api_idempotency_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type text NOT NULL CHECK (scope_type IN ('user', 'outlet', 'canteen', 'platform')),
    scope_id uuid NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing', 'completed', 'failed')),
    response_status integer CHECK (response_status BETWEEN 100 AND 599),
    response_body jsonb,
    resource_type text,
    resource_id uuid,
    locked_until timestamptz,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (scope_type, scope_id, operation, idempotency_key),
    CHECK (expires_at > created_at),
    CHECK (response_body IS NULL OR jsonb_typeof(response_body) IN ('object', 'array'))
);

CREATE INDEX api_idempotency_expiry_idx ON api_idempotency_records (expires_at);

CREATE TABLE webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    signature_valid boolean NOT NULL,
    payload_redacted jsonb NOT NULL CHECK (jsonb_typeof(payload_redacted) = 'object'),
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    next_attempt_at timestamptz,
    last_error text,
    UNIQUE (provider, provider_event_id)
);

CREATE INDEX webhook_events_worker_idx ON webhook_events (status, next_attempt_at)
    WHERE status IN ('received', 'failed');

CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error text,
    correlation_id uuid,
    causation_id uuid
);

CREATE INDEX outbox_events_publish_idx ON outbox_events (available_at, occurred_at)
    WHERE published_at IS NULL;
CREATE INDEX outbox_events_aggregate_idx ON outbox_events (aggregate_type, aggregate_id, occurred_at);

CREATE TABLE audit_logs (
    id bigserial PRIMARY KEY,
    actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    actor_type text NOT NULL CHECK (actor_type IN ('student', 'staff', 'admin', 'system', 'integration')),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
    canteen_id uuid REFERENCES canteens(id) ON DELETE SET NULL,
    outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
    before_data jsonb,
    after_data jsonb,
    reason text,
    request_id text,
    ip_address inet,
    user_agent text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CHECK (before_data IS NULL OR jsonb_typeof(before_data) = 'object'),
    CHECK (after_data IS NULL OR jsonb_typeof(after_data) = 'object')
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_logs_tenant_idx ON audit_logs (canteen_id, outlet_id, occurred_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, occurred_at DESC);

CREATE TABLE data_subject_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    request_type text NOT NULL CHECK (request_type IN ('access', 'correction', 'deletion', 'restriction', 'export')),
    status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'in_progress', 'completed', 'rejected', 'cancelled')),
    verification_method text,
    requested_at timestamptz NOT NULL DEFAULT now(),
    due_at timestamptz,
    completed_at timestamptz,
    handled_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel text NOT NULL CHECK (channel IN ('sms', 'email', 'truecaller', 'campus_sso')),
    destination_hash text NOT NULL,
    provider_reference text,
    code_hash text,
    purpose text NOT NULL CHECK (purpose IN ('sign_in', 'sign_up', 'verify_contact', 'step_up')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    invalidated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);

CREATE INDEX login_challenges_active_idx ON login_challenges (destination_hash, purpose, expires_at)
    WHERE consumed_at IS NULL AND invalidated_at IS NULL;
