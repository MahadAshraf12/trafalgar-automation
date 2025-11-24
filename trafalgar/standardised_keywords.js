import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// --- VPS CONFIGURATION ---
const CONFIG = {
  OPENAI_TIMEOUT: 30000,        // 30 seconds timeout for OpenAI calls
  RATE_LIMIT_DELAY: 1500,       // 1.5 seconds between API calls
  CHECKPOINT_INTERVAL: 5,       // Save checkpoint every 5 trips
  MEMORY_WARNING_MB: 200,       // Warn if memory exceeds 200MB
  MAX_RETRIES: 3,               // Retry failed API calls up to 3 times
  RETRY_DELAY: 5000             // 5 seconds delay between retries
};

// --- STEP 1: Load merged trips + reviews file ---
const mergedData = JSON.parse(fs.readFileSync("trips_with_reviews.json", "utf-8"));

// --- STEP 2: Filter trips with advertised_departures ---
const filteredTrips = mergedData.filter(
  item => Array.isArray(item.advertised_departures) && item.advertised_departures.length > 0
);

// --- STEP 2.5: Process ALL trips (production mode) ---
const allTrips = filteredTrips;

// --- STEP 3: Define standardized keywords array ---
const standardisedKeywords = [
  "adventure","Alpine","Architecture","artisan","Beach","Boutique","budget","camping","City",
  "coastal","community","Cooking Class","couples","cruise","culinary","cultural","Cycling",
  "desert","Diving","Educational","Excursion","Family-Friendly","farm","Fast-paced","Female-Only",
  "festive","friends","glamping","hiking","historical","Homestay","indigenous","island","Lively",
  "Local-led","luxury","Market","meditation","mountain","Music","nature","Nightlife",
  "Off-the-beaten-path","rainforest","Resort","retreat","romantic","rural","Safari","sailing",
  "scenic","Shopping","Singles","Skiing","Slow-travel","Small-group","Solo Traveler","spiritual",
  "streetfood","sustainable","tasting","traditional","train","Trekking","tropical","vegetarian",
  "village","Volunteer","Wellness","wildlife","Wine","Yoga","Overland","Photography","Aquatic"
];

// --- STEP 4: Initialize OpenAI client ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable is not set');
  console.error('💡 Add it to your .env file: OPENAI_API_KEY=your_key_here');
  process.exit(1);
}

// --- Helper: Take first 10 non-null items from array ---
const getFirst10 = arr => Array.isArray(arr) ? arr.filter(x => x != null).slice(0, 10) : [];

