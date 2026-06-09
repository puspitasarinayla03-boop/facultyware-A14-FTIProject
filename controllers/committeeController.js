const db   = require('../lib/db');
const fs   = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun } = require('docx');

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES = ['draft', 'active', 'completed', 'cancelled'];

// ─── Validation ───────────────────────────────────────────────────────────────
function validateMembers(internalMembers, externalMembers) {
  const errors = [];
  if (internalMembers.length === 0 && externalMembers.length === 0)
    errors.push('Minimal harus ada satu anggota kepanitiaan.');
  const leaderCount = internalMembers.filter(m => m.is_leader).length +
    externalMembers.filter(m => m.role.toLowerCase() === 'ketua').length;
  if (leaderCount > 1)
    errors.push('Hanya boleh ada maksimal 1 (satu) orang Ketua.');
  return errors;
}

// ─── Web Controllers ──────────────────────────────────────────────────────────

// GET /committees  — list committees (projects) that have members
const index = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const filterStatus = req.query.status || '';

    const whereClauses = ['(SELECT COUNT(*) FROM committee_members cm WHERE cm.committee_id = c.id) > 0'];
    const params = [];

    if (search) {
      whereClauses.push('(c.name LIKE ? OR c.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (filterStatus) {
      whereClauses.push('c.status = ?');
      params.push(filterStatus);
    }

    const whereSQL = 'WHERE ' + whereClauses.join(' AND ');

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM committees c ${whereSQL}`, params
    );
    const totalPages = Math.ceil(total / limit);

    const [committees] = await db.query(
      `SELECT c.id, c.name, c.status, c.start_date, c.end_date, c.created_at,
              emp.name AS creator_name,
              (SELECT COUNT(*) FROM committee_members cm WHERE cm.committee_id = c.id) AS member_count
       FROM committees c
       LEFT JOIN employees emp ON c.created_by = emp.id
       ${whereSQL}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.render('committees/index', {
      title: 'Kelola Kepanitiaan',
      user: req.session.userName,
      committees,
      pagination: { page, totalPages, total, limit },
      filters: { search, status: filterStatus },
    });
  } catch (err) {
    next(err);
  }
};

// GET /committees/create  — pick a project, then add members
const create = async (req, res, next) => {
  try {
    // List committees (projects) that have NO members yet
    const [projects] = await db.query(
      `SELECT id, name, start_date, end_date FROM committees
       WHERE (SELECT COUNT(*) FROM committee_members cm WHERE cm.committee_id = committees.id) = 0
       ORDER BY name ASC`
    );
    const [employees] = await db.query(
      'SELECT id, name, employee_number FROM employees WHERE status = ? ORDER BY name ASC',
      ['active']
    );

    res.render('committees/create', {
      title: 'Tambah Kepanitiaan',
      user: req.session.userName,
      projects,
      employees,
      errors: [],
      old: {},
    });
  } catch (err) {
    next(err);
  }
};

// POST /committees
const store = async (req, res, next) => {
  try {
    const { committee_id } = req.body;
    const internalMembers = parseInternalMembers(req.body);
    const externalMembers = parseExternalMembers(req.body);
    const errors = validateMembers(internalMembers, externalMembers);

    if (!committee_id) errors.unshift('Kegiatan/proyek wajib dipilih.');

    if (errors.length > 0) {
      const [projects] = await db.query(
        `SELECT id, name, start_date, end_date FROM committees
         WHERE (SELECT COUNT(*) FROM committee_members cm WHERE cm.committee_id = committees.id) = 0
         ORDER BY name ASC`
      );
      const [employees] = await db.query(
        'SELECT id, name, employee_number FROM employees WHERE status = ? ORDER BY name ASC',
        ['active']
      );
      return res.render('committees/create', {
        title: 'Tambah Kepanitiaan',
        user: req.session.userName,
        projects,
        employees,
        errors,
        old: req.body,
        internalMembers: internalMembers,
        externalMembers: externalMembers,
      });
    }

    // Insert internal members
    for (const m of internalMembers) {
      await db.query(
        `INSERT INTO committee_members (committee_id, employee_id, role, is_leader, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [committee_id, m.employee_id, m.role, m.is_leader ? 1 : 0]
      );
    }
    // Insert external members
    for (const m of externalMembers) {
      await db.query(
        `INSERT INTO committee_external_members (committee_id, name, institution, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [committee_id, m.name, m.institution || null, m.role]
      );
    }

    req.session.toast = { message: 'Kepanitiaan berhasil disimpan!', type: 'success' };
    res.redirect(`/committees/${committee_id}`);
  } catch (err) {
    next(err);
  }
};

// GET /committees/:id  — show committee detail + members
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
        message: 'Kepanitiaan tidak ditemukan.',
        error: { status: 404, stack: '' },
      });
    }

    const [internalMembers] = await db.query(
      `SELECT cm.id, cm.role, cm.is_leader, emp.name, emp.employee_number
       FROM committee_members cm
       JOIN employees emp ON cm.employee_id = emp.id
       WHERE cm.committee_id = ?
       ORDER BY cm.is_leader DESC, emp.name ASC`,
      [req.params.id]
    );

    const [externalMembers] = await db.query(
      `SELECT id, name, institution, role
       FROM committee_external_members
       WHERE committee_id = ?
       ORDER BY name ASC`,
      [req.params.id]
    );

    res.render('committees/show', {
      title: rows[0].name,
      user: req.session.userName,
      committee: rows[0],
      internalMembers,
      externalMembers,
    });
  } catch (err) {
    next(err);
  }
};

