// controllers/reportController.js
const db = require('../lib/db');

// ─── ERROR HANDLER UTILITIES ─────────────────────────────────────────────────
const ErrorHandler = {
  detectMySQLError: (err) => {
    console.error('[ErrorHandler] MySQL Error:', err.code, err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ECONNREFUSED') {
      return { type: 'E1', message: 'Database connection failed.', statusCode: 503 };
    }
    return { type: 'E2', message: 'Failed to retrieve report data.', statusCode: 500 };
  }
};

// Helper to validate and query filtered progress data
async function getFilteredProgressData(query) {
  const { status, start_date, end_date, committee, task } = query;

  // Validate parameters (E11)
  if (status && !['in_progress', 'done'].includes(status)) {
    throw { status: 400, message: 'Invalid filter parameter.' };
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (start_date && !datePattern.test(start_date)) {
    throw { status: 400, message: 'Invalid filter parameter.' };
  }
  if (end_date && !datePattern.test(end_date)) {
    throw { status: 400, message: 'Invalid filter parameter.' };
  }

  if (committee && (isNaN(Number(committee)) || Number(committee) <= 0)) {
    throw { status: 400, message: 'Invalid filter parameter.' };
  }
  if (task && (isNaN(Number(task)) || Number(task) <= 0)) {
    throw { status: 400, message: 'Invalid filter parameter.' };
  }

  let sql = `
    SELECT
        progress.id,
        progress.description,
        progress.status,
        progress.progress_date,
        progress.attachment,
        task.title AS task_name,
        committee.name AS committee_name
    FROM committee_task_progress AS progress
    JOIN committee_tasks AS task ON progress.committee_task_id = task.id
    JOIN committees AS committee ON task.committee_id = committee.id
  `;

  let whereClauses = [];
  let params = [];

  if (status) {
    whereClauses.push('progress.status = ?');
    params.push(status);
  }
  if (start_date && end_date) {
    whereClauses.push('progress.progress_date BETWEEN ? AND ?');
    params.push(start_date, end_date);
  } else if (start_date) {
    whereClauses.push('progress.progress_date >= ?');
    params.push(start_date);
  } else if (end_date) {
    whereClauses.push('progress.progress_date <= ?');
    params.push(end_date);
  }
  if (committee) {
    whereClauses.push('committee.id = ?');
    params.push(committee);
  }
  if (task) {
    whereClauses.push('task.id = ?');
    params.push(task);
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }

  sql += ' ORDER BY progress.progress_date DESC';

  const queryPromise = db.query(sql, params);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), 5000)
  );

  const [rows] = await Promise.race([queryPromise, timeoutPromise]);
  return rows;
}

