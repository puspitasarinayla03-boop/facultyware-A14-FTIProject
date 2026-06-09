// routes/tasks.js — nested under /committees/:id/tasks
const express        = require('express');
const router         = express.Router({ mergeParams: true });
const taskController = require('../controllers/taskController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission }  = require('../middlewares/acl');

const guard = [isAuthenticated, checkPermission(['manage_committees', 'manage_all'])];

router.get('/',                    ...guard, taskController.index);
router.get('/create',              ...guard, taskController.create);
router.post('/',                   ...guard, taskController.store);
router.get('/:taskId',             ...guard, taskController.show);
router.get('/:taskId/edit',        ...guard, taskController.edit);
router.post('/:taskId/update',     ...guard, taskController.update);
router.post('/:taskId/delete',     ...guard, taskController.destroy);

module.exports = router;
