require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json());

// ─── CORS ─────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── ROOT ROUTE ───────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "HNG Stage 2 API running 🚀"
  });
});

// ─── MONGODB SETUP ────────────────────
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ MONGODB_URI is missing in environment variables");
}

let db;

async function connectDB() {
  if (db) return db;

  const client = new MongoClient(uri);
  await client.connect();

  db = client.db("hng_stage2");
  console.log("✅ Connected to MongoDB");

  return db;
}

// ─── GET ALL PROFILES ─────────────────
app.get("/api/profiles", async (req, res) => {
  try {
    const db = await connectDB();

    const profiles = await db
      .collection("profiles")
      .find({}, { projection: { _id: 0 } })
      .limit(20)
      .toArray();

    return res.status(200).json({
      status: "success",
      data: profiles
    });

  } catch (err) {
    console.error("❌ /profiles error:", err);

    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

// ─── SEARCH PROFILES ──────────────────
app.get("/api/profiles/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        status: "error",
        message: "q is required"
      });
    }

    const db = await connectDB();

    const results = await db
      .collection("profiles")
      .find(
        {
          $text: { $search: q }
        },
        { projection: { _id: 0 } }
      )
      .toArray();

    return res.status(200).json({
      status: "success",
      data: results
    });

  } catch (err) {
    console.error("❌ search error:", err);

    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

// ─── GET PROFILE BY ID ────────────────
app.get("/api/profiles/:id", async (req, res) => {
  try {
    const db = await connectDB();

    const profile = await db.collection("profiles").findOne(
      { id: req.params.id },
      { projection: { _id: 0 } }
    );

    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found"
      });
    }

    return res.status(200).json({
      status: "success",
      data: profile
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

// ─── DELETE PROFILE ───────────────────
app.delete("/api/profiles/:id", async (req, res) => {
  try {
    const db = await connectDB();

    const result = await db.collection("profiles").deleteOne({
      id: req.params.id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found"
      });
    }

    return res.status(204).send();

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

// ─── EXPORT FOR VERCEL ────────────────
module.exports = app;