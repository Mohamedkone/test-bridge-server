-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    website VARCHAR(255),
    logo VARCHAR(255),
    industry VARCHAR(50),
    size VARCHAR(20),
    location VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- Create company_members table
CREATE TABLE IF NOT EXISTS company_members (
    id VARCHAR(128) PRIMARY KEY,
    company_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    role VARCHAR(50) NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
-- Create company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
    id VARCHAR(128) PRIMARY KEY,
    company_id VARCHAR(128) NOT NULL,
    allow_guest_uploads BOOLEAN NOT NULL DEFAULT FALSE,
    max_file_size INT NOT NULL DEFAULT 100,
    allowed_file_types JSON NOT NULL DEFAULT '[]',
    storage_quota INT NOT NULL DEFAULT 1000,
    custom_branding JSON,
    notifications JSON,
    security JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
-- Create company_invites table
CREATE TABLE IF NOT EXISTS company_invites (
    id VARCHAR(128) PRIMARY KEY,
    company_id VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    token VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);