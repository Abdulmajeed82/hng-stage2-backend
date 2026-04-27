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

// ✅ ROOT ROUTE
app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "HNG Stage 2 API running on Vercel 🚀"
  });
});

// MongoDB
const uri = process.env.MONGODB_URI;
let db;

async function connectDB() {
  if (!uri) throw new Error("MONGODB_URI not set");
  if (db) return db;

  const client = new MongoClient(uri);
  await client.connect();
  db = client.db("hng_stage2");

  return db;
}

// ─── NATURAL LANGUAGE PARSER ───────────────────────────
const COUNTRY_MAP = {
  nigeria: "NG", ghana: "GH", kenya: "KE", ethiopia: "ET",
  tanzania: "TZ", uganda: "UG", "south africa": "ZA",
  egypt: "EG", morocco: "MA"
};

function parseNaturalLanguage(q) {
  const text = q.toLowerCase().trim();
  const filters = {};

  if (/\bfemales?\b/.test(text)) filters.gender = "female";
  else if (/\bmales?\b/.test(text)) filters.gender = "male";

  if (/\byoung\b/.test(text)) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  for (const [k, v] of Object.entries(COUNTRY_MAP)) {
    if (text.includes(k)) {
      filters.country_id = v;
      break;
    }
  }

  return filters;
}

// ─── BUILD QUERY ───────────────────────────────────────
function buildQuery(params) {
  const query = {};

  if (params.gender) query.gender = params.gender;
  if (params.country_id) query.country_id = params.country_id;

  if (params.min_age || params.max_age) {
    query.age = {};
    if (params.min_age) query.age.$gte = params.min_age;
    if (params.max_age) query.age.$lte = params.max_age;
  }

  return query;
}

// ─── GET ALL PROFILES ──────────────────────────────────
app.get("/api/profiles", async (req, res) => {
  try {
    const db = await connectDB();
    const profiles = await db
      .collection("profiles")
      .find({}, { projection: { _id: 0 } })
      .limit(10)
      .toArray();

    res.json({ status: "success", data: profiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error" });
  }
});

// ─── SEARCH ────────────────────────────────────────────
app.get("/api/profiles/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        status: "error",
        message: "q is required"
      });
    }

    const filters = parseNaturalLanguage(q);
    const query = buildQuery(filters);

    const db = await connectDB();
    const results = await db
      .collection("profiles")
      .find(query, { projection: { _id: 0 } })
      .toArray();

    res.json({ status: "success", data: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error" });
  }
});

// ─── GET BY ID ─────────────────────────────────────────
app.get("/api/profiles/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const profile = await db.collection("profiles").findOne(
      { id: req.params.id },
      { projection: { _id: 0 } }
    );

    if (!profile) {
      return res.status(404).json({ status: "error", message: "Not found" });
    }

    res.json({ status: "success", data: profile });
  } catch {
    res.status(500).json({ status: "error" });
  }
});

// ─── DELETE ────────────────────────────────────────────
app.delete("/api/profiles/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("profiles").deleteOne({ id: req.params.id });

    if (!result.deletedCount) {
      return res.status(404).json({ status: "error" });
    }

    res.sendStatus(204);
  } catch {
    res.status(500).json({ status: "error" });
  }
});

// ✅ EXPORT (IMPORTANT FOR VERCEL)
module.exports = app;