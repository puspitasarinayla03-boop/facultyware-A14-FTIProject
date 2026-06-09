// routes/reports.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/acl');

const guard = [isAuthenticated, checkPermission(['manage_projects', 'manage_all'])];

// ─── PROGRESS REPORT ROUTES ──────────────────────────────────────────────────
router.get('/progress',      ...guard, reportController.progressReport);
router.get('/progress/pdf',  ...guard, reportController.exportPdf);
router.get('/progress/docx', ...guard, reportController.exportDocx);

module.exports = router;
