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

  // Create unique index on name to prevent duplicates
  await collection.createIndex({ name: 1 }, { unique: true });
  await collection.createIndex({ id: 1 }, { unique: true });

  const raw = fs.readFileSync(path.join(__dirname, "seed_profiles.json"), "utf8");
  const { profiles } = JSON.parse(raw);

  let inserted = 0;
  let skipped = 0;

  for (const p of profiles) {
    try {
      await collection.updateOne(
        { name: p.name },
        {
          $setOnInsert: {
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
          },
        },
        { upsert: true }
      );
      inserted++;
    } catch (err) {
      skipped++;
    }
  }

  console.log(`Seeding complete: ${inserted} processed, ${skipped} errors`);
  await client.close();
}

seed().catch(console.error);