const db = require('../lib/db');

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const EVENT_TYPES = ['seminar', 'workshop', 'training', 'conference', 'webinar', 'other'];
const DELIVERY_MODES = ['offline', 'online', 'hybrid'];
const STATUSES = ['draft', 'published', 'closed', 'cancelled'];

function validateProject(data) {
  const errors = [];

  if (!data.title || data.title.trim() === '')
    errors.push('Judul proyek wajib diisi.');
  if (data.title && data.title.trim().length > 255)
    errors.push('Judul proyek maksimal 255 karakter.');

  if (!data.event_type || !EVENT_TYPES.includes(data.event_type))
    errors.push('Tipe kegiatan tidak valid. Pilih salah satu: ' + EVENT_TYPES.join(', '));

  if (!data.delivery_mode || !DELIVERY_MODES.includes(data.delivery_mode))
    errors.push('Mode pelaksanaan tidak valid. Pilih salah satu: ' + DELIVERY_MODES.join(', '));

  if (!data.start_date)
    errors.push('Tanggal mulai wajib diisi.');
  if (!data.end_date)
    errors.push('Tanggal selesai wajib diisi.');
  if (data.start_date && data.end_date && data.end_date < data.start_date)
    errors.push('Tanggal selesai harus sama atau setelah tanggal mulai.');

  if (!data.status || !STATUSES.includes(data.status))
    errors.push('Status tidak valid. Pilih salah satu: ' + STATUSES.join(', '));

  if (data.quota && data.quota !== '') {
    const q = parseInt(data.quota);
    if (isNaN(q) || q < 1)
      errors.push('Kuota harus berupa angka positif.');
  }

  return errors;
}

// ─── Web Controllers ─────────────────────────────────────────────────────────

// GET /projects
const index = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 10;
    const offset = (page - 1) * limit;

    const search      = req.query.search || '';
    const filterType  = req.query.event_type || '';
    const filterStatus = req.query.status || '';

    const whereClauses = [];
    const params = [];

    if (search) {
      whereClauses.push('(e.title LIKE ? OR e.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (filterType) {
      whereClauses.push('e.event_type = ?');
      params.push(filterType);
    }
    if (filterStatus) {
      whereClauses.push('e.status = ?');
      params.push(filterStatus);
    }

    const whereSQL = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM events e ${whereSQL}`,
      params
    );
    const totalPages = Math.ceil(total / limit);

    const [projects] = await db.query(
      `SELECT e.id, e.title, e.slug, e.event_type, e.delivery_mode,
              e.start_date, e.end_date, e.status, e.quota, e.created_at,
              emp.name AS creator_name
       FROM events e
       LEFT JOIN employees emp ON e.created_by = emp.id
       ${whereSQL}
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.render('projects/index', {
      title: 'Manajemen Proyek',
      user: req.session.userName,
      projects,
      pagination: { page, totalPages, total, limit },
      filters: { search, event_type: filterType, status: filterStatus },
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

    const {
      title, description, objectives, event_type, delivery_mode,
      start_date, end_date, start_time, end_time, venue,
      online_platform, online_link, quota, registration_deadline, status,
    } = req.body;

    // Generate unique slug
    let slug = generateSlug(title.trim());
    const [[{ count: slugCount }]] = await db.query(
      'SELECT COUNT(*) AS count FROM events WHERE slug = ?', [slug]
    );
    if (slugCount > 0) slug = `${slug}-${Date.now()}`;

    const createdBy = req.session.employeeId || 1;

    await db.query(
      `INSERT INTO events
         (title, slug, description, objectives, event_type, delivery_mode,
          start_date, end_date, start_time, end_time, venue, online_platform,
          online_link, quota, registration_deadline, status, created_by,
          created_by_id, published_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        title.trim(), slug,
        description || null, objectives || null,
        event_type, delivery_mode,
        start_date, end_date,
        start_time || null, end_time || null,
        venue || null, online_platform || null, online_link || null,
        quota ? parseInt(quota) : null,
        registration_deadline || null,
        status, createdBy, createdBy, createdBy,
      ]
    );

    res.redirect('/projects');
  } catch (err) {
    next(err);
  }
};

// GET /projects/:id
const show = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*, emp.name AS creator_name
       FROM events e
       LEFT JOIN employees emp ON e.created_by = emp.id
       WHERE e.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).render('error', {
        message: 'Proyek tidak ditemukan.',
        error: { status: 404, stack: '' },
      });
    }

    res.render('projects/show', {
      title: rows[0].title,
      user: req.session.userName,
      project: rows[0],
    });
  } catch (err) {
    next(err);
  }
};

// GET /projects/:id/edit
const edit = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM events WHERE id = ?', [req.params.id]);

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
    const [existing] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
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

    const {
      title, description, objectives, event_type, delivery_mode,
      start_date, end_date, start_time, end_time, venue,
      online_platform, online_link, quota, registration_deadline, status,
    } = req.body;

    // Regenerate slug only if title changed
    let slug = existing[0].slug;
    if (title.trim() !== existing[0].title) {
      slug = generateSlug(title.trim());
      const [[{ count: slugCount }]] = await db.query(
        'SELECT COUNT(*) AS count FROM events WHERE slug = ? AND id != ?', [slug, id]
      );
      if (slugCount > 0) slug = `${slug}-${Date.now()}`;
    }

    await db.query(
      `UPDATE events SET
         title = ?, slug = ?, description = ?, objectives = ?,
         event_type = ?, delivery_mode = ?,
         start_date = ?, end_date = ?,
         start_time = ?, end_time = ?,
         venue = ?, online_platform = ?, online_link = ?,
         quota = ?, registration_deadline = ?,
         status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        title.trim(), slug,
        description || null, objectives || null,
        event_type, delivery_mode,
        start_date, end_date,
        start_time || null, end_time || null,
        venue || null, online_platform || null, online_link || null,
        quota ? parseInt(quota) : null,
        registration_deadline || null,
        status, id,
      ]
    );

    res.redirect(`/projects/${id}`);
  } catch (err) {
    next(err);
  }
};

