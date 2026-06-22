// tests/02-projects.spec.js
// Skenario: CRUD Kelola Proyek + Search + Delete
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

  // Gunakan .first() untuk menghindari strict mode violation jika ada banyak h1/h2/h3
  await expect(page.locator('h1, h2, h3').filter({ hasText: /proyek|project/i }).first()).toBeVisible();
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
  await page.goto(BASE + '/projects');

  // Hanya cari 'a' tag agar kliknya pas ke link
  const projectLink = page.locator('a', { hasText: PROJECT.name }).first();
  await expect(projectLink).toBeVisible({ timeout: 8000 });
  await projectLink.click();

  await page.waitForURL(/\/projects\/\d+/);
  const editBtn = page.locator('a[href*="/edit"], button', { hasText: /edit/i }).first();
  await editBtn.click();

  await page.waitForURL(/\/projects\/\d+\/edit/);
  await page.fill('#name', PROJECT_UPDATED.name);
  await page.fill('#objective', PROJECT_UPDATED.objective);
  await page.click('button[type="submit"]');

  await page.waitForURL(url => !url.toString().includes('/edit'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText(PROJECT_UPDATED.name);
});

// ── Test 5: Halaman detail proyek dapat diakses ─────────────────────────────
test('Halaman detail proyek dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/projects');

  const projectLink = page.locator('a', { hasText: PROJECT_UPDATED.name }).first();
  await expect(projectLink).toBeVisible({ timeout: 8000 });
  await projectLink.click();

  await page.waitForURL(/\/projects\/\d+/);
  await expect(page.locator('body')).toContainText(PROJECT_UPDATED.name);
});

// ── Test 6: Fitur pencarian proyek ──────────────────────────────────────────
test('Pencarian proyek berhasil menemukan hasil', async ({ page }) => {
  await page.goto(BASE + '/projects');

  // Ketik keyword di kotak search
  const searchInput = page.locator('input[name="search"], input[placeholder*="cari" i], input[type="search"]').first();
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  await searchInput.fill('Playwright');

  // Submit form search
  await Promise.all([
    page.waitForLoadState('networkidle'),
    searchInput.press('Enter'),
  ]);

  // Hasil harus menampilkan proyek yang mengandung kata 'Playwright'
  await expect(page.locator('body')).toContainText(/playwright/i);
});

test('Pencarian proyek dengan keyword yang tidak ada menampilkan pesan kosong', async ({ page }) => {
  await page.goto(BASE + '/projects');

  const searchInput = page.locator('input[name="search"], input[placeholder*="cari" i], input[type="search"]').first();
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  await searchInput.fill('xxxxxxtidakadaxxxxxxx');

  await Promise.all([
    page.waitForLoadState('networkidle'),
    searchInput.press('Enter'),
  ]);

  // Harus menampilkan pesan "tidak ditemukan" atau tabel kosong
  await expect(page.locator('body')).toContainText(/tidak ditemukan|belum ada|no data|kosong/i);
});

// ── Test 7: Filter proyek berdasarkan status ─────────────────────────────────
test('Filter proyek berdasarkan status berhasil', async ({ page }) => {
  await page.goto(BASE + '/projects');

  // Pilih filter status 'active'
  const statusSelect = page.locator('select[name="status"]').first();
  await expect(statusSelect).toBeVisible({ timeout: 5000 });
  await statusSelect.selectOption('active');

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.locator('form[action="/projects"] button[type="submit"], form button[type="submit"]').first().click(),
  ]);

  // URL harus mengandung parameter status=active
  await expect(page).toHaveURL(/status=active/);
});

// ── Test 8: Hapus proyek ────────────────────────────────────────────────────
test('Hapus proyek berhasil', async ({ page }) => {
  await page.goto(BASE + '/projects');

  // Buka detail proyek yang sudah di-update
  const projectLink = page.locator('a', { hasText: PROJECT_UPDATED.name }).first();
  await expect(projectLink).toBeVisible({ timeout: 8000 });
  await projectLink.click();

  await page.waitForURL(/\/projects\/\d+/);

  // Klik tombol Hapus (yang akan membuka modal)
  // Spesifik ke form ber-action /delete agar tidak salah klik tombol di modal duluan
  const deleteBtn = page.locator('form[action*="/delete"] button').first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });
  await deleteBtn.click();

  // Konfirmasi di dialog/modal yang muncul
  // Tunggu modal muncul dan cari tombol konfirmasi khusus di dalam modal
  const confirmBtn = page.locator('dialog button, #delete-modal button, #confirm-delete-btn, .modal button').filter({ hasText: /ya|hapus|confirm|delete/i }).first();
  
  if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  // Harus kembali ke halaman daftar proyek
  await page.waitForURL(/\/projects$/, { timeout: 10000 });

  // Proyek yang dihapus tidak boleh muncul lagi
  await expect(page.locator('body')).not.toContainText(PROJECT_UPDATED.name);
});

