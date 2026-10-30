BEGIN;
SET search_path TO mealy, public;

DO $$
DECLARE
    missing_tables text[];
BEGIN
    SELECT array_agg(required.name ORDER BY required.name)
    INTO missing_tables
    FROM unnest(ARRAY[
        'campuses','canteens','campus_canteens','outlets','service_counters','pos_terminals',
        'student_profiles','access_memberships','roles','permissions','canteen_features',
        'menus','catalog_categories','catalog_items','item_variants','modifier_groups','modifier_options',
        'tax_rates','tax_categories','service_charges','inventory_items','inventory_movements',
        'carts','orders','order_items','order_tokens','kots','kot_items','order_status_events',
        'payment_intents','payment_transactions','refunds','promotions','wallets','wallet_transactions',
        'printers','print_jobs','cash_registers','pos_shifts','cash_movements','audit_logs','outbox_events'
    ]) AS required(name)
    WHERE to_regclass('mealy.' || required.name) IS NULL;

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Missing required tables: %', missing_tables;
    END IF;
END;
$$;

DO $$
DECLARE
    v_admin uuid;
    v_student uuid;
    v_campus uuid;
    v_canteen uuid;
    v_assignment uuid;
    v_outlet uuid;
    v_counter uuid;
    v_terminal uuid;
    v_category uuid;
    v_tax_category uuid;
    v_tax_rate uuid;
    v_item uuid;
    v_variant uuid;
    v_modifier_group uuid;
    v_modifier_option uuid;
    v_order uuid;
    v_number bigint;
    v_token_number integer;
    v_token_label text;
    v_event_from text;
    v_status text;
    v_failed_as_expected boolean := false;
