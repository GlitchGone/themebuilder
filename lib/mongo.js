const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
 try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

module.exports = connectDB;