// ─── GET /reports/progress ───────────────────────────────────────────────────
const progressReport = async (req, res, next) => {
  // Check if JSON request is requested
  const isJson = req.xhr || 
                 (req.headers.accept && req.headers.accept.includes('json')) || 
                 req.query.json === '1';

  if (!isJson) {
    // HTML Page rendering flow
    try {
      const [committees] = await db.query('SELECT id, name FROM committees ORDER BY name');
      const [tasks] = await db.query('SELECT id, title FROM committee_tasks ORDER BY title');

      return res.render('reports/progress', {
        title: 'Laporan Progress Project',
        committees,
        tasks,
        user: req.session.userName || 'Admin'
      });
    } catch (err) {
      console.error('[progressReport HTML error]:', err);
      return res.status(500).render('error', {
        message: 'Gagal memuat halaman laporan progress.',
        error: { status: 500, stack: '' }
      });
    }
  }

  // JSON API flow
  try {
    const rows = await getFilteredProgressData(req.query);
    return res.status(200).json({
      success: true,
      message: 'Data retrieved successfully',
      data: rows
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err.message === 'Request timeout') {
      return res.status(504).json({ success: false, message: 'Permintaan melebihi batas waktu.' });
    }
    const e = ErrorHandler.detectMySQLError(err);
    return res.status(e.statusCode).json({ success: false, message: e.message });
  }
};

// ─── GET /reports/progress/pdf ───────────────────────────────────────────────
const exportPdf = async (req, res, next) => {
  try {
    const rows = await getFilteredProgressData(req.query);
    
    // Check if data is empty (E3)
    if (rows.length === 0) {
      return res.status(400).send('Tidak ada data laporan untuk dicetak.');
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan_progress_project.pdf"');
    
    doc.pipe(res);

    // Header Laporan
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text('LAPORAN PROGRESS PROJECT', { align: 'center' });
    doc.fillColor('#64748b').font('Helvetica').fontSize(10).text('Facultyware - FTI Project', { align: 'center', space: 5 });
    
    // Divider line
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(30, 75).lineTo(565, 75).stroke();
    
    // Tanggal Cetak
    const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fillColor('#334155').fontSize(8).text(`Tanggal Cetak: ${printDate}`, 30, 85, { align: 'right' });
    
    let y = 115;
    
    // Draw Table Header
    doc.rect(30, y, 535, 20).fill('#f1f5f9');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
    doc.text('No', 30, y + 6, { width: 25, align: 'center' });
    doc.text('Committee', 55, y + 6, { width: 100 });
    doc.text('Task', 155, y + 6, { width: 100 });
    doc.text('Progress', 255, y + 6, { width: 180 });
    doc.text('Status', 435, y + 6, { width: 80, align: 'center' });
    doc.text('Tanggal', 515, y + 6, { width: 50, align: 'center' });
    
    y += 20;
    
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    // Draw rows
    doc.font('Helvetica').fontSize(8);
    rows.forEach((row, i) => {
      const desc = row.description || '-';
      const committeeName = row.committee_name || '-';
      const taskName = row.task_name || '-';
      const statusLabel = row.status === 'done' ? 'Selesai' : 'Sedang Berlangsung';
      const dateLabel = formatDate(row.progress_date);

      const descHeight = doc.heightOfString(desc, { width: 180 });
      const rowHeight = Math.max(descHeight + 10, 25);

      // Page break check
      if (y + rowHeight > 780) {
        doc.addPage();
        y = 40;
      }

      // Zebra striping
      if (i % 2 === 1) {
        doc.rect(30, y, 535, rowHeight).fill('#f8fafc');
      }

      doc.fillColor('#334155');
      doc.text(String(i + 1), 30, y + 5, { width: 25, align: 'center' });
      doc.text(committeeName, 55, y + 5, { width: 100 });
      doc.text(taskName, 155, y + 5, { width: 100 });
      doc.text(desc, 255, y + 5, { width: 180 });
      doc.text(statusLabel, 435, y + 5, { width: 80, align: 'center' });
      doc.text(dateLabel, 515, y + 5, { width: 50, align: 'center' });

      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(30, y + rowHeight).lineTo(565, y + rowHeight).stroke();

      y += rowHeight;
    });

    // Footer info
    y += 15;
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    doc.fillColor('#64748b').fontSize(8).text(`Total Data: ${rows.length} progress project.`, 30, y);

    doc.end();

  } catch (err) {
    if (err.status === 400) {
      return res.status(400).send('Filter laporan tidak valid.');
    }
    if (err.message === 'Request timeout') {
      return res.status(504).send('Proses export melebihi batas waktu.');
    }
    console.error('[exportPdf error]:', err);
    return res.status(500).send('Gagal membuat file PDF.');
  }
};

// ─── GET /reports/progress/docx ──────────────────────────────────────────────
const exportDocx = async (req, res, next) => {
  try {
    const rows = await getFilteredProgressData(req.query);

    // Check if data is empty (E3)
    if (rows.length === 0) {
      return res.status(400).send('Tidak ada data laporan untuk dicetak.');
    }

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

    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const makeHeaderCell = (text, widthPct) => new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: 18, color: 'FFFFFF' })],
          alignment: AlignmentType.CENTER
        })
      ],
      shading: { fill: '0F172A' }
    });

    const makeCell = (text, widthPct, align = AlignmentType.LEFT, italic = false) => new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          children: [new TextRun({ text: text || '-', size: 18, italics: italic })],
          alignment: align
        })
      ]
    });

    const headerRow = new TableRow({
      children: [
        makeHeaderCell('No', 5),
        makeHeaderCell('Committee', 20),
        makeHeaderCell('Task', 20),
        makeHeaderCell('Progress', 35),
        makeHeaderCell('Status', 10),
        makeHeaderCell('Tanggal', 10),
      ]
    });

    const tableRows = [headerRow];
    rows.forEach((row, i) => {
      const statusLabel = row.status === 'done' ? 'Selesai' : 'Sedang Berlangsung';
      tableRows.push(new TableRow({
        children: [
          makeCell(String(i + 1), 5, AlignmentType.CENTER),
          makeCell(row.committee_name, 20),
          makeCell(row.task_name, 20),
          makeCell(row.description, 35),
          makeCell(statusLabel, 10, AlignmentType.CENTER),
          makeCell(formatDate(row.progress_date), 10, AlignmentType.CENTER),
        ]
      }));
    });

    const reportTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows
    });

    const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            text: 'LAPORAN PROGRESS PROJECT',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 }
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Facultyware - FTI Project', color: '64748B', size: 20 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 360 }
          }),
          new Paragraph({
            children: [new TextRun({ text: `Tanggal Cetak: ${printDate}`, size: 16, italics: true })],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 200 }
          }),
          reportTable,
          new Paragraph({
            children: [new TextRun({ text: `\nTotal Data: ${rows.length} progress project.`, size: 18, color: '64748B' })],
            spacing: { before: 240 }
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan_progress_project.docx"');
    res.send(buffer);

  } catch (err) {
    if (err.status === 400) {
      return res.status(400).send('Filter laporan tidak valid.');
    }
    if (err.message === 'Request timeout') {
      return res.status(504).send('Proses export melebihi batas waktu.');
    }
    console.error('[exportDocx error]:', err);
    return res.status(500).send('Gagal membuat file DOCX.');
  }
};

module.exports = {
  progressReport,
  exportPdf,
  exportDocx
};
