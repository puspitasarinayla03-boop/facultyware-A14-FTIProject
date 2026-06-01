const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { isAuthenticated } = require('../middlewares/auth');

// ─── Web Routes (semua dilindungi autentikasi) ───────────────────────────────
router.get('/',              isAuthenticated, projectController.index);
router.get('/create',        isAuthenticated, projectController.create);
router.post('/',             isAuthenticated, projectController.store);
router.get('/:id',           isAuthenticated, projectController.show);
router.get('/:id/edit',      isAuthenticated, projectController.edit);
router.post('/:id/update',   isAuthenticated, projectController.update);
router.post('/:id/delete',   isAuthenticated, projectController.destroy);

// ─── REST API Routes (publik) ────────────────────────────────────────────────
router.get('/api/list',      projectController.apiIndex);
router.get('/api/:id',       projectController.apiShow);
router.post('/api',          projectController.apiStore);

module.exports = router;
