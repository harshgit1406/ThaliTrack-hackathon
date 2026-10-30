SET search_path TO mealy, public;

CREATE TABLE gateway_token_blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_id uuid NOT NULL REFERENCES outlet_gateways(id) ON DELETE CASCADE,
    counter_id uuid NOT NULL REFERENCES service_counters(id) ON DELETE CASCADE,
    service_date date NOT NULL,
    token_prefix text NOT NULL,
    range_start integer NOT NULL CHECK (range_start > 0),
    range_end integer NOT NULL CHECK (range_end >= range_start),
    next_value integer NOT NULL CHECK (next_value >= range_start),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','exhausted','expired','revoked')),
    reserved_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (counter_id, service_date, range_start),
    CHECK (next_value <= range_end + 1)
);

CREATE INDEX gateway_token_blocks_active_idx ON gateway_token_blocks (gateway_id, counter_id, service_date, status);

UPDATE schema_metadata SET schema_version = 10, updated_at = now() WHERE singleton;
