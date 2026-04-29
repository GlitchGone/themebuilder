const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");



const { isAuthenticated } = require("../middleware/authMiddleware");
const dashboardController = require("../controllers/dashboardController");

// Protected route
router.get("/dashboard", isAuthenticated, dashboardController.getDashboard);
// PATCH /dashboard/toggle-status
router.patch("/dashboard/toggle-status", async (req, res) => {
  try {
    const { agencyId, isActive } = req.body;
    if (!agencyId) return res.status(400).json({ error: "agencyId required" });

    const db = await mongoose.connection.asPromise().then(c => c.db);
    const result = await db.collection("userThemes").updateOne(
      { agencyId: String(agencyId).trim() },
      { $set: { isActive: Boolean(isActive) } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Agency not found" });
    }

    return res.json({ success: true, agencyId, isActive });
  } catch (err) {
    console.error("TOGGLE STATUS ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
router.patch("/dashboard/update-emails", async (req, res) => {
  try {
    const { agencyId, emails } = req.body;
    if (!agencyId) return res.status(400).json({ error: "agencyId required" });

    const db = await mongoose.connection.asPromise().then(c => c.db);
    const result = await db.collection("userThemes").updateOne(
      { agencyId: String(agencyId).trim() },
      { $set: { email: emails } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Agency not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("UPDATE EMAILS ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
module.exports = router;