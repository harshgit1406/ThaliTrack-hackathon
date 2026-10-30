SET search_path TO mealy, public;

CREATE TABLE payment_method_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    outlet_id uuid REFERENCES outlets(id) ON DELETE CASCADE,
    method_code text NOT NULL CHECK (method_code IN ('cash', 'upi', 'card', 'razorpay', 'wallet', 'bank_transfer', 'other')),
    display_name text NOT NULL,
    provider text,
    secret_reference text,
    public_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_configuration) = 'object'),
    is_enabled boolean NOT NULL DEFAULT false,
    accepted_channels text[] NOT NULL DEFAULT ARRAY['student_web','pos']::text[],
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_method_configs_scope_uidx
    ON payment_method_configs (canteen_id, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), method_code, COALESCE(provider, ''));

CREATE TABLE payment_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    payment_method_config_id uuid REFERENCES payment_method_configs(id) ON DELETE SET NULL,
    provider text,
    provider_intent_id text,
    idempotency_key text NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency_code char(3) NOT NULL,
    status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'requires_action', 'processing', 'authorized', 'captured', 'failed', 'cancelled', 'expired')),
    client_reference text,
    expires_at timestamptz,
    failure_code text,
    failure_message text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, idempotency_key)
);

CREATE UNIQUE INDEX payment_intents_provider_uidx
    ON payment_intents (provider, provider_intent_id)
    WHERE provider IS NOT NULL AND provider_intent_id IS NOT NULL;
CREATE INDEX payment_intents_order_idx ON payment_intents (order_id, created_at DESC);

CREATE TABLE payment_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
    transaction_type text NOT NULL CHECK (transaction_type IN ('authorization', 'capture', 'sale', 'void', 'refund', 'chargeback', 'adjustment')),
    provider_transaction_id text,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency_code char(3) NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'reversed')),
    processed_at timestamptz,
    raw_response_redacted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_response_redacted) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_transactions_provider_uidx
    ON payment_transactions (provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE refund_reasons (
    code text PRIMARY KEY,
    label text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE RESTRICT,
    reason_code text REFERENCES refund_reasons(code) ON DELETE SET NULL,
    provider_refund_id text,
    idempotency_key text NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency_code char(3) NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
    note text,
    requested_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, idempotency_key)
);

CREATE UNIQUE INDEX refunds_provider_uidx ON refunds (provider_refund_id)
    WHERE provider_refund_id IS NOT NULL;

CREATE TABLE promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    promotion_type text NOT NULL CHECK (promotion_type IN ('percentage', 'fixed', 'item_fixed', 'buy_x_get_y', 'free_item')),
    value_minor bigint,
    value_basis_points integer,
    maximum_discount_minor bigint CHECK (maximum_discount_minor >= 0),
    minimum_order_minor bigint CHECK (minimum_order_minor >= 0),
    usage_limit_total integer CHECK (usage_limit_total > 0),
    usage_limit_per_student integer CHECK (usage_limit_per_student > 0),
    eligible_channels text[] NOT NULL DEFAULT ARRAY['student_web','pos']::text[],
    eligibility_rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(eligibility_rules) = 'object'),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended', 'archived')),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((promotion_type = 'percentage' AND value_basis_points IS NOT NULL AND value_basis_points BETWEEN 1 AND 10000 AND value_minor IS NULL) OR
           (promotion_type <> 'percentage' AND value_minor IS NOT NULL AND value_minor >= 0 AND value_basis_points IS NULL)),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE promotion_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    code text NOT NULL,
    usage_limit integer CHECK (usage_limit > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'exhausted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (canteen_id, code),
    CHECK (code = upper(btrim(code)))
);

CREATE TABLE order_discount_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    order_item_id uuid REFERENCES order_items(id) ON DELETE RESTRICT,
    promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
    promotion_code_snapshot text,
    name_snapshot text NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promotion_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
    promotion_code_id uuid REFERENCES promotion_codes(id) ON DELETE SET NULL,
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    student_user_id uuid REFERENCES student_profiles(user_id) ON DELETE SET NULL,
    discount_amount_minor bigint NOT NULL CHECK (discount_amount_minor >= 0),
    redeemed_at timestamptz NOT NULL DEFAULT now(),
    reversed_at timestamptz
);

