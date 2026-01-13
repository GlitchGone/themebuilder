// routes/themeRoutes.js
const express = require('express');
const router = express.Router();
const Theme = require('../models/UserTheme');
const fs = require("fs");
const path = require("path");
const originCheck = require("../middleware/originCheck");
const AgencyLoader = require('../models/loaderSchema');

router.get("/_debug-test", (req, res) => {
  console.log("✅ Theme routes active");
  res.json({ ok: true });
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

    // ✅ If themeData exists → load CSS
    const cssFilePath = path.join(__dirname, "../public/style.css");
    const cssContent = await fs.promises.readFile(cssFilePath, "utf8");
    const encodedCSS = Buffer.from(cssContent, "utf-8").toString("base64");

    // ✅ Send response
    res.json({
      css: encodedCSS,
      themeData: themeData,
      selectedTheme: selectedTheme,
    });

  } catch (err) {
    console.error("❌ API error:", err.message);
    res.status(500).json({ message: "Error loading CSS" });
  }
});


router.get("/merged-css", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;

    if (!agencyId) {
      return res.status(400).json({ message: "agencyId is required" });
    }

    // ✅ Fetch active theme
    const theme = await Theme.findOne({ agencyId, isActive: true });
    if (!theme) {
      return res.status(404).json({ message: "Theme not found or inactive" });
    }

    const themeData = theme.themeData || {};
    const selectedTheme = theme?.selectedTheme || "";

    // ✅ Check if themeData and selectedTheme are missing
    const hasThemeData = Object.keys(themeData).length > 0;
    const hasSelectedTheme = selectedTheme && selectedTheme.trim() !== "";

    // ✅ If both are missing → return only main.css (no system-generated CSS)
    if (!hasThemeData && !hasSelectedTheme) {
      console.warn(`⚠️ No themeData or selectedTheme found for agencyId: ${agencyId}`);

      const mainCssPath = path.join(__dirname, "../public/main.css");
      const mainCss = await fs.promises.readFile(mainCssPath, "utf8");

      res.setHeader("Content-Type", "text/css");
      return res.send(mainCss);
    }

    // ✅ Otherwise, continue with normal themed flow
    let logincss = "";
    const themeCssFiles = {
      "Default Theme": "glitchgonelogin.css",
      "Default Light Theme": "glitchgonelogin.css",
      "BlueWave Theme": "bluewavelogin.css",
      "OceanMist Theme": "oceanmefistlogin.css",
      "OceanMist Light Theme": "oceanmefistlogin.css",
      "VelvetNight Theme": "velvetnightlogin.css",
      "GlitchGone Light Theme": "whitegreenlogin.css",
      "JetBlack Luxury Gold Theme": "jetblacklogin.css",
      "JetBlack Luxury Gold Theme - Light": "jetblacklogin.css",
    };

    if (themeCssFiles[selectedTheme]) {
      const cssFilePath = path.join(__dirname, "../public", themeCssFiles[selectedTheme]);
      try {
        logincss = await fs.promises.readFile(cssFilePath, "utf8");
      } catch (err) {
        console.error(`⚠️ Could not read ${themeCssFiles[selectedTheme]}:`, err);
      }
    }

    // ✅ Loader helpers
    const generatePulsatingLogoCSS = (logoUrl) => `
      .hl-loader-container, .lds-ring, .app-loader,
      #app + .app-loader, #app.loading + .app-loader {
        display: none !important;
      }
      #custom-global-loader {
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100vh;
        background: linear-gradient(180deg, #0074f7 0%, #00c0f7 100%);
        display: flex; justify-content: center; align-items: center;
        z-index: 999999;
      }
      #custom-global-loader::before {
        content: "";
        width: 120px; height: 120px;
        background: url("${logoUrl}") center/contain no-repeat;
        animation: fadeIn 1s ease-in-out infinite alternate;
      }
      @keyframes fadeIn {
        0% { opacity: 0.7; transform: scale(0.95); }
        100% { opacity: 1; transform: scale(1.05); }
      }
    `;

    const generateBouncingLogoCSS = (logoUrl) => `
      .hl-loader-container, .lds-ring, .app-loader,
      #app + .app-loader, #app.loading + .app-loader {
        display: none !important;
      }
      #custom-global-loader {
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100vh;
        background: linear-gradient(180deg, #0074f7 0%, #00c0f7 100%);
        display: flex; justify-content: center; align-items: center;
        z-index: 999999;
      }
      #custom-global-loader::before {
        content: "";
        width: 120px; height: 120px;
        background: url("${logoUrl}") center/contain no-repeat;
        animation: bounceLogo 1s ease-in-out infinite;
      }
      @keyframes bounceLogo {
        0%, 100% { transform: translateY(0); }
        25% { transform: translateY(-30px); }
        50% { transform: translateY(0); }
        75% { transform: translateY(-15px); }
      }
    `;

    // ✅ Select Loader
    const companyLogoUrl = themeData["--loader-company-url"];
    const animationSetting = themeData["--animation-settings"];

    let loaderCSS = "";
    if (companyLogoUrl && companyLogoUrl.trim() !== "") {
      loaderCSS =
        animationSetting === "BouncingLogo"
          ? generateBouncingLogoCSS(companyLogoUrl)
          : generatePulsatingLogoCSS(companyLogoUrl);
    } else {
      const activeLoader = await AgencyLoader.findOne({ agencyId, isActive: true });
      // console.log(activeLoader,'Here is the loader Data');
      loaderCSS = activeLoader?.loaderCSS || "";
    }

    // ✅ Read the system-generated style.css only when themedata exists
    const cssFilePath = path.join(__dirname, "../public/style.css");
    const cssContent = hasThemeData ? await fs.promises.readFile(cssFilePath, "utf8") : "";
    const codeJS = await fs.promises.readFile(path.join(__dirname, "../public/code.js"), "utf8").catch(() => "");

  // ✅ Before generating dynamicVariables
  let processedThemeData = { ...themeData };

  // Only keep --theme-mode if selectedTheme is Light or Dark
  if (!["Dark Theme", "Light Theme"].includes(selectedTheme)) {
    // Remove mode key from themeData for custom themes
    if (processedThemeData["--theme-mode"]) {
      delete processedThemeData["--theme-mode"];
      console.log(`--theme-mode removed from themeData for ${selectedTheme}`);
    }
  }

    // ✅ Dynamic theme variables
    const dynamicVariables = hasThemeData
      ? Object.entries(processedThemeData).map(([key, value]) => `${key}: ${value};`).join("\n")
      : "";

    // ✅ Merge all CSS
    const finalCss = `
    :root {
    ${dynamicVariables}
    }
    ${loaderCSS}
    ${logincss}
    ${cssContent}
    `;

    res.setHeader("Content-Type", "text/css");
    res.send(finalCss);

  } catch (error) {
    console.error("❌ Error merging CSS:", error);
    res.status(500).json({ message: "Server Error merging CSS" });
  }
});

