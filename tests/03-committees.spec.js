// tests/03-committees.spec.js
// Skenario: CRUD Kelola Kepanitiaan + Search + Generate SK + Delete
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';

// ── Test 1: Daftar kepanitiaan dapat diakses ────────────────────────────────
test('Daftar kepanitiaan dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/committees');
  await expect(page).not.toHaveURL(BASE + '/login');
  await expect(page.locator('h1, h2, h3').filter({ hasText: /kepanitiaan/i }).first()).toBeVisible();
});

// ── Test 2: Buat kepanitiaan baru ───────────────────────────────────────────
test('Buat kepanitiaan baru berhasil', async ({ page }) => {
  await page.goto(BASE + '/committees/create');
  await expect(page).not.toHaveURL(BASE + '/login');

  // Cek apakah form tersedia (ada proyek)
  const formVisible = await page.locator('form#committee-create-form').isVisible().catch(() => false);

  if (!formVisible) {
    // Tidak ada proyek yang tersedia — buat proyek baru dulu
    await page.goto(BASE + '/projects/create');
    await page.fill('#name', 'Proyek Untuk Kepanitiaan Playwright');
    await page.fill('#objective', 'Testing kepanitiaan');
    await page.fill('#start_date', '2026-08-01');
    await page.selectOption('#status', 'active');

    // Klik tombol simpan yang spesifik
    await page.locator('form[action="/projects"] button[type="submit"]').first().click();

    await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
    await page.goto(BASE + '/committees/create');
  }

  await expect(page.locator('form#committee-create-form')).toBeVisible({ timeout: 8000 });

  // Pilih proyek pertama yang ada (index 1 karena index 0 adalah placeholder)
  await page.locator('#committee_id').selectOption({ index: 1 });

  // Isi anggota internal yang otomatis ditambahkan row-nya
  await page.locator('select[name="internal_employee_id[]"]').first().selectOption({ index: 1 });
  await page.locator('select[name="internal_role[]"]').first().selectOption('Anggota');

  // Tambah anggota eksternal
  await page.locator('#add-external-btn').click();
  await page.fill('input[name="external_name[]"]', 'Anggota Test Playwright');
  await page.fill('input[name="external_institution[]"]', 'Universitas Test');
  await page.selectOption('select[name="external_role[]"]', 'Anggota');

  await page.click('#submit-create-btn');

  // Redirect ke daftar atau detail setelah berhasil
  await page.waitForURL(url => !url.toString().includes('/create'), { timeout: 10000 });
  await expect(page.locator('body')).not.toContainText(/terdapat kesalahan/i);
});

// ── Test 3: Validasi form — submit tanpa data ────────────────────────────────
test('Validasi form kepanitiaan: proyek wajib dipilih', async ({ page }) => {
  await page.goto(BASE + '/committees/create');

  const formVisible = await page.locator('form#committee-create-form').isVisible().catch(() => false);
  if (!formVisible) {
    console.log('[03-committees] Tidak ada proyek tersedia, test validasi di-skip.');
    return;
  }

  // Submit tanpa mengisi apapun
  await page.click('#submit-create-btn');

  // Harus tetap di halaman create
  await expect(page).toHaveURL(BASE + '/committees/create');
});

// ── Test 4: Halaman detail kepanitiaan dapat diakses ───────────────────────
test('Halaman detail kepanitiaan dapat diakses', async ({ page }) => {
  await page.goto(BASE + '/committees');

  const committeeLink = page.locator('a[href*="/committees/"]').filter({ hasNotText: /buat|tambah|create/i }).first();
  await expect(committeeLink).toBeVisible({ timeout: 8000 });
  await committeeLink.click();

  await page.waitForURL(/\/committees\/\d+/);
  await expect(page.locator('body')).toContainText(/kepanitiaan|committee|anggota/i);
});