// GET /committees/:id/edit  — edit members only
const edit = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM committees WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).render('error', {
        message: 'Kepanitiaan tidak ditemukan.',
        error: { status: 404, stack: '' },
      });
    }

    const [employees] = await db.query(
      'SELECT id, name, employee_number FROM employees WHERE status = ? ORDER BY name ASC',
      ['active']
    );
    const [internalMembers] = await db.query(
      `SELECT cm.id, cm.employee_id, cm.role, cm.is_leader, emp.name
       FROM committee_members cm
       JOIN employees emp ON cm.employee_id = emp.id
       WHERE cm.committee_id = ?
       ORDER BY cm.is_leader DESC, emp.name ASC`,
      [req.params.id]
    );
    const [externalMembers] = await db.query(
      'SELECT * FROM committee_external_members WHERE committee_id = ? ORDER BY name ASC',
      [req.params.id]
    );

    res.render('committees/edit', {
      title: 'Edit Kepanitiaan',
      user: req.session.userName,
      committee: rows[0],
      employees,
      internalMembers,
      externalMembers,
      errors: [],
    });
  } catch (err) {
    next(err);
  }
};

// POST /committees/:id/update  — update members only
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM committees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).render('error', {
        message: 'Kepanitiaan tidak ditemukan.',
        error: { status: 404, stack: '' },
      });
    }

    const internalMembers = parseInternalMembers(req.body);
    const externalMembers = parseExternalMembers(req.body);
    const errors = validateMembers(internalMembers, externalMembers);

    if (errors.length > 0) {
      const [employees] = await db.query(
        'SELECT id, name, employee_number FROM employees WHERE status = ? ORDER BY name ASC',
        ['active']
      );
      return res.render('committees/edit', {
        title: 'Edit Kepanitiaan',
        user: req.session.userName,
        committee: existing[0],
        employees,
        internalMembers: internalMembers,
        externalMembers: externalMembers,
        errors,
      });
    }

    // Replace members
    await db.query('DELETE FROM committee_members WHERE committee_id = ?', [id]);
    await db.query('DELETE FROM committee_external_members WHERE committee_id = ?', [id]);

    for (const m of internalMembers) {
      await db.query(
        `INSERT INTO committee_members (committee_id, employee_id, role, is_leader, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [id, m.employee_id, m.role, m.is_leader ? 1 : 0]
      );
    }
    for (const m of externalMembers) {
      await db.query(
        `INSERT INTO committee_external_members (committee_id, name, institution, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [id, m.name, m.institution || null, m.role]
      );
    }

    req.session.toast = { message: 'Kepanitiaan berhasil diperbarui!', type: 'success' };
    res.redirect(`/committees/${id}`);
  } catch (err) {
    next(err);
  }
};

// POST /committees/:id/delete  — delete only the members (not the committee/project itself)
const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM committee_members WHERE committee_id = ?', [id]);
    await db.query('DELETE FROM committee_external_members WHERE committee_id = ?', [id]);
    req.session.toast = { message: 'Kepanitiaan berhasil dihapus!', type: 'success' };
    res.redirect('/committees');
  } catch (err) {
    next(err);
  }
};

