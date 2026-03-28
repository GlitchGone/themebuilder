const mongoose = require('mongoose');

const agencySettingsSchema = new mongoose.Schema({
  agencyId: { type: String, required: true, unique: true },

  loaderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AgencyLoader',
    default: null 
  },

  themeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Theme',
    default: null
  },

  customLoaderCSS: { type: String, default: "" },
    selectedTheme: String,
  bodyFont: String,
  updatedAt: { type: Date, default: Date.now },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

agencySettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AgencySettings', agencySettingsSchema);