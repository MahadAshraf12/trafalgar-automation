import fs from 'fs';
import path from 'path';

async function main() {
  console.log('▶️ Extracting reviews from Trustpilot API data...');

  // Read trustpilot_reviews.json
  const reviewsFile = path.join(process.cwd(), 'trustpilot_reviews.json');
  if (!fs.existsSync(reviewsFile)) {
    throw new Error('trustpilot_reviews.json not found.');
  }
  const reviews = JSON.parse(fs.readFileSync(reviewsFile, 'utf8'));

  // Create lookup map
  const reviewMap = new Map();
  for (const review of reviews) {
    if (review.importedProductReviewsSummary?.sku) {
      const sku = review.importedProductReviewsSummary.sku;
      const starsAverage = review.importedProductReviewsSummary.starsAverage;
      const totalReviews = review.importedProductReviewsSummary.numberOfReviews?.total;
      reviewMap.set(sku, { avg_rating: starsAverage, total_reviews: totalReviews });
    }
  }

  // Read fullll_final_cleaned_trips.json
  const tripsFile = path.join(process.cwd(), 'fullll_final_cleaned_trips.json');
  if (!fs.existsSync(tripsFile)) {
    throw new Error('fullll_final_cleaned_trips.json not found.');
  }
  const trips = JSON.parse(fs.readFileSync(tripsFile, 'utf8'));

  // Update trips with review data
  for (const trip of trips) {
    const sku = trip.trip_productline || trip.product_line;
    const reviewData = reviewMap.get(sku);
    if (reviewData) {
      trip.avg_rating = reviewData.avg_rating;
      trip.total_reviews = reviewData.total_reviews;
      console.log(`✅ Updated ${sku}: rating ${trip.avg_rating}, reviews ${trip.total_reviews}`);
    } else {
      trip.avg_rating = null;
      trip.total_reviews = null;
      console.log(`⚠️ No review data for ${sku}`);
    }
  }

  // Save updated trips
  fs.writeFileSync(tripsFile, JSON.stringify(trips, null, 2));
  console.log(`✅ Updated ${trips.length} trips with review data from API`);
}

main().catch(err => {
  console.error('❌ Error extracting reviews:', err.message);
  process.exit(1);
});