CREATE SCHEMA IF NOT EXISTS mealy;
SET search_path TO mealy, public;

CREATE TABLE schema_metadata (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    schema_version integer NOT NULL CHECK (schema_version > 0),
    minimum_app_version text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_metadata (schema_version) VALUES (1);

CREATE TABLE app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
    email text,
    phone_e164 text,
    password_hash text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'disabled')),
    preferred_locale text NOT NULL DEFAULT 'en-IN',
    preferred_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
    email_verified_at timestamptz,
    phone_verified_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),
    CHECK (email IS NULL OR email = lower(btrim(email))),
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX app_users_email_uidx ON app_users (lower(email))
    WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX app_users_phone_uidx ON app_users (phone_e164)
    WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE auth_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('password', 'phone_otp', 'email_otp', 'truecaller', 'google', 'microsoft', 'campus_sso')),
    provider_subject text NOT NULL,
    provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_metadata) = 'object'),
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subject),
    UNIQUE (user_id, provider, provider_subject)
);

CREATE TABLE user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    device_name text,
    ip_address inet,
    user_agent text,
    expires_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);

CREATE INDEX user_sessions_active_idx ON user_sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE campuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
    legal_name text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
    timezone text NOT NULL DEFAULT 'Asia/Kolkata',
    currency_code char(3) NOT NULL DEFAULT 'INR',
    country_code char(2) NOT NULL DEFAULT 'IN',
    address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(address) = 'object'),
    latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
    contact_email text,
    contact_phone_e164 text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    CHECK (contact_email IS NULL OR contact_email = lower(btrim(contact_email))),
    CHECK (contact_phone_e164 IS NULL OR contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE canteens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
    legal_name text,
    tax_registration_number text,
    status text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding', 'active', 'suspended', 'closed', 'archived')),
    support_email text,
    support_phone_e164 text,
    logo_asset_url text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    CHECK (support_email IS NULL OR support_email = lower(btrim(support_email))),
    CHECK (support_phone_e164 IS NULL OR support_phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE campus_canteens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    display_name text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'paused', 'ended')),
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campus_id, canteen_id),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE outlets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_canteen_id uuid NOT NULL REFERENCES campus_canteens(id) ON DELETE RESTRICT,
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'temporarily_closed', 'suspended', 'archived')),
    timezone text NOT NULL DEFAULT 'Asia/Kolkata',
    currency_code char(3) NOT NULL DEFAULT 'INR',
    address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(address) = 'object'),
    latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
    accepts_orders boolean NOT NULL DEFAULT false,
    preparation_lead_minutes integer NOT NULL DEFAULT 15 CHECK (preparation_lead_minutes BETWEEN 0 AND 1440),
    max_orders_per_slot integer CHECK (max_orders_per_slot > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    UNIQUE (campus_canteen_id, code)
);

CREATE INDEX outlets_active_idx ON outlets (campus_canteen_id, status) WHERE archived_at IS NULL;

CREATE TABLE service_counters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    code text NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    token_prefix text NOT NULL DEFAULT '' CHECK (length(token_prefix) <= 12),
    token_reset_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, code)
);

CREATE TABLE pos_terminals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    counter_id uuid REFERENCES service_counters(id) ON DELETE SET NULL,
    code text NOT NULL,
    name text NOT NULL,
    device_fingerprint_hash text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'retired')),
    last_seen_at timestamptz,
    app_version text,
    capabilities jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capabilities) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outlet_id, code)
);

CREATE UNIQUE INDEX pos_terminals_fingerprint_uidx
    ON pos_terminals (outlet_id, device_fingerprint_hash)
    WHERE device_fingerprint_hash IS NOT NULL;

CREATE TABLE student_profiles (
    user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    student_number text,
    date_of_birth date,
    dietary_preferences jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dietary_preferences) = 'array'),
    marketing_opt_in boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_campus_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id uuid NOT NULL REFERENCES student_profiles(user_id) ON DELETE CASCADE,
    campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
    campus_student_identifier text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'expired', 'revoked')),
    verified_at timestamptz,
    valid_until date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_user_id, campus_id)
);

