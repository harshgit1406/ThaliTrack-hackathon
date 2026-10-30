SET search_path TO mealy, public;

CREATE TABLE pickup_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    UNIQUE (outlet_id, starts_at)
);

CREATE INDEX pickup_slots_outlet_time_idx ON pickup_slots (outlet_id, starts_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_slot_id uuid REFERENCES pickup_slots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_pickup_slot_idx ON orders (pickup_slot_id, status_code) WHERE pickup_slot_id IS NOT NULL;

CREATE TABLE dish_demand_history (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    service_date date NOT NULL,
    order_count integer NOT NULL CHECK (order_count >= 0),
    quantity_ordered integer NOT NULL CHECK (quantity_ordered >= 0),
    quantity_sold integer NOT NULL CHECK (quantity_sold >= 0 AND quantity_sold <= quantity_ordered),
    leftover_kg numeric(10,3) NOT NULL DEFAULT 0 CHECK (leftover_kg >= 0),
    portion_weight_kg numeric(8,3) NOT NULL DEFAULT 0.250 CHECK (portion_weight_kg > 0),
    lecture_rush_index numeric(5,2) NOT NULL DEFAULT 1 CHECK (lecture_rush_index BETWEEN 0 AND 5),
    source text NOT NULL DEFAULT 'actual' CHECK (source IN ('actual', 'sample', 'manager')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (outlet_id, catalog_item_id, service_date)
);

CREATE TABLE leftover_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
    business_date date NOT NULL,
    leftover_kg numeric(10,3) NOT NULL CHECK (leftover_kg BETWEEN 0 AND 10000),
    notes text CHECK (length(notes) <= 500),
    logged_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, catalog_item_id, business_date)
);

CREATE TABLE campus_rush_windows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
    weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    lecture_ends_at time NOT NULL,
    label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
    expected_multiplier numeric(4,2) NOT NULL DEFAULT 1.2 CHECK (expected_multiplier BETWEEN 1 AND 3),
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (campus_id, weekday, lecture_ends_at)
);

CREATE TABLE surplus_offers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    business_date date NOT NULL,
    quantity_available integer NOT NULL CHECK (quantity_available > 0),
    discount_percent integer NOT NULL CHECK (discount_percent BETWEEN 1 AND 90),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold_out', 'expired', 'cancelled')),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    UNIQUE (outlet_id, catalog_item_id, business_date)
);

-- Trigger functions created by the early schema relied on the migration session's
-- search path. Pin it so Railway/runtime connections cannot resolve these tables
-- against `public` when student orders are inserted.
ALTER FUNCTION validate_order_scope() SET search_path = mealy, pg_temp;
ALTER FUNCTION record_new_order() SET search_path = mealy, pg_temp;

UPDATE schema_metadata SET schema_version = 12, updated_at = now() WHERE singleton;
