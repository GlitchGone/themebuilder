const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(  'mongodb+srv://glitchgone:Ul16UFv0rdLGRq3r@glitchgone.u3qv7.mongodb.net/themeBuilderDB?retryWrites=true&w=majority&appName=GlitchGone',
      // mongodb+srv://haseebharry07_db_user:T7QYyyI0OVVPz5Dw@cluster0.ofu0pz0.mongodb.net/themeBuilderDB?retryWrites=true&w=majority
 {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

module.exports = connectDB;
