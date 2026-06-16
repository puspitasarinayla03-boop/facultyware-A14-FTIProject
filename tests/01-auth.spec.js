// tests/01-auth.spec.js
// Skenario: Login, validasi gagal, logout, simpan session
const { test, expect } = require('@playwright/test');
const path = require('path');

const SESSION_PATH = path.join(__dirname, '.auth', 'session.json');
const BASE = 'http://localhost:3000';

// ── Test 1: Login gagal dengan password salah ──────────────────────────────
test('Login gagal dengan password salah', async ({ page }) => {
  await page.goto(BASE + '/login');
  await expect(page).toHaveTitle(/FacultyWare/i);

  await page.fill('#email', 'admin@example.com');
  await page.fill('#password', 'salahpassword');
  await page.click('button[type="submit"]');

  // Harus tetap di halaman login dan muncul pesan error
  await expect(page).toHaveURL(BASE + '/login');
  await expect(page.locator('form')).toContainText(/email|password|tidak valid|salah/i);
});

// ── Test 2: Login gagal dengan email tidak terdaftar ──────────────────────
test('Login gagal dengan email tidak terdaftar', async ({ page }) => {
  await page.goto(BASE + '/login');

  await page.fill('#email', 'tidakada@example.com');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(BASE + '/login');
});

// ── Test 3: Login berhasil & simpan session ────────────────────────────────
test('Login berhasil dan redirect ke dashboard', async ({ page }) => {
  await page.goto(BASE + '/login');

  await page.fill('#email', 'admin@example.com');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');

  // Setelah login berhasil, diarahkan ke dashboard atau home
  await expect(page).not.toHaveURL(BASE + '/login');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });

  // Simpan session untuk digunakan spec selanjutnya
  await page.context().storageState({ path: SESSION_PATH });
  console.log('[01-auth] Session tersimpan ke:', SESSION_PATH);
});

// ── Test 4: Halaman dilindungi redirect ke login jika belum login ──────────
test('Halaman /projects redirect ke login jika tidak terautentikasi', async ({ browser }) => {
  // Buat konteks baru tanpa session
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();

  await page.goto(BASE + '/projects');
  await expect(page).toHaveURL(BASE + '/login');

  await ctx.close();
});
