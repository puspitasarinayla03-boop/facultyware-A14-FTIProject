// tests/05-tasks.spec.js
// Skenario: CRUD Task pada Kepanitiaan
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

async function getFirstCommitteeId(page) {
  await page.goto(BASE + '/committees');
  const link = page.locator('a[href*="/committees/"]').filter({ hasNotText: /create|tambah/i }).first();
  await expect(link).toBeVisible({ timeout: 8000 });
  await link.click();
  await page.waitForURL(/\/committees\/\d+/);
  const match = page.url().match(/\/committees\/(\d+)/);
  return match?.[1];
}

// ── Test 1: Halaman daftar task dapat diakses ───────────────────────────────
test('Daftar task kepanitiaan dapat diakses', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  await page.goto(BASE + `/committees/${id}/tasks`);
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('body')).toContainText(/task|tugas/i);
});

// ── Test 2: Buat task baru ──────────────────────────────────────────────────
test('Buat task baru berhasil', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  await page.goto(BASE + `/committees/${id}/tasks/create`);

  await page.fill('#title', 'Task Test Playwright');
  await page.fill('#description', 'Deskripsi task yang dibuat oleh Playwright');
  await page.selectOption('#status', 'in_progress');
  await page.fill('#due_date', '2026-08-01');

  await page.click('button[type="submit"]');

  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText('Task Test Playwright');
});

// ── Test 3: Validasi form task — judul wajib diisi ──────────────────────────
test('Validasi form task: judul wajib diisi', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  await page.goto(BASE + `/committees/${id}/tasks/create`);

  // Langsung submit tanpa isi judul
  await page.click('button[type="submit"]');

  // Tetap di halaman create
  await expect(page).toHaveURL(new RegExp(`/committees/${id}/tasks/create`));
});

// ── Test 4: Halaman detail task dapat diakses ───────────────────────────────
test('Halaman detail task dapat diakses', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  await page.goto(BASE + `/committees/${id}/tasks`);

  const taskLink = page.locator('a, tr', { hasText: 'Task Test Playwright' }).first();
  await expect(taskLink).toBeVisible({ timeout: 8000 });
  await taskLink.click();

  await page.waitForURL(/\/tasks\/\d+/);
  await expect(page.locator('body')).toContainText('Task Test Playwright');
});

// ── Test 5: Edit task berhasil ──────────────────────────────────────────────
test('Edit task berhasil', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  await page.goto(BASE + `/committees/${id}/tasks`);

  const taskLink = page.locator('a, tr', { hasText: 'Task Test Playwright' }).first();
  await taskLink.click();
  await page.waitForURL(/\/tasks\/\d+/);

  const editBtn = page.locator('a[href*="/edit"]').first();
  await editBtn.click();
  await page.waitForURL(/\/tasks\/\d+\/edit/);

  // Update judul
  const titleField = page.locator('#title');
  await titleField.fill('Task Test Playwright (Edited)');
  await page.selectOption('#status', 'done');
  await page.click('button[type="submit"]');

  await page.waitForURL(url => !url.toString().includes('/edit'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText('Task Test Playwright (Edited)');
});
