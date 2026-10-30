SET search_path TO mealy, public;

CREATE TABLE order_status_definitions (
    code text PRIMARY KEY,
    label text NOT NULL,
    is_terminal boolean NOT NULL DEFAULT false,
    is_customer_visible boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_status_transitions (
    from_status text NOT NULL REFERENCES order_status_definitions(code) ON DELETE CASCADE,
    to_status text NOT NULL REFERENCES order_status_definitions(code) ON DELETE CASCADE,
    allowed_actor_types text[] NOT NULL,
    requires_reason boolean NOT NULL DEFAULT false,
    PRIMARY KEY (from_status, to_status),
    CHECK (from_status <> to_status),
    CHECK (cardinality(allowed_actor_types) > 0)
);

CREATE TABLE carts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id uuid REFERENCES student_profiles(user_id) ON DELETE CASCADE,
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    currency_code char(3) NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned', 'expired')),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX carts_one_active_per_student_outlet_uidx
    ON carts (student_user_id, outlet_id)
    WHERE student_user_id IS NOT NULL AND status = 'active';

CREATE TABLE cart_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
    variant_id uuid REFERENCES item_variants(id) ON DELETE RESTRICT,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    notes text CHECK (length(notes) <= 1000),
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_item_modifiers (
    cart_item_id uuid NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
    modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE RESTRICT,
    modifier_option_id uuid NOT NULL REFERENCES modifier_options(id) ON DELETE RESTRICT,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
    unit_price_delta_minor bigint NOT NULL,
    PRIMARY KEY (cart_item_id, modifier_option_id)
);

CREATE TABLE order_number_sequences (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    business_date date NOT NULL,
    next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (outlet_id, business_date)
);

CREATE TABLE token_sequences (
    counter_id uuid NOT NULL REFERENCES service_counters(id) ON DELETE CASCADE,
    service_date date NOT NULL,
    next_value integer NOT NULL DEFAULT 1 CHECK (next_value > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (counter_id, service_date)
);

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_number text NOT NULL UNIQUE,
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    counter_id uuid REFERENCES service_counters(id) ON DELETE SET NULL,
    terminal_id uuid REFERENCES pos_terminals(id) ON DELETE SET NULL,
    student_user_id uuid REFERENCES student_profiles(user_id) ON DELETE SET NULL,
    created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    source_channel text NOT NULL CHECK (source_channel IN ('student_web', 'pos', 'admin', 'kiosk', 'api')),
    fulfillment_type text NOT NULL DEFAULT 'pickup' CHECK (fulfillment_type IN ('pickup', 'dine_in', 'delivery')),
    status_code text NOT NULL REFERENCES order_status_definitions(code) ON DELETE RESTRICT,
    payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'failed', 'voided')),
    business_date date NOT NULL,
    order_number bigint NOT NULL CHECK (order_number > 0),
    currency_code char(3) NOT NULL,
    subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
    discount_total_minor bigint NOT NULL DEFAULT 0 CHECK (discount_total_minor >= 0),
    tax_total_minor bigint NOT NULL DEFAULT 0 CHECK (tax_total_minor >= 0),
    charge_total_minor bigint NOT NULL DEFAULT 0 CHECK (charge_total_minor >= 0),
    rounding_minor bigint NOT NULL DEFAULT 0,
    total_minor bigint NOT NULL CHECK (total_minor >= 0),
    paid_total_minor bigint NOT NULL DEFAULT 0 CHECK (paid_total_minor >= 0),
    refunded_total_minor bigint NOT NULL DEFAULT 0 CHECK (refunded_total_minor >= 0),
    customer_name_snapshot text,
    customer_phone_snapshot text,
    customer_note text CHECK (length(customer_note) <= 2000),
    fulfillment_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fulfillment_details) = 'object'),
    pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(pricing_snapshot) = 'object'),
    idempotency_key text,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    placed_at timestamptz NOT NULL DEFAULT now(),
    promised_at timestamptz,
    ready_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (total_minor = subtotal_minor - discount_total_minor + tax_total_minor + charge_total_minor + rounding_minor),
    CHECK (discount_total_minor <= subtotal_minor + tax_total_minor + charge_total_minor),
    CHECK (refunded_total_minor <= paid_total_minor),
    UNIQUE (outlet_id, business_date, order_number)
);

