// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  return res.redirect("/login");
}

module.exports = {
  isAuthenticated,
};
