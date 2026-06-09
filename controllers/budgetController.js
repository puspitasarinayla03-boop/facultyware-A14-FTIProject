// controllers/budgetController.js
const db   = require('../lib/db');
const path = require('path');
const fs   = require('fs');
const multer = require('multer');

// ─── Multer: upload receipt ───────────────────────────────────────────────────
const receiptDir = path.join(__dirname, '../public/uploads/receipts');
if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, receiptDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, 'receipt_' + Date.now() + ext);
  },
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Tipe file tidak diizinkan. Gunakan JPG, PNG, atau PDF.'));
  },
}).single('receipt_file');

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getCommittee(id) {
  const [rows] = await db.query(
    'SELECT id, name FROM committees WHERE id = ?', [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

// =============================================================================
// BUDGET CRUD
// =============================================================================

// GET /committees/:id/budgets  — list budgets for a committee
const budgetIndex = async (req, res, next) => {
  try {
    const committeeId = req.params.id;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [budgets] = await db.query(
      `SELECT cb.*, 
              COALESCE(SUM(cbi.total_price), 0) AS calculated_total,
              COUNT(cbi.id) AS item_count
       FROM committee_budgets cb
       LEFT JOIN committee_budget_items cbi ON cbi.committee_budget_id = cb.id
       WHERE cb.committee_id = ?
       GROUP BY cb.id
       ORDER BY cb.created_at DESC`,
      [committeeId]
    );

    res.render('budgets/index', {
      title: `RAB — ${committee.name}`,
      user: req.session.userName,
      committee,
      budgets,
    });
  } catch (err) { next(err); }
};

// GET /committees/:id/budgets/create
const budgetCreate = async (req, res, next) => {
  try {
    const committeeId = req.params.id;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    res.render('budgets/create', {
      title: 'Tambah RAB',
      user: req.session.userName,
      committee,
      errors: [],
      old: {},
    });
  } catch (err) { next(err); }
};

// POST /committees/:id/budgets
const budgetStore = async (req, res, next) => {
  try {
    const committeeId = req.params.id;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const { name, description } = req.body;
    const errors = [];
    if (!name || !name.trim()) errors.push('Nama RAB wajib diisi.');

    // Parse items
    const itemNames       = [].concat(req.body['item_name[]']       || req.body['item_name']       || []);
    const itemQtys        = [].concat(req.body['item_qty[]']        || req.body['item_qty']        || []);
    const itemUnitPrices  = [].concat(req.body['item_unit_price[]'] || req.body['item_unit_price'] || []);

    const items = [];
    for (let i = 0; i < itemNames.length; i++) {
      const iName = (itemNames[i] || '').trim();
      const qty   = parseFloat(itemQtys[i]) || 0;
      const price = parseFloat((itemUnitPrices[i] || '').replace(/[^0-9.]/g, '')) || 0;
      if (iName) items.push({ name: iName, quantity: qty, unit_price: price, total_price: qty * price });
    }
    if (items.length === 0) errors.push('Minimal harus ada satu item anggaran.');

    if (errors.length > 0) {
      return res.render('budgets/create', {
        title: 'Tambah RAB', user: req.session.userName, committee, errors, old: req.body,
      });
    }

    const totalAmount = items.reduce((s, it) => s + it.total_price, 0);

    const [result] = await db.query(
      `INSERT INTO committee_budgets (committee_id, name, description, total_amount, used_amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, NOW(), NOW())`,
      [committeeId, name.trim(), description || null, totalAmount]
    );
    const budgetId = result.insertId;

    for (const item of items) {
      await db.query(
        `INSERT INTO committee_budget_items (committee_budget_id, name, quantity, unit_price, total_price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [budgetId, item.name, item.quantity, item.unit_price, item.total_price]
      );
    }

    req.session.toast = { message: 'RAB berhasil disimpan!', type: 'success' };
    res.redirect(`/committees/${committeeId}/budgets/${budgetId}`);
  } catch (err) { next(err); }
};

// GET /committees/:id/budgets/:budgetId
const budgetShow = async (req, res, next) => {
  try {
    const { id: committeeId, budgetId } = req.params;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [budgetRows] = await db.query('SELECT * FROM committee_budgets WHERE id = ? AND committee_id = ?', [budgetId, committeeId]);
    if (budgetRows.length === 0) return res.status(404).render('error', { message: 'RAB tidak ditemukan.', error: { status: 404, stack: '' } });

    const [items] = await db.query(
      `SELECT cbi.*,
              COALESCE(SUM(ce.amount), 0) AS used_amount,
              COUNT(ce.id) AS expense_count
       FROM committee_budget_items cbi
       LEFT JOIN committee_expenses ce ON ce.committee_budget_item_id = cbi.id AND ce.status = 'approved'
       WHERE cbi.committee_budget_id = ?
       GROUP BY cbi.id
       ORDER BY cbi.id ASC`,
      [budgetId]
    );

    const [expenses] = await db.query(
      `SELECT ce.*, cbi.name AS item_name, emp.name AS submitted_by_name, emp2.name AS approved_by_name
       FROM committee_expenses ce
       JOIN committee_budget_items cbi ON ce.committee_budget_item_id = cbi.id
       LEFT JOIN employees emp ON ce.employee_id = emp.id
       LEFT JOIN employees emp2 ON ce.approved_by = emp2.id
       WHERE cbi.committee_budget_id = ?
       ORDER BY ce.expense_date DESC`,
      [budgetId]
    );

    res.render('budgets/show', {
      title: `Detail RAB — ${budgetRows[0].name}`,
      user: req.session.userName,
      committee,
      budget: budgetRows[0],
      items,
      expenses,
    });
  } catch (err) { next(err); }
};

// GET /committees/:id/budgets/:budgetId/edit
const budgetEdit = async (req, res, next) => {
  try {
    const { id: committeeId, budgetId } = req.params;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [budgetRows] = await db.query('SELECT * FROM committee_budgets WHERE id = ? AND committee_id = ?', [budgetId, committeeId]);
    if (budgetRows.length === 0) return res.status(404).render('error', { message: 'RAB tidak ditemukan.', error: { status: 404, stack: '' } });

    const [items] = await db.query('SELECT * FROM committee_budget_items WHERE committee_budget_id = ? ORDER BY id ASC', [budgetId]);

    res.render('budgets/edit', {
      title: 'Edit RAB',
      user: req.session.userName,
      committee,
      budget: budgetRows[0],
      items,
      errors: [],
    });
  } catch (err) { next(err); }
};

// POST /committees/:id/budgets/:budgetId/update
const budgetUpdate = async (req, res, next) => {
  try {
    const { id: committeeId, budgetId } = req.params;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [budgetRows] = await db.query('SELECT * FROM committee_budgets WHERE id = ? AND committee_id = ?', [budgetId, committeeId]);
    if (budgetRows.length === 0) return res.status(404).render('error', { message: 'RAB tidak ditemukan.', error: { status: 404, stack: '' } });

    const { name, description } = req.body;
    const errors = [];
    if (!name || !name.trim()) errors.push('Nama RAB wajib diisi.');

    const itemNames       = [].concat(req.body['item_name[]']       || req.body['item_name']       || []);
    const itemQtys        = [].concat(req.body['item_qty[]']        || req.body['item_qty']        || []);
    const itemUnitPrices  = [].concat(req.body['item_unit_price[]'] || req.body['item_unit_price'] || []);

    const items = [];
    for (let i = 0; i < itemNames.length; i++) {
      const iName = (itemNames[i] || '').trim();
      const qty   = parseFloat(itemQtys[i]) || 0;
      const price = parseFloat((itemUnitPrices[i] || '').replace(/[^0-9.]/g, '')) || 0;
      if (iName) items.push({ name: iName, quantity: qty, unit_price: price, total_price: qty * price });
    }
    if (items.length === 0) errors.push('Minimal harus ada satu item anggaran.');

    if (errors.length > 0) {
      const [existingItems] = await db.query('SELECT * FROM committee_budget_items WHERE committee_budget_id = ? ORDER BY id ASC', [budgetId]);
      return res.render('budgets/edit', {
        title: 'Edit RAB', user: req.session.userName, committee, budget: budgetRows[0], items: existingItems, errors,
      });
    }

    const totalAmount = items.reduce((s, it) => s + it.total_price, 0);

    await db.query(
      'UPDATE committee_budgets SET name = ?, description = ?, total_amount = ?, updated_at = NOW() WHERE id = ?',
      [name.trim(), description || null, totalAmount, budgetId]
    );

    // Replace items
    await db.query('DELETE FROM committee_budget_items WHERE committee_budget_id = ?', [budgetId]);
    for (const item of items) {
      await db.query(
        `INSERT INTO committee_budget_items (committee_budget_id, name, quantity, unit_price, total_price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [budgetId, item.name, item.quantity, item.unit_price, item.total_price]
      );
    }

    req.session.toast = { message: 'RAB berhasil diperbarui!', type: 'success' };
    res.redirect(`/committees/${committeeId}/budgets/${budgetId}`);
  } catch (err) { next(err); }
};

// POST /committees/:id/budgets/:budgetId/delete
const budgetDestroy = async (req, res, next) => {
  try {
    const { id: committeeId, budgetId } = req.params;
    await db.query('DELETE FROM committee_budgets WHERE id = ? AND committee_id = ?', [budgetId, committeeId]);
    req.session.toast = { message: 'RAB berhasil dihapus!', type: 'success' };
    res.redirect(`/committees/${committeeId}/budgets`);
  } catch (err) { next(err); }
};

// GET /committees/:id/budgets/:budgetId/export-excel
const exportExcel = async (req, res, next) => {
  try {
    let ExcelJS;
    try {
      ExcelJS = require('exceljs');
    } catch (e) {
      return res.status(500).json({ error: 'exceljs tidak terinstall. Jalankan: npm install exceljs' });
    }

    const { id: committeeId, budgetId } = req.params;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).send('Kepanitiaan tidak ditemukan.');

    const [budgetRows] = await db.query('SELECT * FROM committee_budgets WHERE id = ? AND committee_id = ?', [budgetId, committeeId]);
    if (budgetRows.length === 0) return res.status(404).send('RAB tidak ditemukan.');

    const [items] = await db.query(
      `SELECT cbi.*,
              COALESCE(SUM(ce.amount), 0) AS used_amount
       FROM committee_budget_items cbi
       LEFT JOIN committee_expenses ce ON ce.committee_budget_item_id = cbi.id AND ce.status = 'approved'
       WHERE cbi.committee_budget_id = ?
       GROUP BY cbi.id ORDER BY cbi.id ASC`,
      [budgetId]
    );

    const budget = budgetRows[0];

    const workbook  = new ExcelJS.Workbook();
    workbook.creator = 'Facultyware FTI Unand';

    const ws = workbook.addWorksheet('RAB');

    // ── Header section ──────────────────────────────────────────────────
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = 'RENCANA ANGGARAN BIAYA (RAB)';
    ws.getCell('A1').font  = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `Kepanitiaan: ${committee.name}`;
    ws.getCell('A2').font  = { size: 11 };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:G3');
    ws.getCell('A3').value = `Nama RAB: ${budget.name}`;
    ws.getCell('A3').alignment = { horizontal: 'center' };

    if (budget.description) {
      ws.mergeCells('A4:G4');
      ws.getCell('A4').value = `Keterangan: ${budget.description}`;
      ws.getCell('A4').alignment = { horizontal: 'center' };
    }

    ws.addRow([]);

    // ── Table header ────────────────────────────────────────────────────
    const headerRow = ws.addRow(['No', 'Nama Item', 'Qty', 'Harga Satuan (Rp)', 'Total Anggaran (Rp)', 'Realisasi (Rp)', 'Sisa (Rp)']);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 20;

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 35;
    ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 20;
    ws.getColumn(5).width = 22;
    ws.getColumn(6).width = 18;
    ws.getColumn(7).width = 18;

    const numFmt = '#,##0';
    let grandTotal = 0, grandUsed = 0;

    items.forEach((item, idx) => {
      const sisa = parseFloat(item.total_price) - parseFloat(item.used_amount);
      grandTotal += parseFloat(item.total_price);
      grandUsed  += parseFloat(item.used_amount);

      const row = ws.addRow([
        idx + 1,
        item.name,
        item.quantity,
        parseFloat(item.unit_price),
        parseFloat(item.total_price),
        parseFloat(item.used_amount),
        sisa,
      ]);

      row.getCell(4).numFmt = numFmt;
      row.getCell(5).numFmt = numFmt;
      row.getCell(6).numFmt = numFmt;
      row.getCell(7).numFmt = numFmt;

      if (idx % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
      }
    });

    // ── Total row ───────────────────────────────────────────────────────
    const totalRow = ws.addRow(['', 'TOTAL', '', '', grandTotal, grandUsed, grandTotal - grandUsed]);
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } };
    totalRow.getCell(5).numFmt = numFmt;
    totalRow.getCell(6).numFmt = numFmt;
    totalRow.getCell(7).numFmt = numFmt;

    // ── Footer ──────────────────────────────────────────────────────────
    ws.addRow([]);
    ws.addRow(['', `Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`]);

    // ── Borders ─────────────────────────────────────────────────────────
    const firstDataRow = 7;  // row after headers
    const lastDataRow  = firstDataRow + items.length;
    for (let r = firstDataRow; r <= lastDataRow + 1; r++) {
      for (let c = 1; c <= 7; c++) {
        const cell = ws.getRow(r).getCell(c);
        cell.border = {
          top:    { style: 'thin' }, bottom: { style: 'thin' },
          left:   { style: 'thin' }, right:  { style: 'thin' },
        };
      }
    }

    const filename = `RAB_${committee.name.replace(/\s+/g, '_')}_${budget.name.replace(/\s+/g, '_')}.xlsx`;
    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

// =============================================================================
// EXPENSE CRUD
// =============================================================================

// POST /committees/:id/budgets/:budgetId/expenses  — submit expense
const expenseStore = (req, res, next) => {
  upload(req, res, async (uploadErr) => {
    try {
      const { id: committeeId, budgetId } = req.params;
      const { committee_budget_item_id, amount, description, expense_date } = req.body;
      const employeeId = req.session.employeeId || 1;

      const errors = [];
      if (uploadErr) errors.push(uploadErr.message);
      if (!committee_budget_item_id) errors.push('Item anggaran wajib dipilih.');
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push('Jumlah pengeluaran wajib diisi dan harus positif.');
      if (!expense_date) errors.push('Tanggal pengeluaran wajib diisi.');

      if (errors.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        req.session.toast = { message: errors.join('; '), type: 'error' };
        return res.redirect(`/committees/${committeeId}/budgets/${budgetId}`);
      }

      const receiptFile = req.file ? '/uploads/receipts/' + req.file.filename : null;

      await db.query(
        `INSERT INTO committee_expenses
           (committee_budget_item_id, amount, description, receipt_file, expense_date, status, employee_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'submitted', ?, NOW(), NOW())`,
        [committee_budget_item_id, parseFloat(amount), description || null, receiptFile, expense_date, employeeId]
      );

      req.session.toast = { message: 'Pengeluaran berhasil diajukan (menunggu persetujuan admin).', type: 'success' };
      res.redirect(`/committees/${committeeId}/budgets/${budgetId}`);
    } catch (err) { next(err); }
  });
};

// POST /committees/:id/budgets/:budgetId/expenses/:expenseId/approve
const expenseApprove = async (req, res, next) => {
  try {
    const { id: committeeId, budgetId, expenseId } = req.params;
    const approvedBy = req.session.employeeId || 1;

    await db.query(
      `UPDATE committee_expenses SET status = 'approved', approved_by = ?, updated_at = NOW() WHERE id = ?`,
      [approvedBy, expenseId]
    );

    // Update used_amount on the budget
    await db.query(
      `UPDATE committee_budgets cb
       SET used_amount = (
         SELECT COALESCE(SUM(ce.amount), 0)
         FROM committee_expenses ce
         JOIN committee_budget_items cbi ON ce.committee_budget_item_id = cbi.id
         WHERE cbi.committee_budget_id = cb.id AND ce.status = 'approved'
       ), updated_at = NOW()
       WHERE cb.id = ?`,
      [budgetId]
    );

    req.session.toast = { message: 'Pengeluaran berhasil disetujui!', type: 'success' };
    res.redirect(`/committees/${committeeId}/budgets/${budgetId}`);
  } catch (err) { next(err); }
};

// POST /committees/:id/budgets/:budgetId/expenses/:expenseId/reject
const expenseReject = async (req, res, next) => {
  try {
    const { id: committeeId, budgetId, expenseId } = req.params;
    const approvedBy = req.session.employeeId || 1;

    await db.query(
      `UPDATE committee_expenses SET status = 'rejected', approved_by = ?, updated_at = NOW() WHERE id = ?`,
      [approvedBy, expenseId]
    );

    req.session.toast = { message: 'Pengeluaran berhasil ditolak.', type: 'success' };
    res.redirect(`/committees/${committeeId}/budgets/${budgetId}`);
  } catch (err) { next(err); }
};

// POST /committees/:id/budgets/:budgetId/expenses/:expenseId/delete
const expenseDestroy = async (req, res, next) => {
  try {
    const { id: committeeId, budgetId, expenseId } = req.params;

    const [rows] = await db.query('SELECT * FROM committee_expenses WHERE id = ?', [expenseId]);
    if (rows.length > 0 && rows[0].receipt_file) {
      const filePath = path.join(__dirname, '../public', rows[0].receipt_file);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    }

    await db.query('DELETE FROM committee_expenses WHERE id = ?', [expenseId]);
    req.session.toast = { message: 'Pengeluaran berhasil dihapus!', type: 'success' };
    res.redirect(`/committees/${committeeId}/budgets/${budgetId}`);
  } catch (err) { next(err); }
};

module.exports = {
  budgetIndex, budgetCreate, budgetStore, budgetShow, budgetEdit, budgetUpdate, budgetDestroy,
  exportExcel,
  expenseStore, expenseApprove, expenseReject, expenseDestroy,
};
