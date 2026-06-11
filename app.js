require('dotenv').config();

console.log("DB_HOST =", process.env.DB_HOST);
console.log("DB_NAME =", process.env.DB_NAME);
console.log("SESSION_SECRET =", process.env.SESSION_SECRET);
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);

var indexRouter      = require('./routes/index');
var usersRouter      = require('./routes/users');
var projectsRouter   = require('./routes/projects');
var committeesRouter = require('./routes/committees');
var progressesRouter = require('./routes/progresses');
var reportsRouter    = require('./routes/reports');
var dashboardRouter  = require('./routes/dashboard');
var budgetsRouter    = require('./routes/budgets');
var tasksRouter      = require('./routes/tasks');
const { notFoundHandler, errorHandler } = require('./middlewares/error');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'id',
      expires: 'last_activity',
      data: 'payload'
    }
  }
});

app.use(session({
  key: 'session_cookie_name',
  secret: process.env.SESSION_SECRET || 'secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

app.use((req, res, next) => {
  if (req.session.toast) {
    res.locals.toast = req.session.toast;
    delete req.session.toast;
  }
  next();
});

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/projects',    projectsRouter);
app.use('/committees',  committeesRouter);
app.use('/committees/:id/budgets', budgetsRouter);
app.use('/committees/:id/tasks',   tasksRouter);
app.use('/progresses', progressesRouter);
app.use('/reports', reportsRouter);
app.use('/dashboard', dashboardRouter);

// REST API routes
const projectController  = require('./controllers/projectController');
const { isAuthenticated } = require('./middlewares/auth');
const { checkPermission } = require('./middlewares/acl');
const apiGuard = [isAuthenticated, checkPermission(['manage_projects', 'manage_all'])];
app.get('/api/projects',     ...apiGuard, projectController.apiIndex);
app.get('/api/projects/:id', ...apiGuard, projectController.apiShow);
app.post('/api/projects',    ...apiGuard, projectController.apiStore);

// catch 404 and forward to error handler
app.use(notFoundHandler);

// error handler
app.use(errorHandler);

module.exports = app;
