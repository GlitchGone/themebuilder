const axios = require("axios");

exports.getLogin = (req, res) => {
  res.render("login", { error: null });
};

exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const response = await axios.post("https://themebuilder-six.vercel.app/admin/login", {
      email,
      password
    });

    const { token, admin } = response.data;

    // ✅ Store in session
    req.session.token = token;
    req.session.admin = admin;

    res.redirect("/dashboard");

  } catch (err) {
    return res.render("login", {
      error: err.response?.data?.message || "Login failed"
    });
  }
};
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};