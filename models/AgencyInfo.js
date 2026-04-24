const mongoose = require("mongoose");

const AgencyInfoSchema = new mongoose.Schema({
  full_name:       { type: String, default: null },
  address:         { type: String, default: null },
  agency_name:     { type: String, default: null },
  agencyId:        { type: String, required: true, unique: true },
  relationship_no: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model("AgencyInfo", AgencyInfoSchema);