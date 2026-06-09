// controllers/progressController.js
const db     = require('../lib/db');
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  AlignmentType,
} = require('docx');

// ─── Multer: upload attachment ────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../public/uploads/progress');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = 'progress_' + Date.now() + ext;
    cb(null, name);
  },
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE      = 5 * 1024 * 1024;

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Tipe file tidak diizinkan. Gunakan JPG, PNG, atau PDF.'));
  },
}).single('attachment');

// ─── ERROR HANDLER UTILITIES ─────────────────────────────────────────────────
const ErrorHandler = {

  detectMySQLError: (err) => {
    console.error('[ErrorHandler] MySQL Error:', err.code, err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST')  return { type: 'E1', message: 'Koneksi database terputus. Silakan coba lagi.', statusCode: 503 };
    if (err.code === 'ER_ACCESS_DENIED_ERROR')    return { type: 'E1', message: 'Akses database ditolak. Periksa konfigurasi.', statusCode: 503 };
    if (err.code === 'ECONNREFUSED')              return { type: 'E1', message: 'Database server tidak dapat dijangkau.', statusCode: 503 };
    if (err.code === 'ER_NO_SUCH_TABLE')          return { type: 'E2', message: 'Tabel database tidak ditemukan.', statusCode: 500 };
    if (err.code === 'ER_SYNTAX_ERROR')           return { type: 'E2', message: 'Syntax error dalam query database.', statusCode: 500 };
    if (err.code === 'ER_PARSE_ERROR')            return { type: 'E2', message: 'Parse error dalam query.', statusCode: 500 };
    if (err.code === 'ER_BAD_FIELD_ERROR')        return { type: 'E2', message: 'Kolom database tidak ditemukan.', statusCode: 500 };
    if (err.code === 'PROTOCOL_SEQUENCE_TIMEOUT') return { type: 'E5', message: 'Koneksi database timeout.', statusCode: 504 };
    if (err.message && (err.message.includes('timeout') || err.message.includes('Request timeout'))) {
      return { type: 'E5', message: 'Permintaan melebihi batas waktu.', statusCode: 504 };
    }
    return { type: 'E2', message: 'Terjadi kesalahan database. Kode: ' + (err.code || 'UNKNOWN'), statusCode: 500 };
  },

  validateResponse: (data) => {
    if (data === null || data === undefined) return { valid: false, error: 'Data null atau undefined' };
    if (!Array.isArray(data))               return { valid: false, error: 'Data bukan array' };
    return { valid: true };
  },

  renderError: (res, errorType, message, statusCode) => {
    console.error('[ErrorHandler] Render Error:', errorType, statusCode, message);
    res.status(statusCode).render('error', {
      message: '[' + errorType + '] ' + message,
      error: { status: statusCode, stack: '' },
    });
  },

};

// ─── Helper: ambil daftar task ────────────────────────────────────────────────
async function getTaskOptions() {
  const [tasks] = await db.query(`
    SELECT ct.id, ct.title, c.name AS committee_name
    FROM   committee_tasks ct
    JOIN   committees c ON ct.committee_id = c.id
    ORDER  BY c.name, ct.title
  `);
  return tasks;
}

// ─── GET /progresses ──────────────────────────────────────────────────────────
const index = async (req, res, next) => {
  try {
    // [E3] Validasi route — pastikan path /progresses valid (guard tambahan di level controller)
    // Note: E3 utama (404 route tidak ditemukan) ditangani Express-level via notFoundHandler,
    // tapi kita tambah guard eksplisit di sini untuk konsistensi flow dokumentasi.
    const allowedPath = '/progresses';
    if (req.path !== '/' && !req.path.startsWith(allowedPath.replace('/progresses', ''))) {
      return ErrorHandler.renderError(res, 'E3 - Route Not Found', 'Halaman atau data tidak ditemukan.', 404);
    }

    // [Main Flow] Query INNER JOIN — hanya ambil progress yang relasi task & committee-nya masih valid.
    // [A3] Jika task/committee sudah dihapus, progress tersebut tidak akan muncul (by design INNER JOIN).
    //      Jika ingin tetap menampilkan progress "yatim", ganti ke LEFT JOIN.
    const queryPromise = db.query(`
      SELECT ctp.id, ctp.description, ctp.progress_date, ctp.status, ctp.attachment,
             ct.title AS task_title, c.name AS committee_name
      FROM   committee_task_progress ctp
      INNER  JOIN committee_tasks ct ON ctp.committee_task_id = ct.id
      INNER  JOIN committees      c  ON ct.committee_id       = c.id
      ORDER  BY ctp.progress_date DESC
    `);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 5000)
    );
    const [rows] = await Promise.race([queryPromise, timeoutPromise]);

    // [E6] Validasi format response sebelum render
    const validation = ErrorHandler.validateResponse(rows);
    if (!validation.valid) return ErrorHandler.renderError(res, 'E6 - Invalid Response', 'Format data tidak valid: ' + validation.error, 500);

    // [A1] Data kosong — rows tetap array kosong [], view akan tampilkan pesan "Belum ada progress project"
    res.render('progresses/index', { title: 'Progress Project', progresses: rows, user: req.session.userName || 'Admin' });

  } catch (err) {
    const e = ErrorHandler.detectMySQLError(err);
    if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1 - Database Connection Error', e.message, e.statusCode);
    if (e.type === 'E2') return ErrorHandler.renderError(res, 'E2 - Query Database Error',      e.message, e.statusCode);
    if (e.type === 'E5') return ErrorHandler.renderError(res, 'E5 - Request Timeout',           e.message, e.statusCode);
    console.error('[E4] Unhandled Error in index:', err.message);
    next(err);
  }
};

