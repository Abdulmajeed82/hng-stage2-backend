require("dotenv").config();
const { MongoClient } = require("mongodb");
const fs = require("fs");

const uri = process.env.MONGODB_URI;

async function importData() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db("hng_stage2");

    // read your JSON file
    const data = JSON.parse(fs.readFileSync("seed_profiles.json", "utf-8"));

    // OPTIONAL: clear old data
    await db.collection("profiles").deleteMany({});

    // insert new data
    await db.collection("profiles").insertMany(data);

    console.log(`✅ Imported ${data.length} profiles`);
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

importData();