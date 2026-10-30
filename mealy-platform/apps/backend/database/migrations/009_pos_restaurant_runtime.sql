SET search_path TO mealy, public;

CREATE TABLE staff_login_attempts (
    id bigserial PRIMARY KEY,
    employee_code text NOT NULL,
    outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    terminal_id uuid REFERENCES pos_terminals(id) ON DELETE SET NULL,
    ip_address inet,
    succeeded boolean NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_login_attempts_throttle_idx
    ON staff_login_attempts (employee_code, outlet_id, attempted_at DESC)
    WHERE succeeded = false;

INSERT INTO permissions (code, description, risk_level)
VALUES ('payments.capture_pos', 'Capture configured POS tenders and issue receipts', 'sensitive')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, risk_level = EXCLUDED.risk_level;

INSERT INTO role_permissions (role_id, permission_code)
SELECT role.id, 'payments.capture_pos' FROM roles role
WHERE role.code IN ('super_admin','canteen_owner','canteen_manager','outlet_manager','cashier')
ON CONFLICT DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_shift_id uuid REFERENCES pos_shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_pos_shift_idx ON orders (pos_shift_id, placed_at DESC) WHERE pos_shift_id IS NOT NULL;

UPDATE schema_metadata SET schema_version = 9, updated_at = now() WHERE singleton;
