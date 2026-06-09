// routes/dashboard.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/acl');

const guard = [isAuthenticated, checkPermission(['manage_projects', 'manage_all'])];

router.get('/', ...guard, dashboardController.dashboard);

module.exports = router;