BEGIN
    INSERT INTO app_users (display_name, email) VALUES ('Schema Admin', 'schema-admin@example.test') RETURNING id INTO v_admin;
    INSERT INTO app_users (display_name, phone_e164) VALUES ('Schema Student', '+919999999999') RETURNING id INTO v_student;
    INSERT INTO student_profiles (user_id, student_number) VALUES (v_student, 'TEST-001');

    INSERT INTO campuses (code, name, status, created_by)
    VALUES ('TEST_CAMPUS', 'Test Campus', 'active', v_admin) RETURNING id INTO v_campus;
    INSERT INTO canteens (code, name, status, created_by)
    VALUES ('TEST_CANTEEN', 'Test Canteen', 'active', v_admin) RETURNING id INTO v_canteen;
    INSERT INTO campus_canteens (campus_id, canteen_id)
    VALUES (v_campus, v_canteen) RETURNING id INTO v_assignment;
    INSERT INTO outlets (campus_canteen_id, code, name, status, accepts_orders)
    VALUES (v_assignment, 'MAIN', 'Main Counter', 'active', true) RETURNING id INTO v_outlet;
    INSERT INTO service_counters (outlet_id, code, name, token_prefix)
    VALUES (v_outlet, 'C1', 'Counter 1', 'A') RETURNING id INTO v_counter;
    INSERT INTO pos_terminals (outlet_id, counter_id, code, name, status)
    VALUES (v_outlet, v_counter, 'POS1', 'POS 1', 'active') RETURNING id INTO v_terminal;

    INSERT INTO catalog_categories (canteen_id, code, name)
    VALUES (v_canteen, 'MEALS', 'Meals') RETURNING id INTO v_category;
    INSERT INTO tax_categories (canteen_id, code, name)
    VALUES (v_canteen, 'FOOD', 'Prepared food') RETURNING id INTO v_tax_category;
    INSERT INTO tax_rates (canteen_id, code, name, authority, rate_basis_points)
    VALUES (v_canteen, 'GST5', 'GST 5%', 'GST', 500) RETURNING id INTO v_tax_rate;
    INSERT INTO tax_category_rates (tax_category_id, tax_rate_id) VALUES (v_tax_category, v_tax_rate);

    INSERT INTO catalog_items (canteen_id, primary_category_id, tax_category_id, sku, name, base_price_minor, status, is_customizable)
    VALUES (v_canteen, v_category, v_tax_category, 'MEAL-1', 'Test Meal', 10000, 'active', true)
    RETURNING id INTO v_item;
    INSERT INTO item_variants (item_id, sku, name, price_minor, is_default)
    VALUES (v_item, 'MEAL-1-R', 'Regular', 10000, true) RETURNING id INTO v_variant;
    INSERT INTO modifier_groups (canteen_id, code, name, minimum_selections, maximum_selections)
    VALUES (v_canteen, 'EXTRAS', 'Add-ons', 0, 2) RETURNING id INTO v_modifier_group;
    INSERT INTO modifier_options (modifier_group_id, code, name, price_delta_minor)
    VALUES (v_modifier_group, 'CHEESE', 'Extra cheese', 2000) RETURNING id INTO v_modifier_option;
    INSERT INTO item_modifier_groups (item_id, variant_id, modifier_group_id)
    VALUES (v_item, v_variant, v_modifier_group);

    v_number := next_order_number(v_outlet, current_date);
    IF v_number <> 1 THEN RAISE EXCEPTION 'Expected first order number 1, got %', v_number; END IF;

    INSERT INTO orders (
        public_number, outlet_id, counter_id, terminal_id, student_user_id, created_by_user_id,
        source_channel, status_code, business_date, order_number, currency_code,
        subtotal_minor, tax_total_minor, total_minor
    ) VALUES (
        'TEST-ORDER-001', v_outlet, v_counter, v_terminal, v_student, v_student,
        'student_web', 'placed', current_date, v_number, 'INR', 12000, 600, 12600
    ) RETURNING id INTO v_order;

    INSERT INTO order_items (
        order_id, catalog_item_id, variant_id, sku_snapshot, item_name_snapshot, variant_name_snapshot,
        quantity, unit_price_minor, modifier_total_minor, tax_total_minor, line_total_minor
    ) VALUES (v_order, v_item, v_variant, 'MEAL-1', 'Test Meal', 'Regular', 1, 10000, 2000, 600, 12600);

    SELECT token_number, token_label INTO v_token_number, v_token_label
    FROM allocate_order_token(v_order, v_counter, current_date);
    IF v_token_number <> 1 OR v_token_label <> 'A1' THEN
        RAISE EXCEPTION 'Unexpected token: % / %', v_token_number, v_token_label;
    END IF;

    SELECT token_number, token_label INTO v_token_number, v_token_label
    FROM allocate_order_token(v_order, v_counter, current_date);
    IF v_token_number <> 1 THEN RAISE EXCEPTION 'Token allocation was not idempotent'; END IF;

    PERFORM transition_order(v_order, 'confirmed', 'staff', v_admin, NULL, NULL, 0);
    SELECT status_code INTO v_status FROM orders WHERE id = v_order;
    IF v_status <> 'confirmed' THEN RAISE EXCEPTION 'Order transition failed'; END IF;
    SELECT from_status INTO v_event_from FROM order_status_events
    WHERE order_id = v_order AND to_status = 'confirmed' ORDER BY id DESC LIMIT 1;
    IF v_event_from <> 'placed' THEN RAISE EXCEPTION 'Status event lost from_status'; END IF;

    BEGIN
        PERFORM transition_order(v_order, 'preparing', 'student', v_student);
    EXCEPTION WHEN OTHERS THEN
        v_failed_as_expected := true;
    END;
    IF NOT v_failed_as_expected THEN RAISE EXCEPTION 'Unauthorized transition unexpectedly succeeded'; END IF;

    IF (SELECT count(*) FROM outbox_events WHERE aggregate_id = v_order) < 3 THEN
        RAISE EXCEPTION 'Expected order creation, token, and status outbox events';
    END IF;
END;
$$;

ROLLBACK;

SELECT 'Mealy schema smoke test passed' AS result;
