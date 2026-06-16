// tests/02-projects.spec.js
// Skenario: CRUD Kelola Proyek
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// Data uji
const PROJECT = {
  name: 'Proyek Test Playwright',
  description: 'Deskripsi proyek yang dibuat oleh Playwright',
  objective: 'Menguji fitur kelola proyek',
  start_date: '2026-07-01',
};

const PROJECT_UPDATED = {
  name: 'Proyek Test Playwright (Updated)',
  objective: 'Menguji fitur edit proyek',
};

// ── Test 1: Halaman daftar proyek dapat diakses ─────────────────────────────
test('Daftar proyek dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/projects');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('h1, h2, h3')).toContainText(/proyek|project/i);
});

// ── Test 2: Buat proyek baru ────────────────────────────────────────────────
test('Buat proyek baru berhasil', async ({ page }) => {
  await page.goto(BASE + '/projects/create');
  await expect(page).not.toHaveURL(BASE + '/login');

  await page.fill('#name', PROJECT.name);
  await page.fill('#description', PROJECT.description);
  await page.fill('#objective', PROJECT.objective);
  await page.fill('#start_date', PROJECT.start_date);
  await page.selectOption('#status', 'active');
  await page.click('button[type="submit"]');

  // Setelah simpan, redirect ke halaman daftar atau detail proyek
  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
  
  // Nama proyek harus muncul di halaman
  await expect(page.locator('body')).toContainText(PROJECT.name);
});

// ── Test 3: Validasi form — field wajib kosong ─────────────────────────────
test('Validasi form: field wajib tidak boleh kosong', async ({ page }) => {
  await page.goto(BASE + '/projects/create');

  // Kosongkan semua, langsung submit
  await page.click('button[type="submit"]');

  // Harus tetap di halaman create (HTML5 required atau server validation)
  await expect(page).toHaveURL(BASE + '/projects/create');
});

// ── Test 4: Edit proyek ─────────────────────────────────────────────────────
test('Edit proyek berhasil', async ({ page }) => {
  // Buka halaman daftar, klik proyek yang baru dibuat
  await page.goto(BASE + '/projects');

  // Cari link ke proyek yang sudah dibuat
  const projectLink = page.locator('a, tr', { hasText: PROJECT.name }).first();
  await expect(projectLink).toBeVisible({ timeout: 8000 });
  await projectLink.click();

  // Cari tombol Edit
  await page.waitForURL(/\/projects\/\d+/);
  const editBtn = page.locator('a[href*="/edit"], button', { hasText: /edit/i }).first();
  await editBtn.click();

  // Isi form edit
  await page.fill('#name', PROJECT_UPDATED.name);
  await page.fill('#objective', PROJECT_UPDATED.objective);
  await page.click('button[type="submit"]');

  // Verifikasi nama baru muncul
  await page.waitForURL(url => !url.toString().includes('/edit'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText(PROJECT_UPDATED.name);
});

// ── Test 5: Halaman detail proyek dapat diakses ─────────────────────────────
test('Halaman detail proyek dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/projects');

  const projectLink = page.locator('a, tr', { hasText: PROJECT_UPDATED.name }).first();
  await expect(projectLink).toBeVisible({ timeout: 8000 });
  await projectLink.click();

  await page.waitForURL(/\/projects\/\d+/);
  await expect(page.locator('body')).toContainText(PROJECT_UPDATED.name);
});
