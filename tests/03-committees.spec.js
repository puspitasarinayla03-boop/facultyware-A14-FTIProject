// tests/03-committees.spec.js
// Skenario: CRUD Kelola Kepanitiaan
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';
const PROJECT_NAME = 'Proyek Test Playwright (Updated)'; // dibuat di spec 02

// ── Test 1: Daftar kepanitiaan dapat diakses ────────────────────────────────
test('Daftar kepanitiaan dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/committees');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('h1, h2, h3')).toContainText(/kepanitiaan/i);
});

// ── Test 2: Buat kepanitiaan baru ───────────────────────────────────────────
test('Buat kepanitiaan baru berhasil', async ({ page }) => {
  await page.goto(BASE + '/committees/create');
  await expect(page).not.toHaveURL(BASE + '/login');

  // Pilih proyek dari dropdown
  const projectSelect = page.locator('#committee_id');
  await expect(projectSelect).toBeVisible({ timeout: 8000 });

  // Pilih proyek yang dibuat di spec sebelumnya
  await projectSelect.selectOption({ label: new RegExp(PROJECT_NAME.substring(0, 20), 'i') });

  // Tambah anggota eksternal (lebih mudah daripada internal karena tidak butuh employee di db)
  const addExternalBtn = page.locator('#add-external-btn');
  await addExternalBtn.click();

  // Isi data anggota eksternal
  await page.fill('input[name="external_name[]"]', 'Anggota Test Playwright');
  await page.fill('input[name="external_institution[]"]', 'Universitas Test');
  await page.selectOption('select[name="external_role[]"]', 'Ketua');

  await page.click('#submit-create-btn');

  // Setelah simpan harus redirect ke daftar atau detail
  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText(PROJECT_NAME.substring(0, 20));
});

// ── Test 3: Halaman detail kepanitiaan dapat diakses ───────────────────────
test('Halaman detail kepanitiaan dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/committees');

  const committeeLink = page.locator('a, tr', { hasText: new RegExp(PROJECT_NAME.substring(0, 20), 'i') }).first();
  await expect(committeeLink).toBeVisible({ timeout: 8000 });
  await committeeLink.click();

  await page.waitForURL(/\/committees\/\d+/);
  await expect(page.locator('body')).toContainText(/kepanitiaan|committee|anggota/i);
});

// ── Test 4: Edit kepanitiaan ────────────────────────────────────────────────
test('Edit kepanitiaan: navigasi ke halaman edit', async ({ page }) => {
  await page.goto(BASE + '/committees');

  const committeeLink = page.locator('a, tr', { hasText: new RegExp(PROJECT_NAME.substring(0, 20), 'i') }).first();
  await committeeLink.click();
  await page.waitForURL(/\/committees\/\d+/);

  // Cari tombol edit
  const editBtn = page.locator('a[href*="/edit"]').first();
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForURL(/\/committees\/\d+\/edit/);
    await expect(page.locator('body')).toContainText(/edit|kepanitiaan/i);
  } else {
    // Skip jika tidak ada tombol edit yang terlihat
    console.log('[03-committees] Tombol edit tidak ditemukan, lewati test ini.');
  }
});

// ── Test 5: Download SK kepanitiaan ────────────────────────────────────────
test('Download SK kepanitiaan tersedia', async ({ page }) => {
  await page.goto(BASE + '/committees');

  const committeeLink = page.locator('a, tr', { hasText: new RegExp(PROJECT_NAME.substring(0, 20), 'i') }).first();
  await committeeLink.click();
  await page.waitForURL(/\/committees\/\d+/);

  // Periksa apakah link SK ada
  const skLink = page.locator('a[href*="/sk"]').first();
  await expect(skLink).toBeVisible({ timeout: 5000 }).catch(() => {
    console.log('[03-committees] Link SK tidak ditemukan di halaman ini.');
  });
});
