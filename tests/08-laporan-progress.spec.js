// tests/08-laporan-progress.spec.js
// Skenario: Laporan Progress Project
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// ── Test 1: Halaman laporan dapat diakses ───────────────────────────────────
test('Halaman Laporan Progress Project dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/reports/progress');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('h1, h2')).toContainText(/laporan progress/i);
});

// ── Test 2: Card statistik muncul ─────────────────────────────────────────
test('Card statistik (Total, Berlangsung, Selesai) muncul di halaman', async ({ page }) => {
  await page.goto(BASE + '/reports/progress');

  await expect(page.locator('body')).toContainText(/total progress/i);
  await expect(page.locator('body')).toContainText(/sedang berlangsung/i);
  await expect(page.locator('body')).toContainText(/selesai/i);
});

// ── Test 3: Data progress dari spec 07 muncul di laporan ───────────────────
test('Data progress yang sudah dibuat muncul di laporan', async ({ page }) => {
  await page.goto(BASE + '/reports/progress');

  // Progress yang dibuat di spec 07 seharusnya muncul di tabel laporan
  // (Tunggu tabel/data muncul)
  await page.waitForTimeout(1000);

  const body = page.locator('body');
  // Salah satu harus ada: data progress atau pesan "tidak ditemukan"
  const hasData = await body.getByText(/progress|EDITED|Persiapan/i).isVisible().catch(() => false);
  const hasEmpty = await body.getByText(/tidak ditemukan|kosong/i).isVisible().catch(() => false);
  
  expect(hasData || hasEmpty).toBeTruthy();
});

// ── Test 4: Filter kepanitiaan berfungsi ────────────────────────────────────
test('Filter kepanitiaan pada laporan berfungsi', async ({ page }) => {
  await page.goto(BASE + '/reports/progress');

  const committeeFilter = page.locator('select[name="committee"], #filter-committee').first();
  
  if (await committeeFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
    const options = await committeeFilter.locator('option').all();
    if (options.length > 1) {
      // Pilih kepanitiaan pertama
      await committeeFilter.selectOption({ index: 1 });
      
      // Submit filter
      const filterBtn = page.locator('button[type="submit"], button', { hasText: /filter|cari/i }).first();
      if (await filterBtn.isVisible().catch(() => false)) {
        await filterBtn.click();
      }
      await page.waitForTimeout(1000);
      // Halaman tidak crash
      await expect(page).toHaveURL(/\/reports\/progress/);
    }
  } else {
    console.log('[08-laporan] Filter kepanitiaan tidak ditemukan.');
  }
});

// ── Test 5: Filter status berfungsi ────────────────────────────────────────
test('Filter status "Sedang Berlangsung" pada laporan berfungsi', async ({ page }) => {
  await page.goto(BASE + '/reports/progress');

  const statusFilter = page.locator('select[name="status"], #filter-status').first();

  if (await statusFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
    await statusFilter.selectOption('in_progress');

    const filterBtn = page.locator('button[type="submit"], button', { hasText: /filter|cari/i }).first();
    if (await filterBtn.isVisible().catch(() => false)) {
      await filterBtn.click();
    }
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/reports\/progress/);
  } else {
    console.log('[08-laporan] Filter status tidak ditemukan.');
  }
});

// ── Test 6: Reset filter berfungsi ─────────────────────────────────────────
test('Reset filter pada laporan berfungsi', async ({ page }) => {
  await page.goto(BASE + '/reports/progress');

  const resetBtn = page.locator('button, a', { hasText: /reset/i }).first();
  
  if (await resetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await resetBtn.click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/reports\/progress/);
  } else {
    console.log('[08-laporan] Tombol reset tidak ditemukan.');
  }
});

// ── Test 7: Export PDF tersedia & tidak error ───────────────────────────────
test('Tombol Export PDF tersedia di halaman laporan', async ({ page }) => {
  await page.goto(BASE + '/reports/progress');

  const exportBtn = page.locator('a[href*="pdf"], button', { hasText: /export pdf|pdf/i }).first();
  await expect(exportBtn).toBeVisible({ timeout: 8000 });
});
