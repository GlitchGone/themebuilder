const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();

  } catch (err) {
    return res.status(401).json({ message: "Unauthorized. Invalid or expired token." });
  }
};

// const isAuthenticated = (req, res, next) => {
//   if (req.session && req.session.token) {
//     return next();
//   }
//   res.redirect("/login");
// };
const isAuthenticated = (req, res, next) => {
  res.set("Cache-Control", "no-store");  // ← add this line
  if (req.session && req.session.admin) {
    return next();
  }
  res.redirect("/login");
};

// ✅ EXPORT BOTH
module.exports = { protect, isAuthenticated };