SET search_path TO mealy, public;

INSERT INTO order_status_definitions (code, label, is_terminal, is_customer_visible, sort_order) VALUES
    ('placed', 'Order placed', false, true, 10),
    ('confirmed', 'Confirmed', false, true, 20),
    ('preparing', 'Preparing', false, true, 30),
    ('ready_for_pickup', 'Ready for pickup', false, true, 40),
    ('collected', 'Collected', true, true, 50),
    ('rejected', 'Rejected', true, true, 90),
    ('cancelled', 'Cancelled', true, true, 100);

INSERT INTO order_status_transitions (from_status, to_status, allowed_actor_types, requires_reason) VALUES
    ('placed', 'confirmed', ARRAY['staff','admin','system'], false),
    ('placed', 'cancelled', ARRAY['student','staff','admin','system'], true),
    ('placed', 'rejected', ARRAY['staff','admin','system'], true),
    ('confirmed', 'preparing', ARRAY['staff','admin','system'], false),
    ('confirmed', 'cancelled', ARRAY['staff','admin','system'], true),
    ('confirmed', 'rejected', ARRAY['staff','admin','system'], true),
    ('preparing', 'ready_for_pickup', ARRAY['staff','admin','system'], false),
    ('preparing', 'cancelled', ARRAY['staff','admin'], true),
    ('ready_for_pickup', 'collected', ARRAY['staff','admin'], false),
    ('ready_for_pickup', 'cancelled', ARRAY['staff','admin'], true);

INSERT INTO permissions (code, description, risk_level) VALUES
    ('platform.manage', 'Manage platform-wide configuration and administrators', 'critical'),
    ('campus.manage', 'Create and manage campuses and campus assignments', 'critical'),
    ('canteen.manage', 'Create, suspend, and manage canteens', 'critical'),
    ('outlet.manage', 'Manage outlets, counters, hours, and terminals', 'sensitive'),
    ('features.manage', 'Enable canteen feature entitlements', 'critical'),
    ('settings.manage', 'Manage scoped operational settings', 'sensitive'),
    ('staff.manage', 'Invite staff and assign roles', 'critical'),
    ('catalog.read', 'View catalog configuration', 'normal'),
    ('catalog.manage', 'Manage menus, items, variants, modifiers, taxes, and availability', 'sensitive'),
    ('inventory.read', 'View inventory and movements', 'normal'),
    ('inventory.manage', 'Adjust stock and recipes', 'sensitive'),
    ('pos.use', 'Use a registered POS terminal', 'normal'),
    ('orders.read', 'View scoped orders', 'normal'),
    ('orders.manage', 'Create orders and change fulfillment status', 'sensitive'),
    ('kot.manage', 'Create and update KOTs and kitchen item states', 'sensitive'),
    ('payments.read', 'View payment state and transactions', 'sensitive'),
    ('payments.manage', 'Configure and capture payments', 'critical'),
    ('refunds.manage', 'Issue and reconcile refunds', 'critical'),
    ('payouts.manage', 'Manage canteen settlements and payouts', 'critical'),
    ('reports.read', 'View scoped operational and financial reports', 'sensitive'),
    ('audit.read', 'View scoped audit records', 'critical');

INSERT INTO roles (code, name, scope_type, is_system) VALUES
    ('super_admin', 'Super administrator', 'platform', true),
    ('campus_admin', 'Campus administrator', 'campus', true),
    ('canteen_owner', 'Canteen owner', 'canteen', true),
    ('canteen_manager', 'Canteen manager', 'canteen', true),
    ('outlet_manager', 'Outlet manager', 'outlet', true),
    ('cashier', 'Cashier', 'outlet', true),
    ('kitchen', 'Kitchen staff', 'outlet', true),
    ('viewer', 'Read-only viewer', 'outlet', true);

WITH role_map AS (SELECT id, code, scope_type FROM roles)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM role_map r
CROSS JOIN permissions p
WHERE r.code = 'super_admin'
   OR (r.code = 'campus_admin' AND p.code IN ('campus.manage','canteen.manage','outlet.manage','staff.manage','catalog.read','orders.read','reports.read','audit.read'))
   OR (r.code = 'canteen_owner' AND p.code IN ('canteen.manage','outlet.manage','settings.manage','staff.manage','catalog.read','catalog.manage','inventory.read','inventory.manage','pos.use','orders.read','orders.manage','kot.manage','payments.read','payments.manage','refunds.manage','payouts.manage','reports.read','audit.read'))
   OR (r.code = 'canteen_manager' AND p.code IN ('outlet.manage','settings.manage','staff.manage','catalog.read','catalog.manage','inventory.read','inventory.manage','pos.use','orders.read','orders.manage','kot.manage','payments.read','refunds.manage','reports.read'))
   OR (r.code = 'outlet_manager' AND p.code IN ('outlet.manage','catalog.read','catalog.manage','inventory.read','inventory.manage','pos.use','orders.read','orders.manage','kot.manage','payments.read','refunds.manage','reports.read'))
   OR (r.code = 'cashier' AND p.code IN ('catalog.read','pos.use','orders.read','orders.manage','payments.read'))
   OR (r.code = 'kitchen' AND p.code IN ('catalog.read','orders.read','kot.manage'))
   OR (r.code = 'viewer' AND p.code IN ('catalog.read','inventory.read','orders.read','payments.read','reports.read'));

