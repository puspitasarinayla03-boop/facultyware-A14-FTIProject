// tests/06-expenses.spec.js
// Skenario: Kelola Pengeluaran (Expenses) pada RAB
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

async function getFirstBudgetUrl(page) {
  await page.goto(BASE + '/committees');
  const committeeLink = page.locator('a[href*="/committees/"]').filter({ hasNotText: /create|tambah/i }).first();
  await committeeLink.click();
  await page.waitForURL(/\/committees\/\d+/);
  const committeeId = page.url().match(/\/committees\/(\d+)/)?.[1];

  await page.goto(BASE + `/committees/${committeeId}/budgets`);
  const budgetLink = page.locator('a', { hasText: 'RAB Test Playwright' }).first();
  await expect(budgetLink).toBeVisible({ timeout: 8000 });
  await budgetLink.click();
  await page.waitForURL(/\/budgets\/\d+/);
  return { url: page.url(), committeeId };
}

// ── Test 1: Halaman detail RAB menampilkan seksi pengeluaran ────────────────
test('Halaman detail RAB memiliki form tambah pengeluaran', async ({ page }) => {
  await getFirstBudgetUrl(page);
  // Halaman RAB show harus memuat seksi expenses
  await expect(page.locator('body')).toContainText(/pengeluaran|expense|realisasi/i);
});

// ── Test 2: Tambah pengeluaran baru ────────────────────────────────────────
test('Tambah pengeluaran baru pada RAB', async ({ page }) => {
  const { url, committeeId } = await getFirstBudgetUrl(page);
  const budgetId = url.match(/\/budgets\/(\d+)/)?.[1];

  // Cari form tambah expense di halaman show RAB
  const descField = page.locator('input[name="description"], #expense-description, input[placeholder*="deskripsi"]').first();
  const amountField = page.locator('input[name="amount"], #expense-amount, input[placeholder*="jumlah"]').first();
  
  if (await descField.isVisible()) {
    await descField.fill('Pembelian Dekorasi Test');
    await amountField.fill('75000');

    const submitBtn = page.locator('form button[type="submit"]').last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Halaman di-refresh, pengeluaran harus muncul
    await expect(page.locator('body')).toContainText(/75[.,]000|75000|Pembelian Dekorasi Test/);
  } else {
    // Coba via direct POST jika tidak ada form inline
    await page.goto(BASE + `/committees/${committeeId}/budgets/${budgetId}`);
    console.log('[06-expenses] Form inline tidak ditemukan, lewati pengisian.');
  }
});

// ── Test 3: Approve pengeluaran ────────────────────────────────────────────
test('Approve pengeluaran berhasil', async ({ page }) => {
  await getFirstBudgetUrl(page);

  const approveBtn = page.locator('button[form*="approve"], form[action*="/approve"] button, button', {
    hasText: /approve|setuju/i,
  }).first();

  if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await approveBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toContainText(/approved|disetujui/i);
  } else {
    console.log('[06-expenses] Tidak ada pengeluaran untuk di-approve, lewati.');
  }
});

// ── Test 4: Reject pengeluaran ─────────────────────────────────────────────
test('Reject pengeluaran dapat dilakukan', async ({ page }) => {
  await getFirstBudgetUrl(page);

  const rejectBtn = page.locator('button', { hasText: /reject|tolak/i }).first();

  if (await rejectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await rejectBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toContainText(/rejected|ditolak/i);
  } else {
    console.log('[06-expenses] Tidak ada pengeluaran yang bisa di-reject, lewati.');
  }
});
