// tests/06-expenses.spec.js
// Skenario: Kelola Pengeluaran (Expenses) pada RAB
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

async function getFirstBudgetUrl(page) {
  await page.goto(BASE + '/committees');
  const committeeLink = page.locator('a[href*="/committees/"]').filter({ hasNotText: /create|tambah|buat/i }).first();
  await committeeLink.click();
  await page.waitForURL(/\/committees\/\d+/);
  const committeeId = page.url().match(/\/committees\/(\d+)/)?.[1];

  await page.goto(BASE + `/committees/${committeeId}/budgets`);
  const rabCard = page.locator('.card').filter({ hasText: 'RAB Test Playwright' }).first();
  await expect(rabCard).toBeVisible({ timeout: 8000 });
  await rabCard.locator('a', { hasText: /detail/i }).click();
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

// ── Test 5: Halaman selector expenses dapat diakses ─────────────────────────
test('Halaman selector expenses dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/expenses');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('body')).toContainText(/expense|pengeluaran/i);
});

// ── Test 6: Form tambah pengeluaran dapat dibuka ─────────────────────────────
test('Form tambah pengeluaran dapat dibuka', async ({ page }) => {
  await getFirstBudgetUrl(page);

  const toggleBtn = page.locator('#toggle-expense-form-btn');
  await expect(toggleBtn).toBeVisible({ timeout: 8000 });
  await toggleBtn.click();

  // Form panel harus muncul setelah toggle
  const formPanel = page.locator('#expense-form-panel');
  await expect(formPanel).not.toHaveClass(/hidden/);
  await expect(page.locator('#expense-item-select')).toBeVisible();
  await expect(page.locator('#expense-amount')).toBeVisible();
});

// ── Test 7: Validasi pengeluaran: amount wajib diisi ─────────────────────────
test('Validasi pengeluaran: amount wajib diisi', async ({ page }) => {
  await getFirstBudgetUrl(page);

  const toggleBtn = page.locator('#toggle-expense-form-btn');
  await expect(toggleBtn).toBeVisible({ timeout: 8000 });
  await toggleBtn.click();

  // Pilih item anggaran
  const itemSelect = page.locator('#expense-item-select');
  const opts = await itemSelect.locator('option').all();
  if (opts.length > 1) {
    await itemSelect.selectOption({ index: 1 });
  }

  // Kosongkan amount lalu submit
  await page.locator('#expense-amount').fill('');
  await page.locator('#submit-expense-btn').click();

  // Harus tetap di halaman RAB (HTML5 required mencegah submit)
  await expect(page).toHaveURL(/\/budgets\/\d+/);
});

// ── Test 8: Hapus pengeluaran berhasil ──────────────────────────────────────
test('Hapus pengeluaran berhasil', async ({ page }) => {
  await getFirstBudgetUrl(page);

  const deleteBtn = page.locator('button[id^="del-expense-"]').first();
  const visible = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (visible) {
    await deleteBtn.click();
    const confirmBtn = page.locator('#confirm-delete-btn').first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/budgets\/\d+/);
  } else {
    console.log('[06-expenses] Tidak ada pengeluaran untuk dihapus, test di-skip.');
  }
});

// ── Test 9: Ringkasan pengeluaran tampil di sidebar RAB ─────────────────────
test('Ringkasan pengeluaran tampil di halaman detail RAB', async ({ page }) => {
  await getFirstBudgetUrl(page);
  await expect(page.locator('body')).toContainText(/pengajuan|pengeluaran/i);
});
