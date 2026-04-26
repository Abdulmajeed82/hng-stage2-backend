require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

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

// MongoDB connection
const uri = process.env.MONGODB_URI;
let db;

async function connectDB() {
  if (db) return db;
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db("hng_stage2");
  return db;
}

// ─── NATURAL LANGUAGE PARSER ──────────────────────────────────────────────────
const COUNTRY_MAP = {
  nigeria: "NG", ghana: "GH", kenya: "KE", ethiopia: "ET", tanzania: "TZ",
  uganda: "UG", "south africa": "ZA", egypt: "EG", morocco: "MA",
  senegal: "SN", angola: "AO", mozambique: "MZ", zambia: "ZM",
  zimbabwe: "ZW", cameroon: "CM", "dr congo": "CD", congo: "CD",
  mali: "ML", "burkina faso": "BF", "ivory coast": "CI", "cote d'ivoire": "CI",
  sudan: "SD", rwanda: "RW", somalia: "SO", madagascar: "MG",
  malawi: "MW", namibia: "NA", botswana: "BW", tunisia: "TN",
  algeria: "DZ", libya: "LY", benin: "BJ", togo: "TG", niger: "NE",
  guinea: "GN", "sierra leone": "SL", liberia: "LR", gabon: "GA",
  eritrea: "ER", burundi: "BI", djibouti: "DJ", "cape verde": "CV",
  comoros: "KM", seychelles: "SC", mauritius: "MU", lesotho: "LS",
  eswatini: "SZ", gambia: "GM", "guinea-bissau": "GW", chad: "TD",
  "central african republic": "CF", "equatorial guinea": "GQ",
  mauritania: "MR", "south sudan": "SS",
  "united states": "US", usa: "US", us: "US",
  "united kingdom": "GB", uk: "GB",
  france: "FR", germany: "DE", brazil: "BR", india: "IN",
  china: "CN", japan: "JP", australia: "AU", canada: "CA",
};

function parseNaturalLanguage(q) {
  const text = q.toLowerCase().trim();
  const filters = {};

  // Gender
  if (/\bmales?\b/.test(text) && !/\bfemales?\b/.test(text)) filters.gender = "male";
  else if (/\bfemales?\b/.test(text) && !/\bmales?\b/.test(text)) filters.gender = "female";

  // Age group
  if (/\bchildren\b|\bchild\b|\bkids?\b/.test(text)) filters.age_group = "child";
  else if (/\bteenagers?\b|\badolescents?\b/.test(text)) filters.age_group = "teenager";
  else if (/\bseniors?\b|\belderly\b/.test(text)) filters.age_group = "senior";
  else if (/\badults?\b/.test(text)) filters.age_group = "adult";

  // "young" → ages 16-24
  if (/\byoung\b/.test(text) && !filters.age_group) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  // Age ranges
  const aboveMatch = text.match(/(?:above|over|older than)\s+(\d+)/);
  if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]);

  const belowMatch = text.match(/(?:below|under|younger than)\s+(\d+)/);
  if (belowMatch) filters.max_age = parseInt(belowMatch[1]);

  const betweenMatch = text.match(/between\s+(\d+)\s+and\s+(\d+)/);
  if (betweenMatch) {
    filters.min_age = parseInt(betweenMatch[1]);
    filters.max_age = parseInt(betweenMatch[2]);
  }

  // Country detection
  for (const [keyword, code] of Object.entries(COUNTRY_MAP)) {
    if (text.includes(keyword)) {
      filters.country_id = code;
      break;
    }
  }

  return filters;
}

// ─── BUILD MONGO QUERY ────────────────────────────────────────────────────────
function buildQuery(params) {
  const query = {};
  if (params.gender) query.gender = params.gender.toLowerCase();
  if (params.age_group) query.age_group = params.age_group.toLowerCase();
  if (params.country_id) query.country_id = params.country_id.toUpperCase();
  if (params.min_age || params.max_age) {
    query.age = {};
    if (params.min_age) query.age.$gte = parseInt(params.min_age);
    if (params.max_age) query.age.$lte = parseInt(params.max_age);
  }
  if (params.min_gender_probability) {
    query.gender_probability = { $gte: parseFloat(params.min_gender_probability) };
  }
  if (params.min_country_probability) {
    query.country_probability = { $gte: parseFloat(params.min_country_probability) };
  }
  return query;
}

// ─── GET /api/profiles ────────────────────────────────────────────────────────
app.get("/api/profiles", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("profiles");

    const { sort_by, order, page, limit, min_age, max_age } = req.query;

    if (min_age && isNaN(parseInt(min_age))) {
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });
    }
    if (max_age && isNaN(parseInt(max_age))) {
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });
    }

    const query = buildQuery(req.query);

    const allowedSortFields = ["age", "created_at", "gender_probability"];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : "created_at";
    const sortOrder = order === "asc" ? 1 : -1;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [profiles, total] = await Promise.all([
      collection.find(query, { projection: { _id: 0 } })
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      collection.countDocuments(query),
    ]);

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data: profiles,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// ─── GET /api/profiles/search ─────────────────────────────────────────────────
app.get("/api/profiles/search", async (req, res) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ status: "error", message: "q query parameter is required" });
    }

    const filters = parseNaturalLanguage(q);

    if (Object.keys(filters).length === 0) {
      return res.status(200).json({ status: "error", message: "Unable to interpret query" });
    }

    const db = await connectDB();
    const collection = db.collection("profiles");

    const query = buildQuery(filters);
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [profiles, total] = await Promise.all([
      collection.find(query, { projection: { _id: 0 } })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      collection.countDocuments(query),
    ]);

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data: profiles,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// ─── GET /api/profiles/:id ────────────────────────────────────────────────────
app.get("/api/profiles/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("profiles");
    const profile = await collection.findOne(
      { id: req.params.id },
      { projection: { _id: 0 } }
    );
    if (!profile) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    return res.status(200).json({ status: "success", data: profile });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// ─── DELETE /api/profiles/:id ─────────────────────────────────────────────────
app.delete("/api/profiles/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("profiles");
    const result = await collection.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;