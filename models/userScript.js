const mongoose = require("mongoose");

const userScriptSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },

  agencyId: {
    type: String,
    required: true,
    index: true
  },

  themeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Theme",
    required: true
  },

  customJs: {
    type: String,
    required: true
  },

  customCss: {
    type: String,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true // adds createdAt & updatedAt automatically
});

module.exports = mongoose.model("UserScript", userScriptSchema);