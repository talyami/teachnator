-- ========================================================
-- سكربت إنشاء قاعدة بيانات وجداول المولد الذكي للاختبارات
-- Smart Quiz Generator Database Schema
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
  `has_server_ai_access` TINYINT(1) DEFAULT 0, -- 1 = يمتلك صلاحية استخدام مفتاح المشرف
  `ai_calls_count` INT DEFAULT 0, -- عدد طلبات الذكاء الاصطناعي المنفذة
  `custom_api_settings` LONGTEXT, -- إعدادات ومفاتيح المستخدم الشخصية بتنسيق JSON
  `last_login` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_role` (`role`)
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
  `state_json` LONGTEXT, -- الحالة الكاملة للاستئناف
  `is_completed` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_material_mode` (`user_id`, `material_id`, `mode`),
  INDEX `idx_user_progress` (`user_id`, `material_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. جدول إعدادات المشرف ومفاتيح السيرفر (Gemini / Vertex)
CREATE TABLE IF NOT EXISTS `admin_settings` (
  `setting_key` VARCHAR(100) PRIMARY KEY,
  `setting_value` LONGTEXT,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
