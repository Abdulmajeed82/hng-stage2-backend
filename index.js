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

// ─── ROOT ─────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({ status: "success", message: "HNG Stage 2 API running 🚀" });
});

// ─── MONGODB ──────────────────────────
const uri = process.env.MONGODB_URI;
let db;

async function connectDB() {
  if (db) return db;
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db("hng_stage2");
  console.log("✅ Connected to MongoDB");
  return db;
}

// ─── NATURAL LANGUAGE PARSER ──────────
function parseNaturalQuery(q) {
  const text = q.toLowerCase().trim();
  const filters = {};

  // Gender
  if (/\bmales?\b/.test(text)) filters.gender = "male";
  else if (/\bfemales?\b/.test(text)) filters.gender = "female";
  else if (/\bmen\b/.test(text)) filters.gender = "male";
  else if (/\bwomen\b/.test(text)) filters.gender = "female";

  // Age group
  if (/\bteenager(s)?\b/.test(text)) filters.age_group = "teenager";
  else if (/\bchild(ren)?\b/.test(text)) filters.age_group = "child";
  else if (/\bsenior(s)?\b/.test(text)) filters.age_group = "senior";
  else if (/\badult(s)?\b/.test(text)) filters.age_group = "adult";

  // "young" maps to 16-24 (not a stored age_group)
  if (/\byoung\b/.test(text)) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  // above/older than X
  const aboveMatch = text.match(/(?:above|older than|over)\s+(\d+)/);
  if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]);

  // below/younger than X
  const belowMatch = text.match(/(?:below|younger than|under)\s+(\d+)/);
  if (belowMatch) filters.max_age = parseInt(belowMatch[1]);

  // Country mapping
  const countryMap = {
    nigeria: "NG", ghana: "GH", kenya: "KE", angola: "AO",
    ethiopia: "ET", tanzania: "TZ", uganda: "UG", cameroon: "CM",
    senegal: "SN", benin: "BJ", togo: "TG", mali: "ML",
    niger: "NE", chad: "TD", sudan: "SD", egypt: "EG",
    morocco: "MA", algeria: "DZ", tunisia: "TN", libya: "LY",
    southafrica: "ZA", "south africa": "ZA", zimbabwe: "ZW",
    zambia: "ZM", mozambique: "MZ", madagascar: "MG",
    rwanda: "RW", burundi: "BI", somalia: "SO", eritrea: "ER",
    djibouti: "DJ", comoros: "KM", mauritius: "MU",
    "ivory coast": "CI", "cote d'ivoire": "CI", liberia: "LR",
    "sierra leone": "SL", guinea: "GN", "guinea-bissau": "GW",
    gambia: "GM", "cape verde": "CV", "sao tome": "ST",
    gabon: "GA", congo: "CG", "democratic republic of congo": "CD",
    "dr congo": "CD", "central african republic": "CF",
    "equatorial guinea": "GQ", botswana: "BW", namibia: "NA",
    lesotho: "LS", swaziland: "SZ", eswatini: "SZ", malawi: "MW",
  };

  for (const [countryName, code] of Object.entries(countryMap)) {
    if (text.includes(countryName)) {
      filters.country_id = code;
      break;
    }
  }

  // Must have at least one filter to be valid
  if (Object.keys(filters).length === 0) return null;

  return filters;
}

// ─── SEARCH (must be before /:id) ─────
app.get("/api/profiles/search", async (req, res) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ status: "error", message: "q is required" });
    }

    const filters = parseNaturalQuery(q);

    if (!filters) {
      return res.status(200).json({ status: "error", message: "Unable to interpret query" });
    }

    const db = await connectDB();
    const query = buildMongoQuery(filters);

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      db.collection("profiles").find(query, { projection: { _id: 0 } }).skip(skip).limit(limitNum).toArray(),
      db.collection("profiles").countDocuments(query),
    ]);

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data,
    });

  } catch (err) {
    console.error("❌ search error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// ─── BUILD MONGO QUERY FROM FILTERS ───
function buildMongoQuery(filters) {
  const query = {};

  if (filters.gender) query.gender = filters.gender;
  if (filters.age_group) query.age_group = filters.age_group;
  if (filters.country_id) query.country_id = filters.country_id;
  if (filters.min_gender_probability !== undefined)
    query.gender_probability = { ...query.gender_probability, $gte: parseFloat(filters.min_gender_probability) };
  if (filters.min_country_probability !== undefined)
    query.country_probability = { ...query.country_probability, $gte: parseFloat(filters.min_country_probability) };

  if (filters.min_age !== undefined || filters.max_age !== undefined) {
    query.age = {};
    if (filters.min_age !== undefined) query.age.$gte = parseInt(filters.min_age);
    if (filters.max_age !== undefined) query.age.$lte = parseInt(filters.max_age);
  }

  return query;
}

// ─── GET ALL PROFILES ─────────────────
app.get("/api/profiles", async (req, res) => {
  try {
    const {
      gender, age_group, country_id,
      min_age, max_age,
      min_gender_probability, min_country_probability,
      sort_by, order,
      page, limit,
    } = req.query;

    // Validate types
    if (min_age && isNaN(parseInt(min_age)))
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });
    if (max_age && isNaN(parseInt(max_age)))
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });
    if (min_gender_probability && isNaN(parseFloat(min_gender_probability)))
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });
    if (min_country_probability && isNaN(parseFloat(min_country_probability)))
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });

    const validSortFields = ["age", "created_at", "gender_probability"];
    const validOrders = ["asc", "desc"];
    if (sort_by && !validSortFields.includes(sort_by))
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });
    if (order && !validOrders.includes(order))
      return res.status(422).json({ status: "error", message: "Invalid query parameters" });

    // Build query
    const query = buildMongoQuery({
      gender, age_group, country_id,
      min_age, max_age,
      min_gender_probability, min_country_probability,
    });

    // Pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortField = sort_by || "created_at";
    const sortOrder = (order || "asc") === "desc" ? -1 : 1;
    const sort = { [sortField]: sortOrder };

    const db = await connectDB();

    const [data, total] = await Promise.all([
      db.collection("profiles").find(query, { projection: { _id: 0 } }).sort(sort).skip(skip).limit(limitNum).toArray(),
      db.collection("profiles").countDocuments(query),
    ]);

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data,
    });

  } catch (err) {
    console.error("❌ /profiles error:", err);
    return res.status(500).json({ status: "error", message: err.message });
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
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }

    return res.status(200).json({ status: "success", data: profile });

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// ─── DELETE PROFILE ───────────────────
app.delete("/api/profiles/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection("profiles").deleteOne({ id: req.params.id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }

    return res.status(204).send();

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = app;