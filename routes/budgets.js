// routes/budgets.js  — nested under /committees/:id/budgets
const express          = require('express');
const router           = express.Router({ mergeParams: true });  // inherit :id from parent
const budgetController = require('../controllers/budgetController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission }  = require('../middlewares/acl');

const guard = [isAuthenticated, checkPermission(['manage_committees', 'manage_all'])];

// ─── Budget Routes ────────────────────────────────────────────────────────────
router.get('/',                                  ...guard, budgetController.budgetIndex);
router.get('/create',                            ...guard, budgetController.budgetCreate);
router.post('/',                                 ...guard, budgetController.budgetStore);
router.get('/:budgetId',                         ...guard, budgetController.budgetShow);
router.get('/:budgetId/edit',                    ...guard, budgetController.budgetEdit);
router.post('/:budgetId/update',                 ...guard, budgetController.budgetUpdate);
router.post('/:budgetId/delete',                 ...guard, budgetController.budgetDestroy);
router.get('/:budgetId/export-excel',            ...guard, budgetController.exportExcel);

// ─── Expense Routes (nested under budget) ─────────────────────────────────────
router.post('/:budgetId/expenses',               ...guard, budgetController.expenseStore);
router.post('/:budgetId/expenses/:expenseId/approve', ...guard, budgetController.expenseApprove);
router.post('/:budgetId/expenses/:expenseId/reject',  ...guard, budgetController.expenseReject);
router.post('/:budgetId/expenses/:expenseId/delete',  ...guard, budgetController.expenseDestroy);

module.exports = router;