INSERT INTO feature_definitions (code, name, description, default_enabled) VALUES
    ('student_ordering', 'Student ordering', 'Student-facing catalog, cart, checkout, and order tracking', true),
    ('pos', 'Canteen POS', 'Counter point-of-sale application', true),
    ('kot', 'Kitchen order tickets', 'Kitchen routing and preparation workflow', true),
    ('tokens', 'Pickup tokens', 'Counter-scoped daily pickup token numbers', true),
    ('printing', 'Printing', 'KOT, token, bill, and receipt printing', true),
    ('online_payments', 'Online payments', 'Provider-backed online payment collection', false),
    ('cash_payments', 'Cash payments', 'Cash register and cash-payment operations', true),
    ('wallet', 'Student wallet', 'Stored-value wallet and ledger', false),
    ('coupons', 'Coupons and promotions', 'Promotion rules, codes, and redemptions', false),
    ('feedback', 'Ratings and feedback', 'Order and item feedback', false),
    ('inventory', 'Inventory', 'Ingredient stock, recipes, and movement ledger', false),
    ('dine_in', 'Dine in', 'Dining areas, tables, and dine-in orders', false),
    ('reservations', 'Reservations', 'Dining table reservations', false),
    ('delivery', 'Delivery', 'Student addresses and delivery assignment', false),
    ('multi_pos', 'Multiple POS terminals', 'Multiple registered terminals per outlet', true),
    ('subscriptions', 'Canteen subscriptions', 'Plan and entitlement billing', false),
    ('commissions', 'Platform commissions', 'Collection, commission, and payout accounting', false);

INSERT INTO allergens (code, name) VALUES
    ('celery', 'Celery'), ('crustaceans', 'Crustaceans'), ('eggs', 'Eggs'),
    ('fish', 'Fish'), ('gluten', 'Gluten'), ('lupin', 'Lupin'), ('milk', 'Milk'),
    ('molluscs', 'Molluscs'), ('mustard', 'Mustard'), ('nuts', 'Tree nuts'),
    ('peanuts', 'Peanuts'), ('sesame', 'Sesame'), ('soy', 'Soy'),
    ('sulphites', 'Sulphites');

INSERT INTO refund_reasons (code, label) VALUES
    ('customer_request', 'Customer request'),
    ('item_unavailable', 'Item unavailable'),
    ('canteen_rejected', 'Canteen rejected order'),
    ('duplicate_payment', 'Duplicate payment'),
    ('quality_issue', 'Quality issue'),
    ('other', 'Other');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'schema_metadata','app_users','campuses','canteens','campus_canteens','outlets',
        'service_counters','pos_terminals','student_profiles','student_campus_memberships',
        'roles','access_memberships','feature_definitions','canteen_features','platform_settings',
        'campus_settings','canteen_settings','outlet_settings','outlet_business_hours','menus',
        'menu_schedules','catalog_categories','tax_categories','tax_rates','catalog_items',
        'item_variants','modifier_groups','modifier_options','outlet_item_settings',
        'outlet_variant_settings','service_charges','inventory_items','inventory_balances',
        'carts','cart_items','order_number_sequences','token_sequences','orders','order_items','kitchen_stations','kots','kot_items',
        'payment_method_configs','payment_intents','refunds','promotions','wallets',
        'platform_collections','payouts','subscription_plans','canteen_subscriptions',
        'printers','printer_routes','print_jobs','cash_registers','pos_shifts','dining_areas',
        'dining_tables','reservations','student_addresses','delivery_assignments',
        'receipt_sequences','push_devices','notification_preferences','onboarding_checklists',
        'api_idempotency_records','data_subject_requests'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            table_name || '_set_updated_at', table_name
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION validate_terminal_counter_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.counter_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM service_counters c WHERE c.id = NEW.counter_id AND c.outlet_id = NEW.outlet_id
    ) THEN
        RAISE EXCEPTION 'POS terminal counter must belong to the same outlet';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER pos_terminals_validate_counter
