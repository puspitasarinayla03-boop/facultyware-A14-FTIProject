// routes/progresses.js
const express            = require('express');
const router             = express.Router();
const progressController = require('../controllers/progressController');
const { isAuthenticated }  = require('../middlewares/auth');
const { checkPermission }  = require('../middlewares/acl');

const guard = [isAuthenticated, checkPermission(['manage_projects', 'manage_all'])];

// ─── COLLECTION ROUTES ────────────────────────────────────────────────────────
router.get('/',       ...guard, progressController.index);   // List semua progress
router.get('/create', ...guard, progressController.create);  // Form tambah (HARUS sebelum /:id)
router.get('/api/activities', ...guard, progressController.apiActivities);
router.get('/api/tasks',      ...guard, progressController.apiTasks);
router.get('/api/new-task-fields', ...guard, progressController.apiNewTaskFields);
router.post('/',      ...guard, progressController.store);   // Simpan baru

// ─── RESOURCE ROUTES ─────────────────────────────────────────────────────────
router.get('/:id',              ...guard, progressController.show);       // Detail progress
router.get('/:id/edit',         ...guard, progressController.edit);       // Form edit
router.get('/:id/export-docx',  ...guard, progressController.exportDocx); // Export DOCX
router.post('/:id/update',      ...guard, progressController.update);     // Simpan edit (POST wrapper)
router.put('/:id',              ...guard, progressController.update);     // Simpan edit (Direct PUT)
router.post('/:id/delete',      ...guard, progressController.destroy);    // Hapus (POST wrapper)
router.delete('/:id',           ...guard, progressController.destroy);    // Hapus (Direct DELETE)

module.exports = router;