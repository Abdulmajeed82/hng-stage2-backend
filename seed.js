require("dotenv").config();
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db("hng_stage2");
  const collection = db.collection("profiles");

  const raw = fs.readFileSync(path.join(__dirname, "seed_profiles.json"), "utf8");
  const profiles = JSON.parse(raw);

  // Add id and created_at to each profile
  const docs = profiles.map(p => ({
    id: uuidv4(),
    name: p.name,
    gender: p.gender,
    gender_probability: p.gender_probability,
    age: p.age,
    age_group: p.age_group,
    country_id: p.country_id,
    country_name: p.country_name,
    country_probability: p.country_probability,
    created_at: new Date().toISOString(),
  }));

  // Drop old data and reinsert
  await collection.deleteMany({});
  await collection.insertMany(docs);

  console.log(`✅ Seeded ${docs.length} profiles!`);
  await client.close();
}

seed().catch(console.error);
