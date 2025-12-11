import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

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

if (!fs.existsSync('./trips_enriched_final_costsaver.json')) {
  console.error("ERROR: trips_enriched_final_costsaver.json not found");
  process.exit(1);
}
const tripsData = JSON.parse(fs.readFileSync('./trips_enriched_final_costsaver.json', 'utf8'));

if (!fs.existsSync('./trip_details_us_costsaver.json')) {
  console.error("ERROR: trip_details_us_costsaver.json not found");
  process.exit(1);
}
const tripDetailsData = JSON.parse(fs.readFileSync('./trip_details_us_costsaver.json', 'utf8'));

// Load scraped trip data (ratings, reviews, activity levels)
const ratingsMap = new Map();
try {
  if (fs.existsSync('./trip_data_scraped_costsaver.json')) {
    const scrapedData = JSON.parse(fs.readFileSync('./trip_data_scraped_costsaver.json', 'utf8'));
    scrapedData.forEach(item => {
      ratingsMap.set(item.trip_id, {
        avg_rating: item.rating,
        total_reviews: item.review_count
      });
    });
    console.log(`Loaded ${ratingsMap.size} ratings from trip_data_scraped_costsaver.json`);
  } else {
    console.warn('⚠️  trip_data_scraped_costsaver.json not found - proceeding without ratings');
  }
} catch (err) {
  console.error('Error loading trip_data_scraped_costsaver.json:', err.message);
  console.warn('⚠️  Proceeding without ratings');
}

