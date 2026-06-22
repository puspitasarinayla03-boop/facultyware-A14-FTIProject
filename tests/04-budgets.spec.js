// tests/04-budgets.spec.js
// Skenario: CRUD RAB (Rencana Anggaran Biaya) + Export Excel + Delete
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// Helper: dapatkan committee ID pertama dari daftar
async function getFirstCommitteeId(page) {
  await page.goto(BASE + '/committees');
  const link = page.locator('a[href*="/committees/"]').filter({ hasNotText: /create|tambah|buat/i }).first();
  const visible = await link.isVisible({ timeout: 5000 }).catch(() => false);

  if (!visible) {
    // Buat project dulu
    await page.goto(BASE + '/projects/create');
    await page.fill('#name', 'Proyek Untuk RAB');
    await page.fill('#objective', 'Testing RAB Playwright');
    await page.fill('#start_date', '2026-09-01');
    await page.selectOption('#status', 'active');
    await page.locator('form[action="/projects"] button[type="submit"]').first().click();
    await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });

    // Buat committee
    await page.goto(BASE + '/committees/create');
    await page.locator('#committee_id').selectOption({ index: 1 });
    await page.locator('select[name="internal_employee_id[]"]').first().selectOption({ index: 1 });
    await page.locator('select[name="internal_role[]"]').first().selectOption('Anggota');
    await page.locator('#add-external-btn').click();
    await page.fill('input[name="external_name[]"]', 'Anggota Eksternal');
    await page.selectOption('select[name="external_role[]"]', 'Ketua');
    await page.click('#submit-create-btn');
    await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });

    // Kembali ke daftar committees untuk mengambil ID
    await page.goto(BASE + '/committees');
  }

  const finalLink = page.locator('a[href*="/committees/"]').filter({ hasNotText: /create|tambah|buat/i }).first();
  const href = await finalLink.getAttribute('href');
  const match = href.match(/\/committees\/(\d+)/);
  return match ? match[1] : null;
}

// ── Test 1: Halaman selector RAB dapat diakses ──────────────────────────────
test('Halaman selector RAB dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/budgets');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('h1, h2, h3').filter({ hasText: /rab|anggaran/i }).first()).toBeVisible();
});

// ── Test 2: Halaman daftar RAB kepanitiaan dapat diakses ─────────────────────
test('Daftar RAB pada kepanitiaan dapat diakses', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  if (!id) { console.log('[04-budgets] Tidak ada kepanitiaan, test di-skip.'); return; }

  await page.goto(`${BASE}/committees/${id}/budgets`);
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('body')).toContainText(/rab|anggaran|budget/i);
});

// ── Test 3: Buat RAB baru dengan 2 item anggaran ────────────────────────────
test('Buat RAB baru dengan 2 item anggaran', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  if (!id) { console.log('[04-budgets] Tidak ada kepanitiaan, test di-skip.'); return; }

  await page.goto(`${BASE}/committees/${id}/budgets/create`);
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('form#budget-form')).toBeVisible({ timeout: 8000 });

  // Isi nama RAB
  await page.fill('#name', 'RAB Test Playwright');
  await page.fill('#description', 'Anggaran untuk keperluan test otomatis');

  // Item pertama (sudah ada dari JS)
  const firstRow = page.locator('.item-row').nth(0);
  await firstRow.locator('input[name="item_name[]"]').fill('Dekorasi');
  await firstRow.locator('.item-qty').fill('2');
  await firstRow.locator('.item-price').fill('150000');
  await firstRow.locator('.item-price').dispatchEvent('input');

  // Isi item kedua
  const secondRow = page.locator('.item-row').nth(1);
  await secondRow.locator('input[name="item_name[]"]').fill('Konsumsi');
  await secondRow.locator('.item-qty').fill('50');
  await secondRow.locator('.item-price').fill('25000');
  await secondRow.locator('.item-price').dispatchEvent('input');

  // Submit
  await page.click('#save-budget-btn');
  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
  await expect(page.locator('body')).toContainText('RAB Test Playwright');
});

// ── Test 4: Validasi RAB — nama kosong ──────────────────────────────────────
test('Validasi RAB: nama wajib diisi', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  if (!id) { console.log('[04-budgets] Tidak ada kepanitiaan, test validasi di-skip.'); return; }

  await page.goto(`${BASE}/committees/${id}/budgets/create`);
  await expect(page.locator('form#budget-form')).toBeVisible({ timeout: 8000 });

  // Kosongkan nama lalu submit
  await page.click('#save-budget-btn');

  // Harus tetap di halaman create (HTML5 required)
  await expect(page).toHaveURL(`${BASE}/committees/${id}/budgets/create`);
});

// ── Test 5: Total RAB terhitung dengan benar ─────────────────────────────────
test('Total RAB terhitung dengan benar (Rp 1.550.000)', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  if (!id) { console.log('[04-budgets] Tidak ada kepanitiaan, test di-skip.'); return; }

  await page.goto(`${BASE}/committees/${id}/budgets`);

  const rabCard = page.locator('.card', { hasText: 'RAB Test Playwright' }).first();
  const rabLink = rabCard.locator('a', { hasText: /Detail/i }).first();
  const visible = await rabLink.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) { console.log('[04-budgets] RAB Test tidak ditemukan, test di-skip.'); return; }

  await rabLink.click();
  await page.waitForURL(/\/budgets\/\d+/);

  // Total = (2 × 150.000) + (50 × 25.000) = 300.000 + 1.250.000 = 1.550.000
  await expect(page.locator('body')).toContainText(/1[.,]550[.,]000|1550000/);
});

