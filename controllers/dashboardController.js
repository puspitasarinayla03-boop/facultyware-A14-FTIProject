// controllers/dashboardController.js
const db = require('../lib/db');

// ─── ERROR HANDLER UTILITIES ─────────────────────────────────────────────────
const ErrorHandler = {
  detectMySQLError: (err) => {
    console.error('[ErrorHandler] MySQL Error:', err.code, err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ECONNREFUSED') {
      return { type: 'E1', message: 'Database connection failed.', statusCode: 503 };
    }
    return { type: 'E2', message: 'Failed to retrieve dashboard statistics.', statusCode: 500 };
  }
};

// ─── GET /dashboard ──────────────────────────────────────────────────────────
const dashboard = async (req, res, next) => {
  const isJson = req.xhr || 
                 (req.headers.accept && req.headers.accept.includes('json')) || 
                 req.query.json === '1';

  if (!isJson) {
    // HTML View rendering path
    try {
      const [committees] = await db.query('SELECT id, name FROM committees ORDER BY name');
      return res.render('dashboard/index', {
        title: 'Dashboard Project',
        committees,
        user: req.session.userName || 'Admin'
      });
    } catch (err) {
      console.error('[dashboard HTML load error]:', err);
      return res.status(500).render('error', {
        message: 'Gagal memuat halaman dashboard.',
        error: { status: 500, stack: '' }
      });
    }
  }

  // JSON API path
  try {
    const { status, start_date, end_date, committee } = req.query;

    // Validate parameters (E10)
    if (status && !['in_progress', 'done'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Filter dashboard tidak valid.' });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (start_date && !datePattern.test(start_date)) {
      return res.status(400).json({ success: false, message: 'Filter dashboard tidak valid.' });
    }
    if (end_date && !datePattern.test(end_date)) {
      return res.status(400).json({ success: false, message: 'Filter dashboard tidak valid.' });
    }

    if (committee && (isNaN(Number(committee)) || Number(committee) <= 0)) {
      return res.status(400).json({ success: false, message: 'Filter dashboard tidak valid.' });
    }

    // Dynamic queries with timeout (E7)
    const runFilteredDashboardQueries = async () => {
      // 1. Total Project (Committees)
      let projectSql = 'SELECT COUNT(*) AS total FROM committees';
      let projectParams = [];
      if (committee) {
        projectSql += ' WHERE id = ?';
        projectParams.push(committee);
      }
      const [projectRows] = await db.query(projectSql, projectParams);
      const totalProject = projectRows[0] ? projectRows[0].total : 0;

      // 2. Total Task
      let taskSql = 'SELECT COUNT(*) AS total FROM committee_tasks';
      let taskParams = [];
      if (committee) {
        taskSql += ' WHERE committee_id = ?';
        taskParams.push(committee);
      }
      const [taskRows] = await db.query(taskSql, taskParams);
      const totalTask = taskRows[0] ? taskRows[0].total : 0;

      // 3. Total Progress and status breakdown
      let progressSql = `
        SELECT
            progress.status,
            COUNT(DISTINCT progress.id) AS count
        FROM committee_task_progress AS progress
        JOIN committee_tasks AS task ON progress.committee_task_id = task.id
        JOIN committees AS committee ON task.committee_id = committee.id
      `;
      let whereClauses = [];
      let progressParams = [];

      if (committee) {
        whereClauses.push('committee.id = ?');
        progressParams.push(committee);
      }
      if (status) {
        whereClauses.push('progress.status = ?');
        progressParams.push(status);
      }
      if (start_date && end_date) {
        whereClauses.push('progress.progress_date BETWEEN ? AND ?');
        progressParams.push(start_date, end_date);
      } else if (start_date) {
        whereClauses.push('progress.progress_date >= ?');
        progressParams.push(start_date);
      } else if (end_date) {
        whereClauses.push('progress.progress_date <= ?');
        progressParams.push(end_date);
      }

      if (whereClauses.length > 0) {
        progressSql += ' WHERE ' + whereClauses.join(' AND ');
      }
      progressSql += ' GROUP BY progress.status';

      const [progressRows] = await db.query(progressSql, progressParams);

      let progressOngoing = 0;
      let progressDone = 0;
      let totalProgress = 0;

      progressRows.forEach(row => {
        if (row.status === 'in_progress') {
          progressOngoing = row.count;
        } else if (row.status === 'done') {
          progressDone = row.count;
        }
        totalProgress += row.count;
      });

      // 4. Summary Table & Bar Chart JOIN data
      let summarySql = `
        SELECT
            committee.id,
            committee.name,
            COUNT(DISTINCT task.id) AS total_task,
            COUNT(DISTINCT progress.id) AS total_progress
        FROM committees AS committee
        LEFT JOIN committee_tasks AS task ON committee.id = task.committee_id
        LEFT JOIN committee_task_progress AS progress ON task.id = progress.committee_task_id
      `;
      
      let summaryWhere = [];
      let summaryParams = [];

      if (committee) {
        summaryWhere.push('committee.id = ?');
        summaryParams.push(committee);
      }
      // If progress-specific filters are active, they apply to the JOIN
      if (status) {
        summaryWhere.push('(progress.status = ? OR progress.status IS NULL)');
        summaryParams.push(status);
      }
      if (start_date && end_date) {
        summaryWhere.push('(progress.progress_date BETWEEN ? AND ? OR progress.progress_date IS NULL)');
        summaryParams.push(start_date, end_date);
      } else if (start_date) {
        summaryWhere.push('(progress.progress_date >= ? OR progress.progress_date IS NULL)');
        summaryParams.push(start_date);
      } else if (end_date) {
        summaryWhere.push('(progress.progress_date <= ? OR progress.progress_date IS NULL)');
        summaryParams.push(end_date);
      }

      if (summaryWhere.length > 0) {
        summarySql += ' WHERE ' + summaryWhere.join(' AND ');
      }

      summarySql += ' GROUP BY committee.id ORDER BY committee.name';

      const [summaryRows] = await db.query(summarySql, summaryParams);

      // Handle null defaultings (A2 / A4)
      const sanitizedSummary = summaryRows.map(row => ({
        id: row.id,
        name: row.name || 'Unnamed Project',
        total_task: row.total_task || 0,
        total_progress: row.total_progress || 0
      }));

      return {
        stats: {
          total_project: totalProject,
          total_task: totalTask,
          total_progress: totalProgress,
          progress_done: progressDone,
          progress_ongoing: progressOngoing,
          progress_pending: 0 // Progress status enum is only in_progress or done
        },
        summary: sanitizedSummary
      };
    };

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 5000)
    );

    const data = await Promise.race([runFilteredDashboardQueries(), timeoutPromise]);

    return res.status(200).json({
      success: true,
      message: 'Data retrieved successfully',
      data
    });

  } catch (err) {
    if (err.message === 'Request timeout') {
      return res.status(504).json({ success: false, message: 'Permintaan melebihi batas waktu.' });
    }
    const e = ErrorHandler.detectMySQLError(err);
    return res.status(e.statusCode).json({ success: false, message: e.message });
  }
};

module.exports = {
  dashboard
};
