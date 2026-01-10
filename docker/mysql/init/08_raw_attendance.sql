CREATE TABLE IF NOT EXISTS raw_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  employee_id INT NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  occurred_at_utc DATETIME NOT NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_raw (tenant_id, device_id, employee_id, event_type, occurred_at_utc)
);

CREATE TABLE IF NOT EXISTS attendance_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  in_time DATETIME NULL,
  out_time DATETIME NULL,
  worked_minutes INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'Present',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_day (tenant_id, employee_id, date)
);

