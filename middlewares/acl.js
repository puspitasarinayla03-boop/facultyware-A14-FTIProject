const db = require("../lib/db");

/**
 * ACL Middleware — checks if a logged-in user has the required permission(s).
 *
 * @param {string|string[]} requiredPermissions - A single permission or array.
 *   If an array is provided, the user must have at least one of them.
 *
 * Database Schema (Spatie-style, used in this project):
 *   roles                : id, name
 *   permissions          : id, name
 *   role_has_permissions : role_id, permission_id
 *   model_has_roles      : role_id, model_id, model_type
 *
 * model_id  = users.id
 * model_type = 'User' (static string — we only have one model type)
 */

const checkPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.redirect("/login");
    }

    const permissionsArray = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    try {
      const [rows] = await db.query(
        `SELECT DISTINCT p.name
         FROM permissions p
         JOIN role_has_permissions rhp ON p.id = rhp.permission_id
         JOIN model_has_roles mhr      ON rhp.role_id = mhr.role_id
         WHERE mhr.model_id = ?
           AND mhr.model_type = 'User'
           AND p.name IN (?)`,
        [req.session.userId, permissionsArray]
      );

      if (rows.length > 0) return next();

      return res.status(403).render("error", {
        message: "Akses Ditolak: Anda tidak memiliki izin untuk mengakses halaman ini.",
        error: { status: 403, stack: "" }
      });
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { checkPermission };
