const mongoose = require("mongoose");

const themeSchema = new mongoose.Schema(
  {
    themeName: {
      type: String,
      required: true,
      unique: true
    },
    themeData: {
      type: Object, // Stores all CSS variables
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Themedynamically", themeSchema);