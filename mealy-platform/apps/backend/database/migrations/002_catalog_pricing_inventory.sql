SET search_path TO mealy, public;

CREATE TABLE media_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid REFERENCES canteens(id) ON DELETE CASCADE,
    storage_key text NOT NULL UNIQUE,
    public_url text,
    mime_type text NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
    width_px integer CHECK (width_px > 0),
    height_px integer CHECK (height_px > 0),
    alt_text text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'quarantined', 'deleted')),
    uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE menus (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    description text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    sort_order integer NOT NULL DEFAULT 0,
    image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    UNIQUE (canteen_id, code)
);

CREATE TABLE menu_outlets (
    menu_id uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (menu_id, outlet_id)
);

CREATE TABLE menu_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    outlet_id uuid REFERENCES outlets(id) ON DELETE CASCADE,
    day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6),
    starts_at time,
    ends_at time,
    valid_from date,
    valid_until date,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
    CHECK (starts_at IS NULL OR starts_at <> ends_at),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE TABLE catalog_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    parent_id uuid REFERENCES catalog_categories(id) ON DELETE SET NULL,
    code text NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    description text,
    image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    UNIQUE (canteen_id, code),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE menu_categories (
    menu_id uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (menu_id, category_id)
);

CREATE TABLE tax_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (canteen_id, code)
);

CREATE TABLE tax_rates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL,
    authority text,
    rate_basis_points integer NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 10000),
    price_inclusive boolean NOT NULL DEFAULT false,
    calculation_order smallint NOT NULL DEFAULT 1 CHECK (calculation_order BETWEEN 1 AND 100),
    is_compound boolean NOT NULL DEFAULT false,
    starts_at timestamptz,
    ends_at timestamptz,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (canteen_id, code),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE tax_category_rates (
    tax_category_id uuid NOT NULL REFERENCES tax_categories(id) ON DELETE CASCADE,
    tax_rate_id uuid NOT NULL REFERENCES tax_rates(id) ON DELETE RESTRICT,
    PRIMARY KEY (tax_category_id, tax_rate_id)
);

CREATE TABLE catalog_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    primary_category_id uuid REFERENCES catalog_categories(id) ON DELETE SET NULL,
    tax_category_id uuid REFERENCES tax_categories(id) ON DELETE SET NULL,
    sku text,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    short_description text,
    description text,
    food_type text NOT NULL DEFAULT 'unspecified' CHECK (food_type IN ('vegetarian', 'non_vegetarian', 'vegan', 'egg', 'unspecified')),
    base_price_minor bigint NOT NULL CHECK (base_price_minor >= 0),
    currency_code char(3) NOT NULL DEFAULT 'INR',
    image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    is_featured boolean NOT NULL DEFAULT false,
    is_customizable boolean NOT NULL DEFAULT false,
    preparation_minutes integer CHECK (preparation_minutes BETWEEN 0 AND 1440),
    sort_order integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

CREATE UNIQUE INDEX catalog_items_sku_uidx ON catalog_items (canteen_id, sku)
    WHERE sku IS NOT NULL AND archived_at IS NULL;
CREATE INDEX catalog_items_browse_idx ON catalog_items (canteen_id, primary_category_id, status, sort_order)
    WHERE archived_at IS NULL;

CREATE TABLE catalog_item_categories (
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, category_id)
);

CREATE TABLE item_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    sku text,
    name text NOT NULL,
    price_minor bigint NOT NULL CHECK (price_minor >= 0),
    is_default boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

CREATE UNIQUE INDEX item_variants_sku_uidx ON item_variants (item_id, sku)
    WHERE sku IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX item_variants_one_default_uidx ON item_variants (item_id)
    WHERE is_default AND archived_at IS NULL;

CREATE TABLE modifier_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    minimum_selections integer NOT NULL DEFAULT 0 CHECK (minimum_selections >= 0),
    maximum_selections integer NOT NULL DEFAULT 1 CHECK (maximum_selections > 0),
    allow_quantity boolean NOT NULL DEFAULT false,
    free_selection_count integer NOT NULL DEFAULT 0 CHECK (free_selection_count >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    UNIQUE (canteen_id, code),
    CHECK (maximum_selections >= minimum_selections),
    CHECK (free_selection_count <= maximum_selections)
);

CREATE TABLE modifier_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    price_delta_minor bigint NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    UNIQUE (modifier_group_id, code)
);

