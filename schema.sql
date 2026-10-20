-- ========================================================
-- سكربت إنشاء قاعدة بيانات وجداول المولد الذكي للاختبارات
-- Baseline schema for numbered migrations (fresh databases only).
-- Existing installations: use npm run db:migrate, not manual schema imports.
-- ========================================================

CREATE DATABASE IF NOT EXISTS `fast_learning_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `fast_learning_db`;

-- 1. جدول المستخدمين (Google & Apple Accounts)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `name` VARCHAR(255) DEFAULT '',
  `avatar` TEXT,
  `auth_provider` VARCHAR(50) DEFAULT 'google',
  `provider_id` VARCHAR(255) DEFAULT '',
  `role` VARCHAR(50) DEFAULT 'user', -- 'admin' أو 'user'
  `status` VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active' or 'banned'
  `session_version` INT UNSIGNED NOT NULL DEFAULT 0,
  `has_server_ai_access` TINYINT(1) DEFAULT 0,
  `ai_calls_count` INT DEFAULT 0,
  `last_login` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_role` (`role`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. جدول المواد الدراسية والاختبارات المحفوظة
CREATE TABLE IF NOT EXISTS `materials` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `content_preview` TEXT,
  `source_filename` VARCHAR(255) DEFAULT '',
  `questions_json` LONGTEXT NOT NULL,
  `total_questions` INT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_user_id` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. جدول تقدم المستخدم وإمكانية الاستئناف في أي وقت
CREATE TABLE IF NOT EXISTS `user_progress` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `material_id` INT NOT NULL,
  `mode` VARCHAR(50) DEFAULT 'speed',
  `current_index` INT DEFAULT 0,
  `score` INT DEFAULT 0,
  `total_questions` INT DEFAULT 0,
  `correct_count` INT DEFAULT 0,
  `wrong_count` INT DEFAULT 0,
  `state_json` LONGTEXT,
  `is_completed` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_material_mode` (`user_id`, `material_id`, `mode`),
  INDEX `idx_user_progress` (`user_id`, `material_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. إعدادات الخادم والمفاتيح السرية (Server-only AI & App settings)
CREATE TABLE IF NOT EXISTS `admin_settings` (
  `setting_key` VARCHAR(100) PRIMARY KEY,
  `setting_value` LONGTEXT,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. حسابات رصيد المواد وحجوزات التوليد
CREATE TABLE IF NOT EXISTS `material_quota_accounts` (
  `owner_key` VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  `material_limit` INT UNSIGNED NULL DEFAULT 1,
  `materials_used` INT UNSIGNED NOT NULL DEFAULT 0,
  `pending_generation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `material_generations` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  `owner_key` VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` INT NULL,
  `state` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `draft_state` VARCHAR(16) NOT NULL DEFAULT 'idle',
  `revise_state` VARCHAR(16) NOT NULL DEFAULT 'idle',
  `charged` TINYINT(1) NOT NULL DEFAULT 0,
  `material_id` INT NULL,
  `source_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_generation_owner` (`owner_key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `guest_ip_usage` (
  `ip_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  `materials_used` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 6. سجل استهلاك التوكنز والتكلفة (AI Token & Cost Telemetry)
CREATE TABLE IF NOT EXISTS `ai_usage` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `owner_key` VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `task` VARCHAR(32) NOT NULL,
  `model` VARCHAR(100) DEFAULT '',
  `input_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
  `output_tokens` INT UNSIGNED NOT NULL DEFAULT 0,
  `cached` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ok',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_usage_owner_day` (`owner_key`, `task`, `created_at`),
  INDEX `idx_usage_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atomic per-owner/task daily request budgets (also ensured by migration 003).
CREATE TABLE IF NOT EXISTS `ai_daily_budgets` (
  `owner_key` VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `task` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `usage_day` DATE NOT NULL,
  `requests` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`owner_key`, `task`, `usage_day`)
) ENGINE=InnoDB;

-- 7. التخزين المؤقت للصوت (Server-Side TTS Audio Cache)
CREATE TABLE IF NOT EXISTS `tts_cache` (
  `hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  `voice` VARCHAR(50) NOT NULL DEFAULT '',
  `model` VARCHAR(100) NOT NULL DEFAULT '',
  `mime_type` VARCHAR(64) NOT NULL DEFAULT 'audio/pcm',
  `audio_base64` LONGTEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. طلبات الدفع وشراء باقات المواد (Payment Orders)
CREATE TABLE IF NOT EXISTS `payment_orders` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  `user_id` INT NOT NULL,
  `pack_id` VARCHAR(32) NOT NULL,
  `materials_added` INT UNSIGNED NOT NULL,
  `amount_halalas` INT UNSIGNED NOT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'SAR',
  `provider` VARCHAR(32) NOT NULL DEFAULT 'moyasar',
  `provider_payment_id` VARCHAR(128) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paid_at` DATETIME NULL,
  INDEX `idx_payment_user` (`user_id`, `created_at`),
  UNIQUE KEY `uq_provider_payment` (`provider`, `provider_payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