// --- STEP 5: Function to call GPT and get 15 relevant keywords (with retry & timeout) ---
async function enrichTripKeywords(trip) {
  const prompt = `
You are an AI travel analyst.
Select exactly 15 keywords from the provided standardisedKeywords list for this travel tour.

Trip Data:
Name: ${trip.name || ""}
Trip ID: ${trip.trip_id || ""}
Trip SKU: ${trip.product_line || trip.trip_sku || ""}
Description: ${trip.trip_description || trip.description || ""}
Details: ${JSON.stringify(getFirst10(trip.details || trip.itinerary), null, 2)}
Geography: ${JSON.stringify(getFirst10(trip.geography || []), null, 2)}
Reviews: ${JSON.stringify(getFirst10(trip.reviews || []), null, 2)}
StandardisedKeywords: ${JSON.stringify(standardisedKeywords)}

Output JSON exactly like this:
{
  "trip_id": "trip_id_here",
  "trip_sku": "trip_sku_here",
  "standardised_keywords": ["keyword1","keyword2",...,"keyword15"]
}
`;

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      console.log(`🤖 Calling OpenAI (attempt ${attempt}/${CONFIG.MAX_RETRIES}) for trip ${trip.trip_id || trip.id}`);

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`OpenAI call timed out after ${CONFIG.OPENAI_TIMEOUT}ms`)), CONFIG.OPENAI_TIMEOUT);
      });

      // Race between OpenAI call and timeout
      const response = await Promise.race([
        client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 300
        }),
        timeoutPromise
      ]);

      const rawOutput = response.choices[0].message.content;

      // Extract JSON block
      let match = rawOutput.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonString = match && match[1] ? match[1] : rawOutput;

      const result = JSON.parse(jsonString);

      // Validate the result has the expected structure
      if (!result.trip_id || !Array.isArray(result.standardised_keywords)) {
        throw new Error('Invalid response structure from OpenAI');
      }

      console.log(`✅ Successfully processed trip ${trip.trip_id || trip.id} on attempt ${attempt}`);
      return result;

    } catch (err) {
      console.error(`❌ Attempt ${attempt}/${CONFIG.MAX_RETRIES} failed for trip ${trip.trip_id || trip.id}:`, err.message);

      if (attempt === CONFIG.MAX_RETRIES) {
        // All retries exhausted
        return {
          trip_id: trip.trip_id || trip.id || "",
          trip_sku: trip.product_line || trip.trip_sku || "",
          standardised_keywords: [],
          error: `Failed after ${CONFIG.MAX_RETRIES} attempts: ${err.message}`,
          failed_at: new Date().toISOString()
        };
      }

      // Wait before retrying
      console.log(`⏳ Waiting ${CONFIG.RETRY_DELAY}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
    }
  }
}

// --- Memory monitoring function ---
function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

// --- Checkpoint saving for resumability ---
function saveCheckpoint(processedTrips, currentIndex) {
  const checkpoint = {
    processedTrips,
    currentIndex,
    timestamp: new Date().toISOString(),
    totalTrips: allTrips.length
  };
  fs.writeFileSync('keywords_checkpoint.json', JSON.stringify(checkpoint, null, 2));
}

// --- Load checkpoint if exists ---
function loadCheckpoint() {
  try {
    if (fs.existsSync('keywords_checkpoint.json')) {
      const checkpoint = JSON.parse(fs.readFileSync('keywords_checkpoint.json', 'utf8'));
      console.log(`📁 Found checkpoint - resuming from trip ${checkpoint.currentIndex + 1}/${checkpoint.totalTrips}`);
      return checkpoint;
    }
  } catch (err) {
    console.log('⚠️  Could not load checkpoint, starting fresh');
  }
  return null;
}

// --- STEP 6: Main function with VPS optimizations ---
async function main() {
  console.log(`🚀 Starting keyword enrichment for ${allTrips.length} trips (VPS-optimized)...`);
  console.log(`📊 Using OpenAI GPT-4o-mini to select 15 keywords per trip`);
  console.log(`📝 Total available trips: ${filteredTrips.length}`);
  logMemory("Start of keyword enrichment");

  // Load checkpoint if exists (for resumability)
  const checkpoint = loadCheckpoint();
  let finalTrips = checkpoint ? checkpoint.processedTrips : [];
  let startIndex = checkpoint ? checkpoint.currentIndex : 0;

  console.log(`🎯 Processing trips ${startIndex + 1} to ${allTrips.length}`);

  // Process trips with error recovery and memory management
  for (let i = startIndex; i < allTrips.length; i++) {
    const trip = allTrips[i];
    console.log(`🔄 Processing trip ${i + 1}/${allTrips.length}: ${trip.trip_id || trip.id}`);
    logMemory(`Before processing trip ${i + 1}`);

    try {
      const enriched = await enrichTripKeywords(trip);
      finalTrips.push(enriched);

      console.log(`✅ Completed trip ${i + 1}/${testTrips.length}`);

      // Save checkpoint every N trips (for resumability)
      if ((i + 1) % CONFIG.CHECKPOINT_INTERVAL === 0) {
        saveCheckpoint(finalTrips, i + 1);
        console.log(`💾 Checkpoint saved at trip ${i + 1}`);
      }

    } catch (error) {
      console.error(`❌ Failed to process trip ${trip.trip_id || trip.id}:`, error.message);

      // Save failed trip info and continue
      finalTrips.push({
        trip_id: trip.trip_id || trip.id || "",
        trip_sku: trip.product_line || trip.trip_sku || "",
        standardised_keywords: [],
        error: error.message,
        failed_at: new Date().toISOString()
      });

      // Still save checkpoint on errors
      saveCheckpoint(finalTrips, i + 1);
    }

    // Memory cleanup
    if (global.gc) {
      global.gc();
    }

    // Memory monitoring and warnings
    const memUsage = process.memoryUsage();
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    if (rssMB > CONFIG.MEMORY_WARNING_MB) {
      console.log(`⚠️  High memory usage: ${rssMB}MB RSS - triggering GC`);
      if (global.gc) {
        global.gc();
      }
    }

    // Rate limiting delay (adjust based on your OpenAI rate limits)
    const delay = i < allTrips.length - 1 ? CONFIG.RATE_LIMIT_DELAY : 0; // No delay on last trip
    if (delay > 0) {
      console.log(`⏳ Waiting ${delay}ms before next trip...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    logMemory(`After processing trip ${i + 1}`);
  }

  // Save final output
  const outputFile = "trips_with_standardised_keywords.json";
  fs.writeFileSync(outputFile, JSON.stringify(finalTrips, null, 2));

  // Clean up checkpoint file
  if (fs.existsSync('keywords_checkpoint.json')) {
    fs.unlinkSync('keywords_checkpoint.json');
  }

  logMemory("End of keyword enrichment");

  const successCount = finalTrips.filter(t => !t.error).length;
  const errorCount = finalTrips.filter(t => t.error).length;

  console.log(`\n✅ ${outputFile} created with ${finalTrips.length} trips!`);
  console.log(`📊 Successfully processed: ${successCount} trips`);
  console.log(`❌ Failed trips: ${errorCount}`);
  console.log(`🧠 Memory monitoring: Active (warnings >${CONFIG.MEMORY_WARNING_MB}MB)`);
  console.log(`⏱️  Rate limiting: ${CONFIG.RATE_LIMIT_DELAY}ms between calls`);
  console.log(`🔄 Retry logic: Up to ${CONFIG.MAX_RETRIES} attempts per trip`);
  console.log(`💾 Checkpoint system: Enabled (every ${CONFIG.CHECKPOINT_INTERVAL} trips)`);
  console.log(`🛡️  VPS-safe: Memory limits, error recovery, resumable`);

  if (errorCount > 0) {
    console.log(`\n⚠️  ${errorCount} trips failed - check the output file for error details`);
    console.log(`💡 Failed trips can be reprocessed by running the script again (checkpoint system)`);
  }
}

// --- STEP 7: Run ---
main().catch(console.error);