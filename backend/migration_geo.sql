CREATE TABLE IF NOT EXISTS geo_settings (
  tenant_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  update_interval_sec INT NOT NULL DEFAULT 30,
  min_accuracy_m INT NULL DEFAULT NULL,
  offline_after_sec INT NOT NULL DEFAULT 180,
  require_fence TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geo_fences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  type VARCHAR(16) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  center_lat DOUBLE NULL,
  center_lng DOUBLE NULL,
  radius_m INT NULL,
  time_start TIME NULL,
  time_end TIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_geo_fences_tenant (tenant_id),
  KEY idx_geo_fences_tenant_active (tenant_id, active),
  KEY idx_geo_fences_tenant_default (tenant_id, is_default),
  CONSTRAINT fk_geo_fences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geo_fence_vertices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  fence_id INT NOT NULL,
  seq INT NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_geo_fence_vertex (fence_id, seq),
  KEY idx_geo_fence_vertices_tenant_fence (tenant_id, fence_id),
  CONSTRAINT fk_geo_fence_vertices_fence FOREIGN KEY (fence_id) REFERENCES geo_fences(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_fence_vertices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geo_user_fences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  fence_id INT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_geo_user_fence_employee (tenant_id, employee_id),
  KEY idx_geo_user_fence_tenant_fence (tenant_id, fence_id),
  CONSTRAINT fk_geo_user_fences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_user_fences_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_user_fences_fence FOREIGN KEY (fence_id) REFERENCES geo_fences(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geo_location_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  accuracy_m INT NULL,
  speed_mps DOUBLE NULL,
  device_status VARCHAR(32) NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_geo_location_logs_tenant_employee_time (tenant_id, employee_id, captured_at),
  KEY idx_geo_location_logs_tenant_time (tenant_id, captured_at),
  CONSTRAINT fk_geo_location_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_location_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geo_location_latest (
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  accuracy_m INT NULL,
  speed_mps DOUBLE NULL,
  device_status VARCHAR(32) NULL,
  last_seen_at DATETIME NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'offline',
  inside TINYINT(1) NOT NULL DEFAULT 0,
  fence_id INT NULL,
  distance_outside_m INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, employee_id),
  KEY idx_geo_location_latest_tenant_status (tenant_id, status),
  KEY idx_geo_location_latest_tenant_seen (tenant_id, last_seen_at),
  CONSTRAINT fk_geo_location_latest_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_location_latest_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_location_latest_fence FOREIGN KEY (fence_id) REFERENCES geo_fences(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geo_breach_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  fence_id INT NULL,
  event_type VARCHAR(16) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  distance_outside_m INT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  seen_at DATETIME NULL,
  KEY idx_geo_breach_logs_tenant_seen (tenant_id, seen_at),
  KEY idx_geo_breach_logs_tenant_time (tenant_id, occurred_at),
  KEY idx_geo_breach_logs_tenant_employee_time (tenant_id, employee_id, occurred_at),
  CONSTRAINT fk_geo_breach_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_breach_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_breach_logs_fence FOREIGN KEY (fence_id) REFERENCES geo_fences(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_attempt_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  action VARCHAR(16) NOT NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(255) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  accuracy_m INT NULL,
  user_id INT NULL,
  user_role VARCHAR(64) NULL,
  ip VARCHAR(64) NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attendance_attempt_logs_tenant_time (tenant_id, occurred_at),
  KEY idx_attendance_attempt_logs_tenant_employee_time (tenant_id, employee_id, occurred_at),
  CONSTRAINT fk_attendance_attempt_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_attempt_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

