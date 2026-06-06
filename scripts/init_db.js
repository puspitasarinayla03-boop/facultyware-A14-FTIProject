const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../lib/db');
const bcrypt = require('bcryptjs');

async function init() {
  try {
    console.log('🚀 Starting database initialization...\n');

    // ─── 1. USERS TABLE ─────────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        email_verified_at TIMESTAMP NULL DEFAULT NULL,
        password VARCHAR(255) NOT NULL,
        two_factor_secret TEXT NULL DEFAULT NULL,
        two_factor_recovery_codes TEXT NULL DEFAULT NULL,
        two_factor_confirmed_at TIMESTAMP NULL DEFAULT NULL,
        remember_token VARCHAR(100) NULL DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
      )
    `);
    console.log('✓ Users table ready.');

    const [userRows] = await db.query('SELECT id FROM users WHERE email = ?', ['admin@example.com']);
    let userId;
    if (userRows.length === 0) {
      const hashedPassword = await bcrypt.hash('password', 10);
      const [result] = await db.query(
        'INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, NOW())',
        ['Admin FTI', 'admin@example.com', hashedPassword]
      );
      userId = result.insertId;
      console.log(`✓ Admin user created → admin@example.com (id=${userId})`);
    } else {
      userId = userRows[0].id;
      console.log(`✓ Admin user already exists (id=${userId})`);
    }

    // ─── 2. EMPLOYMENT STATUSES ─────────────────────────────────────────────
    await db.query(`
      INSERT IGNORE INTO employment_statuses (id, name, description)
      VALUES (1, 'Tetap', 'Pegawai Negeri Sipil / Dosen Tetap')
    `);
    console.log('✓ Employment status seeded (id=1: Tetap)');

    // ─── 3. ORGANIZATION UNITS ──────────────────────────────────────────────
    await db.query(`
      INSERT IGNORE INTO organization_units (id, name, code, parent_id, type, organization_unit_id)
      VALUES (1, 'Fakultas Teknologi Informasi', 'FTI', NULL, 'faculty', 1)
    `);
    console.log('✓ Organization unit seeded (id=1: FTI)');

    // ─── 4. EMPLOYEES (id must match users.id due to FK constraint) ─────────
    await db.query(`
      INSERT IGNORE INTO employees
        (id, employee_number, name, birth_place, birth_date, gender,
         marital_status, address, organization_unit_id, hire_date,
         employment_status_id, status, created_at)
      VALUES
        (?, 'EMP001', 'Admin FTI', 'Jakarta', '1990-01-01', 'male',
         'single', 'Jl. Kampus Universitas No. 1', 1, '2020-01-01',
         1, 'active', NOW())
    `, [userId]);
    console.log(`✓ Employee seeded (id=${userId}: Admin FTI → EMP001)`);

    // ─── 5. RBAC — roles ────────────────────────────────────────────────────
    await db.query(`
      INSERT IGNORE INTO roles (id, name, guard_name, created_at, updated_at)
      VALUES (1, 'admin', 'web', NOW(), NOW())
    `);
    console.log('✓ Role seeded (id=1: admin)');

    // ─── 6. RBAC — permissions ──────────────────────────────────────────────
    const permissionNames = [
      'manage_all',
      'manage_projects',
      'manage_committees',
      'manage_users',
    ];
    for (const perm of permissionNames) {
      await db.query(`
        INSERT IGNORE INTO permissions (name, guard_name, created_at, updated_at)
        VALUES (?, 'web', NOW(), NOW())
      `, [perm]);
    }
    console.log(`✓ Permissions seeded: ${permissionNames.join(', ')}`);

    // ─── 7. RBAC — role_has_permissions ─────────────────────────────────────
    const [permRows] = await db.query('SELECT id FROM permissions WHERE name IN (?)', [permissionNames]);
    for (const p of permRows) {
      await db.query(
        'INSERT IGNORE INTO role_has_permissions (permission_id, role_id) VALUES (?, 1)',
        [p.id]
      );
    }
    console.log('✓ Permissions linked to admin role');

    // ─── 8. RBAC — model_has_roles (assign admin role to admin user) ─────────
    await db.query(`
      INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
      VALUES (1, 'User', ?)
    `, [userId]);
    console.log(`✓ Admin role assigned to user id=${userId} via model_has_roles`);

    console.log('\n✅ Database initialization complete!');
    console.log('   Login with: admin@example.com / password\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error initializing database:', err.message);
    process.exit(1);
  }
}

init();