BEFORE INSERT OR UPDATE OF outlet_id, counter_id ON pos_terminals
FOR EACH ROW EXECUTE FUNCTION validate_terminal_counter_scope();

CREATE OR REPLACE FUNCTION validate_order_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.counter_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM service_counters c WHERE c.id = NEW.counter_id AND c.outlet_id = NEW.outlet_id
    ) THEN
        RAISE EXCEPTION 'Order counter must belong to the order outlet';
    END IF;
    IF NEW.terminal_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pos_terminals t WHERE t.id = NEW.terminal_id AND t.outlet_id = NEW.outlet_id
    ) THEN
        RAISE EXCEPTION 'Order terminal must belong to the order outlet';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER orders_validate_scope
BEFORE INSERT OR UPDATE OF outlet_id, counter_id, terminal_id ON orders
FOR EACH ROW EXECUTE FUNCTION validate_order_scope();

CREATE OR REPLACE FUNCTION validate_membership_role_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    membership_scope text;
    role_scope text;
BEGIN
    SELECT scope_type INTO membership_scope FROM access_memberships WHERE id = NEW.membership_id;
    SELECT scope_type INTO role_scope FROM roles WHERE id = NEW.role_id;
    IF membership_scope IS DISTINCT FROM role_scope THEN
        RAISE EXCEPTION 'Role scope % does not match membership scope %', role_scope, membership_scope;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER membership_roles_validate_scope
BEFORE INSERT OR UPDATE ON membership_roles
FOR EACH ROW EXECUTE FUNCTION validate_membership_role_scope();

CREATE OR REPLACE FUNCTION validate_menu_outlet_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    menu_canteen uuid;
    outlet_canteen uuid;
BEGIN
    SELECT canteen_id INTO menu_canteen FROM menus WHERE id = NEW.menu_id;
    SELECT cc.canteen_id INTO outlet_canteen
    FROM outlets o JOIN campus_canteens cc ON cc.id = o.campus_canteen_id
    WHERE o.id = NEW.outlet_id;
    IF menu_canteen IS DISTINCT FROM outlet_canteen THEN
        RAISE EXCEPTION 'Menu and outlet must belong to the same canteen';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER menu_outlets_validate_scope
BEFORE INSERT OR UPDATE ON menu_outlets
FOR EACH ROW EXECUTE FUNCTION validate_menu_outlet_scope();

CREATE OR REPLACE FUNCTION validate_item_modifier_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    item_canteen uuid;
    group_canteen uuid;
    variant_item uuid;
BEGIN
    SELECT canteen_id INTO item_canteen FROM catalog_items WHERE id = NEW.item_id;
    SELECT canteen_id INTO group_canteen FROM modifier_groups WHERE id = NEW.modifier_group_id;
    IF item_canteen IS DISTINCT FROM group_canteen THEN
        RAISE EXCEPTION 'Item and modifier group must belong to the same canteen';
    END IF;
    IF NEW.variant_id IS NOT NULL THEN
        SELECT item_id INTO variant_item FROM item_variants WHERE id = NEW.variant_id;
        IF variant_item IS DISTINCT FROM NEW.item_id THEN
            RAISE EXCEPTION 'Variant must belong to the linked item';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER item_modifier_groups_validate_scope
BEFORE INSERT OR UPDATE ON item_modifier_groups
FOR EACH ROW EXECUTE FUNCTION validate_item_modifier_scope();

CREATE OR REPLACE FUNCTION validate_promotion_code_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    promotion_canteen uuid;
BEGIN
    SELECT canteen_id INTO promotion_canteen FROM promotions WHERE id = NEW.promotion_id;
    IF promotion_canteen IS DISTINCT FROM NEW.canteen_id THEN
        RAISE EXCEPTION 'Promotion code and promotion must belong to the same canteen';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER promotion_codes_validate_scope
BEFORE INSERT OR UPDATE ON promotion_codes
FOR EACH ROW EXECUTE FUNCTION validate_promotion_code_scope();

CREATE OR REPLACE FUNCTION next_order_number(p_outlet_id uuid, p_business_date date)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = mealy, pg_temp
AS $$
    INSERT INTO order_number_sequences (outlet_id, business_date, next_value)
    VALUES (p_outlet_id, p_business_date, 2)
    ON CONFLICT (outlet_id, business_date)
    DO UPDATE SET next_value = order_number_sequences.next_value + 1, updated_at = now()
    RETURNING next_value - 1;
$$;

