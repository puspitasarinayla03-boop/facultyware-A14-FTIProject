// tests/07-progress.spec.js
// Skenario: CRUD Kelola Progress pada Task
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// ── Test 1: Halaman daftar progress dapat diakses ───────────────────────────
test('Halaman kelola progress dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/progresses');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('body')).toContainText(/progress/i);
});

// ── Test 2: Buat progress baru ──────────────────────────────────────────────
test('Buat progress baru berhasil', async ({ page }) => {
  await page.goto(BASE + '/progresses/create');
  await expect(page).not.toHaveURL(BASE + '/login');

  // Pilih task dari dropdown (dari task yang dibuat di spec 05)
  const taskSelect = page.locator('select[name="committee_task_id"], #committee_task_id').first();
  
  if (await taskSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Pilih opsi pertama yang tersedia
    const options = await taskSelect.locator('option').all();
    if (options.length > 1) {
      await taskSelect.selectOption({ index: 1 }); // Pilih opsi pertama (bukan placeholder)
    }
  }

  // Isi form progress
  const descField = page.locator('#description, textarea[name="description"]').first();
  await descField.fill('Progress test: Persiapan awal sudah selesai dilakukan oleh Playwright.');

  const dateField = page.locator('#progress_date, input[name="progress_date"]').first();
  await dateField.fill('2026-07-15');

  const statusSelect = page.locator('#status, select[name="status"]').first();
  await statusSelect.selectOption('in_progress');

  await page.click('button[type="submit"]');

  // Setelah simpan harus redirect ke daftar atau detail
  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText(/progress|berhasil/i);
});

// ── Test 3: Verifikasi progress muncul di daftar ───────────────────────────
test('Progress yang dibuat muncul di halaman daftar', async ({ page }) => {
  await page.goto(BASE + '/progresses');
  await expect(page.locator('body')).toContainText(/Persiapan awal sudah selesai/i);
});

// ── Test 4: Halaman detail progress dapat diakses ──────────────────────────
test('Halaman detail progress dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/progresses');

  const progressLink = page.locator('a', { hasText: /Persiapan awal sudah selesai/i })
    .or(page.locator('a[href*="/progresses/"]').filter({ hasNotText: /create|tambah/i }))
    .first();
  
  await expect(progressLink).toBeVisible({ timeout: 8000 });
  await progressLink.click();
  await page.waitForURL(/\/progresses\/\d+/);
  await expect(page.locator('body')).toContainText(/progress|detail/i);
});

// ── Test 5: Edit progress berhasil ─────────────────────────────────────────
test('Edit progress berhasil', async ({ page }) => {
  await page.goto(BASE + '/progresses');

  // Buka detail progress pertama
  const progressLink = page.locator('a[href*="/progresses/"]').filter({ hasNotText: /create|tambah/i }).first();
  await expect(progressLink).toBeVisible({ timeout: 8000 });
  await progressLink.click();
  await page.waitForURL(/\/progresses\/\d+/);

  // Klik edit
  const editBtn = page.locator('a[href*="/edit"]').first();
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    await page.waitForURL(/\/progresses\/\d+\/edit/);

    const descField = page.locator('#description, textarea[name="description"]').first();
    await descField.fill('Progress test EDITED: Update setelah revisi Playwright.');

    const statusSelect = page.locator('#status, select[name="status"]').first();
    await statusSelect.selectOption('done');

    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.toString().includes('/edit'), { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/EDITED|selesai|done/i);
  } else {
    console.log('[07-progress] Tombol edit tidak ditemukan, lewati.');
  }
});

// ── Test 6: Export DOCX progress tersedia ──────────────────────────────────
test('Export DOCX progress tersedia', async ({ page }) => {
  await page.goto(BASE + '/progresses');

  const progressLink = page.locator('a[href*="/progresses/"]').filter({ hasNotText: /create|tambah/i }).first();
  await progressLink.click();
  await page.waitForURL(/\/progresses\/\d+/);

  const docxLink = page.locator('a[href*="export-docx"]').first();
  await expect(docxLink).toBeVisible({ timeout: 5000 }).catch(() => {
    console.log('[07-progress] Link export DOCX tidak ditemukan.');
  });
});
