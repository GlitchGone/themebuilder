const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // or "outlook"
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // app password (IMPORTANT)
  }
});

module.exports = transporter;