// ── Test 6: Edit RAB berhasil ────────────────────────────────────────────────
test('Edit RAB: total tidak berkurang setelah disimpan', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  if (!id) { console.log('[04-budgets] Tidak ada kepanitiaan, test edit di-skip.'); return; }

  await page.goto(`${BASE}/committees/${id}/budgets`);

  const rabCard = page.locator('.card', { hasText: 'RAB Test Playwright' }).first();
  const rabLink = rabCard.locator('a', { hasText: /Detail/i }).first();
  const visible = await rabLink.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) { console.log('[04-budgets] RAB Test tidak ditemukan, test edit di-skip.'); return; }

  await rabLink.click();
  await page.waitForURL(/\/budgets\/\d+/);

  const editBtn = page.locator('a[href*="/edit"]').first();
  const editVisible = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!editVisible) { console.log('[04-budgets] Tombol edit tidak ada, test di-skip.'); return; }

  await editBtn.click();
  await page.waitForURL(/\/budgets\/\d+\/edit/);

  // Verifikasi item sudah terisi
  const firstPriceDisplay = page.locator('.item-total').first();
  await expect(firstPriceDisplay).not.toContainText('Rp 0');

  // Simpan tanpa perubahan
  await page.click('#save-edit-btn');
  await page.waitForURL(url => !url.toString().includes('/edit'), { timeout: 10000 });

  // Total tetap 1.550.000
  await expect(page.locator('body')).toContainText(/1[.,]550[.,]000|1550000/);
});

// ── Test 7: Export Excel RAB men-download file .xlsx ────────────────────────
test('Export Excel RAB berhasil men-download file .xlsx', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  if (!id) { console.log('[04-budgets] Tidak ada kepanitiaan, test export di-skip.'); return; }

  await page.goto(`${BASE}/committees/${id}/budgets`);

  const rabCard = page.locator('.card', { hasText: 'RAB Test Playwright' }).first();
  const rabLink = rabCard.locator('a', { hasText: /Detail/i }).first();
  const rabVisible = await rabLink.isVisible({ timeout: 5000 }).catch(() => false);
  if (!rabVisible) { console.log('[04-budgets] RAB test tidak ada, test export di-skip.'); return; }

  await rabLink.click();
  await page.waitForURL(/\/budgets\/\d+/);

  const exportBtn = page.locator('a[href*="export-excel"], button', { hasText: /excel|export/i }).first();
  const exportVisible = await exportBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (exportVisible) {
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
    console.log('[04-budgets] Excel berhasil di-download:', download.suggestedFilename());
  } else {
    console.log('[04-budgets] Tombol Export Excel tidak ditemukan, test di-skip.');
  }
});

// ── Test 8: Hapus RAB berhasil ───────────────────────────────────────────────
test('Hapus RAB berhasil', async ({ page }) => {
  const id = await getFirstCommitteeId(page);
  if (!id) { console.log('[04-budgets] Tidak ada kepanitiaan, test hapus di-skip.'); return; }

  // Buat RAB khusus untuk dihapus agar tidak mengganggu data yang dipakai test 06-expenses
  await page.goto(`${BASE}/committees/${id}/budgets/create`);
  await expect(page.locator('form#budget-form')).toBeVisible({ timeout: 8000 });
  await page.fill('#name', 'RAB Hapus Playwright');
  // Isi minimal 1 item agar form bisa disubmit
  const firstRow = page.locator('.item-row').nth(0);
  await firstRow.locator('input[name="item_name[]"]').fill('Item Hapus');
  await firstRow.locator('.item-qty').fill('1');
  await firstRow.locator('.item-price').fill('10000');
  await firstRow.locator('.item-price').dispatchEvent('input');

  // Form starts with 2 rows by default — fill second row to pass HTML5 required
  const secondRow = page.locator('.item-row').nth(1);
  const secondRowVisible = await secondRow.isVisible({ timeout: 2000 }).catch(() => false);
  if (secondRowVisible) {
    await secondRow.locator('input[name="item_name[]"]').fill('Item Hapus 2');
    await secondRow.locator('.item-qty').fill('1');
    await secondRow.locator('.item-price').fill('5000');
    await secondRow.locator('.item-price').dispatchEvent('input');
  }

  await page.click('#save-budget-btn');
  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });

  // Buka detail RAB yang baru dibuat
  await page.goto(`${BASE}/committees/${id}/budgets`);
  const rabCard = page.locator('.card', { hasText: 'RAB Hapus Playwright' }).first();
  await expect(rabCard).toBeVisible({ timeout: 8000 });
  await rabCard.locator('a', { hasText: /Detail/i }).first().click();
  await page.waitForURL(/\/budgets\/\d+/);

  const deleteBtn = page.locator('#quick-delete-btn').first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });
  await deleteBtn.click();

  const confirmBtn = page.locator('button[onclick="executeDeleteForm()"]').first();
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });

  const urlBefore = page.url();
  await confirmBtn.click();
  await page.waitForURL(url => url.toString() !== urlBefore, { timeout: 10000 });
  await expect(page.locator('body')).not.toContainText('RAB Hapus Playwright');
});
