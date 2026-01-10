SET @has_status := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'status'
);
SET @sql := IF(@has_status = 0, 'ALTER TABLE attendance_records ADD COLUMN status VARCHAR(64) NOT NULL DEFAULT ''Present''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_late := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'late_minutes'
);
SET @sql := IF(@has_late = 0, 'ALTER TABLE attendance_records ADD COLUMN late_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_early := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'early_leave_minutes'
);
SET @sql := IF(@has_early = 0, 'ALTER TABLE attendance_records ADD COLUMN early_leave_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ot := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'overtime_minutes'
);
SET @sql := IF(@has_ot = 0, 'ALTER TABLE attendance_records ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_emp_date := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND index_name = 'idx_attendance_employee_date'
);
SET @sql := IF(@idx_emp_date = 0, 'CREATE INDEX idx_attendance_employee_date ON attendance_records (employee_id, date)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_open := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND index_name = 'idx_attendance_open_shift'
);
SET @sql := IF(@idx_open = 0, 'CREATE INDEX idx_attendance_open_shift ON attendance_records (employee_id, clock_out)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