CREATE UNIQUE INDEX orders_idempotency_uidx ON orders (outlet_id, source_channel, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX orders_outlet_queue_idx ON orders (outlet_id, status_code, placed_at DESC);
CREATE INDEX orders_student_history_idx ON orders (student_user_id, placed_at DESC)
    WHERE student_user_id IS NOT NULL;
CREATE INDEX orders_active_idx ON orders (outlet_id, placed_at)
    WHERE status_code NOT IN ('collected', 'cancelled', 'rejected');

CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL,
    variant_id uuid REFERENCES item_variants(id) ON DELETE SET NULL,
    sku_snapshot text,
    item_name_snapshot text NOT NULL,
    variant_name_snapshot text,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    modifier_total_minor bigint NOT NULL DEFAULT 0 CHECK (modifier_total_minor >= 0),
    discount_total_minor bigint NOT NULL DEFAULT 0 CHECK (discount_total_minor >= 0),
    tax_total_minor bigint NOT NULL DEFAULT 0 CHECK (tax_total_minor >= 0),
    line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0),
    notes text CHECK (length(notes) <= 1000),
    preparation_status text NOT NULL DEFAULT 'pending' CHECK (preparation_status IN ('pending', 'queued', 'preparing', 'ready', 'served', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (line_total_minor = ((unit_price_minor + modifier_total_minor) * quantity) - discount_total_minor + tax_total_minor)
);

CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE order_item_modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    modifier_group_id uuid REFERENCES modifier_groups(id) ON DELETE SET NULL,
    modifier_option_id uuid REFERENCES modifier_options(id) ON DELETE SET NULL,
    group_name_snapshot text NOT NULL,
    option_name_snapshot text NOT NULL,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
    unit_price_delta_minor bigint NOT NULL,
    total_minor bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (total_minor = unit_price_delta_minor * quantity)
);

CREATE TABLE order_tax_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    order_item_id uuid REFERENCES order_items(id) ON DELETE RESTRICT,
    tax_rate_id uuid REFERENCES tax_rates(id) ON DELETE SET NULL,
    name_snapshot text NOT NULL,
    rate_basis_points integer NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 10000),
    taxable_amount_minor bigint NOT NULL CHECK (taxable_amount_minor >= 0),
    tax_amount_minor bigint NOT NULL CHECK (tax_amount_minor >= 0),
    price_inclusive boolean NOT NULL,
    calculation_order smallint NOT NULL CHECK (calculation_order BETWEEN 1 AND 100),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_tax_lines_order_idx ON order_tax_lines (order_id);

CREATE TABLE order_charge_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    service_charge_id uuid REFERENCES service_charges(id) ON DELETE SET NULL,
    name_snapshot text NOT NULL,
    calculation_type text NOT NULL CHECK (calculation_type IN ('fixed', 'percentage')),
    rate_basis_points integer CHECK (rate_basis_points BETWEEN 0 AND 10000),
    base_amount_minor bigint CHECK (base_amount_minor >= 0),
    charge_amount_minor bigint NOT NULL CHECK (charge_amount_minor >= 0),
    tax_amount_minor bigint NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_status_events (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    from_status text REFERENCES order_status_definitions(code) ON DELETE RESTRICT,
    to_status text NOT NULL REFERENCES order_status_definitions(code) ON DELETE RESTRICT,
    actor_type text NOT NULL CHECK (actor_type IN ('student', 'staff', 'admin', 'system', 'payment_provider')),
    actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    reason_code text,
    note text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_status_events_order_idx ON order_status_events (order_id, id);

CREATE TABLE order_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    counter_id uuid NOT NULL REFERENCES service_counters(id) ON DELETE RESTRICT,
    service_date date NOT NULL,
    token_number integer NOT NULL CHECK (token_number > 0),
    token_label text NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    called_at timestamptz,
    collected_at timestamptz,
    voided_at timestamptz,
    UNIQUE (counter_id, service_date, token_number)
);

CREATE INDEX order_tokens_active_lookup_idx ON order_tokens (counter_id, service_date, token_number)
    WHERE voided_at IS NULL;

CREATE TABLE kitchen_stations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, code)
);

CREATE TABLE item_station_routes (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    kitchen_station_id uuid NOT NULL REFERENCES kitchen_stations(id) ON DELETE RESTRICT,
    priority smallint NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 100),
    PRIMARY KEY (outlet_id, item_id, kitchen_station_id)
);

CREATE TABLE kots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    kitchen_station_id uuid REFERENCES kitchen_stations(id) ON DELETE SET NULL,
    kot_number integer NOT NULL CHECK (kot_number > 0),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'accepted', 'preparing', 'ready', 'served', 'cancelled')),
    source text NOT NULL DEFAULT 'order' CHECK (source IN ('order', 'amendment', 'reprint', 'manual')),
    idempotency_key text,
    fired_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    ready_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, kot_number, revision)
);

CREATE UNIQUE INDEX kots_idempotency_uidx ON kots (order_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX kots_station_queue_idx ON kots (kitchen_station_id, status, fired_at);

CREATE TABLE kot_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kot_id uuid NOT NULL REFERENCES kots(id) ON DELETE RESTRICT,
    order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    item_name_snapshot text NOT NULL,
    variant_name_snapshot text,
    notes_snapshot text,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'accepted', 'preparing', 'ready', 'served', 'cancelled')),
    started_at timestamptz,
    ready_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kot_id, order_item_id)
);

CREATE TABLE kot_item_modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kot_item_id uuid NOT NULL REFERENCES kot_items(id) ON DELETE RESTRICT,
    option_name_snapshot text NOT NULL,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kot_status_events (
    id bigserial PRIMARY KEY,
    kot_id uuid NOT NULL REFERENCES kots(id) ON DELETE RESTRICT,
    kot_item_id uuid REFERENCES kot_items(id) ON DELETE RESTRICT,
    from_status text,
    to_status text NOT NULL,
    actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    reason_code text,
    note text,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kot_status_events_kot_idx ON kot_status_events (kot_id, id);