CREATE UNIQUE INDEX student_campus_identifier_uidx
    ON student_campus_memberships (campus_id, campus_student_identifier)
    WHERE campus_student_identifier IS NOT NULL AND status <> 'revoked';

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    scope_type text NOT NULL CHECK (scope_type IN ('platform', 'campus', 'canteen', 'outlet')),
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (scope_type, code)
);

CREATE TABLE permissions (
    code text PRIMARY KEY,
    description text NOT NULL,
    risk_level text NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('normal', 'sensitive', 'critical')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE access_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    scope_type text NOT NULL CHECK (scope_type IN ('platform', 'campus', 'canteen', 'outlet')),
    campus_id uuid REFERENCES campuses(id) ON DELETE CASCADE,
    canteen_id uuid REFERENCES canteens(id) ON DELETE CASCADE,
    outlet_id uuid REFERENCES outlets(id) ON DELETE CASCADE,
    employee_code text,
    status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'ended')),
    invited_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (scope_type = 'platform' AND campus_id IS NULL AND canteen_id IS NULL AND outlet_id IS NULL) OR
        (scope_type = 'campus' AND campus_id IS NOT NULL AND canteen_id IS NULL AND outlet_id IS NULL) OR
        (scope_type = 'canteen' AND campus_id IS NULL AND canteen_id IS NOT NULL AND outlet_id IS NULL) OR
        (scope_type = 'outlet' AND campus_id IS NULL AND canteen_id IS NULL AND outlet_id IS NOT NULL)
    ),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX access_memberships_platform_uidx ON access_memberships (user_id)
    WHERE scope_type = 'platform' AND status <> 'ended';
CREATE UNIQUE INDEX access_memberships_campus_uidx ON access_memberships (user_id, campus_id)
    WHERE scope_type = 'campus' AND status <> 'ended';
CREATE UNIQUE INDEX access_memberships_canteen_uidx ON access_memberships (user_id, canteen_id)
    WHERE scope_type = 'canteen' AND status <> 'ended';
CREATE UNIQUE INDEX access_memberships_outlet_uidx ON access_memberships (user_id, outlet_id)
    WHERE scope_type = 'outlet' AND status <> 'ended';

CREATE TABLE membership_roles (
    membership_id uuid NOT NULL REFERENCES access_memberships(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (membership_id, role_id)
);

CREATE TABLE feature_definitions (
    code text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL,
    default_enabled boolean NOT NULL DEFAULT false,
    configuration_schema jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration_schema) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canteen_features (
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    feature_code text NOT NULL REFERENCES feature_definitions(code) ON DELETE RESTRICT,
    enabled boolean NOT NULL,
    configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (canteen_id, feature_code),
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE TABLE platform_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    is_public boolean NOT NULL DEFAULT false,
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campus_settings (
    campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb NOT NULL,
    is_public boolean NOT NULL DEFAULT false,
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (campus_id, key)
);

CREATE TABLE canteen_settings (
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb NOT NULL,
    is_public boolean NOT NULL DEFAULT false,
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (canteen_id, key)
);

CREATE TABLE outlet_settings (
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    key text NOT NULL,
    value jsonb NOT NULL,
    is_public boolean NOT NULL DEFAULT false,
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (outlet_id, key)
);

CREATE TABLE outlet_business_hours (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    service_type text NOT NULL DEFAULT 'pickup' CHECK (service_type IN ('pickup', 'dine_in', 'delivery')),
    opens_at time NOT NULL,
    closes_at time NOT NULL,
    ordering_opens_minutes_before integer NOT NULL DEFAULT 0 CHECK (ordering_opens_minutes_before BETWEEN 0 AND 1440),
    ordering_closes_minutes_before integer NOT NULL DEFAULT 0 CHECK (ordering_closes_minutes_before BETWEEN 0 AND 1440),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (opens_at <> closes_at)
);

CREATE INDEX outlet_business_hours_lookup_idx
    ON outlet_business_hours (outlet_id, day_of_week, service_type, is_active);

CREATE TABLE outlet_closures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    reason text,
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX outlet_closures_window_idx ON outlet_closures (outlet_id, starts_at, ends_at);
