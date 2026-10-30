SET search_path TO mealy, public;

DO $$
BEGIN
  IF (SELECT count(*) FROM campuses WHERE code LIKE 'MEALY_%' AND status = 'active') < 2 THEN
    RAISE EXCEPTION 'Expected at least two active sample campuses';
  END IF;
  IF (SELECT count(*) FROM canteens WHERE metadata @> '{"sample":true}') < 2 THEN
    RAISE EXCEPTION 'Expected two sample canteens';
  END IF;
  IF (SELECT count(*) FROM outlets WHERE id::text LIKE 'e0000000-0000-4000-8000-%' AND status = 'active' AND accepts_orders) <> 3 THEN
    RAISE EXCEPTION 'Expected three active sample outlets accepting orders';
  END IF;
  IF (SELECT count(*) FROM catalog_items WHERE id::text LIKE '30000000-0000-4000-8000-%' AND status = 'active') <> 13 THEN
    RAISE EXCEPTION 'Expected thirteen active sample catalog items';
  END IF;
  IF (SELECT count(*) FROM orders WHERE id::text LIKE '50000000-0000-4000-8000-%') <> 2 THEN
    RAISE EXCEPTION 'Expected two sample orders';
  END IF;
  IF (SELECT count(*) FROM kots WHERE id::text LIKE '53000000-0000-4000-8000-%') <> 3 THEN
    RAISE EXCEPTION 'Expected three sample kitchen tickets';
  END IF;
  IF EXISTS (
    SELECT 1 FROM catalog_items item
    JOIN campus_canteens link ON link.canteen_id = item.canteen_id
    JOIN outlets outlet ON outlet.campus_canteen_id = link.id
    LEFT JOIN outlet_item_settings settings ON settings.outlet_id = outlet.id AND settings.item_id = item.id
    WHERE item.id::text LIKE '30000000-0000-4000-8000-%' AND settings.item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Every sample item must have outlet availability';
  END IF;
  IF (SELECT count(*) FROM dish_demand_history WHERE outlet_id = 'e0000000-0000-4000-8000-000000000001' AND source = 'sample') <> 280 THEN
    RAISE EXCEPTION 'Expected 28 days across 10 dishes in ThaliTrack demand history';
  END IF;
  IF (SELECT count(*) FROM campus_rush_windows WHERE campus_id = 'b0000000-0000-4000-8000-000000000001' AND is_active) <> 10 THEN
    RAISE EXCEPTION 'Expected two weekday rush windows for five weekdays';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM surplus_offers WHERE outlet_id = 'e0000000-0000-4000-8000-000000000001' AND status = 'active') THEN
    RAISE EXCEPTION 'Expected an active sample surplus offer';
  END IF;
END;
$$;

SELECT 'Mealy development sample data test passed' AS result;