CREATE TABLE item_modifier_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES item_variants(id) ON DELETE CASCADE,
    modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE RESTRICT,
    minimum_override integer CHECK (minimum_override >= 0),
    maximum_override integer CHECK (maximum_override > 0),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (item_id, variant_id, modifier_group_id),
    CHECK (maximum_override IS NULL OR minimum_override IS NULL OR maximum_override >= minimum_override)
);

CREATE TABLE outlet_item_settings (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    is_available boolean NOT NULL DEFAULT true,
    is_visible_student boolean NOT NULL DEFAULT true,
    is_visible_pos boolean NOT NULL DEFAULT true,
    price_override_minor bigint CHECK (price_override_minor >= 0),
    daily_quantity_limit integer CHECK (daily_quantity_limit >= 0),
    sold_out_until timestamptz,
    preparation_minutes_override integer CHECK (preparation_minutes_override BETWEEN 0 AND 1440),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (outlet_id, item_id)
);

CREATE TABLE outlet_variant_settings (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES item_variants(id) ON DELETE CASCADE,
    is_available boolean NOT NULL DEFAULT true,
    price_override_minor bigint CHECK (price_override_minor >= 0),
    sold_out_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (outlet_id, variant_id)
);

CREATE TABLE price_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    outlet_id uuid REFERENCES outlets(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES item_variants(id) ON DELETE CASCADE,
    channel text CHECK (channel IN ('student_web', 'pos', 'admin', 'kiosk')),
    price_minor bigint NOT NULL CHECK (price_minor >= 0),
    priority integer NOT NULL DEFAULT 0,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX price_rules_resolution_idx
    ON price_rules (item_id, variant_id, outlet_id, channel, priority DESC, starts_at DESC);

CREATE TABLE service_charges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL,
    calculation_type text NOT NULL CHECK (calculation_type IN ('fixed', 'percentage')),
    amount_minor bigint CHECK (amount_minor >= 0),
    rate_basis_points integer CHECK (rate_basis_points BETWEEN 0 AND 10000),
    tax_category_id uuid REFERENCES tax_categories(id) ON DELETE SET NULL,
    applies_to_channels text[] NOT NULL DEFAULT ARRAY['student_web','pos']::text[],
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (canteen_id, code),
    CHECK ((calculation_type = 'fixed' AND amount_minor IS NOT NULL AND rate_basis_points IS NULL) OR
           (calculation_type = 'percentage' AND amount_minor IS NULL AND rate_basis_points IS NOT NULL)),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE allergens (
    code text PRIMARY KEY,
    name text NOT NULL UNIQUE
);

CREATE TABLE item_allergens (
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    allergen_code text NOT NULL REFERENCES allergens(code) ON DELETE RESTRICT,
    presence text NOT NULL DEFAULT 'contains' CHECK (presence IN ('contains', 'may_contain')),
    PRIMARY KEY (item_id, allergen_code)
);

CREATE TABLE inventory_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    sku text,
    name text NOT NULL,
    unit text NOT NULL CHECK (unit IN ('unit', 'gram', 'kilogram', 'millilitre', 'litre')),
    track_stock boolean NOT NULL DEFAULT true,
    low_stock_threshold numeric(18,6) CHECK (low_stock_threshold >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

CREATE UNIQUE INDEX inventory_items_sku_uidx ON inventory_items (canteen_id, sku)
    WHERE sku IS NOT NULL AND archived_at IS NULL;

CREATE TABLE recipes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES item_variants(id) ON DELETE CASCADE,
    modifier_option_id uuid REFERENCES modifier_options(id) ON DELETE CASCADE,
    inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT (variant_id IS NOT NULL AND modifier_option_id IS NOT NULL))
);

CREATE TABLE inventory_balances (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    on_hand numeric(18,6) NOT NULL DEFAULT 0,
    reserved numeric(18,6) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (outlet_id, inventory_item_id),
    CHECK (on_hand >= reserved)
);

CREATE TABLE inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    movement_type text NOT NULL CHECK (movement_type IN ('opening', 'purchase', 'sale', 'waste', 'adjustment', 'transfer_in', 'transfer_out', 'return', 'reservation', 'release')),
    quantity_delta numeric(18,6) NOT NULL CHECK (quantity_delta <> 0),
    reference_type text,
    reference_id uuid,
    reason text,
    performed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    idempotency_key text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX inventory_movements_idempotency_uidx
    ON inventory_movements (outlet_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX inventory_movements_ledger_idx
    ON inventory_movements (outlet_id, inventory_item_id, occurred_at DESC);
