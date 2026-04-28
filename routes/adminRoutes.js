const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const Admin   = require("../models/Admin");
const { protect } = require("../middleware/authMiddleware");

// ─── Seeder: Create first superadmin (run once, then disable) ────────────────
// POST /admin/seed
router.post("/seed", async (req, res) => {
  try {
    const existing = await Admin.findOne({ email: "superadmin@yourdomain.com" });
    if (existing) {
      return res.status(409).json({ message: "Superadmin already exists." });
    }

    await Admin.create({
      full_name: "Super Admin",
      email:     "superadmin@yourdomain.com",
      password:  "Admin@123",   // ← change this immediately after first login
      role:      "superadmin",
    });

    return res.status(201).json({ message: "Superadmin created successfully." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── Login ───────────────────────────────────────────────────────────────────
// POST /admin/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: "Your account has been deactivated. Contact superadmin." });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      admin: {
        id:        admin._id,
        full_name: admin.full_name,
        email:     admin.email,
        role:      admin.role,
      }
    });

  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── Logout ──────────────────────────────────────────────────────────────────
// POST /admin/logout  (protected)
router.post("/logout", protect, (req, res) => {
  // JWT is stateless — logout is handled client-side by deleting the token.
  // For extra security you can maintain a token blacklist in Redis here.
  return res.status(200).json({ message: "Logged out successfully." });
});

// ─── Get current logged-in admin ─────────────────────────────────────────────
// GET /admin/me  (protected)
router.get("/me", protect, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");
    if (!admin) return res.status(404).json({ message: "Admin not found." });
    return res.status(200).json({ admin });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── Create new admin  (superadmin only) ─────────────────────────────────────
// POST /admin/create  (protected)
router.post("/create", protect, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({ message: "Only superadmin can create new admins." });
    }

    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ message: "full_name, email and password are required." });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "Admin with this email already exists." });
    }

    const newAdmin = await Admin.create({ full_name, email, password, role: role || "admin" });

    return res.status(201).json({
      message: "Admin created successfully.",
      admin: {
        id:        newAdmin._id,
        full_name: newAdmin.full_name,
        email:     newAdmin.email,
        role:      newAdmin.role,
      }
    });

  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── Deactivate an admin  (superadmin only) ───────────────────────────────────
// PATCH /admin/:id/deactivate  (protected)
router.patch("/:id/deactivate", protect, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({ message: "Only superadmin can deactivate admins." });
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select("-password");

    if (!admin) return res.status(404).json({ message: "Admin not found." });

    return res.status(200).json({ message: "Admin deactivated.", admin });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Example: Get all agency information for Theme Builder dashboard



module.exports = router;