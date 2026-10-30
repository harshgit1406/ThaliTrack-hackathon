BEGIN;
SET LOCAL search_path TO mealy, public;

-- Development-only records. Stable UUIDs make this seed safe to run repeatedly and
-- make local frontend configuration predictable.
INSERT INTO app_users (id, display_name, email, phone_e164, status, email_verified_at, phone_verified_at)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Mealy Demo Administrator', 'admin@demo.mealy.test', NULL, 'active', now(), NULL),
  ('a0000000-0000-4000-8000-000000000002', 'Aarav Sharma', 'aarav@demo.mealy.test', '+919900000001', 'active', now(), now()),
  ('a0000000-0000-4000-8000-000000000003', 'Meera Nair', 'meera@demo.mealy.test', '+919900000002', 'active', now(), now()),
  ('a0000000-0000-4000-8000-000000000004', 'Rohan Kitchen', 'rohan@demo.mealy.test', '+919900000003', 'active', now(), now()),
  ('a0000000-0000-4000-8000-000000000005', 'Priya Cashier', 'priya@demo.mealy.test', '+919900000004', 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, status = EXCLUDED.status, updated_at = now();

UPDATE app_users
SET password_hash = 'scrypt:BcQSoYaaeVlpyidO1ExJYg:si6z7WYtvvIYn5KY7ZoK1yPigabFLIgpjjj0HxKwkk8', updated_at = now()
WHERE id = 'a0000000-0000-4000-8000-000000000005';

INSERT INTO student_profiles (user_id, student_number, dietary_preferences)
VALUES
  ('a0000000-0000-4000-8000-000000000002', 'DEMO-STU-001', '["vegetarian"]'),
  ('a0000000-0000-4000-8000-000000000003', 'DEMO-STU-002', '[]')
ON CONFLICT (user_id) DO UPDATE SET student_number = EXCLUDED.student_number, dietary_preferences = EXCLUDED.dietary_preferences, updated_at = now();

INSERT INTO campuses (id, code, name, legal_name, status, address, latitude, longitude, contact_email, created_by)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'MEALY_DEMO', 'Mealy Institute of Technology', 'Mealy Institute of Technology', 'active', '{"line1":"Innovation Road","city":"Bengaluru","state":"Karnataka","postal_code":"560001"}', 12.971599, 77.594566, 'campus@demo.mealy.test', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'MEALY_CITY', 'Mealy City College', 'Mealy City College', 'active', '{"line1":"College Avenue","city":"Bengaluru","state":"Karnataka","postal_code":"560004"}', 12.945000, 77.570000, 'city@demo.mealy.test', 'a0000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', address = EXCLUDED.address, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, updated_at = now();

INSERT INTO canteens (id, code, name, legal_name, status, support_email, support_phone_e164, created_by, metadata)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'CENTRAL_BITES', 'Central Bites', 'Central Bites Foods', 'active', 'central@demo.mealy.test', '+919900001001', 'a0000000-0000-4000-8000-000000000001', '{"sample":true,"cuisine":["Indian","Snacks","Beverages"]}'),
  ('c0000000-0000-4000-8000-000000000002', 'SOUTH_SPICE', 'South Spice', 'South Spice Kitchens', 'active', 'south@demo.mealy.test', '+919900001002', 'a0000000-0000-4000-8000-000000000001', '{"sample":true,"cuisine":["South Indian","Beverages"]}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', support_email = EXCLUDED.support_email, metadata = EXCLUDED.metadata, updated_at = now();

INSERT INTO campus_canteens (id, campus_id, canteen_id, display_name, status)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Central Bites - Main Campus', 'active'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'South Spice - Main Campus', 'active'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Central Bites - City Campus', 'active')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active', updated_at = now();

INSERT INTO outlets (id, campus_canteen_id, code, name, status, address, latitude, longitude, accepts_orders, preparation_lead_minutes, max_orders_per_slot)
VALUES
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'MAIN_FOOD_COURT', 'Main Food Court', 'active', '{"building":"Student Centre","floor":"Ground"}', 12.971700, 77.594700, true, 12, 80),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'HOSTEL_BLOCK', 'Hostel Block Canteen', 'active', '{"building":"Hostel Block A","floor":"Ground"}', 12.973100, 77.596100, true, 15, 60),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'CITY_CAFE', 'City Campus Cafe', 'active', '{"building":"Academic Block","floor":"First"}', 12.945100, 77.570100, true, 10, 50)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', accepts_orders = true, preparation_lead_minutes = EXCLUDED.preparation_lead_minutes, updated_at = now();

