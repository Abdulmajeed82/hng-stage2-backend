require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ROOT
app.get("/", (req, res) => {
  res.json({ status: "success", message: "Local API running 🚀" });
});

// MongoDB
const uri = process.env.MONGODB_URI;
let db;

async function connectDB() {
  if (!uri) throw new Error("MONGODB_URI missing");
  if (db) return db;

  const client = new MongoClient(uri);
  await client.connect();
  db = client.db("hng_stage2");
  return db;
}

// SIMPLE ROUTE (LOCAL TEST)
app.get("/api/profiles", async (req, res) => {
  const db = await connectDB();
  const data = await db.collection("profiles").find().limit(10).toArray();
  res.json({ status: "success", data });
});

// START SERVER (ONLY HERE)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});