// 🟢 Create or update a loader for an agency
router.post("/loader-css", async (req, res) => {
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
// 🟡 Get all loaders for an agency
router.get("/Get-loader-css", async (req, res) => {
  try {
    const { agencyId } = req.query;
    if (!agencyId) {
      return res.status(400).json({ success: false, message: "agencyId is required" });
    }
    const loaders = await AgencyLoader.find({ agencyId });
    if (!loaders || loaders.length === 0) {
      return res.status(404).json({ success: false, message: "No loaders found for this agency" });
    }
    res.json({ success: true, loaders });
  } catch (err) {
    console.error("❌ Error fetching loaders:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// ✅ Update loader isActive status
router.put("/loader-css/status", async (req, res) => {
  try {
    const { _id, isActive } = req.body;

    // ✅ Validate input
    if (!_id || typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "_id and boolean isActive are required",
      });
    }

    // ✅ Find the loader by ID
    const loader = await AgencyLoader.findById(_id);
    if (!loader) {
      return res.status(404).json({ message: "Loader not found" });
    }

    // ✅ CASE 1: If activating a new loader
    if (isActive) {
      // 🔹 Find currently active loader for this agency
      const currentActive = await AgencyLoader.findOne({
        agencyId: loader.agencyId,
        isActive: true,
      });

      // 🔹 If this same loader is already active → skip updates
      if (currentActive && currentActive._id.equals(loader._id)) {
        return res.status(200).json({
          message: "This loader is already active. No changes made.",
          loader,
        });
      }

      // 🔹 Otherwise, deactivate all loaders of this agency
      await AgencyLoader.updateMany(
        { agencyId: loader.agencyId },
        { isActive: false }
      );
    }

    // ✅ Update the target loader’s status
    loader.isActive = isActive;
    loader.updatedAt = new Date();
    await loader.save();

    res.status(200).json({
      message: `Loader ${isActive ? "activated" : "deactivated"} successfully`,
      loader,
    });
  } catch (err) {
    console.error("❌ Error updating loader status:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/combined", async (req, res) => {
  try {
    const agencyId = req.query.agencyId;
    if (!agencyId) return res.status(400).json({ message: "agencyId is required" });

    const theme = await Theme.findOne({ agencyId, isActive: true });
    if (!theme) return res.status(403).json({ message: "User Not Found Or Invalid ID" });

    const themeData = theme.themeData || {};
    const selectedTheme = theme.selectedTheme || "";

    // === Load local + remote files ===
    const codeJS = await fs.promises.readFile(path.join(__dirname, "../public/code.js"), "utf8").catch(() => "");
    const remoteSettings = await fetch("https://glitch-gone-nu.vercel.app/settings.js").then(r => r.text()).catch(() => "");
    const codefile = await fetch("https://glitch-gone-nu.vercel.app/codefile.js").then(r => r.text()).catch(() => "");
    const topnav = await fs.promises.readFile(path.join(__dirname, "../public/topnav.js"), "utf8").catch(() => "");
    const cssContent = await fs.promises.readFile(path.join(__dirname, "../public/style.css"), "utf8").catch(() => "");
    // === Encode dynamic data ===
    const encodedCSS = Buffer.from(cssContent || "", "utf8").toString("base64");
    const encodedAgn = Buffer.from(agencyId, "utf8").toString("base64");

    // === Inject theme + agency vars ===
    const dynamicVars = `
    const agn = "${encodedAgn}";
   const remoteEncoded = "aHR0cHM6Ly90aGVtZS1idWlsZGVyLWRlbHRhLnZlcmNlbC5hcHAvYXBpL3RoZW1lL2ZpbGU/YWdlbmN5SWQ9${encodedAgn}";
    try { localStorage.setItem('agn', agn); } catch (e) {}
    `;

    // === Combine final JS ===
    const finalJS = `
    ${codefile}
    ${dynamicVars}
    ${codeJS}
    ${remoteSettings}
    `;

    res.setHeader("Content-Type", "application/javascript");
    res.send(finalJS);
  } catch (err) {
    console.error("❌ Error in /combined API:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ New API: Find theme by email
router.get("/:email", async (req, res) => {
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

module.exports = router;
