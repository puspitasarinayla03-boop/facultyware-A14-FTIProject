const db = require('../lib/db');

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES = ['draft', 'active', 'completed', 'cancelled'];

// ─── Validation ───────────────────────────────────────────────────────────────
function validateProject(data) {
  const errors = [];

  if (!data.name || data.name.trim() === '')
    errors.push('Nama kegiatan wajib diisi.');
  if (data.name && data.name.trim().length > 255)
    errors.push('Nama kegiatan maksimal 255 karakter.');

  if (!data.objective || data.objective.trim() === '')
    errors.push('Tujuan kegiatan wajib diisi.');

  if (!data.start_date)
    errors.push('Tanggal mulai wajib diisi.');
  if (data.start_date && data.end_date && data.end_date < data.start_date)
    errors.push('Tanggal selesai harus sama atau setelah tanggal mulai.');

  if (!data.status || !STATUSES.includes(data.status))
    errors.push('Status tidak valid.');

  return errors;
}

// ─── Web Controllers ─────────────────────────────────────────────────────────

// GET /projects
const index = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 10;
    const offset = (page - 1) * limit;

    const search       = req.query.search || '';
    const filterStatus = req.query.status || '';

    const whereClauses = [];
    const params = [];

    if (search) {
      whereClauses.push('(c.name LIKE ? OR c.description LIKE ? OR c.objective LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (filterStatus) {
      whereClauses.push('c.status = ?');
      params.push(filterStatus);
    }

    // Exclude committees that already have members (those are managed under Kepanitiaan)
    // Projects are committees without member data — show all committees as projects here
    const whereSQL = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM committees c ${whereSQL}`,
      params
    );
    const totalPages = Math.ceil(total / limit);

    const [projects] = await db.query(
      `SELECT c.id, c.name, c.status, c.start_date, c.end_date, c.objective,
              c.description, c.created_at,
              emp.name AS creator_name,
              (SELECT COUNT(*) FROM committee_members cm WHERE cm.committee_id = c.id) AS member_count
       FROM committees c
       LEFT JOIN employees emp ON c.created_by = emp.id
       ${whereSQL}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.render('projects/index', {
      title: 'Kelola Proyek',
      user: req.session.userName,
      projects,
      pagination: { page, totalPages, total, limit },
      filters: { search, status: filterStatus },
      query: req.query,
    });
  } catch (err) {
    next(err);
  }
};

// GET /projects/create
const create = (req, res) => {
  res.render('projects/create', {
    title: 'Buat Proyek Baru',
    user: req.session.userName,
    errors: [],
    old: {},
  });
};

