const express = require('express');
const router  = express.Router();
const projectController = require('../controllers/projectController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission }  = require('../middlewares/acl');

// ─── Web Routes ───────────────────────────────────────────────────────────────
router.get('/',            isAuthenticated, checkPermission(['manage_projects','manage_all']), projectController.index);
router.get('/create',      isAuthenticated, checkPermission(['manage_projects','manage_all']), projectController.create);
router.post('/',           isAuthenticated, checkPermission(['manage_projects','manage_all']), projectController.store);
router.get('/:id',         isAuthenticated, checkPermission(['manage_projects','manage_all']), projectController.show);
router.get('/:id/edit',    isAuthenticated, checkPermission(['manage_projects','manage_all']), projectController.edit);
router.post('/:id/update', isAuthenticated, checkPermission(['manage_projects','manage_all']), projectController.update);
router.post('/:id/delete', isAuthenticated, checkPermission(['manage_projects','manage_all']), projectController.destroy);

// ─── REST API Routes (public) ─────────────────────────────────────────────────
router.get('/api/list', projectController.apiIndex);
router.get('/api/:id',  projectController.apiShow);
router.post('/api',     projectController.apiStore);

module.exports = router;
