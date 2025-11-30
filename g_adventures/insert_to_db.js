import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TRIPS_TABLE = process.env.TRIPS_TABLE || "trips";
const TRIP_DETAILS_TABLE = process.env.TRIP_DETAILS_TABLE || "trip_details";
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 50);
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS || 200);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_KEY must be set (env or .env).");
  process.exit(1);
}

if (!fs.existsSync('./trips_gadventuress.json')) {
  console.error("ERROR: trips_gadventuress.json not found");
  process.exit(1);
}
const tripsData = JSON.parse(fs.readFileSync('./trips_gadventuress.json', 'utf8'));

// Load trip details data
if (!fs.existsSync('./g_adventures_trip_details.json')) {
  console.error("ERROR: g_adventures_trip_details.json not found");
  process.exit(1);
}
const tripDetailsData = JSON.parse(fs.readFileSync('./g_adventures_trip_details.json', 'utf8'));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Prepare trips entries
const tripsEntries = tripsData.map(trip => ({
  trip_id: trip.id,
  name: trip.name,
  trip_provider: trip.trip_provider,
  trip_productline: trip.product_line,
  region: trip.region,
  service_level: trip.service_level,
  trip_description: trip.description,
  banner_image: trip.banner_image,
  departures: trip.departures,
  advertised_departures: trip.advertised_departures,
  duration: trip.duration,
  trip_current_price: trip.trip_current_price,
  avg_rating: trip.avg_rating,
  total_reviews: trip.total_reviews,
  activity_level: trip.activity_level,
  standardised_keywords: trip.standardised_keywords
}));

console.log(`Prepared ${tripsEntries.length} G Adventures trips for upsert.`);

// Prepare trip details entries
const tripDetailsEntries = tripDetailsData.map(detail => ({
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
  avg_group_size: detail.avg_group_size,
  activity_level: detail.activity_level,
  service_level: detail.service_level
}));

// Filter invalid entries
const uniqueDetails = tripDetailsEntries.filter(item =>
  item.trip_id && item.departure_id && item.start_date && item.end_date
);

console.log(`Prepared ${uniqueDetails.length} valid G Adventures trip details for upsert.`);

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
  let totalSuccess = 0;
  let totalFailed = 0;
  const failedDetails = [];

  // Upsert trips
  const tripsBatches = chunk(tripsEntries, BATCH_SIZE);
  for (let i = 0; i < tripsBatches.length; i++) {
    const batch = tripsBatches[i];
    console.log(`Upserting G Adventures trips batch ${i + 1}/${tripsBatches.length} (${batch.length} items)...`);
    const result = await upsertBatch(TRIPS_TABLE, batch, 'trip_id');
    if (result.success) {
      totalSuccess += result.count;
    } else {
      totalFailed += result.entries.length;
      failedDetails.push({ table: TRIPS_TABLE, batch: i, error: result.error, entries: result.entries });
    }
    if (i < tripsBatches.length - 1) await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
  }

  // Upsert trip details
  const detailsBatches = chunk(uniqueDetails, BATCH_SIZE);
  for (let i = 0; i < detailsBatches.length; i++) {
    const batch = detailsBatches[i];
    console.log(`Upserting G Adventures trip_details batch ${i + 1}/${detailsBatches.length} (${batch.length} items)...`);
    const result = await upsertBatch(TRIP_DETAILS_TABLE, batch, 'trip_id,departure_id');
    if (result.success) {
      totalSuccess += result.count;
    } else {
      totalFailed += result.entries.length;
      failedDetails.push({ table: TRIP_DETAILS_TABLE, batch: i, error: result.error, entries: result.entries });
    }
    if (i < detailsBatches.length - 1) await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
  }

  console.log("=== G Adventures Summary ===");
  console.log("Total entries processed:", tripsEntries.length + uniqueDetails.length);
  console.log("Successfully upserted:", totalSuccess);
  console.log("Failed:", totalFailed);

  if (failedDetails.length > 0) {
    const pathErr = "./failed_upserts_g_adventures.json";
    fs.writeFileSync(pathErr, JSON.stringify(failedDetails, null, 2), "utf8");
    console.log("Wrote failed details to", pathErr);
  }

  console.log("Done.");
  process.exit(0);
})();