// POST /projects/:id/delete
const destroy = async (req, res, next) => {
  try {
    await db.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.redirect('/projects');
  } catch (err) {
    next(err);
  }
};

// ─── REST API Controllers ────────────────────────────────────────────────────

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
      whereClauses.push('(title LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (req.query.event_type) {
      whereClauses.push('event_type = ?');
      params.push(req.query.event_type);
    }
    if (req.query.status) {
      whereClauses.push('status = ?');
      params.push(req.query.status);
    }

    const whereSQL = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM events ${whereSQL}`, params
    );
    const totalPages = Math.ceil(total / limit);

    const [projects] = await db.query(
      `SELECT id, title, slug, event_type, delivery_mode,
              start_date, end_date, status, quota, created_at
       FROM events ${whereSQL}
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
    const [rows] = await db.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
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

    const {
      title, description, objectives, event_type, delivery_mode,
      start_date, end_date, start_time, end_time, venue,
      online_platform, online_link, quota, registration_deadline, status,
    } = req.body;

    let slug = generateSlug(title.trim());
    const [[{ count: slugCount }]] = await db.query(
      'SELECT COUNT(*) AS count FROM events WHERE slug = ?', [slug]
    );
    if (slugCount > 0) slug = `${slug}-${Date.now()}`;

    const createdBy = 1;

    const [result] = await db.query(
      `INSERT INTO events
         (title, slug, description, objectives, event_type, delivery_mode,
          start_date, end_date, start_time, end_time, venue, online_platform,
          online_link, quota, registration_deadline, status, created_by,
          created_by_id, published_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        title.trim(), slug,
        description || null, objectives || null,
        event_type, delivery_mode,
        start_date, end_date,
        start_time || null, end_time || null,
        venue || null, online_platform || null, online_link || null,
        quota ? parseInt(quota) : null,
        registration_deadline || null,
        status, createdBy, createdBy, createdBy,
      ]
    );

    const [newProject] = await db.query('SELECT * FROM events WHERE id = ?', [result.insertId]);
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
