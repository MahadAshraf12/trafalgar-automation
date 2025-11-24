import fs from 'fs';
import path from 'path';

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

// Read trips data
function readTripsData() {
  const tripsFile = path.join(process.cwd(), 'trips_insight.json');

  if (!fs.existsSync(tripsFile)) {
    throw new Error(`Trips file not found: ${tripsFile}`);
  }

  console.log(`📖 Reading trips from: ${tripsFile}`);
  const data = fs.readFileSync(tripsFile, 'utf8');
  return JSON.parse(data);
}

// Read reviews data
function readReviewsData() {
  const reviewsFile = path.join(process.cwd(), 'feefo_reviews_insight.json');

  if (!fs.existsSync(reviewsFile)) {
    throw new Error(`Reviews file not found: ${reviewsFile}`);
  }

  console.log(`📖 Reading reviews from: ${reviewsFile}`);
  const data = fs.readFileSync(reviewsFile, 'utf8');
  const reviewsData = JSON.parse(data);
  return reviewsData.reviews || [];
}

// Group reviews by trip_id
function groupReviewsByTripId(reviews) {
  console.log(`🔄 Grouping ${reviews.length} reviews by trip_id...`);

  const reviewsByTrip = new Map();

  reviews.forEach(review => {
    const tripId = review.trip_id;
    if (!reviewsByTrip.has(tripId)) {
      reviewsByTrip.set(tripId, []);
    }
    reviewsByTrip.get(tripId).push(review);
  });

  console.log(`✅ Grouped reviews for ${reviewsByTrip.size} trips`);
  return reviewsByTrip;
}

// Merge reviews into trips data
function mergeReviewsWithTrips(trips, reviewsByTrip) {
  console.log(`🔄 Merging reviews into ${trips.length} trips...`);

  let reviewsAdded = 0;
  let totalReviews = 0;

  const enhancedTrips = trips.map(trip => {
    const tripReviews = reviewsByTrip.get(trip.trip_id) || [];

    if (tripReviews.length > 0) {
      reviewsAdded++;
      totalReviews += tripReviews.length;
      console.log(`✅ Added ${tripReviews.length} reviews for trip ${trip.trip_id} (${trip.trip_name})`);
    } else {
      console.log(`⚠️ No reviews found for trip ${trip.trip_id} (${trip.trip_name})`);
    }

    // Add reviews to the trip object
    return {
      ...trip,
      reviews: tripReviews
    };
  });

  console.log(`✅ Merged reviews into ${reviewsAdded} trips (${totalReviews} total reviews)`);
  console.log(`📊 Average reviews per trip: ${(totalReviews / trips.length).toFixed(1)}`);

  return enhancedTrips;
}

// Save enhanced trips data
function saveEnhancedTrips(enhancedTrips) {
  const outputFile = path.join(process.cwd(), 'trips_with_reviews_insight.json');

  console.log(`💾 Saving enhanced trips data to: ${outputFile}`);

  fs.writeFileSync(outputFile, JSON.stringify(enhancedTrips, null, 2));

  console.log(`✅ Saved ${enhancedTrips.length} trips with reviews`);
  console.log(`📏 File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);

  return outputFile;
}

// Main function
async function mergeReviewsWithTripsMain() {
  try {
    console.log('🚀 Starting reviews merge with trips data...');
    logMemory("Start of merge_reviews_with_trips.js");

    // Read data
    const trips = readTripsData();
    const reviews = readReviewsData();

    console.log(`📊 Found ${trips.length} trips and ${reviews.length} reviews`);
    logMemory("After reading data");

    // Group reviews
    const reviewsByTrip = groupReviewsByTripId(reviews);
    logMemory("After grouping reviews");

    // Merge reviews into trips
    const enhancedTrips = mergeReviewsWithTrips(trips, reviewsByTrip);
    logMemory("After merging reviews");

    // Save enhanced data
    const outputFile = saveEnhancedTrips(enhancedTrips);
    logMemory("After saving enhanced data");

    // Summary
    const totalReviews = enhancedTrips.reduce((sum, trip) => sum + trip.reviews.length, 0);
    const tripsWithReviews = enhancedTrips.filter(trip => trip.reviews.length > 0).length;

    console.log('\n=== Reviews Merge Summary ===');
    console.log(`Total trips processed: ${enhancedTrips.length}`);
    console.log(`Trips with reviews: ${tripsWithReviews}`);
    console.log(`Total reviews: ${totalReviews}`);
    console.log(`Average reviews per trip: ${(totalReviews / enhancedTrips.length).toFixed(1)}`);
    console.log(`Output file: ${outputFile}`);

    logMemory("End of merge_reviews_with_trips.js");
    console.log('✅ Reviews merge completed successfully!');

  } catch (error) {
    console.error('❌ Error during reviews merge process:', error);
    process.exit(1);
  }
}

// Run the script
mergeReviewsWithTripsMain().catch(console.error);