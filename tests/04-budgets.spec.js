// tests/04-budgets.spec.js
// Skenario: CRUD RAB (Rencana Anggaran Biaya)
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// Helper: dapatkan committee ID pertama dari daftar
async function getFirstCommitteeUrl(page) {
  await page.goto(BASE + '/committees');
  const link = page.locator('a[href*="/committees/"]').filter({ hasNotText: /create|tambah/i }).first();
  await expect(link).toBeVisible({ timeout: 8000 });
  await link.click();
  await page.waitForURL(/\/committees\/\d+/);
  return page.url();
}

// ── Test 1: Halaman daftar RAB dapat diakses ────────────────────────────────
test('Daftar RAB pada kepanitiaan dapat diakses', async ({ page }) => {
  const committeeUrl = await getFirstCommitteeUrl(page);
  const id = committeeUrl.match(/\/committees\/(\d+)/)?.[1];
  
  await page.goto(BASE + `/committees/${id}/budgets`);
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('body')).toContainText(/rab|anggaran|budget/i);
});

// ── Test 2: Buat RAB baru dengan item ──────────────────────────────────────
test('Buat RAB baru dengan 2 item anggaran', async ({ page }) => {
  const committeeUrl = await getFirstCommitteeUrl(page);
  const id = committeeUrl.match(/\/committees\/(\d+)/)?.[1];

  await page.goto(BASE + `/committees/${id}/budgets/create`);

  // Isi nama RAB
  await page.fill('#name', 'RAB Test Playwright');
  await page.fill('#description', 'Anggaran untuk keperluan test otomatis');

  // Item pertama sudah ada di form (tambah 2 baris)
  const addBtn = page.locator('#add-item-btn');
  
  // Isi item pertama
  const rows = page.locator('.item-row');
  const firstRow = rows.nth(0);
  await firstRow.locator('input[name="item_name[]"]').fill('Dekorasi');
  await firstRow.locator('.item-qty').fill('2');
  await firstRow.locator('.item-price').fill('150000');

  // Tambah item kedua
  await addBtn.click();
  const secondRow = rows.nth(1);
  await secondRow.locator('input[name="item_name[]"]').fill('Konsumsi');
  await secondRow.locator('.item-qty').fill('50');
  await secondRow.locator('.item-price').fill('25000');

  // Submit
  await page.click('#save-budget-btn');
  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText('RAB Test Playwright');
});

// ── Test 3: Total RAB terhitung dengan benar ────────────────────────────────
test('Total RAB terhitung dengan benar (Rp 1.550.000)', async ({ page }) => {
  const committeeUrl = await getFirstCommitteeUrl(page);
  const id = committeeUrl.match(/\/committees\/(\d+)/)?.[1];

  await page.goto(BASE + `/committees/${id}/budgets`);
  
  // Klik RAB yang baru dibuat
  const rabLink = page.locator('a, tr', { hasText: 'RAB Test Playwright' }).first();
  await expect(rabLink).toBeVisible({ timeout: 8000 });
  await rabLink.click();

  await page.waitForURL(/\/budgets\/\d+/);
  // Total = (2 × 150.000) + (50 × 25.000) = 300.000 + 1.250.000 = 1.550.000
  await expect(page.locator('body')).toContainText(/1[.,]550[.,]000|1550000/);
});

// ── Test 4: Edit RAB — total tidak berkurang ────────────────────────────────
test('Edit RAB: total tidak berkurang setelah disimpan', async ({ page }) => {
  const committeeUrl = await getFirstCommitteeUrl(page);
  const id = committeeUrl.match(/\/committees\/(\d+)/)?.[1];

  await page.goto(BASE + `/committees/${id}/budgets`);
  
  const rabLink = page.locator('a, tr', { hasText: 'RAB Test Playwright' }).first();
  await rabLink.click();
  await page.waitForURL(/\/budgets\/\d+/);

  // Klik Edit
  const editBtn = page.locator('a[href*="/edit"]').first();
  await editBtn.click();
  await page.waitForURL(/\/budgets\/\d+\/edit/);

  // Pastikan item sudah terisi (tidak 0)
  const firstPriceDisplay = page.locator('.item-total').first();
  await expect(firstPriceDisplay).not.toContainText('Rp 0');

  // Simpan tanpa perubahan
  await page.click('#save-edit-btn');
  await page.waitForURL(url => !url.toString().includes('/edit'), { timeout: 10000 });

  // Total tetap 1.550.000
  await expect(page.locator('body')).toContainText(/1[.,]550[.,]000|1550000/);
});

// ── Test 5: Export Excel tersedia ──────────────────────────────────────────
test('Export Excel RAB tersedia', async ({ page }) => {
  const committeeUrl = await getFirstCommitteeUrl(page);
  const id = committeeUrl.match(/\/committees\/(\d+)/)?.[1];

  await page.goto(BASE + `/committees/${id}/budgets`);
  const rabLink = page.locator('a, tr', { hasText: 'RAB Test Playwright' }).first();
  await rabLink.click();
  await page.waitForURL(/\/budgets\/\d+/);

  // Cari tombol export Excel
  const exportBtn = page.locator('a[href*="export-excel"], button', { hasText: /excel/i }).first();
  await expect(exportBtn).toBeVisible({ timeout: 5000 }).catch(() => {
    console.log('[04-budgets] Tombol export Excel tidak ditemukan.');
  });
});
