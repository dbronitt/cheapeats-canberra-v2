-- Create restaurant_audit_log table for tracking changes
-- Run this script in your PostgreSQL database

CREATE TABLE IF NOT EXISTS restaurant_audit_log (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  restaurant_name VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  changed_by VARCHAR(255),
  changes JSONB NOT NULL,
  previous_state JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant_id ON restaurant_audit_log(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON restaurant_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON restaurant_audit_log(action);

-- Add comment
COMMENT ON TABLE restaurant_audit_log IS 'Tracks all changes made to restaurants for audit and revert functionality';
