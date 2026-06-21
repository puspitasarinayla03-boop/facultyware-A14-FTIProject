// tests/global-setup.js
// Dijalankan SEKALI sebelum semua test: reset & seed database facultyware_test

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');

// Baca .env.test
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

module.exports = async function globalSetup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const DB = process.env.DB_NAME || 'facultyware_test';
  console.log(`\n[global-setup] Menyiapkan database: ${DB}\n`);

  // ── 1. Buat / pastikan database ada ──────────────────────────────────────────
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB}\``);

  // ── 2. Buat semua tabel ────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      email_verified_at TIMESTAMP NULL DEFAULT NULL,
      password VARCHAR(255) NOT NULL,
      remember_token VARCHAR(100) NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      guard_name VARCHAR(100) NOT NULL DEFAULT 'web',
      created_at TIMESTAMP NULL,
      updated_at TIMESTAMP NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      guard_name VARCHAR(100) NOT NULL DEFAULT 'web',
      created_at TIMESTAMP NULL,
      updated_at TIMESTAMP NULL
    );

    CREATE TABLE IF NOT EXISTS role_has_permissions (
      permission_id INT UNSIGNED NOT NULL,
      role_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (permission_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS model_has_roles (
      role_id INT UNSIGNED NOT NULL,
      model_type VARCHAR(255) NOT NULL,
      model_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (role_id, model_id, model_type)
    );

    CREATE TABLE IF NOT EXISTS employment_statuses (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS organization_units (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) NULL,
      parent_id INT UNSIGNED NULL,
      type VARCHAR(50) NULL,
      organization_unit_id INT UNSIGNED NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      employee_number VARCHAR(50) NULL,
      name VARCHAR(255) NOT NULL,
      birth_place VARCHAR(100) NULL,
      birth_date DATE NULL,
      gender ENUM('male','female') NULL,
      marital_status VARCHAR(50) NULL,
      address TEXT NULL,
      organization_unit_id INT UNSIGNED NULL,
      hire_date DATE NULL,
      employment_status_id INT UNSIGNED NULL,
      status ENUM('active','inactive') DEFAULT 'active',
      created_at TIMESTAMP NULL
    );

    -- committees = Projects (digunakan oleh projectController & committeeController)
    CREATE TABLE IF NOT EXISTS committees (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      objective TEXT NULL,
      expected_outcome TEXT NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      status ENUM('draft','active','completed','cancelled') DEFAULT 'draft',
      created_by BIGINT UNSIGNED NULL,
      employee_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL
    );

    -- Anggota internal (dari employees)
    CREATE TABLE IF NOT EXISTS committee_members (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      committee_id BIGINT UNSIGNED NOT NULL,
      employee_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(100) NULL,
      is_leader TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE
    );

    -- Anggota eksternal (manual)
    CREATE TABLE IF NOT EXISTS committee_external_members (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      committee_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      institution VARCHAR(255) NULL,
      role VARCHAR(100) NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE
    );

    -- RAB (nama tabel sesuai budgetController.js)
    CREATE TABLE IF NOT EXISTS committee_budgets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      committee_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      total_amount DECIMAL(15,2) DEFAULT 0,
      used_amount DECIMAL(15,2) DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS committee_budget_items (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      committee_budget_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      quantity INT DEFAULT 1,
      unit_price DECIMAL(15,2) DEFAULT 0,
      total_price DECIMAL(15,2) DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (committee_budget_id) REFERENCES committee_budgets(id) ON DELETE CASCADE
    );

    -- Pengeluaran (expenses)
    CREATE TABLE IF NOT EXISTS committee_expenses (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      committee_budget_item_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(15,2) DEFAULT 0,
      description VARCHAR(255) NULL,
      receipt_file VARCHAR(500) NULL,
      expense_date DATE NULL,
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      approved_by BIGINT UNSIGNED NULL,
      employee_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (committee_budget_item_id) REFERENCES committee_budget_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS committee_tasks (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      committee_id BIGINT UNSIGNED NOT NULL,
      assigned_to BIGINT UNSIGNED NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      start_date DATE NULL,
      due_date DATE NULL,
      priority ENUM('low','medium','high') DEFAULT 'medium',
      status ENUM('pending','in_progress','done') DEFAULT 'pending',
      committee_member_id BIGINT NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS committee_task_progress (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      committee_task_id BIGINT UNSIGNED NOT NULL,
      description TEXT NOT NULL,
      progress_date DATE NOT NULL,
      status ENUM('in_progress','done') DEFAULT 'in_progress',
      attachment VARCHAR(255) NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (committee_task_id) REFERENCES committee_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      last_activity INT(11) UNSIGNED NOT NULL,
      payload MEDIUMTEXT
    );
  `);

  // Kosongkan data tabel (TRUNCATE) agar fresh
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables] = await conn.query('SHOW TABLES');
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    await conn.query(`TRUNCATE TABLE \`${tableName}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // ── 3. Seed data awal ──────────────────────────────────────────────────────
  const hashedPw = await bcrypt.hash('password', 10);

  // User admin
  const [userResult] = await conn.query(
    `INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, NOW())`,
    ['Admin FTI', 'admin@example.com', hashedPw]
  );
  const userId = userResult.insertId;

  // Employment status & org unit & employee
  await conn.query(`INSERT INTO employment_statuses (id, name) VALUES (1, 'Tetap')`);
  await conn.query(`INSERT INTO organization_units (id, name, code, type) VALUES (1, 'FTI', 'FTI', 'faculty')`);
  await conn.query(
    `INSERT INTO employees (id, employee_number, name, organization_unit_id, employment_status_id, created_at)
     VALUES (?, 'EMP001', 'Admin FTI', 1, 1, NOW())`,
    [userId]
  );

  // RBAC
  await conn.query(`INSERT INTO roles (id, name) VALUES (1, 'admin')`);
  const perms = ['manage_all', 'manage_projects', 'manage_committees', 'manage_users'];
  for (const p of perms) {
    await conn.query(`INSERT INTO permissions (name) VALUES (?)`, [p]);
  }
  const [permRows] = await conn.query(`SELECT id FROM permissions`);
  for (const p of permRows) {
    await conn.query(`INSERT INTO role_has_permissions VALUES (?, 1)`, [p.id]);
  }
  await conn.query(
    `INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (1, 'User', ?)`,
    [userId]
  );

  await conn.end();
  console.log(`[global-setup] ✅ Database ${DB} siap. Login: admin@example.com / password\n`);

  // Pastikan folder .auth ada
  const fs = require('fs');
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
};