// POST /projects
const store = async (req, res, next) => {
  try {
    const errors = validateProject(req.body);
    if (errors.length > 0) {
      return res.render('projects/create', {
        title: 'Buat Proyek Baru',
        user: req.session.userName,
        errors,
        old: req.body,
      });
    }

    const { name, description, objective, expected_outcome, start_date, end_date, status } = req.body;
    const createdBy = req.session.employeeId || 1;

    await db.query(
      `INSERT INTO committees
         (name, description, objective, expected_outcome,
          start_date, end_date, status,
          created_by, employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        name.trim(),
        description || null,
        objective.trim(),
        expected_outcome || null,
        start_date,
        end_date || null,
        status,
        createdBy,
        createdBy,
      ]
    );

    req.session.toast = { message: 'Proyek berhasil dibuat!', type: 'success' };
    res.redirect('/projects');
  } catch (err) {
    next(err);
  }
};

// GET /projects/:id
const show = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, emp.name AS creator_name
       FROM committees c
       LEFT JOIN employees emp ON c.created_by = emp.id
       WHERE c.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).render('error', {
        message: 'Proyek tidak ditemukan.',
        error: { status: 404, stack: '' },
      });
    }

    const [memberCount] = await db.query(
      'SELECT COUNT(*) AS total FROM committee_members WHERE committee_id = ?',
      [req.params.id]
    );

    res.render('projects/show', {
      title: rows[0].name,
      user: req.session.userName,
      project: rows[0],
      memberCount: memberCount[0].total,
      query: req.query,
    });
  } catch (err) {
    next(err);
  }
};

// GET /projects/:id/edit
const edit = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM committees WHERE id = ?', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).render('error', {
        message: 'Proyek tidak ditemukan.',
        error: { status: 404, stack: '' },
      });
    }

    res.render('projects/edit', {
      title: 'Edit Proyek',
      user: req.session.userName,
      project: rows[0],
      errors: [],
    });
  } catch (err) {
    next(err);
  }
};

// POST /projects/:id/update
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM committees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).render('error', {
        message: 'Proyek tidak ditemukan.',
        error: { status: 404, stack: '' },
      });
    }

    const errors = validateProject(req.body);
    if (errors.length > 0) {
      return res.render('projects/edit', {
        title: 'Edit Proyek',
        user: req.session.userName,
        project: { ...existing[0], ...req.body, id },
        errors,
      });
    }

    const { name, description, objective, expected_outcome, start_date, end_date, status } = req.body;

    await db.query(
      `UPDATE committees SET
         name = ?, description = ?, objective = ?, expected_outcome = ?,
         start_date = ?, end_date = ?,
         status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name.trim(),
        description || null,
        objective.trim(),
        expected_outcome || null,
        start_date,
        end_date || null,
        status,
        id,
      ]
    );

    req.session.toast = { message: 'Proyek berhasil diperbarui!', type: 'success' };
    res.redirect(`/projects/${id}`);
  } catch (err) {
    next(err);
  }
};

// POST /projects/:id/delete
const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Only delete if no committee members are attached
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM committee_members WHERE committee_id = ?', [id]
    );
    if (total > 0) {
      // Redirect back with error message — cannot delete a project that has members
      return res.redirect(`/projects?error=has_members`);
    }
    await db.query('DELETE FROM committees WHERE id = ?', [id]);
    req.session.toast = { message: 'Proyek berhasil dihapus!', type: 'success' };
    res.redirect('/projects');
  } catch (err) {
    next(err);
  }
};

// ─── REST API Controllers ─────────────────────────────────────────────────────

// GET /api/projects
const apiIndex = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const whereClauses = [];
    const params = [];

    if (search) {
      whereClauses.push('(name LIKE ? OR description LIKE ? OR objective LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.status) {
      whereClauses.push('status = ?');
      params.push(req.query.status);
    }

    const whereSQL = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM committees ${whereSQL}`, params
    );
    const totalPages = Math.ceil(total / limit);

    const [projects] = await db.query(
      `SELECT id, name, description, objective, start_date, end_date, status, created_at
       FROM committees ${whereSQL}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      message: 'Data retrieved successfully',
      data: projects,
      pagination: { total, page, limit, totalPages },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

// GET /api/projects/:id
const apiShow = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, emp.name AS creator_name
       FROM committees c
       LEFT JOIN employees emp ON c.created_by = emp.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found', data: null });
    }
    res.json({ success: true, message: 'Data retrieved successfully', data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

// POST /api/projects
const apiStore = async (req, res) => {
  try {
    const errors = validateProject(req.body);
    if (errors.length > 0) {
      return res.status(422).json({ success: false, message: errors.join('; '), data: null });
    }

    const { name, description, objective, expected_outcome, start_date, end_date, status } = req.body;
    const createdBy = 1;

    const [result] = await db.query(
      `INSERT INTO committees
         (name, description, objective, expected_outcome,
          start_date, end_date, status,
          created_by, employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        name.trim(),
        description || null,
        objective.trim(),
        expected_outcome || null,
        start_date,
        end_date || null,
        status,
        createdBy,
        createdBy,
      ]
    );

    const [newProject] = await db.query('SELECT * FROM committees WHERE id = ?', [result.insertId]);
    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: newProject[0],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

module.exports = {
  index, create, store, show, edit, update, destroy,
  apiIndex, apiShow, apiStore,
};