// ─── GET /progresses/create ───────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const tasks = await getTaskOptions();
    const validation = ErrorHandler.validateResponse(tasks);
    if (!validation.valid) return ErrorHandler.renderError(res, 'E6 - Invalid Response', 'Format data tidak valid.', 500);

    const defaultOld = req.query.task_id ? { committee_task_id: req.query.task_id } : {};
    res.render('progresses/create', { title: 'Tambah Progress', tasks, errors: [], old: defaultOld, user: req.session.userName });

  } catch (err) {
    const e = ErrorHandler.detectMySQLError(err);
    if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1 - Database Connection Error', e.message, 503);
    if (e.type === 'E5') return ErrorHandler.renderError(res, 'E5 - Request Timeout',           e.message, 504);
    return ErrorHandler.renderError(res, 'E2 - Query Error', 'Gagal memuat form tambah progress.', 500);
  }
};

// ─── POST /progresses ─────────────────────────────────────────────────────────
const store = (req, res, next) => {
  upload(req, res, async (uploadErr) => {
    try {
      const tasks = await getTaskOptions();

      if (uploadErr) {
        return res.render('progresses/create', { title: 'Tambah Progress', tasks, errors: [uploadErr.message], old: req.body, user: req.session.userName });
      }

      const { committee_task_id, description, status, progress_date } = req.body;
      const errors = [];
      if (!committee_task_id)                  errors.push('Task wajib dipilih.');
      if (!description || !description.trim()) errors.push('Deskripsi progress wajib diisi.');
      if (!status)                             errors.push('Status wajib dipilih.');
      if (!progress_date)                      errors.push('Tanggal progress wajib diisi.');

      if (committee_task_id) {
        const [taskCheck] = await db.query('SELECT id FROM committee_tasks WHERE id = ?', [committee_task_id]);
        if (taskCheck.length === 0) errors.push('Task yang dipilih tidak valid.');
      }

      if (errors.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.render('progresses/create', { title: 'Tambah Progress', tasks, errors, old: req.body, user: req.session.userName });
      }

      const attachment = req.file ? '/uploads/progress/' + req.file.filename : null;
      await db.query(
        `INSERT INTO committee_task_progress
           (committee_task_id, description, status, progress_date, attachment, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [committee_task_id, description.trim(), status, progress_date, attachment]
      );

      res.redirect('/progresses');

    } catch (err) {
      const e = ErrorHandler.detectMySQLError(err);
      if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1 - Database Connection Error', e.message, 503);
      return ErrorHandler.renderError(res, 'E2 - Query Error', 'Gagal menyimpan data progress.', 500);
    }
  });
};

// ─── GET /progresses/:id ──────────────────────────────────────────────────────
// ─── GET /progresses/:id ──────────────────────────────────────────────────────
const show = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) return ErrorHandler.renderError(res, 'E1', 'Progress project tidak ditemukan.', 400);

    const queryPromise = db.query(`
      SELECT ctp.id, ctp.description, ctp.progress_date, ctp.status, ctp.attachment,
             ctp.created_at, ctp.updated_at,
             ct.title AS task_title, c.name AS committee_name
      FROM   committee_task_progress ctp
      LEFT   JOIN committee_tasks ct ON ctp.committee_task_id = ct.id
      LEFT   JOIN committees      c  ON ct.committee_id       = c.id
      WHERE  ctp.id = ?
    `, [id]);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 5000)
    );
    const [rows] = await Promise.race([queryPromise, timeoutPromise]);

    const validation = ErrorHandler.validateResponse(rows);
    if (!validation.valid) return ErrorHandler.renderError(res, 'E6', 'Format data tidak valid.', 500);
    if (rows.length === 0) return ErrorHandler.renderError(res, 'E1', 'Progress project tidak ditemukan.', 404);

    res.render('progresses/show', { title: 'Detail Progress', progress: rows[0], user: req.session.userName });

  } catch (err) {
    const e = ErrorHandler.detectMySQLError(err);
    if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1', e.message, 503);
    if (e.type === 'E5') return ErrorHandler.renderError(res, 'E5', e.message, 504);
    return ErrorHandler.renderError(res, 'E2', 'Gagal mengambil detail progress.', 500);
  }
};

// ─── GET /progresses/:id/edit ─────────────────────────────────────────────────
const edit = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) return ErrorHandler.renderError(res, 'E1', 'Progress project tidak ditemukan.', 400);

    const queryPromise = db.query('SELECT * FROM committee_task_progress WHERE id = ?', [id]);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 5000)
    );
    const [rows] = await Promise.race([queryPromise, timeoutPromise]);

    if (rows.length === 0) return ErrorHandler.renderError(res, 'E1', 'Progress project tidak ditemukan.', 404);

    const tasks      = await getTaskOptions();
    const validation = ErrorHandler.validateResponse(tasks);
    if (!validation.valid) return ErrorHandler.renderError(res, 'E6', 'Format data tidak valid.', 500);

    res.render('progresses/edit', { title: 'Edit Progress', progress: rows[0], tasks, errors: [], user: req.session.userName });

  } catch (err) {
    const e = ErrorHandler.detectMySQLError(err);
    if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1', e.message, 503);
    if (e.type === 'E5') return ErrorHandler.renderError(res, 'E5', e.message, 504);
    return ErrorHandler.renderError(res, 'E2', 'Gagal memuat data edit.', 500);
  }
};

// ─── POST /progresses/:id/update ─── / PUT /progresses/:id ──────────────────
const update = (req, res, next) => {
  upload(req, res, async (uploadErr) => {
    try {
      const { id } = req.params;
      if (!id || isNaN(id)) {
        return ErrorHandler.renderError(res, 'E1', 'Progress project tidak ditemukan.', 400);
      }

      let existing;
      try {
        [existing] = await db.query('SELECT * FROM committee_task_progress WHERE id = ?', [id]);
      } catch (dbErr) {
        return ErrorHandler.renderError(res, 'E5', 'Terjadi kesalahan saat memperbarui data.', 500);
      }

      if (existing.length === 0) {
        return ErrorHandler.renderError(res, 'E1', 'Progress project tidak ditemukan.', 404);
      }

      const old   = existing[0];
      const tasks = await getTaskOptions();

      if (uploadErr) {
        return res.render('progresses/edit', { title: 'Edit Progress', progress: { ...old, ...req.body, id }, tasks, errors: [uploadErr.message], user: req.session.userName });
      }

      const { committee_task_id, description, status, progress_date } = req.body;
      const errors = [];
      const hasMissingMandatory = !description || !description.trim() || !status || !progress_date;
      
      if (hasMissingMandatory) {
        errors.push('Field wajib harus diisi.');
      }
      if (!committee_task_id)                  errors.push('Task wajib dipilih.');
      if (!description || !description.trim()) errors.push('Deskripsi progress wajib diisi.');
      if (!status)                             errors.push('Status wajib dipilih.');
      if (!progress_date)                      errors.push('Tanggal progress wajib diisi.');

      if (committee_task_id) {
        const [taskCheck] = await db.query('SELECT id FROM committee_tasks WHERE id = ?', [committee_task_id]);
        if (taskCheck.length === 0) errors.push('Task yang dipilih tidak valid.');
      }

      // Format dates locally to avoid timezone mismatch
      const formatDate = (d) => {
        if (!d) return '';
        const date = new Date(d);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      };

      const oldDateStr = formatDate(old.progress_date);
      const newDateStr = formatDate(progress_date);

      const isUnchanged =
        Number(committee_task_id) === Number(old.committee_task_id) &&
        description.trim() === (old.description || '').trim() &&
        status === old.status &&
        newDateStr === oldDateStr &&
        !req.file;

      if (errors.length === 0 && isUnchanged) {
        errors.push('Tidak ada perubahan data.');
      }

      if (errors.length > 0) {
        if (req.file) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        return res.render('progresses/edit', { title: 'Edit Progress', progress: { ...old, ...req.body, id }, tasks, errors, user: req.session.userName });
      }

      let attachment = old.attachment;
      if (req.file) {
        if (old.attachment) {
          const oldPath = path.join(__dirname, '../public', old.attachment);
          try {
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          } catch (_) {}
        }
        attachment = '/uploads/progress/' + req.file.filename;
      }

      try {
        await db.query(
          `UPDATE committee_task_progress
           SET committee_task_id = ?, description = ?, status = ?,
               progress_date = ?, attachment = ?, updated_at = NOW()
           WHERE id = ?`,
          [committee_task_id, description.trim(), status, progress_date, attachment, id]
        );
      } catch (dbErr) {
        return ErrorHandler.renderError(res, 'E5', 'Terjadi kesalahan saat memperbarui data.', 500);
      }

      res.redirect('/progresses');

    } catch (err) {
      const e = ErrorHandler.detectMySQLError(err);
      if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1', e.message, 503);
      if (e.type === 'E5') return ErrorHandler.renderError(res, 'E5', e.message, 504);
      return ErrorHandler.renderError(res, 'E5', 'Terjadi kesalahan saat memperbarui data.', 500);
    }
  });
};

// ─── POST /progresses/:id/delete ─── / DELETE /progresses/:id ────────────────
const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return ErrorHandler.renderError(res, 'E1', 'Progress project tidak ditemukan.', 400);
    }

    let rows;
    try {
      [rows] = await db.query('SELECT * FROM committee_task_progress WHERE id = ?', [id]);
    } catch (dbErr) {
      return ErrorHandler.renderError(res, 'E3', 'Terjadi kesalahan saat menghapus data.', 500);
    }

    if (rows.length === 0) {
      return ErrorHandler.renderError(res, 'A2', 'Data progress sudah tidak tersedia.', 404);
    }

    const progress = rows[0];
    if (progress.attachment) {
      const filePath = path.join(__dirname, '../public', progress.attachment);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('[destroy] File deletion failed:', err);
        return ErrorHandler.renderError(res, 'E8', 'Gagal menghapus attachment file.', 500);
      }
    }

    try {
      await db.query('DELETE FROM committee_task_progress WHERE id = ?', [id]);
    } catch (dbErr) {
      return ErrorHandler.renderError(res, 'E3', 'Terjadi kesalahan saat menghapus data.', 500);
    }

    res.redirect('/progresses');

  } catch (err) {
    const e = ErrorHandler.detectMySQLError(err);
    if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1', e.message, 503);
    return ErrorHandler.renderError(res, 'E3', 'Terjadi kesalahan saat menghapus data.', 500);
  }
};

// ─── GET /progresses/:id/export-docx ─────────────────────────────────────────
const exportDocx = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) return ErrorHandler.renderError(res, 'E3 - Invalid ID', 'ID progress tidak valid.', 400);

    const [rows] = await db.query(`
      SELECT ctp.id, ctp.description, ctp.progress_date, ctp.status,
             ctp.attachment, ctp.created_at, ctp.updated_at,
             ct.title AS task_title, c.name AS committee_name
      FROM   committee_task_progress ctp
      LEFT   JOIN committee_tasks ct ON ctp.committee_task_id = ct.id
      LEFT   JOIN committees      c  ON ct.committee_id       = c.id
      WHERE  ctp.id = ?
    `, [id]);

    if (rows.length === 0) return ErrorHandler.renderError(res, 'E3 - Not Found', 'Progress tidak ditemukan.', 404);

    const p = rows[0];

    const formatDate = (d) => d
      ? new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : '-';

    const statusLabel = p.status === 'done' ? 'Done' : 'In Progress';

    const makeRow = (label, value) => new TableRow({
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 22 })] })],
        }),
        new TableCell({
          width: { size: 5, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: ':', size: 22 })] })],
        }),
        new TableCell({
          width: { size: 60, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: value || '-', size: 22 })] })],
        }),
      ],
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: 'LAPORAN PROGRESS PROJECT',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Facultyware - FTI Project', size: 22, color: '666666' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              makeRow('ID Progress', String(p.id)),
              makeRow('Committee',   p.committee_name),
              makeRow('Task',        p.task_title),
              makeRow('Status',      statusLabel),
              makeRow('Tanggal',     formatDate(p.progress_date)),
              makeRow('Attachment',  p.attachment ? p.attachment.split('/').pop() : 'Tidak ada'),
            ],
          }),
          new Paragraph({ text: '', spacing: { after: 300 } }),
          new Paragraph({
            children: [new TextRun({ text: 'Deskripsi Progress', bold: true, size: 26 })],
            spacing: { after: 160 },
          }),
          new Paragraph({
            children: [new TextRun({ text: p.description || '-', size: 22 })],
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [new TextRun({
              text: 'Diekspor pada: ' + new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
              size: 18, color: '999999', italics: true,
            })],
            alignment: AlignmentType.RIGHT,
          }),
        ],
      }],
    });

    const buffer   = await Packer.toBuffer(doc);
    const filename = 'progress_' + id + '_' + Date.now() + '.docx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(buffer);

  } catch (err) {
    console.error('[exportDocx] Error:', err.message);
    const e = ErrorHandler.detectMySQLError(err);
    if (e.type === 'E1') return ErrorHandler.renderError(res, 'E1 - Database Connection Error', e.message, 503);
    return ErrorHandler.renderError(res, 'E2 - Export Error', 'Gagal mengekspor dokumen DOCX.', 500);
  }
};

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = { index, create, store, show, edit, update, destroy, exportDocx };