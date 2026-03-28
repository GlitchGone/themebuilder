const mongoose = require('mongoose');

const loaderSchema = new mongoose.Schema({
  loaderName: { type: String, required: true }, // Example: 'BlueGradientSpinner'
  loaderCSS: { type: String, required: true }, // Store complete CSS of the loader as text
  previewImage: { type: String, default: null }, // (Optional) URL for visual preview
 // Optional but recommended 👇
  category: { type: String, default: "general" },
  isDefault: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now   },
}, { 
  collection: 'agencyLoaders' 
});

// Automatically update `updatedAt` when document changes
loaderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AgencyLoader', loaderSchema);
