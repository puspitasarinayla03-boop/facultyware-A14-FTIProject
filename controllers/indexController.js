const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const index = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/projects");
  }
  res.redirect("/login");
};

// Redirect /home → /projects (projects list is the main dashboard)
const home = (req, res) => {
  res.redirect("/projects");
};

const loginPage = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/projects");
  }
  res.render("login", { title: "Login", error: null });
};

const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    if (rows.length === 0) {
      return res.render("login", {
        title: "Login",
        error: "Email atau password tidak valid.",
      });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("login", {
        title: "Login",
        error: "Email atau password tidak valid.",
      });
    }

    // Cari employee record berdasarkan user.id (FK: employees.id → users.id)
    const [empRows] = await db.query(
      "SELECT id FROM employees WHERE id = ?", [user.id]
    );

    // Set session — userName diberi fallback ke email/Admin agar sidebar tidak error
    // jika kolom `name` di tabel users bernilai null/kosong (Fix #3 - Flow 2)
    req.session.userId     = user.id;
    req.session.userName   = user.name || user.email || 'Admin';
    req.session.userEmail  = user.email;
    req.session.employeeId = empRows.length > 0 ? empRows[0].id : null;

    res.redirect("/projects");
  } catch (err) {
    next(err);
  }
};

const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
};

module.exports = {
  index,
  home,
  loginPage,
  login,
  logout,
};