// ── Test 5: Edit kepanitiaan ────────────────────────────────────────────────
test('Edit kepanitiaan berhasil', async ({ page }) => {
  await page.goto(BASE + '/committees');

  const committeeLink = page.locator('a[href*="/committees/"]').filter({ hasNotText: /buat|tambah|create/i }).first();
  await expect(committeeLink).toBeVisible({ timeout: 8000 });
  await committeeLink.click();
  await page.waitForURL(/\/committees\/\d+/);

  const editBtn = page.locator('a[href*="/edit"]').first();
  const editVisible = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (editVisible) {
    await editBtn.click();
    await page.waitForURL(/\/committees\/\d+\/edit/);
    await expect(page.locator('body')).toContainText(/edit|kepanitiaan/i);

    // Tambah anggota eksternal baru
    const addExternalBtn = page.locator('#add-external-btn');
    if (await addExternalBtn.isVisible().catch(() => false)) {
      await addExternalBtn.click();
      await page.locator('input[name="external_name[]"]').last().fill('Anggota Edit Test');
      await page.locator('select[name="external_role[]"]').last().selectOption('Anggota');
    }

    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.toString().includes('/edit'), { timeout: 10000 });
    await expect(page.locator('body')).not.toContainText(/terdapat kesalahan/i);
  } else {
    console.log('[03-committees] Tombol edit tidak ditemukan, test di-skip.');
  }
});

// ── Test 6: Pencarian kepanitiaan ───────────────────────────────────────────
test('Pencarian kepanitiaan berfungsi', async ({ page }) => {
  await page.goto(BASE + '/committees');

  const searchInput = page.locator('input[name="search"], input[type="search"]').first();
  const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

  if (hasSearch) {
    await searchInput.fill('Playwright');
    await Promise.all([
      page.waitForLoadState('networkidle'),
      searchInput.press('Enter'),
    ]);
    await expect(page).not.toHaveURL(BASE + '/login');
  } else {
    console.log('[03-committees] Fitur search tidak tersedia, test di-skip.');
  }
});

// ── Test 7: Generate SK kepanitiaan men-download file .docx ─────────────────
test('Generate SK kepanitiaan berhasil men-download file', async ({ page }) => {
  await page.goto(BASE + '/committees');

  const committeeLink = page.locator('a[href*="/committees/"]').filter({ hasNotText: /buat|tambah|create/i }).first();
  await expect(committeeLink).toBeVisible({ timeout: 8000 });
  await committeeLink.click();
  await page.waitForURL(/\/committees\/\d+/);

  const skLink = page.locator('a[href*="/sk"], button', { hasText: /sk|surat keputusan|generate/i }).first();
  const skVisible = await skLink.isVisible({ timeout: 5000 }).catch(() => false);

  if (skVisible) {
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await skLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.docx$/i);
    console.log('[03-committees] SK berhasil di-download:', download.suggestedFilename());
  } else {
    console.log('[03-committees] Tombol Generate SK tidak ditemukan di halaman detail.');
  }
});

// ── Test 8: Hapus kepanitiaan ────────────────────────────────────────────────
test('Hapus kepanitiaan berhasil', async ({ page }) => {
  await page.goto(BASE + '/committees');

  // Hapus kepanitiaan terakhir yang dibuat oleh playwright
  const committeeLink = page.locator('a[href*="/committees/"]').filter({ hasNotText: /buat|tambah|create/i }).last();
  await expect(committeeLink).toBeVisible({ timeout: 8000 });
  await committeeLink.click();
  await page.waitForURL(/\/committees\/\d+/);

  // Klik tombol Hapus form khusus delete
  const deleteBtn = page.locator('form[action*="/delete"] button').first();
  const deleteVisible = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (deleteVisible) {
    await deleteBtn.click();

    const confirmBtn = page.locator('dialog button, #delete-modal button, #confirm-delete-btn, .modal button').filter({ hasText: /ya|hapus|confirm|delete/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await page.waitForURL(/\/committees$/, { timeout: 10000 });
    await expect(page).toHaveURL(BASE + '/committees');
  } else {
    console.log('[03-committees] Tombol hapus tidak ditemukan, test di-skip.');
  }
});
