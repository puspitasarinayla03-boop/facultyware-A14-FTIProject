// controllers/taskController.js
const db = require('../lib/db');

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getCommittee(id) {
  const [rows] = await db.query('SELECT id, name FROM committees WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

async function getMembers(committeeId) {
  const [rows] = await db.query(
    `SELECT cm.id, e.name, cm.role
     FROM committee_members cm
     JOIN employees e ON cm.employee_id = e.id
     WHERE cm.committee_id = ?
     ORDER BY e.name ASC`,
    [committeeId]
  );
  return rows;
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateTask(body) {
  const errors = [];
  const { title, status, priority, committee_member_id } = body;
  if (!title || !title.trim())                          errors.push('Judul task wajib diisi.');
  if (!['todo','in_progress','done','blocked'].includes(status)) errors.push('Status tidak valid.');
  if (!['low','medium','high'].includes(priority))      errors.push('Prioritas tidak valid.');
  if (!committee_member_id)                             errors.push('Anggota yang bertanggung jawab wajib dipilih.');
  return errors;
}

// =============================================================================
// CRUD
// =============================================================================

// GET /committees/:id/tasks
const index = async (req, res, next) => {
  try {
    const committeeId = req.params.id;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [tasks] = await db.query(
      `SELECT ct.*,
              e.name AS assigned_name,
              cm.role AS assigned_role,
              COUNT(ctp.id) AS progress_count
       FROM committee_tasks ct
       LEFT JOIN committee_members cm ON ct.committee_member_id = cm.id
       LEFT JOIN employees e ON cm.employee_id = e.id
       LEFT JOIN committee_task_progress ctp ON ctp.committee_task_id = ct.id
       WHERE ct.committee_id = ?
       GROUP BY ct.id
       ORDER BY ct.created_at DESC`,
      [committeeId]
    );

    res.render('tasks/index', {
      title: `Task — ${committee.name}`,
      user: req.session.userName,
      committee,
      tasks,
    });
  } catch (err) { next(err); }
};

// GET /committees/:id/tasks/create
const create = async (req, res, next) => {
  try {
    const committeeId = req.params.id;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const members = await getMembers(committeeId);
    res.render('tasks/create', {
      title: 'Tambah Task',
      user: req.session.userName,
      committee,
      members,
      errors: [],
      old: {},
    });
  } catch (err) { next(err); }
};

// POST /committees/:id/tasks
const store = async (req, res, next) => {
  try {
    const committeeId = req.params.id;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const errors = validateTask(req.body);
    if (errors.length > 0) {
      const members = await getMembers(committeeId);
      return res.render('tasks/create', { title: 'Tambah Task', user: req.session.userName, committee, members, errors, old: req.body });
    }

    const { title, description, status, priority, committee_member_id, start_date, due_date } = req.body;

    await db.query(
      `INSERT INTO committee_tasks
         (committee_id, committee_member_id, title, description, status, priority, start_date, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [committeeId, committee_member_id, title.trim(), description || null, status, priority,
       start_date || null, due_date || null]
    );

    req.session.toast = { message: 'Task berhasil dibuat!', type: 'success' };
    res.redirect(`/committees/${committeeId}/tasks`);
  } catch (err) { next(err); }
};

// GET /committees/:id/tasks/:taskId
const show = async (req, res, next) => {
  try {
    const { id: committeeId, taskId } = req.params;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [taskRows] = await db.query(
      `SELECT ct.*, e.name AS assigned_name, cm.role AS assigned_role
       FROM committee_tasks ct
       LEFT JOIN committee_members cm ON ct.committee_member_id = cm.id
       LEFT JOIN employees e ON cm.employee_id = e.id
       WHERE ct.id = ? AND ct.committee_id = ?`,
      [taskId, committeeId]
    );
    if (taskRows.length === 0) return res.status(404).render('error', { message: 'Task tidak ditemukan.', error: { status: 404, stack: '' } });

    const [progresses] = await db.query(
      `SELECT * FROM committee_task_progress WHERE committee_task_id = ? ORDER BY progress_date DESC`,
      [taskId]
    );

    res.render('tasks/show', {
      title: `Task: ${taskRows[0].title}`,
      user: req.session.userName,
      committee,
      task: taskRows[0],
      progresses,
    });
  } catch (err) { next(err); }
};

// GET /committees/:id/tasks/:taskId/edit
const edit = async (req, res, next) => {
  try {
    const { id: committeeId, taskId } = req.params;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [taskRows] = await db.query('SELECT * FROM committee_tasks WHERE id = ? AND committee_id = ?', [taskId, committeeId]);
    if (taskRows.length === 0) return res.status(404).render('error', { message: 'Task tidak ditemukan.', error: { status: 404, stack: '' } });

    const members = await getMembers(committeeId);
    res.render('tasks/edit', {
      title: 'Edit Task',
      user: req.session.userName,
      committee,
      task: taskRows[0],
      members,
      errors: [],
    });
  } catch (err) { next(err); }
};

// POST /committees/:id/tasks/:taskId/update
const update = async (req, res, next) => {
  try {
    const { id: committeeId, taskId } = req.params;
    const committee = await getCommittee(committeeId);
    if (!committee) return res.status(404).render('error', { message: 'Kepanitiaan tidak ditemukan.', error: { status: 404, stack: '' } });

    const [taskRows] = await db.query('SELECT * FROM committee_tasks WHERE id = ? AND committee_id = ?', [taskId, committeeId]);
    if (taskRows.length === 0) return res.status(404).render('error', { message: 'Task tidak ditemukan.', error: { status: 404, stack: '' } });

    const errors = validateTask(req.body);
    if (errors.length > 0) {
      const members = await getMembers(committeeId);
      return res.render('tasks/edit', { title: 'Edit Task', user: req.session.userName, committee, task: { ...taskRows[0], ...req.body, id: taskId }, members, errors });
    }

    const { title, description, status, priority, committee_member_id, start_date, due_date } = req.body;

    await db.query(
      `UPDATE committee_tasks
       SET committee_member_id = ?, title = ?, description = ?, status = ?, priority = ?,
           start_date = ?, due_date = ?, updated_at = NOW()
       WHERE id = ?`,
      [committee_member_id, title.trim(), description || null, status, priority,
       start_date || null, due_date || null, taskId]
    );

    req.session.toast = { message: 'Task berhasil diperbarui!', type: 'success' };
    res.redirect(`/committees/${committeeId}/tasks`);
  } catch (err) { next(err); }
};

// POST /committees/:id/tasks/:taskId/delete
const destroy = async (req, res, next) => {
  try {
    const { id: committeeId, taskId } = req.params;
    await db.query('DELETE FROM committee_tasks WHERE id = ? AND committee_id = ?', [taskId, committeeId]);
    req.session.toast = { message: 'Task berhasil dihapus!', type: 'success' };
    res.redirect(`/committees/${committeeId}/tasks`);
  } catch (err) { next(err); }
};

module.exports = { index, create, store, show, edit, update, destroy };
