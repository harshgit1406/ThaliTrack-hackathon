SET search_path TO mealy, public;

CREATE TABLE printers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL,
    printer_type text NOT NULL CHECK (printer_type IN ('network', 'usb', 'bluetooth', 'system', 'cloud')),
    connection_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(connection_config) = 'object'),
    paper_width_mm integer CHECK (paper_width_mm IN (58, 76, 80)),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'offline', 'disabled', 'retired')),
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, code)
);

CREATE TABLE printer_routes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    printer_id uuid NOT NULL REFERENCES printers(id) ON DELETE RESTRICT,
    document_type text NOT NULL CHECK (document_type IN ('kot', 'bill', 'receipt', 'token', 'summary')),
    kitchen_station_id uuid REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    terminal_id uuid REFERENCES pos_terminals(id) ON DELETE CASCADE,
    copies smallint NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 10),
    priority smallint NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 100),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX printer_routes_resolution_idx
    ON printer_routes (outlet_id, document_type, kitchen_station_id, terminal_id, priority);

CREATE TABLE print_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    printer_id uuid NOT NULL REFERENCES printers(id) ON DELETE RESTRICT,
    order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
    kot_id uuid REFERENCES kots(id) ON DELETE RESTRICT,
    document_type text NOT NULL CHECK (document_type IN ('kot', 'bill', 'receipt', 'token', 'summary')),
    document_version integer NOT NULL DEFAULT 1 CHECK (document_version > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    idempotency_key text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'printing', 'printed', 'failed', 'cancelled')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    printed_at timestamptz,
    failed_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (printer_id, idempotency_key)
);

CREATE INDEX print_jobs_worker_idx ON print_jobs (status, available_at)
    WHERE status IN ('queued', 'failed');

CREATE TABLE cash_registers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    terminal_id uuid REFERENCES pos_terminals(id) ON DELETE SET NULL,
    code text NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'retired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, code)
);

CREATE TABLE pos_shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_register_id uuid NOT NULL REFERENCES cash_registers(id) ON DELETE RESTRICT,
    opened_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    closed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    opening_cash_minor bigint NOT NULL DEFAULT 0 CHECK (opening_cash_minor >= 0),
    expected_closing_cash_minor bigint CHECK (expected_closing_cash_minor >= 0),
    counted_closing_cash_minor bigint CHECK (counted_closing_cash_minor >= 0),
    variance_minor bigint,
    currency_code char(3) NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed', 'force_closed')),
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    opening_note text,
    closing_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status IN ('open', 'closing') AND closed_at IS NULL) OR (status IN ('closed', 'force_closed') AND closed_at IS NOT NULL)),
    CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

CREATE UNIQUE INDEX pos_shifts_one_open_uidx ON pos_shifts (cash_register_id)
    WHERE status IN ('open', 'closing');

CREATE TABLE cash_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id uuid NOT NULL REFERENCES pos_shifts(id) ON DELETE RESTRICT,
    order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
    movement_type text NOT NULL CHECK (movement_type IN ('opening', 'sale', 'refund', 'cash_in', 'cash_out', 'safe_drop', 'closing_adjustment')),
    amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
    currency_code char(3) NOT NULL,
    reason text,
    performed_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    idempotency_key text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shift_id, idempotency_key)
);

CREATE INDEX cash_movements_shift_idx ON cash_movements (shift_id, occurred_at, id);

CREATE TABLE dining_areas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, code)
);

CREATE TABLE dining_tables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dining_area_id uuid NOT NULL REFERENCES dining_areas(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    capacity integer NOT NULL CHECK (capacity > 0),
    qr_token_hash text UNIQUE,
    status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'blocked', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (dining_area_id, code)
);

CREATE TABLE reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    dining_table_id uuid REFERENCES dining_tables(id) ON DELETE SET NULL,
    student_user_id uuid REFERENCES student_profiles(user_id) ON DELETE SET NULL,
    guest_name text NOT NULL,
    guest_phone_e164 text,
    party_size integer NOT NULL CHECK (party_size > 0),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK (guest_phone_e164 IS NULL OR guest_phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX reservations_schedule_idx ON reservations (outlet_id, starts_at, ends_at)
    WHERE status IN ('pending', 'confirmed', 'seated');

CREATE TABLE student_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id uuid NOT NULL REFERENCES student_profiles(user_id) ON DELETE CASCADE,
    label text,
    recipient_name text NOT NULL,
    phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    address_line_1 text NOT NULL,
    address_line_2 text,
    city text NOT NULL,
    state text NOT NULL,
    postal_code text NOT NULL,
    country_code char(2) NOT NULL DEFAULT 'IN',
    latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE UNIQUE INDEX student_addresses_one_default_uidx ON student_addresses (student_user_id)
    WHERE is_default AND deleted_at IS NULL;

CREATE TABLE delivery_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    assigned_to_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    external_partner text,
    external_reference text,
    status text NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled')),
    pickup_at timestamptz,
    delivered_at timestamptz,
    proof jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(proof) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE receipt_sequences (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    financial_year text NOT NULL,
    next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (outlet_id, financial_year)
);

CREATE TABLE receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    receipt_number text NOT NULL,
    receipt_type text NOT NULL DEFAULT 'sale' CHECK (receipt_type IN ('sale', 'refund', 'credit_note')),
    financial_year text NOT NULL,
    legal_snapshot jsonb NOT NULL CHECK (jsonb_typeof(legal_snapshot) = 'object'),
    totals_snapshot jsonb NOT NULL CHECK (jsonb_typeof(totals_snapshot) = 'object'),
    issued_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    voided_at timestamptz,
    void_reason text,
    UNIQUE (receipt_number)
);

CREATE TABLE feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    student_user_id uuid NOT NULL REFERENCES student_profiles(user_id) ON DELETE RESTRICT,
    overall_rating smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    comment text CHECK (length(comment) <= 4000),
    status text NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'hidden', 'flagged')),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    moderated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    moderated_at timestamptz
);

CREATE TABLE feedback_items (
    feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text CHECK (length(comment) <= 2000),
    PRIMARY KEY (feedback_id, order_item_id)
);

CREATE TABLE push_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
    endpoint_hash text NOT NULL UNIQUE,
    encrypted_subscription jsonb NOT NULL CHECK (jsonb_typeof(encrypted_subscription) = 'object'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'revoked')),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_preferences (
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    event_code text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('in_app', 'push', 'sms', 'email', 'whatsapp')),
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_code, channel)
);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    event_code text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_inbox_idx ON notifications (user_id, created_at DESC);

CREATE TABLE onboarding_checklists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    step_code text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'waived', 'blocked')),
    completed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    completed_at timestamptz,
    notes text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (canteen_id, step_code)
);
