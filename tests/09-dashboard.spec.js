// tests/09-dashboard.spec.js
// Skenario: Halaman Dashboard Project
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// ── Test 1: Halaman dashboard dapat diakses ─────────────────────────────────
test('Halaman dashboard dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('h1')).toContainText(/Dashboard Project/i);
});

// ── Test 2: Lima card statistik muncul ─────────────────────────────────────
test('Lima card statistik muncul di dashboard', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await expect(page.locator('body')).toContainText(/Total Proyek/i);
  await expect(page.locator('body')).toContainText(/Total Task/i);
  await expect(page.locator('body')).toContainText(/Total Progress/i);
  await expect(page.locator('body')).toContainText(/Selesai/i);
  await expect(page.locator('body')).toContainText(/Berlangsung/i);
});

// ── Test 3: Stat cards terisi angka setelah data API dimuat ────────────────
test('Stat cards berisi angka valid setelah data API dimuat', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await page.waitForLoadState('networkidle');

  const projectStat = page.locator('#stat-projects');
  const taskStat    = page.locator('#stat-tasks');
  await expect(projectStat).toBeVisible();
  await expect(taskStat).toBeVisible();

  const projectText = await projectStat.textContent();
  const taskText    = await taskStat.textContent();
  expect(Number(projectText.trim())).not.toBeNaN();
  expect(Number(taskText.trim())).not.toBeNaN();
});

// ── Test 4: Donut chart status progress muncul ─────────────────────────────
test('Donut chart status progress muncul di dashboard', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await expect(page.locator('#donut-svg')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#stat-done')).toBeVisible();
  await expect(page.locator('#stat-ongoing')).toBeVisible();
});

// ── Test 5: Tabel ringkasan kepanitiaan tampil ─────────────────────────────
test('Tabel ringkasan kepanitiaan atau empty state tampil', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await page.waitForLoadState('networkidle');

  const hasTable = await page.locator('#summary-table-body tr').first().isVisible().catch(() => false);
  const hasEmpty = await page.locator('#empty-state').isVisible().catch(() => false);
  const hasHeader = await page.locator('body').getByText(/Ringkasan Kepanitiaan/i).first().isVisible().catch(() => false);

  expect(hasTable || hasEmpty || hasHeader).toBeTruthy();
});

// ── Test 6: Filter kepanitiaan berfungsi ───────────────────────────────────
test('Filter kepanitiaan pada dashboard berfungsi', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await page.waitForLoadState('networkidle');

  const committeeSelect = page.locator('#filter-committee');
  await expect(committeeSelect).toBeVisible();

  const opts = await committeeSelect.locator('option').all();
  if (opts.length > 1) {
    await committeeSelect.selectOption({ index: 1 });
    await page.waitForLoadState('networkidle');
  }

  // Halaman tidak crash
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('#stat-projects')).toBeVisible();
});

// ── Test 7: Filter status berfungsi ────────────────────────────────────────
test('Filter status progress pada dashboard berfungsi', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await page.waitForLoadState('networkidle');

  const statusSelect = page.locator('#filter-status');
  await expect(statusSelect).toBeVisible();

  await statusSelect.selectOption('in_progress');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('#stat-progress')).toBeVisible();
});

// ── Test 8: Reset filter berfungsi ─────────────────────────────────────────
test('Reset filter pada dashboard berfungsi', async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await page.waitForLoadState('networkidle');

  // Set filter dulu
  await page.locator('#filter-status').selectOption('done');
  await page.waitForLoadState('networkidle');

  // Klik reset
  await page.locator('#reset-filters-btn').click();
  await page.waitForLoadState('networkidle');

  // Filter kembali ke default (kosong)
  await expect(page.locator('#filter-status')).toHaveValue('');
  await expect(page).toHaveURL(/\/dashboard/);
});

// ── Test 9: Dashboard JSON API merespons dengan data valid ─────────────────
test('Dashboard JSON API merespons dengan struktur data yang valid', async ({ page }) => {
  // Mulai listen sebelum goto agar tidak miss response yang datang saat load
  const responsePromise = page.waitForResponse(
    res => res.url().includes('/dashboard') && res.url().includes('json=1'),
    { timeout: 15000 }
  );

  await page.goto(BASE + '/dashboard');
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.data.stats).toHaveProperty('total_project');
  expect(body.data.stats).toHaveProperty('total_task');
  expect(body.data.stats).toHaveProperty('total_progress');
  expect(Array.isArray(body.data.summary)).toBe(true);
});
