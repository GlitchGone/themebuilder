// routes/themeRoutes.js
require("dotenv").config();
const express = require('express');
const router = express.Router();
const Theme = require('../models/UserTheme');
const fs = require("fs");
const path = require("path");
const originCheck = require("../middleware/originCheck");
const AgencyLoader = require('../models/loaderSchema');
const defaultTheme = require("../middleware/defaulttheme");
const Themedynamically = require("../models/Theme");
const transporter = require("../utils/mailer");
const UserScript = require("../models/userScript");
const AgencySettings = require("../models/AgencySettings");
const connectDB = require("../lib/mongo"); // ← add this line
// ─── Server-side caches (persist across warm requests) ───────────────────────
const _fileCache = new Map();        // static CSS files: path → content
const _resultCache = new Map();      // final CSS: agencyId → { css, etag, builtAt }
const RESULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const _remoteJsCache = new Map(); // url → { content, fetchedAt }
const REMOTE_JS_TTL = 5 * 60 * 1000; // 10 minutes
const _combinedCache = new Map(); // agencyId → { js, etag, builtAt }
let _allThemesCache = null; // { data, etag, builtAt }
const ALL_THEMES_TTL = 5 * 60 * 1000; // 5 minutes
async function readFileCached(filePath) {
  if (_fileCache.has(filePath)) return _fileCache.get(filePath);
  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    _fileCache.set(filePath, content);
    return content;
  } catch (e) {
    return "";
  }
}
// ─────────────────────────────────────────────────────────────────────────────
async function fetchRemoteCached(url) {
  const hit = _remoteJsCache.get(url);
  if (hit && (Date.now() - hit.fetchedAt) < REMOTE_JS_TTL) return hit.content;
  try {
    const content = await fetch(url).then(r => r.text());
    _remoteJsCache.set(url, { content, fetchedAt: Date.now() });
    return content;
  } catch (e) {
    // Return stale cache if fetch fails rather than empty string
    return hit?.content || "";
  }
}


