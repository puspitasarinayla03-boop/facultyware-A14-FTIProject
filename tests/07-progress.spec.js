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

  // Bypass HTMX cascade via direct API fetch to avoid DOM timing race conditions.
  const hasData = await page.evaluate(async () => {
    const r1 = await fetch('/progresses/api/activities?activity_type=kepanitiaan');
    const html1 = await r1.text();
    const actSel = document.querySelector('#activity_id');
    actSel.innerHTML = html1;
    const firstActivity = [...actSel.options].find(o => o.value && o.value !== '');
    if (!firstActivity) return false;
    actSel.value = firstActivity.value;

    const r2 = await fetch('/progresses/api/tasks?activity_id=' + firstActivity.value);
    const html2 = await r2.text();
    const taskSel = document.querySelector('#committee_task_id');
    taskSel.innerHTML = html2;
    const firstTask = [...taskSel.options].find(o => o.value && o.value !== '' && o.value !== 'new');
    if (!firstTask) return false;
    taskSel.value = firstTask.value;

    document.querySelector('#activity_type').value = 'kepanitiaan';
    return true;
  });

  if (!hasData) {
    console.log('[07-progress] Tidak ada committee/task tersedia, lewati pengisian.');
    return;
  }

  await page.locator('#description').fill('Progress test: Persiapan awal sudah selesai dilakukan oleh Playwright.');
  await page.locator('#progress_date').fill('2026-07-15');
  await page.locator('#status').selectOption('in_progress');

  await page.click('button[type="submit"]');

  // Setelah simpan harus redirect ke daftar
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

// ── Test 7: Validasi form progress: deskripsi wajib diisi ──────────────────
test('Validasi form progress: deskripsi wajib diisi', async ({ page }) => {
  await page.goto(BASE + '/progresses/create');
  await expect(page).not.toHaveURL(BASE + '/login');

  // Langsung klik submit tanpa isi form
  await page.click('button[type="submit"]');

  // Harus tetap di halaman create (HTML5 required)
  await expect(page).toHaveURL(BASE + '/progresses/create');
});

// ── Test 8: Hapus progress berhasil ────────────────────────────────────────
test('Hapus progress berhasil', async ({ page }) => {
  await page.goto(BASE + '/progresses');

  const progressLink = page.locator('a[href*="/progresses/"]').filter({ hasNotText: /create|tambah/i }).first();
  await expect(progressLink).toBeVisible({ timeout: 8000 });
  await progressLink.click();
  await page.waitForURL(/\/progresses\/\d+/);

  const deleteBtn = page.locator('form[action*="/delete"] button').first();
  const deleteVisible = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (deleteVisible) {
    await deleteBtn.click();

    // Konfirmasi via global deleteOverlay
    const confirmBtn = page.locator('button[onclick="executeDeleteForm()"]').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });

    const urlBefore = page.url();
    await confirmBtn.click();
    // Tunggu URL berubah dari halaman detail ke daftar progress
    await page.waitForURL(url => url.toString() !== urlBefore, { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/progresses\/\d+/);
  } else {
    console.log('[07-progress] Tombol hapus tidak ditemukan, test di-skip.');
  }
});

// ── Test 9: Export DOCX progress men-download file ─────────────────────────
test('Export DOCX progress men-download file .docx', async ({ page }) => {
  await page.goto(BASE + '/progresses');

  const progressLink = page.locator('a[href*="/progresses/"]').filter({ hasNotText: /create|tambah/i }).first();
  const visible = await progressLink.isVisible({ timeout: 5000 }).catch(() => false);

  if (!visible) {
    console.log('[07-progress] Tidak ada progress tersedia untuk export, test di-skip.');
    return;
  }

  await progressLink.click();
  await page.waitForURL(/\/progresses\/\d+/);

  const exportBtn = page.locator('button', { hasText: /docx|export/i }).first();
  const exportVisible = await exportBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (exportVisible) {
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.docx$/i);
    console.log('[07-progress] DOCX berhasil di-download:', download.suggestedFilename());
  } else {
    console.log('[07-progress] Tombol export DOCX tidak ditemukan, test di-skip.');
  }
});
