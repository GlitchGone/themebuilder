const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema({
  rlNo: { type: String, required: true, unique: true },
  email: { type: [String], required: true},
  agencyId: { type: String, required: true, unique: false },
  themeData: { type: Object, default: {} },  // stores all CSS variables dynamically
  selectedTheme: String,
  bodyFont: String,
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true } ,
  updatedBy:{type:String, default:null}
}, { collection: 'userThemes' });

module.exports = mongoose.model('Theme', themeSchema);