// Load trip cities
const citiesMap = new Map();
try {
  if (fs.existsSync('./trip_itinerary_locations.json')) {
    const citiesData = JSON.parse(fs.readFileSync('./trip_itinerary_locations.json', 'utf8'));
    if (citiesData && Array.isArray(citiesData.data)) {
      citiesData.data.forEach(item => {
        if (item.trip_id && item.Cities) {
          citiesMap.set(item.trip_id, item.Cities);
        }
      });
      console.log(`Loaded ${citiesMap.size} city lists from trip_itinerary_locations.json`);
    }
  } else {
    console.warn('⚠️  trip_itinerary_locations.json not found - proceeding without cities');
  }
} catch (err) {
  console.error('Error loading trip_itinerary_locations.json:', err.message);
  console.warn('⚠️  Proceeding without cities');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Debug: Log the first few ratings
console.log('First 5 ratings from trip_ratings.json:');
Array.from(ratingsMap.entries()).slice(0, 5).forEach(([tripId, rating]) => {
  console.log(`- Trip ${tripId}:`, rating);
});

const tripsEntries = tripsData.map(trip => {
  const ratings = ratingsMap.get(trip.trip_id);
  const tripCities = citiesMap.get(trip.trip_id) || [];
  
  const entry = {
    trip_id: trip.trip_id,
    name: trip.trip_name,
    trip_provider: 'COSTSAVER',
    trip_productline: trip.trip_product_line,
    region: trip.region,
    service_level: 'Basic',
    trip_description: trip.trip_description,
    banner_image: trip.banner_image,
    departures: trip.departures,
    advertised_departures: trip.advertised_departures,
    duration: trip.duration,
    trip_current_price: trip.trip_current_price,
    reviews: trip.reviews,
    avg_rating: trip.avg_rating || null,
    total_reviews: trip.total_reviews || null,
    activity_level: null,  // ✅ CostSaver has no activity levels
    standardised_keywords: trip.standardised_keywords || [] // text[] column
  };

  // Debug: Log if we found ratings for this trip
  if (ratings) {
    console.log(`Found ratings for trip ${trip.trip_id} (${trip.trip_name}):`, {
      avg_rating: ratings.avg_rating,
      total_reviews: ratings.total_reviews,
      type_avg: typeof ratings.avg_rating,
      type_reviews: typeof ratings.total_reviews
    });
    
    // Direct assignment to see if it makes a difference
    entry.avg_rating = ratings.avg_rating ? parseFloat(ratings.avg_rating) : null;
    entry.total_reviews = ratings.total_reviews ? parseInt(ratings.total_reviews, 10) : null;
  } else {
    console.log(`No ratings found for trip ${trip.trip_id} (${trip.trip_name})`);
  }

  return entry;
});

// Debug: Log first few entries to verify
tripsEntries.slice(0, 3).forEach((entry, i) => {
  console.log(`Entry ${i + 1}:`, {
    trip_id: entry.trip_id,
    name: entry.name,
    avg_rating: entry.avg_rating,
    total_reviews: entry.total_reviews,
    type_avg: typeof entry.avg_rating,
    type_reviews: typeof entry.total_reviews
  });
});

// Function to update only ratings for existing trips
async function updateRatings() {
  const updates = [];
  for (const [tripId, rating] of ratingsMap.entries()) {
    if (rating.avg_rating || rating.total_reviews) {
      updates.push({
        trip_id: tripId,
        avg_rating: rating.avg_rating ? parseFloat(rating.avg_rating) : null,
        total_reviews: rating.total_reviews ? parseInt(rating.total_reviews, 10) : null
      });
    }
  }

  console.log(`\nUpdating ratings for ${updates.length} trips...`);
  
  // Process in batches of 20
  const BATCH_SIZE = 20;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    console.log(`Updating batch ${i / BATCH_SIZE + 1}/${Math.ceil(updates.length / BATCH_SIZE)}`);
    
    for (const update of batch) {
      const { data, error } = await supabase
        .from('trips')
        .update({
          avg_rating: update.avg_rating,
          total_reviews: update.total_reviews,
          updated_at: new Date().toISOString()
        })
        .eq('trip_id', update.trip_id);
        
      if (error) {
        console.error(`Error updating trip ${update.trip_id}:`, error);
      } else {
        console.log(`✅ Updated trip ${update.trip_id} with rating ${update.avg_rating} (${update.total_reviews} reviews)`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

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

const uniqueDetails = tripDetailsEntries.filter(item =>
  item.trip_id && item.departure_id && item.start_date && item.end_date
);

console.log(`Prepared ${tripsEntries.length} CostSaver trips and ${uniqueDetails.length} valid trip details for insertion.`);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function stripNullish(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) { if (v !== null && v !== undefined) out[k] = v; }
  return out;
}

async function insertBatch(table, entries) {
  try {
    const sanitized = entries.map(stripNullish);
    
    // For debugging: Log the first entry being inserted
    if (sanitized.length > 0) {
      console.log(`Inserting to ${table} (first entry):`, {
        id: sanitized[0].trip_id,
        name: sanitized[0].name || sanitized[0].trip_sku,
        keys: Object.keys(sanitized[0])
      });
    }

    // First, delete any existing records with the same trip_id (for trips) or trip_id+departure_id (for details)
    if (table === TRIPS_TABLE) {
      const tripIds = [...new Set(sanitized.map(item => item.trip_id))];
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .in('trip_id', tripIds);
      
      if (deleteError) {
        console.error(`❌ Error deleting from ${table}:`, deleteError);
        return { success: false, error: deleteError, entries: sanitized };
      }
    } else if (table === TRIP_DETAILS_TABLE) {
      // For trip details, we need to delete by both trip_id and departure_id
      const deletePromises = sanitized.map(item => 
        supabase
          .from(table)
          .delete()
          .eq('trip_id', item.trip_id)
          .eq('departure_id', item.departure_id)
      );
      
      const deleteResults = await Promise.all(deletePromises);
      const deleteError = deleteResults.find(r => r.error)?.error;
      
      if (deleteError) {
        console.error(`❌ Error deleting from ${table}:`, deleteError);
        return { success: false, error: deleteError, entries: sanitized };
      }
    }

    // Now insert the new records
    const { data, error } = await supabase
      .from(table)
      .insert(sanitized);

    if (error) {
      console.error(`❌ Error inserting to ${table}:`, error);
      return { success: false, error, entries: sanitized };
    }

    console.log(`✅ Successfully inserted ${sanitized.length} items to ${table}`);
    return { success: true, count: sanitized.length };
  } catch (error) {
    console.error(`❌ Exception in insertBatch for ${table}:`, error);
    return { success: false, error, entries: entries.map(stripNullish) };
  }
}

(async () => {
  logMemory("Start of costsaver/insert_to_db.js");

  let totalSuccess = 0;
  let totalFailed = 0;
  const failedDetails = [];

  // First, update the ratings for existing trips
  if (ratingsMap.size > 0) {
    console.log("\n=== Updating Trip Ratings ===");
    await updateRatings();
    console.log("✅ Ratings update complete\n");
  } else {
    console.log("\n⚠️  No ratings to update\n");
  }

  // Process trips in batches
  const tripsBatches = chunk(tripsEntries, BATCH_SIZE);
  for (let i = 0; i < tripsBatches.length; i++) {
    const batch = tripsBatches[i];
    console.log(`Processing CostSaver trips batch ${i + 1}/${tripsBatches.length} (${batch.length} items)...`);
    const result = await insertBatch(TRIPS_TABLE, batch);
    if (result.success) { totalSuccess += result.count; }
    else { totalFailed += result.entries.length; failedDetails.push({ table: TRIPS_TABLE, batch: i, error: result.error, entries: result.entries }); }
    if (i < tripsBatches.length - 1) await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
  }

  // Process trip details in batches
  const detailsBatches = chunk(uniqueDetails, BATCH_SIZE);
  for (let i = 0; i < detailsBatches.length; i++) {
    const batch = detailsBatches[i];
    console.log(`Processing CostSaver trip_details batch ${i + 1}/${detailsBatches.length} (${batch.length} items)...`);
    const result = await insertBatch(TRIP_DETAILS_TABLE, batch);
    if (result.success) { totalSuccess += result.count; }
    else { totalFailed += result.entries.length; failedDetails.push({ table: TRIP_DETAILS_TABLE, batch: i, error: result.error, entries: result.entries }); }
    if (i < detailsBatches.length - 1) await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
  }

  console.log("\n=== CostSaver Summary ===");
  console.log("Total entries processed:", tripsEntries.length + uniqueDetails.length);
  console.log("Successfully inserted:", totalSuccess);
  console.log("Failed:", totalFailed);

  if (failedDetails.length > 0) {
    const pathErr = "./failed_inserts_costsaver.json";
    fs.writeFileSync(pathErr, JSON.stringify(failedDetails, null, 2), "utf8");
    console.log("Wrote failed details to", pathErr);
  }

  logMemory("End of costsaver/insert_to_db.js");
  console.log("✅ Done.");
  process.exit(0);
})();