router.get("/_debug-test", (req, res) => {
  console.log("✅ Theme routes active");
  res.json({ ok: true });
});
router.post("/addthemes", async (req, res) => {
  await connectDB();
  try {
    const { themeName, themeData, createdBy } = req.body;

    if (!themeName || !themeData) {
      return res.status(400).json({
        message: "themeName and themeData are required"
      });
    }

    // Check duplicate
    const existingTheme = await Themedynamically.findOne({ themeName });

    if (existingTheme) {
      return res.status(409).json({
        message: "Theme with this name already exists"
      });
    }

    const newTheme = new Themedynamically({
      themeName,
      themeData,
      createdBy: createdBy || null
    });

    await newTheme.save();

    res.status(201).json({
      message: "Theme created successfully",
      theme: newTheme
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});
router.get("/getallthemes", async (req, res) => {
  await connectDB();
  try {
    // ── 1. In-memory cache check ──────────────────────────────────────────────
    if (_allThemesCache && (Date.now() - _allThemesCache.builtAt) < ALL_THEMES_TTL) {
      res.setHeader("ETag", _allThemesCache.etag);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

      if (req.headers["if-none-match"] === _allThemesCache.etag) {
        return res.status(304).end();
      }

      return res.status(200).json(_allThemesCache.data);
    }

    // ── 2. Fetch from DB ──────────────────────────────────────────────────────
    const themes = await Themedynamically.find({ isActive: true }).sort({ _id: -1 });

    const responseData = { count: themes.length, themes };

    // ── 3. Build ETag from latest theme's _id ─────────────────────────────────
    const latestId = themes[0]?._id?.toString() || "empty";
    const etag = `"allthemes-${latestId}-${themes.length}"`;

    // ── 4. Store in cache ─────────────────────────────────────────────────────
    _allThemesCache = { data: responseData, etag, builtAt: Date.now() };

    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.status(200).json(responseData);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
router.post("/onboard", async (req, res) => {
  try {
    let { email, Relationship_No, createdBy } = req.body;

    if (!email && !Relationship_No) {
      return res.status(400).json({
        message: "Either email or Relationship_No is required"
      });
    }

    let emailList = [];
    if (email) {
      if (Array.isArray(email)) {
        emailList = email.map(e => e.toLowerCase());
      } else {
        emailList = [email.toLowerCase()];
      }
    }

    if (emailList.length) {
      const existingEmailUser = await Theme.findOne({
        email: { $in: emailList }
      });
      if (existingEmailUser) {
        return res.status(409).json({
          message: "Email already exists, please choose another email. Thanks"
        });
      }
    }

    const AgencyId = await generateAgencyId();

    let query = { agencyId: AgencyId };
    if (emailList.length) {
      query.email = { $in: emailList };
    } else if (Relationship_No) {
      query.Relationship_No = Relationship_No;
    }

    const existingTheme = await Theme.findOne(query);
    if (existingTheme) {
      return res.status(409).json({
        message: "Theme already exists for this user and agency"
      });
    }

    // ✅ Fetch Default Theme template
    const defaultThemeTemplate = await Themedynamically.findOne({ themeName: "Default Theme" });
    console.log(defaultThemeTemplate,'defaultThemeTemplate');
    const newTheme = new Theme({
      email: emailList.length ? emailList : [],
      rlNo: Relationship_No || null,
      agencyId: AgencyId,
      bodyFont: defaultThemeTemplate?.themeData?.["--body-font"] || null,
      isActive: true,
      createdBy: createdBy || null,
      updatedAt: new Date(),
      // ✅ Seed with default theme data
      themeData: defaultThemeTemplate?.themeData || {},
      selectedTheme: defaultThemeTemplate ? "Default Theme" : null
    });

    await newTheme.save();

    const baseURL = "https://themebuilder-six.vercel.app/api/theme";
    const customJsScript = `${baseURL}/combined?agencyId=${AgencyId}`;
    const customCssImport = `${baseURL}/merged-css?agencyId=${AgencyId}`;

    const responseData = {
      themeId: newTheme._id,
      agencyId: AgencyId,
      customJs: `<script src="${customJsScript}"></script>`,
      customCss: `@import url("${customCssImport}");`
    };

    try {
      await UserScript.create({
        email: emailList.length ? emailList[0] : null,
        agencyId: AgencyId,
        themeId: newTheme._id,
        customJs: `<script src="${customJsScript}"></script>`,
        customCss: `@import url("${customCssImport}");`
      });
    } catch (err) {
      console.error("❌ Error saving to UserScript:", err);
    }

    try {
      await AgencySettings.create({
        agencyId: AgencyId,
        loaderId: "69975a870e781c3a0b685ca5", // ✅ fixed loader id
        themeId: newTheme._id,
        selectedTheme: defaultThemeTemplate ? "Default Theme" : null,
        bodyFont: defaultThemeTemplate?.themeData?.["--body-font"] || null
      });
    } catch (err) {
      console.error("❌ Error creating default AgencySettings:", err);
    }

    return res.status(201).json({
      message: "Theme created & email sent successfully",
      ...responseData
    });

  } catch (err) {
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});
router.get("/script/by-email", async (req, res) => {
  try {
    let { email } = req.query;

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    email = email.toLowerCase().trim();

    // 🔥 Find latest script for this user
    const scriptData = await UserScript.findOne({ email })
      .sort({ createdAt: -1 }); // latest first

    if (!scriptData) {
      return res.status(404).json({
        message: "No script found for this email"
      });
    }

    return res.status(200).json({
      message: "Script fetched successfully",
      themeId: scriptData.themeId,
      agencyId: scriptData.agencyId,
      customJs: scriptData.customJs,
      customCss: scriptData.customCss
    });

  } catch (err) {
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});
// Get theme for a user
router.get('/code/:identifier', async (req, res) => {
    try {
        const identifier = req.params.identifier;

        // Find theme where rlNo OR email matches AND isActive = true
         const theme = await Theme.findOne({
            $or: [
                { rlNo: identifier },
                { email: { $in: [identifier] } }  // ✅ check if email array contains identifier
            ],
            isActive: true
            });

        if (!theme) {
            return res.status(404).json({ message: "Theme not found or user is not eligible" });
        }

        res.json(theme);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Save or update theme for a user
router.post("/", async (req, res) => {
  await connectDB();
  console.log("BODY SIZE:", JSON.stringify(req.body).length);
  let { rlNo, email, themeData, selectedTheme, bodyFont, agencyId, updatedBy } = req.body;

  if (!email && !rlNo) {
    return res.status(400).json({ message: "Either email or rlNo is required" });
  }

  try {
    // ✅ Normalize emails
    let emailList = [];
    if (email) {
      if (Array.isArray(email)) {
        emailList = email.map((e) => e.toLowerCase());
      } else {
        emailList = [email.toLowerCase()];
      }
    }
    // ✅ NEW CHECK (cross-agency)
    if (emailList.length > 0) {
      const emailConflict = await Theme.findOne({
        email: { $in: emailList },
        agencyId: { $ne: agencyId }
      });

      if (emailConflict) {
        return res.status(409).json({
          message: "This email is already associated with another agency. Please use a different email."
        });
      }
    }
    // ✅ Build query with agencyId check
    let query = {};
    if (emailList.length > 0) {
        query = {
            email: { $regex: emailList.join('|'), $options: 'i' },
            agencyId
        }    } else if (rlNo) {
      query = { rlNo: rlNo, agencyId: agencyId };
    }

    let existingTheme = await Theme.findOne(query);

    // ❗️Check if theme exists
    if (!existingTheme) {
      return res.status(404).json({ message: "No theme found for the provided email/rlNo and agencyId" });
    }

    // ✅ If found but inactive
    if (!existingTheme.isActive) {
      return res
        .status(403)
        .json({ message: "User is not eligible to update the theme" });
    }

    // ✅ Update existing theme
    // if (emailList.length > 0) existingTheme.email = emailList;
    // if (rlNo) existingTheme.rlNo = rlNo;
    // Check if theme changed
    const isNewTheme = existingTheme.selectedTheme !== selectedTheme;

    // Default menu customization data
    const defaultMenuCustomizations = {
      sb_dashboard: { title: "Dashboard", icon: "f853" },
      sb_conversations: { title: "Conversations", icon: "f27a" },
      sb_calendars: { title: "Calendars", icon: "f133" },
      sb_launchpad: { title: "Launchpad", icon: "f06a" },
      sb_opportunities: { title: "Opportunities", icon: "f83e" },
      sb_contacts: { title: "Contacts", icon: "f2c2" },
      sb_payments: { title: "Payments", icon: "f81d" },
      sb_reporting: { title: "Reporting", icon: "f24d" },
      sb_email_marketing: { title: "Email Marketing", icon: "f07a" },
      sb_automation: { title: "Automation", icon: "f544" },
      sb_sites: { title: "Sites", icon: "f0ac" },
      sb_app_media: { title: "App Media", icon: "f478" },
      sb_memberships: { title: "Memberships", icon: "f390" },
      sb_reputation: { title: "Reputation", icon: "f005" }
    };

    // If new theme → inject menu customizations
    if (isNewTheme) {
      existingTheme.themeData = {
        ...existingTheme.themeData,
        "--menuCustomizations": JSON.stringify(defaultMenuCustomizations)
      };
    }

    existingTheme.themeData = themeData;
    existingTheme.selectedTheme = selectedTheme;
    existingTheme.bodyFont = bodyFont;
    existingTheme.updatedAt = new Date();
    existingTheme.updatedBy = updatedBy || null; //added by myself new
    console.log(existingTheme,'here is existingTheme');
    await existingTheme.save();

    res.json({
      message: "Theme updated successfully",
      updatedBy: existingTheme.updatedBy,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
router.get("/file", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;

    if (!agencyId) {
      return res.status(400).json({ message: "agencyId is required" });
    }

    // ✅ Fetch active theme
    const theme = await Theme.findOne({ agencyId, isActive: true });
    if (!theme) {
      return res.status(403).json({ message: "Invalid or inactive agencyId" });
    }

    const themeData = theme.themeData || {};
    const selectedTheme = theme.selectedTheme || "";

    // ✅ If no themeData found (null, undefined, or empty object) → send nothing
    const hasThemeData = themeData && Object.keys(themeData).length > 0;
    if (!hasThemeData) {
      console.warn(`⚠️ No Data Related Theme found for agencyId: ${agencyId}`);
      return res.status(204).send(); // 204 = No Content
      // OR, if you prefer a message instead of an empty response:
      // return res.status(404).json({ message: "No theme data found" });
    }
    const companyLogoUrl = themeData["--loader-company-url"];
    const animationSetting = themeData["--animation-settings"];
    const settings = await AgencySettings.findOne({ agencyId });
    let loaderCSS = "";
    if (companyLogoUrl && companyLogoUrl.trim() !== "") {
      loaderCSS = animationSetting === "BouncingLogo"
        ? generateBouncingLogoCSS(companyLogoUrl)
        : generatePulsatingLogoCSS(companyLogoUrl);
    } else {
      if (settings?.customLoaderCSS) {
        loaderCSS = settings.customLoaderCSS;
      } else if (settings?.loaderId) {
        const loader = await AgencyLoader.findById(settings.loaderId);
        loaderCSS = loader?.loaderCSS || "";
      }
    }
    // ✅ If themeData exists → load CSS
    const cssFilePath = path.join(__dirname, "../public/style.css");
    const cssContent = await fs.promises.readFile(cssFilePath, "utf8");
    const encodedCSS = Buffer.from(cssContent, "utf-8").toString("base64");

    // ✅ Send response
    res.json({
      css: encodedCSS,
      themeData: themeData,
      selectedTheme: selectedTheme,
      loaderCSS: Buffer.from(loaderCSS, "utf8").toString("base64") // encode it
    });

  } catch (err) {
    console.error("❌ API error:", err.message);
    res.status(500).json({ message: "Error loading CSS" });
  }
});
router.post("/check-theme", async (req, res) => {
  await connectDB();
    try {
        const { email, agencyId } = req.body;

        // ✅ Validation
        if (!email || !agencyId) {
            return res.status(400).json({
                success: false,
                message: "Email and agencyId are required"
            });
        }

        // ✅ Query with email + agencyId + isActive
        const theme = await Theme.findOne({
            email: email,
            agencyId: agencyId,
            isActive: true
        });

        if (!theme) {
            return res.json({ success: false }); // ❌ Not found
        }

        return res.json({ success: true }); // ✅ Found
    } catch (err) {
        console.error("❌ API Error:", err.message);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});
router.get("/merged-css", async (req, res) => {
  await connectDB();
  try {
    const agencyId = req.query.agencyId;
    if (!agencyId) return res.status(400).json({ message: "agencyId is required" });

    // ── 1. Fetch theme (always needed to get updatedAt for ETag) ──────────────
    const theme = await Theme.findOne({ agencyId, isActive: true });
    if (!theme) return res.status(404).json({ message: "Theme not found or inactive" });

    const themeData = theme.themeData || {};
    const selectedTheme = theme.selectedTheme || "";
    const hasThemeData = Object.keys(themeData).length > 0;

    if (!hasThemeData || selectedTheme === "") {
      console.warn(`⚠️ No themeData found for agencyId: ${agencyId}`);
      return res.status(204).send();
    }

    // ── 2. ETag check — if theme hasn't changed, skip all work ────────────────
    const etag = `"${agencyId}-${theme.updatedAt?.getTime?.() || Date.now()}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end(); // Browser uses its cached copy
    }

    // ── 3. In-memory result cache check ───────────────────────────────────────
    const cached = _resultCache.get(agencyId);
    if (cached && cached.etag === etag && (Date.now() - cached.builtAt) < RESULT_CACHE_TTL) {
      res.setHeader("Content-Type", "text/css");
      return res.send(cached.css);
    }

    // ── 4. Run DB queries in parallel ─────────────────────────────────────────
    const themeCssFiles = {
      "Green Night Theme": "glitchgonelogin.css",
      "Default Light Theme": "glitchgonelogin.css",
      "BlueWave Theme": "bluewavelogin.css",
      "OceanMist Theme": "oceanmefistlogin.css",
      "OceanMist Light Theme": "oceanmefistlogin.css",
      "VelvetNight Theme": "velvetnightlogin.css",
      "GlitchGone Light Theme": "whitegreenlogin.css",
      "JetBlack Luxury Gold Theme": "jetblacklogin.css",
      "JetBlack Luxury Gold Theme - Light": "jetblacklogin.css",
      "Veltrix Nova Theme": "veltrixnovaloginpage.css",
    };

    const loginCssFile = themeCssFiles[selectedTheme];

    const [settings, styleCss, logincss] = await Promise.all([
      AgencySettings.findOne({ agencyId }),
      readFileCached(path.join(__dirname, "../public/style.css")),
      loginCssFile
        ? readFileCached(path.join(__dirname, "../public", loginCssFile))
        : Promise.resolve(""),
    ]);

    // ── 5. Build loader CSS ───────────────────────────────────────────────────
    const companyLogoUrl = themeData["--loader-company-url"];
    const animationSetting = themeData["--animation-settings"];

    let loaderCSS = "";
    if (companyLogoUrl && companyLogoUrl.trim() !== "") {
      loaderCSS = animationSetting === "BouncingLogo"
        ? generateBouncingLogoCSS(companyLogoUrl)
        : generatePulsatingLogoCSS(companyLogoUrl);
    } else if (settings?.customLoaderCSS) {
      loaderCSS = settings.customLoaderCSS;
    } else if (settings?.loaderId) {
      const loader = await AgencyLoader.findById(settings.loaderId);
      loaderCSS = loader?.loaderCSS || "";
    }

    // ── 6. Build dynamic variables ────────────────────────────────────────────
    let processedThemeData = { ...themeData };
    if (!["Dark Theme", "Light Theme"].includes(selectedTheme)) {
      delete processedThemeData["--theme-mode"];
    }

    const dynamicVariables = Object.entries(processedThemeData)
      .map(([key, value]) => `${key}: ${value};`)
      .join("\n");

    // ── 7. Assemble final CSS ─────────────────────────────────────────────────
    const finalCss = `:root {\n${dynamicVariables}\n}\n${loaderCSS}\n${logincss}\n${styleCss}`;

    // ── 8. Store in memory cache ──────────────────────────────────────────────
    _resultCache.set(agencyId, { css: finalCss, etag, builtAt: Date.now() });

    res.setHeader("Content-Type", "text/css");
    res.send(finalCss);

  } catch (error) {
    console.error("❌ Error merging CSS:", error);
    res.status(500).json({ message: "Server Error merging CSS" });
  }
});
router.post("/loader-css", async (req, res) => {
  await connectDB();
  try {
    const { agencyId, loaderName, loaderCSS, previewImage, isActive } = req.body;

    // ✅ Validate required fields
    if (!agencyId || !loaderName || !loaderCSS) {
      return res.status(400).json({
        message: "agencyId, loaderName, and loaderCSS are required"
      });
    }

    // ✅ If this loader is marked active, deactivate others for same agency
    if (isActive) {
      await AgencyLoader.updateMany({ agencyId }, { isActive: false });
    }

    // ✅ Create a new loader record
    const newLoader = new AgencyLoader({
      agencyId,
      loaderName,
      loaderCSS,
      previewImage: previewImage || null,
      isActive: !!isActive,
      updatedAt: new Date()
    });

    await newLoader.save();

    res.status(201).json({
      message: "Loader saved successfully",
      loader: newLoader
    });
  } catch (err) {
    console.error("❌ Error saving loader:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// 🟡 Get all loaders for an agency -0 need to update this API to remove agency Based.
router.get("/Get-loader-css", async (req, res) => {
  await connectDB();
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
    }
    const userTheme = await Theme.findOne({ email: email, isActive: true });

    if(!userTheme || userTheme.email.length === 0 || userTheme.isActive === false){
      return res.status(404).json({ message: "User theme not found" });
    }

    const loaders = await AgencyLoader.find().lean();
    const settings = await AgencySettings.findOne({
      agencyId: userTheme.agencyId
    }).lean();
    console.log(settings,'here are loaders');
    res.json({
      success: true,
      loaders,
      activeLoaderId: settings?.loaderId || null
    });

  } catch (err) {
    console.error("❌ Error fetching loaders:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});
// ✅ Update loader isActive status
router.put("/loader-css/status", async (req, res) => {
  await connectDB();
  try {
    const { _id,email } = req.body;

    // ✅ Validate input

    if (!_id) {
      return res.status(400).json({
        message: "loader _id is required",
      });
    }
    const userTheme = await Theme.findOne({ email: email, isActive: true });
    if(!userTheme || userTheme.email.length === 0 || userTheme.isActive === false){
      return res.status(404).json({ message: "User theme not found" });
    }
    const agencysettings = await AgencySettings.findOne({ agencyId: userTheme.agencyId });
    // ✅ Find the loader by ID
    const loader = await AgencyLoader.findById(_id);
    if (!loader) {
      return res.status(404).json({ message: "Loader not found" });
    }

        const currentActive = await AgencySettings.findOne({
          agencyId: userTheme.agencyId,
        });
        console.log(currentActive,'here is current active loader');
        if (
          currentActive &&
          currentActive.loaderId &&
          currentActive.loaderId.equals(loader._id)
        ) {
          return res.status(200).json({
            message: "Already active",
            loaderId: loader._id,
          });
        }

      // 🔹 Otherwise, deactivate all loaders of this agency
      await AgencySettings.updateOne(
        { agencyId: userTheme.agencyId },
        { loaderId: loader._id, updatedAt: new Date() },
        { upsert: true }
      );

    res.status(200).json({
      message: "Loader activated successfully",
      loaderId: loader._id
    });
  } catch (err) {
    console.error("❌ Error updating loader status:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
router.get("/combined", async (req, res) => {
  await connectDB();
  try {
    const agencyId = req.query.agencyId;
    if (!agencyId) return res.status(400).json({ message: "agencyId is required" });

    // ── 1. Fetch theme (always needed for ETag) ───────────────────────────────
    const theme = await Theme.findOne({ agencyId, isActive: true });
    if (!theme) return res.status(403).json({ message: "User Not Found Or Invalid ID" });

    // ── 2. ETag check ─────────────────────────────────────────────────────────
    const etag = `"combined-${agencyId}-${theme.updatedAt?.getTime?.() || Date.now()}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    // ── 3. In-memory result cache check ───────────────────────────────────────
    const cached = _combinedCache.get(agencyId);
    if (cached && cached.etag === etag && (Date.now() - cached.builtAt) < RESULT_CACHE_TTL) {
      res.setHeader("Content-Type", "application/javascript");
      return res.send(cached.js);
    }

    // ── 4. Fetch all remote + local files in parallel ─────────────────────────
    const [codeJS, remoteSettings, codefile, topnav] = await Promise.all([
      fetchRemoteCached("https://glitch-gone-nu.vercel.app/code.js"),
      fetchRemoteCached("https://glitch-gone-nu.vercel.app/settings.js"),
      fetchRemoteCached("https://glitch-gone-nu.vercel.app/codefile.js"),
      readFileCached(path.join(__dirname, "../public/topnav.js")),
    ]);

    // ── 5. Build dynamic vars (agencyId-specific) ─────────────────────────────
    const encodedAgn = Buffer.from(agencyId, "utf8").toString("base64");
    const dynamicVars = `
const agn = "${encodedAgn}";
const remoteEncoded = "aHR0cHM6Ly90aGVtZWJ1aWxkZXItc2l4LnZlcmNlbC5hcHAvYXBpL3RoZW1lL2ZpbGU/YWdlbmN5SWQ9${encodedAgn}";
try { localStorage.setItem('agn', agn); } catch (e) {}
`;

    // ── 6. Assemble final JS ──────────────────────────────────────────────────
    const finalJS = `${codefile}\n${dynamicVars}\n${codeJS}\n${remoteSettings}`;

    // ── 7. Store in memory cache ──────────────────────────────────────────────
    _combinedCache.set(agencyId, { js: finalJS, etag, builtAt: Date.now() });

    res.setHeader("Content-Type", "application/javascript");
    res.send(finalJS);

  } catch (err) {
    console.error("❌ Error in /combined API:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/agencysettings", async (req, res) => {
  await connectDB();

  try {
    const { agencyId } = req.body;

    if (!agencyId) {
      return res.status(400).json({ message: "agencyId is required" });
    }

    const result = await AgencySettings.updateOne(
      {
        agencyId: agencyId,
        loaderId: null // ✅ only update if loaderId is null
      },
      {
        $set: {
          loaderId: "69975a870e781c3a0b685ca5"
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "No matching record found or loaderId already set"
      });
    }

    return res.status(200).json({
      message: "LoaderId updated successfully",
      updated: result
    });

  } catch (err) {
    console.error("❌ Error in /agencysettings API:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
// ✅ New API: Find theme by email
router.get("/:email", async (req, res) => {
  await connectDB();
    try {
        const email = req.params.email;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const theme = await Theme.findOne({ email: email, isActive: true });

        if (!theme) {
            return res.json({ success: false }); // ❌ Not found or inactive
        }

        return res.json({ success: true }); // ✅ Found and active
    } catch (err) {
        console.error("❌ API Error:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
const generateAgencyId = async () => {
  let isUnique = false;
  let agencyId;

  while (!isUnique) {
    const randomNum = Math.floor(100000 + Math.random() * 900000); // 6 digit
    agencyId = `ign${randomNum}`;

    const existing = await Theme.findOne({ agencyId });

    if (!existing) {
      isUnique = true;
    }
  }

  return agencyId;
};
async function sendThemeEmail(to, data) {
  const safeJs = data.customJs
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const safeCss = data.customCss
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: "Your Theme Builder Script",
   html: `
  <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 30px;">

    <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">

      <!-- Header -->
      <div style="background: linear-gradient(135deg, #4a90e2, #007aff); padding: 20px; text-align: center; color: white;">
        <h2 style="margin: 0;">🎉 You are Registered Successfully</h2>
        <p style="margin: 5px 0 0;">Your custom theme is ready</p>
      </div>

      <!-- Body -->
      <div style="padding: 20px; color: #333;">

        <p style="font-size: 14px;">Hello,</p>
        <p style="font-size: 14px;">
          Your theme has been successfully created. Please find your integration details below:
        </p>

        <!-- JS -->
        <div style="margin: 15px 0;">
          <strong>Custom JS Script:</strong>
          <div style="background: #0f172a; color: #38bdf8; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; overflow-x: auto;">
            ${safeJs}
          </div>
        </div>

        <!-- CSS -->
        <div style="margin: 15px 0;">
          <strong>Custom CSS:</strong>
          <div style="background: #0f172a; color: #22c55e; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; overflow-x: auto;">
            ${safeCss}
          </div>
        </div>

        <!-- Instructions -->
        <p style="font-size: 14px;">
          Copy and paste the above code into your website to activate your theme.
        </p>

        <!-- Warning -->
        <div style="margin-top: 20px; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 6px;">
          <strong style="color: #856404;">⚠️ Important Note:</strong>
          <p style="margin: 5px 0; font-size: 13px; color: #856404;">
            Please do not share this code with anyone. Unauthorized sharing may result in your theme builder being blocked for security reasons.
          </p>
        </div>

      </div>

      <!-- Footer -->
      <div style="background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #888;">
        © ${new Date().getFullYear()} Growthable • All rights reserved
      </div>

    </div>
  </div>
`
  };

  await transporter.sendMail(mailOptions);
}
module.exports = router;