INSERT INTO service_counters (id, outlet_id, code, name, status, token_prefix)
VALUES
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'PICKUP_A', 'Pickup Counter A', 'active', 'A'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'PICKUP_B', 'Pickup Counter B', 'active', 'B'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'MAIN', 'Main Pickup', 'active', 'H'),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000003', 'MAIN', 'Cafe Pickup', 'active', 'C')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now();

INSERT INTO pos_terminals (id, outlet_id, counter_id, code, name, status, app_version, capabilities)
VALUES
  ('11000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'POS_A1', 'Main POS', 'active', '0.1.0', '{"receipt_printing":true}'),
  ('11000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003', 'POS_H1', 'Hostel POS', 'active', '0.1.0', '{"receipt_printing":true}'),
  ('11000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000004', 'POS_C1', 'Cafe POS', 'active', '0.1.0', '{"receipt_printing":false}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', app_version = EXCLUDED.app_version, updated_at = now();

INSERT INTO outlet_business_hours (id, outlet_id, day_of_week, opens_at, closes_at)
SELECT ('12000000-0000-4000-8000-' || lpad(((outlet_no * 10) + day_no)::text, 12, '0'))::uuid,
       outlet_id, day_no, time '08:00', time '21:00'
FROM (VALUES (1, 'e0000000-0000-4000-8000-000000000001'::uuid), (2, 'e0000000-0000-4000-8000-000000000002'::uuid), (3, 'e0000000-0000-4000-8000-000000000003'::uuid)) outlets(outlet_no, outlet_id)
CROSS JOIN generate_series(0, 6) AS day_no
ON CONFLICT (id) DO UPDATE SET is_active = true, updated_at = now();

INSERT INTO canteen_features (canteen_id, feature_code, enabled, configuration, updated_by)
SELECT canteen.id, feature.code,
       feature.code IN ('pos','student_ordering','kot','kds','printing','online_payments','inventory','reports'),
       CASE WHEN feature.code = 'online_payments' THEN '{"provider":"razorpay","mode":"test"}'::jsonb ELSE '{}'::jsonb END,
       'a0000000-0000-4000-8000-000000000001'
FROM (VALUES ('c0000000-0000-4000-8000-000000000001'::uuid), ('c0000000-0000-4000-8000-000000000002'::uuid)) canteen(id)
CROSS JOIN feature_definitions feature
ON CONFLICT (canteen_id, feature_code) DO UPDATE SET enabled = EXCLUDED.enabled, configuration = EXCLUDED.configuration, updated_by = EXCLUDED.updated_by, updated_at = now();

INSERT INTO access_memberships (id, user_id, scope_type, canteen_id, outlet_id, employee_code, status, invited_by, starts_at)
VALUES
  ('13000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'platform', NULL, NULL, 'PLATFORM-001', 'active', NULL, now()),
  ('13000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'canteen', 'c0000000-0000-4000-8000-000000000001', NULL, 'CB-KITCHEN-01', 'active', 'a0000000-0000-4000-8000-000000000001', now()),
  ('13000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', 'outlet', NULL, 'e0000000-0000-4000-8000-000000000001', 'CB-CASHIER-01', 'active', 'a0000000-0000-4000-8000-000000000001', now())
ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();

INSERT INTO membership_roles (membership_id, role_id, assigned_by)
SELECT '13000000-0000-4000-8000-000000000001', id, 'a0000000-0000-4000-8000-000000000001' FROM roles WHERE scope_type = 'platform' AND code = 'super_admin'
ON CONFLICT DO NOTHING;
INSERT INTO membership_roles (membership_id, role_id, assigned_by)
SELECT '13000000-0000-4000-8000-000000000002', id, 'a0000000-0000-4000-8000-000000000001' FROM roles WHERE scope_type = 'canteen' AND code = 'canteen_manager'
ON CONFLICT DO NOTHING;
INSERT INTO membership_roles (membership_id, role_id, assigned_by)
SELECT '13000000-0000-4000-8000-000000000003', id, 'a0000000-0000-4000-8000-000000000001' FROM roles WHERE scope_type = 'outlet' AND code = 'cashier'
ON CONFLICT DO NOTHING;

INSERT INTO student_campus_memberships (id, student_user_id, campus_id, campus_student_identifier, status, verified_at)
VALUES
  ('14000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'MIT-2026-001', 'verified', now()),
  ('14000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'MIT-2026-002', 'verified', now())
ON CONFLICT (id) DO UPDATE SET status = 'verified', verified_at = now(), updated_at = now();

INSERT INTO menus (id, canteen_id, code, name, description, status, sort_order)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'ALL_DAY', 'All Day Menu', 'Breakfast, meals, snacks and drinks', 'active', 1),
  ('20000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'SOUTH_MENU', 'South Indian Favourites', 'Fresh campus classics', 'active', 1)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now();

INSERT INTO menu_outlets (menu_id, outlet_id, is_active)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', true),
  ('20000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', true)
ON CONFLICT (menu_id, outlet_id) DO UPDATE SET is_active = true;

INSERT INTO catalog_categories (id, canteen_id, code, name, description, sort_order)
VALUES
  ('21000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'BREAKFAST', 'Breakfast', 'Quick morning favourites', 1),
  ('21000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'MEALS', 'Meals', 'Filling lunch and dinner plates', 2),
  ('21000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'SNACKS', 'Snacks', 'Campus break-time bites', 3),
  ('21000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'DRINKS', 'Beverages', 'Hot and cold drinks', 4),
  ('21000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'SOUTH', 'South Indian', 'Dosa, idli and rice favourites', 1),
  ('21000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002', 'DRINKS', 'Beverages', 'Freshly made drinks', 2)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now();

INSERT INTO menu_categories (menu_id, category_id, sort_order)
VALUES
  ('20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 1),
  ('20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 2),
  ('20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003', 3),
  ('20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000004', 4),
  ('20000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000005', 1),
  ('20000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000006', 2)
ON CONFLICT (menu_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO tax_categories (id, canteen_id, code, name)
VALUES
  ('22000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'PREPARED_FOOD', 'Prepared food'),
  ('22000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'PREPARED_FOOD', 'Prepared food')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();
INSERT INTO tax_rates (id, canteen_id, code, name, authority, rate_basis_points, price_inclusive)
VALUES
  ('23000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'GST5', 'GST 5%', 'GST', 500, false),
  ('23000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'GST5', 'GST 5%', 'GST', 500, false)
ON CONFLICT (id) DO UPDATE SET rate_basis_points = 500, status = 'active', updated_at = now();
INSERT INTO tax_category_rates (tax_category_id, tax_rate_id)
VALUES
  ('22000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO media_assets (id, canteen_id, storage_key, public_url, mime_type, byte_size, checksum_sha256, alt_text, status)
VALUES
  ('24000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'demo/masala-poha.jpg', '/food/masala-poha.jpg', 'image/jpeg', 43073, 'be0500dce501a7cba9ed60ef859589a9db394af6de188bda20788ba13051654d', 'Bowl of masala poha', 'ready'),
  ('24000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'demo/campus-veg-thali.jpg', '/food/campus-veg-thali.jpg', 'image/jpeg', 51792, '95bf85f8059d2e74035d9ee00302689d957366a1629d29e2248e65c20cc70a01', 'Campus vegetable thali', 'ready'),
  ('24000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'demo/grilled-paneer-sandwich.jpg', '/food/grilled-paneer-sandwich.jpg', 'image/jpeg', 43783, '323c41e59ec8503a0751f465add1b722c850af313f1b2738956baadc7e8f2615', 'Grilled paneer sandwich', 'ready'),
  ('24000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'demo/masala-chai.jpg', '/food/masala-chai.jpg', 'image/jpeg', 29777, 'fc39d7403b08bc3d88333971ce6705230816c4fb510a23be224846202789246c', 'Cup of masala chai', 'ready'),
  ('24000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'demo/rajma-chawal.jpg', '/food/rajma-chawal.jpg', 'image/jpeg', 51792, '95bf85f8059d2e74035d9ee00302689d957366a1629d29e2248e65c20cc70a01', 'Rajma with steamed rice', 'ready'),
  ('24000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'demo/punjabi-samosa.jpg', '/food/punjabi-samosa.jpg', 'image/jpeg', 37816, 'a3ec5dc905ae27292b7552037e60df59e071d2f379512d66df31f40faa992e62', 'Punjabi samosa', 'ready'),
  ('24000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', 'demo/chole-kulche.jpg', '/food/chole-kulche.jpg', 'image/jpeg', 43084, 'd8704432f004845f1b481666e8a2edb13135b717d7f0e6e157b384a24f75be5c', 'Chole with kulche', 'ready'),
  ('24000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', 'demo/veg-hakka-noodles.jpg', '/food/veg-hakka-noodles.jpg', 'image/jpeg', 43073, 'be0500dce501a7cba9ed60ef859589a9db394af6de188bda20788ba13051654d', 'Vegetable Hakka noodles', 'ready'),
  ('24000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', 'demo/aloo-paratha.jpg', '/food/aloo-paratha.jpg', 'image/jpeg', 46676, '9e9068bd88c38a3b77618b517ba72bb5328a2df6ec138473136df021e0a7cd4c', 'Aloo paratha with accompaniments', 'ready'),
  ('24000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000001', 'demo/sweet-lassi.jpg', '/food/sweet-lassi.jpg', 'image/jpeg', 30836, 'f36ffb144731be5b20c5c3254cd326ace749fe712ccec48c93b3e3b59276be39', 'Chilled sweet lassi', 'ready')
ON CONFLICT (id) DO UPDATE SET public_url = EXCLUDED.public_url, byte_size = EXCLUDED.byte_size,
  checksum_sha256 = EXCLUDED.checksum_sha256, alt_text = EXCLUDED.alt_text, status = 'ready', deleted_at = NULL;

INSERT INTO catalog_items (id, canteen_id, primary_category_id, tax_category_id, image_asset_id, sku, name, short_description, food_type, base_price_minor, status, is_featured, is_customizable, preparation_minutes, sort_order)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'CB-POHA', 'Masala Poha', 'Flattened rice with peanuts and fresh lemon', 'vegan', 4500, 'active', true, false, 6, 1),
  ('30000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000002', 'CB-THALI', 'Campus Veg Thali', 'Dal, seasonal sabzi, rice, roti and salad', 'vegetarian', 9500, 'active', true, true, 12, 2),
  ('30000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000003', 'CB-SANDWICH', 'Grilled Paneer Sandwich', 'Spiced paneer and vegetables, grilled crisp', 'vegetarian', 7000, 'active', false, true, 9, 3),
  ('30000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000004', 'CB-CHAI', 'Masala Chai', 'Fresh ginger-cardamom tea', 'vegetarian', 2000, 'active', false, false, 4, 4),
  ('30000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000005', '22000000-0000-4000-8000-000000000002', NULL, 'SS-DOSA', 'Masala Dosa', 'Crisp dosa with potato masala, sambar and chutney', 'vegan', 6500, 'active', true, true, 10, 1),
  ('30000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000005', '22000000-0000-4000-8000-000000000002', NULL, 'SS-IDLI', 'Idli Sambar', 'Three soft idlis with sambar and chutney', 'vegan', 4000, 'active', true, false, 6, 2),
  ('30000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000006', '22000000-0000-4000-8000-000000000002', NULL, 'SS-COFFEE', 'Filter Coffee', 'Traditional South Indian filter coffee', 'vegetarian', 2500, 'active', false, false, 4, 3),
  ('30000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000008', 'CB-RAJMA', 'Rajma Chawal', 'Slow-cooked rajma with steamed rice', 'vegan', 7500, 'active', true, false, 10, 5),
  ('30000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000009', 'CB-SAMOSA', 'Punjabi Samosa', 'Crisp pastry with spiced potato filling', 'vegan', 2500, 'active', true, false, 5, 6),
  ('30000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000010', 'CB-CHOLE', 'Chole Kulche', 'Tangy chickpeas with soft kulche', 'vegan', 8000, 'active', false, false, 11, 7),
  ('30000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000011', 'CB-NOODLES', 'Veg Hakka Noodles', 'Wok-tossed noodles with seasonal vegetables', 'vegan', 7000, 'active', false, false, 9, 8),
  ('30000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000012', 'CB-PARATHA', 'Aloo Paratha', 'Whole-wheat paratha with potato filling and curd', 'vegetarian', 6000, 'active', false, false, 8, 9),
  ('30000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000013', 'CB-LASSI', 'Sweet Lassi', 'Chilled yoghurt drink', 'vegetarian', 3500, 'active', false, false, 3, 10)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  image_asset_id = EXCLUDED.image_asset_id, base_price_minor = EXCLUDED.base_price_minor, status = 'active', updated_at = now();

INSERT INTO catalog_item_categories (item_id, category_id)
SELECT id, primary_category_id FROM catalog_items WHERE id::text LIKE '30000000-0000-4000-8000-%'
ON CONFLICT DO NOTHING;

INSERT INTO item_variants (id, item_id, sku, name, price_minor, is_default, sort_order)
VALUES
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'CB-POHA-R', 'Regular', 4500, true, 1),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'CB-THALI-R', 'Regular', 9500, true, 1),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'CB-THALI-L', 'Large', 12500, false, 2),
  ('31000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'CB-SANDWICH-R', 'Regular', 7000, true, 1),
  ('31000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000004', 'CB-CHAI-C', 'Cup', 2000, true, 1),
  ('31000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000005', 'SS-DOSA-R', 'Regular', 6500, true, 1),
  ('31000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000006', 'SS-IDLI-3', '3 pieces', 4000, true, 1),
  ('31000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000007', 'SS-COFFEE-C', 'Cup', 2500, true, 1)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_minor = EXCLUDED.price_minor, status = 'active', updated_at = now();

INSERT INTO modifier_groups (id, canteen_id, code, name, minimum_selections, maximum_selections, allow_quantity, sort_order)
VALUES
  ('32000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'MEAL_EXTRAS', 'Meal extras', 0, 3, true, 1),
  ('32000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'DOSA_STYLE', 'Dosa options', 0, 2, false, 1)
ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();
INSERT INTO modifier_options (id, modifier_group_id, code, name, price_delta_minor, sort_order)
VALUES
  ('33000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'EXTRA_ROTI', 'Extra roti', 1000, 1),
  ('33000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 'EXTRA_CURD', 'Curd cup', 2000, 2),
  ('33000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', 'CHEESE', 'Cheese slice', 1500, 3),
  ('33000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000002', 'GHEE', 'Ghee roast', 1500, 1),
  ('33000000-0000-4000-8000-000000000005', '32000000-0000-4000-8000-000000000002', 'EXTRA_SAMBAR', 'Extra sambar', 1000, 2)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_delta_minor = EXCLUDED.price_delta_minor, status = 'active', updated_at = now();
INSERT INTO item_modifier_groups (id, item_id, modifier_group_id, sort_order)
VALUES
  ('34000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 1),
  ('34000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', 1),
  ('34000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000005', '32000000-0000-4000-8000-000000000002', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO outlet_item_settings (outlet_id, item_id, is_available, is_visible_student, is_visible_pos)
SELECT outlet.id, item.id, true, true, true
FROM outlets outlet
JOIN campus_canteens link ON link.id = outlet.campus_canteen_id
JOIN catalog_items item ON item.canteen_id = link.canteen_id
WHERE outlet.id::text LIKE 'e0000000-0000-4000-8000-%' AND item.id::text LIKE '30000000-0000-4000-8000-%'
ON CONFLICT (outlet_id, item_id) DO UPDATE SET is_available = true, is_visible_student = true, is_visible_pos = true, updated_at = now();

INSERT INTO kitchen_stations (id, outlet_id, code, name, display_order)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'HOT', 'Hot Kitchen', 1),
  ('40000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'BEVERAGE', 'Beverage Station', 2),
  ('40000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'MAIN', 'Main Kitchen', 1),
  ('40000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000003', 'MAIN', 'Cafe Kitchen', 1)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now();

INSERT INTO item_station_routes (outlet_id, item_id, kitchen_station_id)
VALUES
  ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO inventory_items (id, canteen_id, sku, name, unit, low_stock_threshold)
VALUES
  ('41000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'INV-RICE', 'Rice', 'kilogram', 10),
  ('41000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'INV-MILK', 'Milk', 'litre', 8),
  ('41000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'INV-BATTER', 'Dosa and idli batter', 'kilogram', 12)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now();
INSERT INTO inventory_balances (outlet_id, inventory_item_id, on_hand, reserved)
VALUES
  ('e0000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 48, 2),
  ('e0000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 30, 1),
  ('e0000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000003', 55, 4)
ON CONFLICT (outlet_id, inventory_item_id) DO UPDATE SET on_hand = EXCLUDED.on_hand, reserved = EXCLUDED.reserved, updated_at = now();

INSERT INTO payment_method_configs (id, canteen_id, method_code, display_name, provider, public_configuration, is_enabled, accepted_channels, sort_order)
VALUES
  ('42000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'cash', 'Cash at POS', NULL, '{}', true, ARRAY['pos'], 1),
  ('42000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'upi', 'UPI terminal', 'manual_terminal', '{}', true, ARRAY['pos'], 2),
  ('42000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'card', 'Card terminal', 'manual_terminal', '{}', true, ARRAY['pos'], 3),
  ('42000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'razorpay', 'Pay online', 'razorpay', '{"mode":"test"}', true, ARRAY['student_web'], 2),
  ('42000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'cash', 'Cash at POS', NULL, '{}', true, ARRAY['pos'], 1),
  ('42000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', 'razorpay', 'Pay online', 'razorpay', '{"mode":"test"}', true, ARRAY['student_web'], 2)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_enabled = EXCLUDED.is_enabled, updated_at = now();

INSERT INTO cash_registers (id, outlet_id, terminal_id, code, name, status)
VALUES ('42500000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'MAIN_DRAWER', 'Main cash drawer', 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now();

INSERT INTO printers (id, outlet_id, code, name, printer_type, connection_config, paper_width_mm, status, last_seen_at)
VALUES
  ('43000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'KITCHEN_1', 'Kitchen KOT Printer', 'network', '{"host":"192.0.2.10","development":true}', 80, 'active', now()),
  ('43000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'RECEIPT_1', 'Counter Receipt Printer', 'system', '{"queue":"Demo Receipt Printer","development":true}', 80, 'active', now())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', last_seen_at = now(), updated_at = now();

INSERT INTO printer_routes (id, outlet_id, printer_id, document_type, terminal_id, copies, priority, is_active)
VALUES
  ('43500000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'kot', NULL, 1, 1, true),
  ('43500000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000002', 'receipt', '11000000-0000-4000-8000-000000000001', 1, 1, true)
ON CONFLICT (id) DO UPDATE SET is_active = true, updated_at = now();

INSERT INTO orders (id, public_number, outlet_id, counter_id, terminal_id, student_user_id, created_by_user_id, source_channel, status_code, payment_status, business_date, order_number, currency_code, subtotal_minor, tax_total_minor, total_minor, paid_total_minor, customer_name_snapshot, customer_phone_snapshot, customer_note, idempotency_key, placed_at, promised_at)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'DEMO-' || to_char(current_date, 'YYYYMMDD') || '-9001', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', NULL, 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'student_web', 'preparing', 'paid', current_date, 9001, 'INR', 9500, 475, 9975, 9975, 'Aarav Sharma', '+919900000001', 'Less spicy, please', 'demo-order-9001', now() - interval '8 minutes', now() + interval '4 minutes'),
  ('50000000-0000-4000-8000-000000000002', 'DEMO-' || to_char(current_date, 'YYYYMMDD') || '-9002', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', NULL, 'a0000000-0000-4000-8000-000000000004', 'pos', 'ready_for_pickup', 'paid', current_date, 9002, 'INR', 9000, 450, 9450, 9450, 'Walk-in Student', NULL, NULL, 'demo-order-9002', now() - interval '16 minutes', now() - interval '4 minutes')
ON CONFLICT (id) DO UPDATE SET status_code = EXCLUDED.status_code, payment_status = EXCLUDED.payment_status, placed_at = EXCLUDED.placed_at, promised_at = EXCLUDED.promised_at, updated_at = now();

INSERT INTO order_items (id, order_id, catalog_item_id, variant_id, sku_snapshot, item_name_snapshot, variant_name_snapshot, quantity, unit_price_minor, tax_total_minor, line_total_minor, notes, preparation_status)
VALUES
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'CB-THALI', 'Campus Veg Thali', 'Regular', 1, 9500, 475, 9975, 'Less spicy', 'preparing'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000004', 'CB-SANDWICH', 'Grilled Paneer Sandwich', 'Regular', 1, 7000, 350, 7350, NULL, 'ready'),
  ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', '31000000-0000-4000-8000-000000000005', 'CB-CHAI', 'Masala Chai', 'Cup', 1, 2000, 100, 2100, NULL, 'ready')
ON CONFLICT (id) DO UPDATE SET preparation_status = EXCLUDED.preparation_status, updated_at = now();

INSERT INTO order_tokens (id, order_id, counter_id, service_date, token_number, token_label, called_at)
VALUES
  ('52000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', current_date, 9001, 'A9001', NULL),
  ('52000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', current_date, 9002, 'A9002', now() - interval '2 minutes')
ON CONFLICT (id) DO UPDATE SET called_at = EXCLUDED.called_at;

INSERT INTO kots (id, order_id, kitchen_station_id, kot_number, status, idempotency_key, fired_at, accepted_at, ready_at, created_by)
VALUES
  ('53000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 1, 'preparing', 'demo-kot-9001', now() - interval '8 minutes', now() - interval '7 minutes', NULL, 'a0000000-0000-4000-8000-000000000004'),
  ('53000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 1, 'ready', 'demo-kot-9002-hot', now() - interval '16 minutes', now() - interval '15 minutes', now() - interval '4 minutes', 'a0000000-0000-4000-8000-000000000004'),
  ('53000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 2, 'ready', 'demo-kot-9002-drink', now() - interval '16 minutes', now() - interval '15 minutes', now() - interval '10 minutes', 'a0000000-0000-4000-8000-000000000004')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, fired_at = EXCLUDED.fired_at, accepted_at = EXCLUDED.accepted_at, ready_at = EXCLUDED.ready_at, updated_at = now();

INSERT INTO kot_items (id, kot_id, order_item_id, quantity, item_name_snapshot, variant_name_snapshot, notes_snapshot, status, started_at, ready_at)
VALUES
  ('54000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 1, 'Campus Veg Thali', 'Regular', 'Less spicy', 'preparing', now() - interval '7 minutes', NULL),
  ('54000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', 1, 'Grilled Paneer Sandwich', 'Regular', NULL, 'ready', now() - interval '15 minutes', now() - interval '4 minutes'),
  ('54000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000003', 1, 'Masala Chai', 'Cup', NULL, 'ready', now() - interval '15 minutes', now() - interval '10 minutes')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, started_at = EXCLUDED.started_at, ready_at = EXCLUDED.ready_at, updated_at = now();

INSERT INTO payment_intents (id, order_id, payment_method_config_id, provider, provider_intent_id, idempotency_key, amount_minor, currency_code, status, metadata)
VALUES
  ('55000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002', 'razorpay', 'pay_demo_9001', 'demo-payment-9001', 9975, 'INR', 'captured', '{"sample":true}'),
  ('55000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', 'manual', 'cash_demo_9002', 'demo-payment-9002', 9450, 'INR', 'captured', '{"sample":true}')
ON CONFLICT (id) DO UPDATE SET status = 'captured', updated_at = now();

INSERT INTO payment_transactions (id, payment_intent_id, transaction_type, provider_transaction_id, amount_minor, currency_code, status, processed_at, raw_response_redacted)
VALUES
  ('56000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'capture', 'txn_demo_9001', 9975, 'INR', 'succeeded', now() - interval '8 minutes', '{"sample":true}'),
  ('56000000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000002', 'sale', 'txn_cash_demo_9002', 9450, 'INR', 'succeeded', now() - interval '16 minutes', '{"sample":true}')
ON CONFLICT (id) DO UPDATE SET status = 'succeeded', processed_at = EXCLUDED.processed_at;

INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, campus_id, canteen_id, outlet_id, after_data, reason, request_id, occurred_at)
SELECT 'a0000000-0000-4000-8000-000000000001', 'admin', 'sample.seeded', 'canteen', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '{"sample":true}', 'Local development sample data', 'development-seed', now()
WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE request_id = 'development-seed');

INSERT INTO campus_rush_windows (campus_id, weekday, lecture_ends_at, label, expected_multiplier)
SELECT 'b0000000-0000-4000-8000-000000000001', weekday, rush_time, label, multiplier
FROM generate_series(1, 5) weekday
CROSS JOIN (VALUES (time '12:50', 'Lunch lecture release', 1.55::numeric), (time '15:30', 'Afternoon lecture release', 1.25::numeric)) rush(rush_time, label, multiplier)
ON CONFLICT (campus_id, weekday, lecture_ends_at) DO UPDATE SET label = EXCLUDED.label, expected_multiplier = EXCLUDED.expected_multiplier, is_active = true;

WITH tracked(item_id, item_rank, portion_kg) AS (
  VALUES
    ('30000000-0000-4000-8000-000000000001'::uuid, 1, 0.250::numeric),
    ('30000000-0000-4000-8000-000000000002'::uuid, 2, 0.450::numeric),
    ('30000000-0000-4000-8000-000000000003'::uuid, 3, 0.280::numeric),
    ('30000000-0000-4000-8000-000000000004'::uuid, 4, 0.180::numeric),
    ('30000000-0000-4000-8000-000000000008'::uuid, 5, 0.400::numeric),
    ('30000000-0000-4000-8000-000000000009'::uuid, 6, 0.150::numeric),
    ('30000000-0000-4000-8000-000000000010'::uuid, 7, 0.380::numeric),
    ('30000000-0000-4000-8000-000000000011'::uuid, 8, 0.320::numeric),
    ('30000000-0000-4000-8000-000000000012'::uuid, 9, 0.300::numeric),
    ('30000000-0000-4000-8000-000000000013'::uuid, 10, 0.250::numeric)
), days AS (
  SELECT day_offset, (current_date - 28 + day_offset)::date AS service_date FROM generate_series(0, 27) day_offset
), generated AS (
  SELECT tracked.*, days.*,
    (18 + item_rank * 3 + CASE WHEN extract(isodow FROM service_date) BETWEEN 1 AND 5 THEN 14 ELSE 2 END + floor(day_offset / 7) * 2)::int AS demand,
    CASE WHEN extract(isodow FROM service_date) BETWEEN 1 AND 5 THEN 1.45 ELSE 0.85 END::numeric AS rush_index
  FROM tracked CROSS JOIN days
)
INSERT INTO dish_demand_history (outlet_id, catalog_item_id, service_date, order_count, quantity_ordered, quantity_sold, leftover_kg, portion_weight_kg, lecture_rush_index, source)
SELECT 'e0000000-0000-4000-8000-000000000001', item_id, service_date,
  greatest(1, round(demand * 0.72))::int, demand,
  greatest(0, demand - greatest(1, round((3.8 - day_offset * 0.08 + item_rank * 0.06) / portion_kg))::int),
  greatest(0.350, 3.8 - day_offset * 0.08 + item_rank * 0.06), portion_kg, rush_index, 'sample'
FROM generated
ON CONFLICT (outlet_id, catalog_item_id, service_date) DO UPDATE SET
  order_count = EXCLUDED.order_count, quantity_ordered = EXCLUDED.quantity_ordered, quantity_sold = EXCLUDED.quantity_sold,
  leftover_kg = EXCLUDED.leftover_kg, portion_weight_kg = EXCLUDED.portion_weight_kg,
  lecture_rush_index = EXCLUDED.lecture_rush_index, source = 'sample', updated_at = now();

INSERT INTO surplus_offers (outlet_id, catalog_item_id, business_date, quantity_available, discount_percent, starts_at, ends_at, created_by)
SELECT 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000008', current_date, 12, 35,
  (current_date + time '15:00') AT TIME ZONE outlet.timezone, (current_date + time '20:00') AT TIME ZONE outlet.timezone,
  'a0000000-0000-4000-8000-000000000004'
FROM outlets outlet WHERE outlet.id = 'e0000000-0000-4000-8000-000000000001'
ON CONFLICT (outlet_id, catalog_item_id, business_date) DO UPDATE SET quantity_available = 12, discount_percent = 35, status = 'active', updated_at = now();

COMMIT;

SELECT 'Development sample data ready' AS result,
       'e0000000-0000-4000-8000-000000000001'::uuid AS primary_outlet_id,
       'f0000000-0000-4000-8000-000000000001'::uuid AS primary_counter_id,
       '11000000-0000-4000-8000-000000000001'::uuid AS primary_terminal_id;
