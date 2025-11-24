import fs from 'fs';
import path from 'path';

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

// Read trips data
function readTripsData() {
  const tripsFile = path.join(process.cwd(), 'trips.json');

  if (!fs.existsSync(tripsFile)) {
    throw new Error(`Trips file not found: ${tripsFile}`);
  }

  console.log(`📖 Reading trips from: ${tripsFile}`);
  const data = fs.readFileSync(tripsFile, 'utf8');
  return JSON.parse(data);
}

// Read reviews data
function readReviewsData() {
  const reviewsFile = path.join(process.cwd(), 'feefo_reviews_trafalgar.json');

  if (!fs.existsSync(reviewsFile)) {
    throw new Error(`Reviews file not found: ${reviewsFile}`);
  }

  console.log(`📖 Reading reviews from: ${reviewsFile}`);
  const data = fs.readFileSync(reviewsFile, 'utf8');
  return JSON.parse(data);
}

// Group reviews by trip_id
function groupReviewsByTripId(reviews) {
  console.log(`🔄 Grouping ${reviews.length} reviews by trip_id...`);

  const reviewsByTripId = new Map();

  reviews.forEach(review => {
    const tripId = review.trip_id;
    if (!reviewsByTripId.has(tripId)) {
      reviewsByTripId.set(tripId, []);
    }
    reviewsByTripId.get(tripId).push(review);
  });

  console.log(`✅ Grouped reviews into ${reviewsByTripId.size} trip groups`);
  return reviewsByTripId;
}

// Merge reviews into trips data
function mergeReviewsWithTrips(trips, reviewsByTripId) {
  console.log(`🔄 Merging reviews into ${trips.length} trips...`);

  let totalReviewsMerged = 0;
  let tripsWithReviews = 0;

  const enhancedTrips = trips.map(trip => {
    const tripReviews = reviewsByTripId.get(trip.trip_id) || [];

    // Remove internal fields from reviews that aren't needed in the final output
    const cleanReviews = tripReviews.map(review => {
      const { page_fetched, products_reviewed, ...cleanReview } = review;
      return cleanReview;
    });

    totalReviewsMerged += cleanReviews.length;
    if (cleanReviews.length > 0) {
      tripsWithReviews++;
    }

    // Add reviews array and update review stats
    return {
      ...trip,
      reviews: cleanReviews,
      total_reviews: cleanReviews.length,
      // You can calculate avg_rating from reviews if needed
      // avg_rating: calculateAverageRating(cleanReviews)
    };
  });

  console.log(`✅ Merged ${totalReviewsMerged} reviews into ${tripsWithReviews} trips`);
  console.log(`📊 Average reviews per trip: ${(totalReviewsMerged / trips.length).toFixed(1)}`);

  return enhancedTrips;
}

// Save enhanced trips data
function saveEnhancedTrips(enhancedTrips) {
  const outputFile = path.join(process.cwd(), 'trips_with_reviews.json');

  console.log(`💾 Saving enhanced trips data to: ${outputFile}`);

  fs.writeFileSync(outputFile, JSON.stringify(enhancedTrips, null, 2));

  console.log(`✅ Saved ${enhancedTrips.length} enhanced trips with reviews`);
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
    const reviewsData = readReviewsData();
    const reviews = reviewsData.reviews || [];

    console.log(`📊 Found ${trips.length} trips and ${reviews.length} reviews`);
    logMemory("After reading data");

    // Group reviews by trip_id
    const reviewsByTripId = groupReviewsByTripId(reviews);
    logMemory("After grouping reviews");

    // Merge reviews into trips
    const enhancedTrips = mergeReviewsWithTrips(trips, reviewsByTripId);
    logMemory("After merging data");

    // Save enhanced data
    const outputFile = saveEnhancedTrips(enhancedTrips);
    logMemory("After saving data");

    // Summary
    const totalReviews = enhancedTrips.reduce((sum, trip) => sum + trip.reviews.length, 0);
    const tripsWithReviews = enhancedTrips.filter(trip => trip.reviews.length > 0).length;

    console.log('\n=== Merge Summary ===');
    console.log(`Total trips processed: ${enhancedTrips.length}`);
    console.log(`Trips with reviews: ${tripsWithReviews}`);
    console.log(`Total reviews merged: ${totalReviews}`);
    console.log(`Average reviews per trip: ${(totalReviews / enhancedTrips.length).toFixed(1)}`);
    console.log(`Output file: ${outputFile}`);

    logMemory("End of merge_reviews_with_trips.js");
    console.log('✅ Reviews merge completed successfully!');

  } catch (error) {
    console.error('❌ Error during merge process:', error);
    process.exit(1);
  }
}

// Run the script
mergeReviewsWithTripsMain().catch(console.error);