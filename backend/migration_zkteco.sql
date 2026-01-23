-- Migration: Add ZKTeco device support columns to devices table
-- Run this migration to enable ZKTeco device configuration

ALTER TABLE devices
ADD COLUMN zk_ip VARCHAR(45) DEFAULT NULL COMMENT 'ZKTeco device IP address',
ADD COLUMN zk_port INT DEFAULT 4370 COMMENT 'ZKTeco device port (default 4370)',
ADD COLUMN zk_password INT DEFAULT 0 COMMENT 'ZKTeco communication key/password',
ADD COLUMN zk_last_sync TIMESTAMP NULL DEFAULT NULL COMMENT 'Last sync time from ZKTeco device';

-- Add index for ZKTeco configured devices
CREATE INDEX idx_devices_zk_configured ON devices (zk_ip);