CREATE OR REPLACE FUNCTION allocate_order_token(
    p_order_id uuid,
    p_counter_id uuid,
    p_service_date date
)
RETURNS TABLE (token_number integer, token_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mealy, pg_temp
AS $$
DECLARE
    v_outlet_id uuid;
    v_counter_outlet_id uuid;
    v_prefix text;
    v_number integer;
BEGIN
    SELECT outlet_id INTO v_outlet_id FROM orders WHERE id = p_order_id FOR UPDATE;
    IF v_outlet_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF EXISTS (SELECT 1 FROM order_tokens ot WHERE ot.order_id = p_order_id) THEN
        RETURN QUERY SELECT ot.token_number, ot.token_label FROM order_tokens ot WHERE ot.order_id = p_order_id;
        RETURN;
    END IF;

    SELECT outlet_id, token_prefix INTO v_counter_outlet_id, v_prefix
    FROM service_counters WHERE id = p_counter_id AND status = 'active';
    IF v_counter_outlet_id IS DISTINCT FROM v_outlet_id THEN
        RAISE EXCEPTION 'Counter must be active and belong to the order outlet';
    END IF;

    INSERT INTO token_sequences (counter_id, service_date, next_value)
    VALUES (p_counter_id, p_service_date, 2)
    ON CONFLICT (counter_id, service_date)
    DO UPDATE SET next_value = token_sequences.next_value + 1, updated_at = now()
    RETURNING next_value - 1 INTO v_number;

    INSERT INTO order_tokens (order_id, counter_id, service_date, token_number, token_label)
    VALUES (p_order_id, p_counter_id, p_service_date, v_number, v_prefix || v_number::text);

    UPDATE orders SET counter_id = p_counter_id WHERE id = p_order_id;

    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'order.token_issued', jsonb_build_object('token_number', v_number, 'token_label', v_prefix || v_number::text));

    RETURN QUERY SELECT v_number, v_prefix || v_number::text;
END;
$$;

CREATE OR REPLACE FUNCTION transition_order(
    p_order_id uuid,
    p_to_status text,
    p_actor_type text,
    p_actor_user_id uuid DEFAULT NULL,
    p_reason_code text DEFAULT NULL,
    p_note text DEFAULT NULL,
    p_expected_version bigint DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mealy, pg_temp
AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_from_status text;
    v_allowed_actors text[];
    v_requires_reason boolean;
BEGIN
    IF p_actor_type NOT IN ('student', 'staff', 'admin', 'system', 'payment_provider') THEN
        RAISE EXCEPTION 'Invalid actor type';
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    IF p_expected_version IS NOT NULL AND v_order.version <> p_expected_version THEN
        RAISE EXCEPTION 'Order version conflict';
    END IF;
    v_from_status := v_order.status_code;

    SELECT allowed_actor_types, requires_reason
    INTO v_allowed_actors, v_requires_reason
    FROM order_status_transitions
    WHERE from_status = v_order.status_code AND to_status = p_to_status;

    IF NOT FOUND OR NOT (p_actor_type = ANY(v_allowed_actors)) THEN
        RAISE EXCEPTION 'Transition from % to % is not allowed for %', v_order.status_code, p_to_status, p_actor_type;
    END IF;
    IF v_requires_reason AND nullif(btrim(p_reason_code), '') IS NULL THEN
        RAISE EXCEPTION 'A reason is required for this transition';
    END IF;

    UPDATE orders
    SET status_code = p_to_status,
        version = version + 1,
        ready_at = CASE WHEN p_to_status = 'ready_for_pickup' THEN now() ELSE ready_at END,
        completed_at = CASE WHEN p_to_status IN ('collected', 'cancelled', 'rejected') THEN now() ELSE completed_at END,
        cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN now() ELSE cancelled_at END
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    INSERT INTO order_status_events (
        order_id, from_status, to_status, actor_type, actor_user_id, reason_code, note
    ) VALUES (
        p_order_id, v_from_status, p_to_status,
        p_actor_type, p_actor_user_id, p_reason_code, p_note
    );

    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'order.status_changed', jsonb_build_object(
        'from_status', v_from_status,
        'to_status', p_to_status,
        'version', v_order.version
    ));

    RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION record_new_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO order_status_events (order_id, from_status, to_status, actor_type, actor_user_id)
    VALUES (NEW.id, NULL, NEW.status_code, 'system', NEW.created_by_user_id);

    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', NEW.id, 'order.created', jsonb_build_object(
        'status', NEW.status_code,
        'outlet_id', NEW.outlet_id,
        'source_channel', NEW.source_channel,
        'version', NEW.version
    ));
    RETURN NEW;
END;
$$;

CREATE TRIGGER orders_record_creation
AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION record_new_order();

REVOKE ALL ON FUNCTION next_order_number(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION allocate_order_token(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION transition_order(uuid, text, text, uuid, text, text, bigint) FROM PUBLIC;

UPDATE schema_metadata SET schema_version = 7;
