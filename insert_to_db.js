// Install dependencies first:
// npm install @supabase/supabase-js fs

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Prepare trips entries
const tripsEntries = tripsData.map(trip => ({
  trip_id: trip.trip_id,
  trip_productline: trip.trip_product_line,
  region: trip.region,
  trip_description: trip.trip_description,
  banner_image: trip.banner_image,
  group_size: `Max ${trip.group_size_max}, Avg ${trip.group_size_avg}`,
  departures: trip.departures, // assuming JSONB column
  duration: trip.duration,
  reviews: trip.reviews
}));

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

// Deduplicate based on trip_id and departure_id
const uniqueDetails = tripDetailsEntries.filter((item, index, self) =>
  index === self.findIndex(t => t.trip_id === item.trip_id && t.departure_id === item.departure_id)
);

console.log(`Prepared ${tripsEntries.length} trips and ${uniqueDetails.length} unique trip details for upsert.`);

// Helper: split into chunks
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertBatch(table, entries, conflictKey) {
  try {
    const { data, error } = await supabase
      .from(table)
      .upsert(entries, { onConflict: conflictKey, ignoreDuplicates: false });

    if (error) throw error;
    return { success: true, count: entries.length };
  } catch (err) {
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

  // Upsert trip details
  const detailsBatches = chunk(uniqueDetails, BATCH_SIZE);
  for (let i = 0; i < detailsBatches.length; i++) {
    const batch = detailsBatches[i];
    console.log(`Upserting trip_details batch ${i + 1}/${detailsBatches.length} (${batch.length} items)...`);
    const result = await upsertBatch(TRIP_DETAILS_TABLE, batch, 'departure_id');
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

  console.log("Done.");
  process.exit(0);
})();
