const Admin = require("../models/Admin");
const bcrypt = require("bcrypt");

exports.getLogin = (req, res) => {
  res.render("login", { error: null });
};

exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.render("login", { error: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.render("login", { error: "Invalid email or password" });
    }
    req.session.admin = { id: admin._id, email: admin.email };
    req.session.save((err) => {
      if (err) console.error(err);
      res.redirect("/dashboard");
    });

  } catch (err) {
    console.error(err);
    return res.render("login", { error: "Login failed" });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};