-- Migration 001: Initial Schema for Fast Learning Rebuild (v2)

CREATE TABLE IF NOT EXISTS api_keys (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,
  key_value   TEXT NOT NULL,
  provider    ENUM('gemini','vertex') NOT NULL DEFAULT 'gemini',
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  name           VARCHAR(255) NOT NULL DEFAULT '',
  avatar_url     TEXT,
  role           ENUM('user','admin') NOT NULL DEFAULT 'user',
  plan           ENUM('free','unlimited') NOT NULL DEFAULT 'free',
  daily_ai_limit_override INT NULL,
  assigned_key_id INT NULL,
  status         ENUM('active','banned') NOT NULL DEFAULT 'active',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  DATETIME NULL,
  UNIQUE KEY uq_email (email),
  CONSTRAINT fk_users_api_key FOREIGN KEY (assigned_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_identities (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  provider         ENUM('google','apple') NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  provider_email   VARCHAR(255),
  is_private_email TINYINT(1) NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_subject (provider, provider_subject),
  CONSTRAINT fk_identities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce_hash CHAR(64) PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id_hash      CHAR(64) PRIMARY KEY,
  user_id      INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  last_seen_at DATETIME NULL,
  ip           VARCHAR(45),
  user_agent   VARCHAR(255),
  revoked_at   DATETIME NULL,
  INDEX idx_session_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS materials (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  title           VARCHAR(255) NOT NULL,
  source_type     ENUM('text','file','image','mixed') NOT NULL,
  source_name     VARCHAR(255) NOT NULL DEFAULT '',
  content_preview TEXT,
  questions       JSON NOT NULL,
  question_count  INT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  INDEX idx_user (user_id, deleted_at, updated_at),
  CONSTRAINT fk_materials_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  material_id    INT NOT NULL,
  mode           ENUM('learn','quiz') NOT NULL,
  status         ENUM('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress',
  question_order JSON NOT NULL,
  answers        JSON NOT NULL,
  current_index  INT NOT NULL DEFAULT 0,
  score          INT NOT NULL DEFAULT 0,
  started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at   DATETIME NULL,
  INDEX idx_resume (user_id, material_id, mode, status),
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  task          ENUM('generate_quiz','evaluate_answer','tts','other') NOT NULL,
  units         INT NOT NULL,
  model         VARCHAR(100),
  input_tokens  INT,
  output_tokens INT,
  status        ENUM('reserved','ok','error') NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_day (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tts_cache (
  hash       CHAR(64) PRIMARY KEY,
  voice      VARCHAR(50),
  model      VARCHAR(100),
  mime_type  VARCHAR(50),
  audio      LONGBLOB,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id       INT NOT NULL,
  action         VARCHAR(50) NOT NULL,
  target_user_id INT NULL,
  details        JSON,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(100) PRIMARY KEY,
  applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
