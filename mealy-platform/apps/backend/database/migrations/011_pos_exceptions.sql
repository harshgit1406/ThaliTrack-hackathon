SET search_path TO mealy, public;

INSERT INTO refund_reasons (code, label, is_active) VALUES
  ('customer_request', 'Customer request', true),
  ('order_cancelled', 'Order cancelled', true),
  ('quality_issue', 'Quality issue', true)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, is_active = true;

INSERT INTO order_status_transitions (from_status, to_status, allowed_actor_types, requires_reason)
VALUES ('ready_for_pickup', 'preparing', ARRAY['staff','admin','system'], true)
ON CONFLICT (from_status, to_status) DO UPDATE SET allowed_actor_types = EXCLUDED.allowed_actor_types, requires_reason = true;

UPDATE schema_metadata SET schema_version = 11, updated_at = now() WHERE singleton;
