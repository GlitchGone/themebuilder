const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  console.log("ENV:", process.env.MONGO_URI);
  try {
    const db = await mongoose.connect(process.env.MONGO_URI);

    isConnected = db.connections[0].readyState;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

module.exports = connectDB;