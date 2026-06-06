const express = require('express');
const router  = express.Router();
const committeeController = require('../controllers/committeeController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission }  = require('../middlewares/acl');

// ─── Web Routes ───────────────────────────────────────────────────────────────
router.get('/',            isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.index);
router.get('/create',      isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.create);
router.post('/',           isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.store);
router.get('/:id',         isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.show);
router.get('/:id/edit',    isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.edit);
router.post('/:id/update', isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.update);
router.post('/:id/delete', isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.destroy);
router.get('/:id/sk',      isAuthenticated, checkPermission(['manage_committees','manage_all']), committeeController.exportSK);

module.exports = router;
