var createError = require('http-errors');

// [E3] catch 404 — Route API tidak ditemukan (endpoint salah / belum dibuat)
const notFoundHandler = (req, res, next) => {
  const err = createError(404);
  err.message = 'Halaman atau data tidak ditemukan.';
  next(err);
};

  // error handler — menangani semua error yang di-next() dari middleware/controller
const errorHandler = (err, req, res, next) => {
  console.error('SERVER_ERROR:', err);
  // set locals, only providing error stack in development
  res.locals.message = err.message || 'Terjadi kesalahan pada server.';
  res.locals.error   = req.app.get('env') === 'development' ? err : {};

  const status = err.status || 500;
  res.status(status);
  res.render('error', {
    message: err.message || 'Terjadi kesalahan pada server.',
    error: { status, stack: req.app.get('env') === 'development' ? err.stack : '' },
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};