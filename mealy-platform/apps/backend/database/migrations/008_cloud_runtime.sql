SET search_path TO mealy, public;

INSERT INTO feature_definitions (code, name, description, default_enabled)
VALUES
    ('qr_ordering', 'QR ordering', 'QR-scoped student or guest ordering', false),
    ('kds', 'Kitchen display system', 'Visual kitchen display backed by kitchen order tickets', false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE outlet_gateways (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    gateway_key text NOT NULL UNIQUE CHECK (length(btrim(gateway_key)) BETWEEN 3 AND 120),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
    token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'blocked', 'retired')),
    last_acknowledged_sequence bigint NOT NULL DEFAULT 0 CHECK (last_acknowledged_sequence >= 0),
    last_connected_at timestamptz,
    last_seen_at timestamptz,
    app_version text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, display_name)
);

CREATE INDEX outlet_gateways_outlet_status_idx ON outlet_gateways (outlet_id, status);

CREATE TABLE cloud_gateway_events (
    sequence bigserial PRIMARY KEY,
    event_id uuid NOT NULL UNIQUE,
    outbox_event_id uuid UNIQUE REFERENCES outbox_events(id) ON DELETE SET NULL,
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cloud_gateway_events_replay_idx ON cloud_gateway_events (outlet_id, sequence);

CREATE TABLE gateway_ingest_events (
    gateway_id uuid NOT NULL REFERENCES outlet_gateways(id) ON DELETE CASCADE,
    event_id text NOT NULL,
    event_type text NOT NULL,
    aggregate_id text NOT NULL,
    gateway_sequence bigint CHECK (gateway_sequence > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
    last_error text,
    PRIMARY KEY (gateway_id, event_id)
);

CREATE INDEX gateway_ingest_events_worker_idx ON gateway_ingest_events (status, received_at)
    WHERE status IN ('received', 'failed');

CREATE TRIGGER outlet_gateways_set_updated_at
BEFORE UPDATE ON outlet_gateways
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

UPDATE schema_metadata SET schema_version = 8;
