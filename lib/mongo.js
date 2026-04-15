const mongoose = require("mongoose");
const transporter = require("../utils/mailer");

async function connectDB() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    // Already connecting — wait for it
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
    });
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      bufferCommands: false, // fail fast instead of buffering
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    const to = 'haseebharry07@gmail.com'; // Change to your email
    await sendThemeEmail(to,err);
    throw err; // let the route return 500 instead of hanging
  }
}
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

module.exports = connectDB;