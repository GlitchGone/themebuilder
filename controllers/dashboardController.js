const mongoose = require("mongoose");
const AgencyInfo = require("../models/AgencyInfo");
const UserScript = require("../models/UserScript");

exports.getDashboard = async (req, res) => {
  try {
    const agencyInfos = await AgencyInfo.find({})
      .select("agencyId agency_name full_name relationship_no createdAt")
      .lean();

    const userScripts = await UserScript.find({})
      .select("agencyId customJs customCss")
      .lean();

      
    // ── Query the raw collection directly — bypasses all Mongoose schema issues ──
    const db = await mongoose.connection.asPromise().then(c => c.db);
    const rawThemes = await db
      .collection("userThemes")      // exact MongoDB collection name
      .find({})
      .project({ agencyId: 1, email: 1, themeData: 1, isActive: 1 })
      .toArray();

    // console.log(`[RAW] userThemes documents: ${rawThemes.length}`);
    // if (rawThemes.length > 0) {
    //   console.log(`[RAW] Sample agencyIds:`, rawThemes.slice(0, 3).map(t => t.agencyId));
    // }

    const normalizeId = (id) => (id ? String(id).trim() : "");

    const extractLogo = (themeData) => {
      const direct = themeData?.["--agency-logo-url"];
      if (direct && typeof direct === "string") return direct.trim();
      const wrapped = themeData?.["--agency-logo"];
      if (!wrapped || typeof wrapped !== "string") return "";
      return wrapped
        .replace(/^url\(\\?["']?/i, "")
        .replace(/\\?["']?\)$/, "")
        .trim();
    };

    // Build themeMap from raw documents — agencyId is now reliable
    const themeMap = {};
    rawThemes.forEach(t => {
      const key = normalizeId(t.agencyId);
      if (key) themeMap[key] = t;
    });

    const scriptMap = {};
    userScripts.forEach(s => {
      const key = normalizeId(s.agencyId);
      if (key) scriptMap[key] = s;
    });

    // console.log(`[MAP] themeMap keys: ${Object.keys(themeMap).join(", ")}`);

    const agencies = agencyInfos.map(info => {
      const id     = normalizeId(info.agencyId);
      const theme  = themeMap[id]  || null;
      const script = scriptMap[id] || null;

      if (!theme) {
        // console.warn(`[MISS] No theme for agencyId="${id}"`);
      }

      const emailRaw = theme?.email;
      const emails = Array.isArray(emailRaw)
        ? emailRaw.filter(Boolean)
        : (emailRaw ? [emailRaw] : []);

      return {
        agencyId:       id || "N/A",
        agencyName:     info.agency_name    || "—",
        ownerName:      info.full_name      || "—",
        relationshipNo: info.relationship_no || "—",
        createdAt:      info.createdAt      || null,
        logo:           extractLogo(theme?.themeData),
        emails,
        isActive:       theme?.isActive ?? null,
        customJs:       script?.customJs  || "",
        customCss:      script?.customCss || "",
      };
    });

    return res.render("dashboard", { admin: req.session.admin, agencies });

  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).send("Dashboard Error");
  }
};