// GET /committees/:id/sk  — Generate & download DOCX SK
const exportSK = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM committees WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kepanitiaan tidak ditemukan.' });
    }

    const committee = rows[0];
    const [internalMembers] = await db.query(
      `SELECT cm.role, cm.is_leader, emp.name, emp.employee_number
       FROM committee_members cm
       JOIN employees emp ON cm.employee_id = emp.id
       WHERE cm.committee_id = ?
       ORDER BY cm.is_leader DESC, emp.name ASC`,
      [req.params.id]
    );
    const [externalMembers] = await db.query(
      'SELECT name, institution, role FROM committee_external_members WHERE committee_id = ? ORDER BY name ASC',
      [req.params.id]
    );

    const allMembers = [
      ...internalMembers.map(m => ({ ...m, source: 'internal' })),
      ...externalMembers.map(m => ({ ...m, is_leader: 0, source: 'external' })),
    ];

    const skNumber = `SK/${String(committee.id).padStart(4, '0')}/${new Date().getFullYear()}/FTI`;
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const startFmt = committee.start_date
      ? new Date(committee.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : '-';
    const endFmt = committee.end_date
      ? new Date(committee.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : '-';

    const borderStyle = {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    };

    const noBorder = {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    };

    const memberRows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: 'No', alignment: AlignmentType.CENTER })], borders: borderStyle }),
          new TableCell({ children: [new Paragraph({ text: 'Nama', alignment: AlignmentType.CENTER })], borders: borderStyle }),
          new TableCell({ children: [new Paragraph({ text: 'NIP / Institusi', alignment: AlignmentType.CENTER })], borders: borderStyle }),
          new TableCell({ children: [new Paragraph({ text: 'Jabatan', alignment: AlignmentType.CENTER })], borders: borderStyle }),
        ],
        tableHeader: true,
      }),
      ...allMembers.map((m, i) => new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: String(i + 1), alignment: AlignmentType.CENTER })], borders: borderStyle }),
          new TableCell({ children: [new Paragraph({ text: m.name || '-' })], borders: borderStyle }),
          new TableCell({ children: [new Paragraph({ text: m.employee_number || m.institution || '-' })], borders: borderStyle }),
          new TableCell({ children: [new Paragraph({ text: m.is_leader ? `Ketua — ${m.role}` : m.role })], borders: borderStyle }),
        ],
      })),
    ];

    // ── Load logo ──────────────────────────────────────────────────────────
    const logoPath = path.join(__dirname, '../public/assets/images/logo-unand.png');
    const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

    const kopNoBorder = {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    };

    // ── Kop Surat: logo kiri + teks kanan ─────────────────────────────────
    const headerLogoCell = new TableCell({
      width: { size: 15, type: WidthType.PERCENTAGE },
      borders: kopNoBorder,
      children: logoBuffer ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: logoBuffer, transformation: { width: 80, height: 80 }, type: 'png' })],
        }),
      ] : [new Paragraph({ children: [] })],
    });

    const headerTextCell = new TableCell({
      width: { size: 85, type: WidthType.PERCENTAGE },
      borders: kopNoBorder,
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'KEMENTERIAN PENDIDIKAN TINGGI, SAINS DAN TEKNOLOGI', size: 24, font: 'Times New Roman' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'UNIVERSITAS ANDALAS', size: 28, bold: true, font: 'Times New Roman' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'FAKULTAS TEKNOLOGI INFORMASI', bold: true, size: 24, font: 'Times New Roman' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Kampus Universitas Andalas, Limau Manis, Padang - 25163', size: 20, font: 'Times New Roman' })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Telp: 0751-9824667  website: http://fti.unand.ac.id  email: sekretariat@it.unand.ac.id', size: 20, font: 'Times New Roman', italics: true })],
          border: { bottom: { color: '000000', space: 1, style: BorderStyle.SINGLE, size: 12 } },
          spacing: { after: 400 },
        }),
      ],
    });

    const kopTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
      },
      rows: [new TableRow({ children: [headerLogoCell, headerTextCell] })],
    });

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1800 } } },
        children: [
          kopTable,

          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'KEPUTUSAN DEKAN', size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'FAKULTAS TEKNOLOGI INFORMASI UNIVERSITAS ANDALAS', size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Nomor: ${skNumber}`, size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'TENTANG', size: 24, font: 'Times New Roman' })], spacing: { before: 200, after: 200 } }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: committee.name.toUpperCase(), bold: true, size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'FAKULTAS TEKNOLOGI INFORMASI', bold: true, size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'UNIVERSITAS ANDALAS', bold: true, size: 24, font: 'Times New Roman' })], spacing: { after: 400 } }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DEKAN FAKULTAS TEKNOLOGI INFORMASI UNIVERSITAS ANDALAS', size: 24, font: 'Times New Roman' })], spacing: { after: 400 } }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Membaca', font: 'Times New Roman', size: 24 })] })] }),
                  new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: ':', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ width: { size: 75, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: `a. Surat terkait kepanitiaan ${committee.name};`, font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Menimbang', font: 'Times New Roman', size: 24 })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ':', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: `a. Bahwa dalam rangka ${committee.objective || 'mendukung kegiatan'}, dipandang perlu membentuk kepanitiaan;`, font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED }),
                      new Paragraph({ children: [new TextRun({ text: 'b. Bahwa berdasarkan pertimbangan pada huruf "a" perlu ditetapkan dengan Keputusan Dekan;', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED }),
                    ]
                  }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Mengingat', font: 'Times New Roman', size: 24 })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ':', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: '1. Undang-Undang Nomor 12 Tahun 2012 tentang Pendidikan Tinggi;', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED }),
                      new Paragraph({ children: [new TextRun({ text: '2. Peraturan Pemerintah Nomor 17 Tahun 2010 tentang Penyelenggaraan & Pengelolaan Pendidikan;', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED }),
                      new Paragraph({ children: [new TextRun({ text: '3. Peraturan Rektor Universitas Andalas Nomor 8 Tahun 2022 tentang Organisasi dan Tata Kerja Organ Pengelola Universitas Andalas;', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED }),
                    ]
                  }),
                ]
              }),
            ],
          }),

          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'MEMUTUSKAN', size: 24, font: 'Times New Roman' })], spacing: { before: 300, after: 300 } }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorder,
            rows: [
              new TableRow({
                children: [
                  new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Menetapkan', font: 'Times New Roman', size: 24 })] })] }),
                  new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: ':', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ width: { size: 75, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: `KEPUTUSAN DEKAN TENTANG PENUNJUKAN / PENGANGKATAN KEPANITIAAN ${committee.name.toUpperCase()} FAKULTAS TEKNOLOGI INFORMASI UNIVERSITAS ANDALAS`, font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Pertama', font: 'Times New Roman', size: 24 })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ':', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Menunjuk/Mengangkat Kepanitiaan ${committee.name} Fakultas Teknologi Informasi Universitas Andalas dengan nama-nama terlampir dalam keputusan ini`, font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Kedua', font: 'Times New Roman', size: 24 })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ':', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Kepanitiaan ${committee.name} dalam melaksanakan tugas, bertanggung jawab kepada Dekan`, font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Ketiga', font: 'Times New Roman', size: 24 })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ':', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Keputusan ini berlaku sejak tanggal ditetapkan dengan ketentuan apabila terdapat kekeliruan dalam penetapan ini akan diadakan perbaikan sebagaimana mestinya.', font: 'Times New Roman', size: 24 })], alignment: AlignmentType.JUSTIFIED })] }),
                ]
              }),
            ],
          }),

          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Ditetapkan di Padang', size: 24, font: 'Times New Roman' })], spacing: { before: 600 } }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Pada Tanggal ${today}`, size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'DEKAN,        ', size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '\n\n\n\n', size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'LUSI SUSANTI    ', size: 24, font: 'Times New Roman', bold: true })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'NIP 197608152006042040  ', size: 24, font: 'Times New Roman' })], spacing: { after: 600 } }),

          // ── LAMPIRAN ──
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'LAMPIRAN', bold: true, size: 24, font: 'Times New Roman' })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `SUSUNAN KEPANITIAAN ${committee.name.toUpperCase()}`, bold: true, size: 24, font: 'Times New Roman' })], spacing: { after: 300 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: memberRows }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `SK_${committee.name.replace(/\s+/g, '_')}_${new Date().getFullYear()}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseInternalMembers(body) {
  const members = [];
  const ids = [].concat(body['internal_employee_id[]'] || body['internal_employee_id'] || []);
  const roles = [].concat(body['internal_role[]'] || body['internal_role'] || []);
  const maxLen = Math.max(ids.length, roles.length);
  for (let i = 0; i < maxLen; i++) {
    const empId = parseInt(ids[i]);
    const role = (roles[i] || '').trim();
    if (empId && role) {
      members.push({ employee_id: empId, role, is_leader: role.toLowerCase() === 'ketua' });
    }
  }
  return members;
}

function parseExternalMembers(body) {
  const members = [];
  const names = [].concat(body['external_name[]'] || body['external_name'] || []);
  const institutions = [].concat(body['external_institution[]'] || body['external_institution'] || []);
  const roles = [].concat(body['external_role[]'] || body['external_role'] || []);
  const maxLen = names.length;
  for (let i = 0; i < maxLen; i++) {
    const name = (names[i] || '').trim();
    const role = (roles[i] || '').trim();
    if (name && role) {
      members.push({ name, institution: institutions[i] || '', role });
    }
  }
  return members;
}

module.exports = { index, create, store, show, edit, update, destroy, exportSK };