CREATE INDEX promotion_redemptions_limit_idx ON promotion_redemptions (promotion_id, student_user_id, redeemed_at)
    WHERE reversed_at IS NULL;

CREATE TABLE wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id uuid NOT NULL REFERENCES student_profiles(user_id) ON DELETE RESTRICT,
    currency_code char(3) NOT NULL,
    balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_user_id, currency_code)
);

CREATE TABLE wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    transaction_type text NOT NULL CHECK (transaction_type IN ('topup', 'order_debit', 'refund', 'promotional_credit', 'adjustment', 'expiry')),
    amount_delta_minor bigint NOT NULL CHECK (amount_delta_minor <> 0),
    balance_after_minor bigint NOT NULL CHECK (balance_after_minor >= 0),
    order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
    payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL,
    idempotency_key text NOT NULL,
    expires_at timestamptz,
    note text,
    performed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (wallet_id, idempotency_key)
);

CREATE INDEX wallet_transactions_ledger_idx ON wallet_transactions (wallet_id, created_at DESC, id DESC);

CREATE TABLE commission_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
    outlet_id uuid REFERENCES outlets(id) ON DELETE CASCADE,
    channel text,
    calculation_type text NOT NULL CHECK (calculation_type IN ('fixed', 'percentage')),
    amount_minor bigint CHECK (amount_minor >= 0),
    rate_basis_points integer CHECK (rate_basis_points BETWEEN 0 AND 10000),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((calculation_type = 'fixed' AND amount_minor IS NOT NULL AND rate_basis_points IS NULL) OR
           (calculation_type = 'percentage' AND amount_minor IS NULL AND rate_basis_points IS NOT NULL)),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE platform_collections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    gross_collected_minor bigint NOT NULL CHECK (gross_collected_minor >= 0),
    commission_minor bigint NOT NULL CHECK (commission_minor >= 0),
    gateway_fee_minor bigint NOT NULL DEFAULT 0 CHECK (gateway_fee_minor >= 0),
    tax_on_commission_minor bigint NOT NULL DEFAULT 0 CHECK (tax_on_commission_minor >= 0),
    net_payable_minor bigint NOT NULL,
    currency_code char(3) NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'held', 'paid', 'reversed')),
    available_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (net_payable_minor >= 0),
    CHECK (net_payable_minor = gross_collected_minor - commission_minor - gateway_fee_minor - tax_on_commission_minor)
);

CREATE TABLE payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    provider text,
    provider_payout_id text,
    idempotency_key text NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency_code char(3) NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
    destination_reference text,
    requested_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    processed_at timestamptz,
    failure_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (canteen_id, idempotency_key)
);

CREATE UNIQUE INDEX payouts_provider_uidx ON payouts (provider, provider_payout_id)
    WHERE provider IS NOT NULL AND provider_payout_id IS NOT NULL;

CREATE TABLE payout_collections (
    payout_id uuid NOT NULL REFERENCES payouts(id) ON DELETE RESTRICT,
    collection_id uuid NOT NULL UNIQUE REFERENCES platform_collections(id) ON DELETE RESTRICT,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    PRIMARY KEY (payout_id, collection_id)
);

CREATE TABLE subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    billing_period text NOT NULL CHECK (billing_period IN ('monthly', 'quarterly', 'yearly', 'one_time')),
    price_minor bigint NOT NULL CHECK (price_minor >= 0),
    currency_code char(3) NOT NULL DEFAULT 'INR',
    included_features jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(included_features) = 'object'),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canteen_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canteen_id uuid NOT NULL REFERENCES canteens(id) ON DELETE RESTRICT,
    plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
    starts_at timestamptz NOT NULL,
    current_period_ends_at timestamptz,
    cancelled_at timestamptz,
    provider text,
    provider_subscription_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (current_period_ends_at IS NULL OR current_period_ends_at > starts_at)
);

CREATE UNIQUE INDEX canteen_subscriptions_current_uidx ON canteen_subscriptions (canteen_id)
    WHERE status IN ('trialing', 'active', 'past_due', 'paused');
