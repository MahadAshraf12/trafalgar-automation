// Install dependencies first:
// npm install @supabase/supabase-js fs

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

// ---------------- Configuration ----------------
const SUPABASE_URL = process.env.SUPABASE_URL || "https://vrcnwvcsvsudmtokdapd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyY253dmNzdnN1ZG10b2tkYXBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1Nzk5NjUsImV4cCI6MjA3MzE1NTk2NX0.n_0YTReO8Qqyfi-ajw2ixKl4yOne5xbaf9dBNqo-ius"; // service_role key preferred
const TRIPS_TABLE = process.env.TRIPS_TABLE || "trips";
const TRIP_DETAILS_TABLE = process.env.TRIP_DETAILS_TABLE || "trip_details";
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 50);
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS || 200);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_KEY must be set (env or .env).");
  process.exit(1);
}

// Load trips data
if (!fs.existsSync('./trips.json')) {
  console.error("ERROR: trips.json not found");
  process.exit(1);
}
const tripsData = JSON.parse(fs.readFileSync('./trips.json', 'utf8'));

// Load trip details data
if (!fs.existsSync('./trip_details_us.json')) {
  console.error("ERROR: trip_details_us.json not found");
  process.exit(1);
}
const tripDetailsData = JSON.parse(fs.readFileSync('./trip_details_us.json', 'utf8'));

// Load trip ratings data
if (!fs.existsSync('./trip_ratings.json')) {
  console.error("ERROR: trip_ratings.json not found");
  process.exit(1);
}
const tripRatingsData = JSON.parse(fs.readFileSync('./trip_ratings.json', 'utf8'));

// Read scraped activity levels and build a map (trip_id -> activity_level)
const ACTIVITY_LEVELS_PATH = './json_files/trip_tweaked_icons.json';
let activityLevelMap = new Map();
if (fs.existsSync(ACTIVITY_LEVELS_PATH)) {
  try {
    const activityJson = JSON.parse(fs.readFileSync(ACTIVITY_LEVELS_PATH, 'utf8'));
    activityLevelMap = new Map(activityJson
      .filter(x => x && typeof x.trip_id !== 'undefined')
      .map(x => [x.trip_id, x.activity_level || null])
    );
  } catch (e) {
    console.warn('Warning: failed reading activity levels:', e.message);
  }
} else {
  console.warn(`Warning: ${ACTIVITY_LEVELS_PATH} not found; skipping activity levels`);
}

// Create ratings map
const ratingsMap = new Map();
tripRatingsData.forEach(rating => {
  ratingsMap.set(rating.trip_id, {
    avg_rating: rating.avg_rating,
    total_reviews: rating.total_reviews
  });
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Prepare trips entries
const tripsEntries = tripsData.map(trip => {
  const ratings = ratingsMap.get(trip.trip_id);
  return {
    trip_id: trip.trip_id,
    name: trip.trip_name, // table column is 'name'
    trip_provider: 'TRAFALGAR',
    trip_productline: trip.trip_product_line,
    region: trip.region,
    service_level: 'Standard',
    trip_description: trip.trip_description,
    banner_image: trip.banner_image,
    departures: trip.departures, // assuming JSONB column
    advertised_departures: trip.advertised_departures, // assuming JSONB column
    duration: trip.duration,
    trip_current_price: trip.trip_current_price, // numeric
    reviews: trip.reviews,
    avg_rating: ratings?.avg_rating ?? undefined,
    total_reviews: ratings?.total_reviews ?? undefined,
    activity_level: activityLevelMap.get(trip.trip_id) ?? undefined
  };
});

// Prepare trip details entries
let tripDetailsEntries = tripDetailsData.map(detail => ({
  trip_id: detail.trip_id,
  trip_sku: detail.trip_sku,
  departure_id: detail.departure_id,
  start_date: detail.start_date,
  end_date: detail.end_date,
  trip_current_price: detail.trip_current_price,
  trip_prev_price: detail.trip_prev_price,
  duration: detail.duration,
  region: detail.region,
  availability: detail.availability,
  max_group_size: detail.max_group_size,
  min_group_size: detail.min_group_size,
  avg_group_size: detail.avg_group_size
}));

// Filter invalid entries
const uniqueDetails = tripDetailsEntries.filter(item =>
  item.trip_id && item.departure_id && item.start_date && item.end_date
);

console.log(`Prepared ${tripsEntries.length} trips and ${uniqueDetails.length} valid trip details for upsert.`);

// Helper: split into chunks
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Helper: remove null/undefined so we don't overwrite existing values with nulls
function stripNullish(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

async function upsertBatch(table, entries, conflictKey) {
  try {
    // Ensure each row omits null/undefined fields
    const sanitized = entries.map(stripNullish);
    const { data, error } = await supabase
      .from(table)
      .upsert(sanitized, { onConflict: conflictKey, ignoreDuplicates: false, defaultToNull: false });
    if (error) {
      console.error(`Error inserting batch:`, error);
      return { success: false, error: error.message, entries };
    }
    return { success: true, count: entries.length };
  } catch (err) {
    console.error(`Unexpected error:`, err);
    return { success: false, error: err.message, entries };
  }
}

(async () => {
  logMemory("Start of insert_to_db.js");

  let totalSuccess = 0;
  let totalFailed = 0;
  const failedDetails = [];

  // Upsert trips (no truncation; preserve other providers and existing rows)
  const tripsBatches = chunk(tripsEntries, BATCH_SIZE);
  for (let i = 0; i < tripsBatches.length; i++) {
    const batch = tripsBatches[i];
    console.log(`Upserting trips batch ${i + 1}/${tripsBatches.length} (${batch.length} items)...`);
    const result = await upsertBatch(TRIPS_TABLE, batch, 'trip_id');
    if (result.success) {
      totalSuccess += result.count;
    } else {
      totalFailed += result.entries.length;
      failedDetails.push({ table: TRIPS_TABLE, batch: i, error: result.error, entries: result.entries });
    }
    if (i < tripsBatches.length - 1) await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
  }

  // Upsert trip details (no truncation; preserve existing rows)
  const detailsBatches = chunk(uniqueDetails, BATCH_SIZE);
  for (let i = 0; i < detailsBatches.length; i++) {
    const batch = detailsBatches[i];
    console.log(`Upserting trip_details batch ${i + 1}/${detailsBatches.length} (${batch.length} items)...`);
    const result = await upsertBatch(TRIP_DETAILS_TABLE, batch, 'trip_id,departure_id');
    if (result.success) {
      totalSuccess += result.count;
    } else {
      totalFailed += result.entries.length;
      failedDetails.push({ table: TRIP_DETAILS_TABLE, batch: i, error: result.error, entries: result.entries });
    }
    if (i < detailsBatches.length - 1) await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
  }

  console.log("=== Summary ===");
  console.log("Total entries processed:", tripsEntries.length + uniqueDetails.length);
  console.log("Successfully upserted:", totalSuccess);
  console.log("Failed:", totalFailed);

  if (failedDetails.length > 0) {
    const pathErr = "./failed_upserts.json";
    fs.writeFileSync(pathErr, JSON.stringify(failedDetails, null, 2), "utf8");
    console.log("Wrote failed details to", pathErr);
  }

  logMemory("End of insert_to_db.js");
  console.log("Done.");
  process.exit(0);
})();
