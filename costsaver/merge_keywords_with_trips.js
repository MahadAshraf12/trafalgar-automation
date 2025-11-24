import fs from 'fs';
import path from 'path';

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

// Read trips with reviews data
function readTripsWithReviewsData() {
  const tripsFile = path.join(process.cwd(), 'trips_with_reviews_costsaver.json');

  if (!fs.existsSync(tripsFile)) {
    throw new Error(`Trips with reviews file not found: ${tripsFile}`);
  }

  console.log(`📖 Reading trips with reviews from: ${tripsFile}`);
  const data = fs.readFileSync(tripsFile, 'utf8');
  return JSON.parse(data);
}

// Read keywords data
function readKeywordsData() {
  const keywordsFile = path.join(process.cwd(), 'trips_with_standardised_keywords_costsaver.json');

  if (!fs.existsSync(keywordsFile)) {
    throw new Error(`Keywords file not found: ${keywordsFile}`);
  }

  console.log(`📖 Reading keywords from: ${keywordsFile}`);
  const data = fs.readFileSync(keywordsFile, 'utf8');
  return JSON.parse(data);
}

// Create keywords lookup map
function createKeywordsMap(keywordsData) {
  console.log(`🔄 Creating keywords lookup map...`);

  const keywordsMap = new Map();

  keywordsData.forEach(item => {
    if (item.trip_id && Array.isArray(item.standardised_keywords)) {
      // Convert trip_id to string for consistent matching
      const tripIdKey = String(item.trip_id);
      keywordsMap.set(tripIdKey, item.standardised_keywords);
      console.log(`📝 Mapped keywords for trip ${tripIdKey}: ${item.standardised_keywords.length} keywords`);
    }
  });

  console.log(`✅ Created keywords map for ${keywordsMap.size} trips`);
  return keywordsMap;
}

// Merge keywords into trips data
function mergeKeywordsWithTrips(trips, keywordsMap) {
  console.log(`🔄 Merging keywords into ${trips.length} trips...`);

  let keywordsMerged = 0;

  const enhancedTrips = trips.map(trip => {
    // Convert trip_id to string for consistent matching
    const tripIdKey = String(trip.trip_id);
    const tripKeywords = keywordsMap.get(tripIdKey) || [];

    if (tripKeywords.length > 0) {
      keywordsMerged++;
      console.log(`✅ Found keywords for trip ${tripIdKey}: ${tripKeywords.length} keywords`);
    } else {
      console.log(`⚠️ No keywords found for trip ${tripIdKey}`);
    }

    // Remove reviews and add keywords to the trip object
    const { reviews, ...tripWithoutReviews } = trip;
    return {
      ...tripWithoutReviews,
      standardised_keywords: tripKeywords
    };
  });

  console.log(`✅ Merged keywords into ${keywordsMerged} trips`);
  console.log(`📊 Average keywords per trip: ${(enhancedTrips.reduce((sum, trip) => sum + trip.standardised_keywords.length, 0) / trips.length).toFixed(1)}`);

  return enhancedTrips;
}

// Save final enhanced trips data
function saveFinalTrips(enhancedTrips) {
  const outputFile = path.join(process.cwd(), 'trips_enriched_final_costsaver.json');

  console.log(`💾 Saving final enriched trips data to: ${outputFile}`);

  fs.writeFileSync(outputFile, JSON.stringify(enhancedTrips, null, 2));

  console.log(`✅ Saved ${enhancedTrips.length} enriched trips with keywords`);
  console.log(`📏 File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);

  return outputFile;
}

// Main function
async function mergeKeywordsWithTripsMain() {
  try {
    console.log('🚀 Starting keywords merge with trips data...');
    logMemory("Start of merge_keywords_with_trips.js");

    // Read data
    const trips = readTripsWithReviewsData();
    const keywordsData = readKeywordsData();

    console.log(`📊 Found ${trips.length} trips with reviews and ${keywordsData.length} trips with keywords`);
    logMemory("After reading data");

    // Create keywords lookup
    const keywordsMap = createKeywordsMap(keywordsData);
    logMemory("After creating keywords map");

    // Merge keywords into trips
    const enhancedTrips = mergeKeywordsWithTrips(trips, keywordsMap);
    logMemory("After merging keywords");

    // Save final data
    const outputFile = saveFinalTrips(enhancedTrips);
    logMemory("After saving final data");

    // Summary
    const totalKeywords = enhancedTrips.reduce((sum, trip) => sum + trip.standardised_keywords.length, 0);
    const tripsWithKeywords = enhancedTrips.filter(trip => trip.standardised_keywords.length > 0).length;

    console.log('\n=== Final Enrichment Summary ===');
    console.log(`Total trips enriched: ${enhancedTrips.length}`);
    console.log(`Trips with keywords: ${tripsWithKeywords}`);
    console.log(`Total keywords: ${totalKeywords}`);
    console.log(`Average keywords per trip: ${(totalKeywords / enhancedTrips.length).toFixed(1)}`);
    console.log(`Output file: ${outputFile}`);
    console.log(`Note: Reviews removed from final output as requested`);

    logMemory("End of merge_keywords_with_trips.js");
    console.log('✅ Keywords merge completed successfully!');

  } catch (error) {
    console.error('❌ Error during keywords merge process:', error);
    process.exit(1);
  }
}

// Run the script
mergeKeywordsWithTripsMain().catch(console.error);