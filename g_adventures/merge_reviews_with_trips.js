import fs from 'fs';
import path from 'path';

function normalizeSku(sku) {
  return sku ? sku.toString().trim().toUpperCase() : null;
}

async function main() {
  console.log('▶️ Merging reviews with trips data...');
  const tripsFile = path.join(process.cwd(), 'fullll_final_cleaned_trips.json');
  const reviewsFile = path.join(process.cwd(), 'trustpilot_reviews.json');

  if (!fs.existsSync(tripsFile)) {
    throw new Error('fullll_final_cleaned_trips.json not found.');
  }
  if (!fs.existsSync(reviewsFile)) {
    throw new Error('trustpilot_reviews.json not found.');
  }

  const trips = JSON.parse(fs.readFileSync(tripsFile, 'utf8'));
  const reviews = JSON.parse(fs.readFileSync(reviewsFile, 'utf8'));

  // Create review lookup by normalized sku
  const reviewLookup = {};
  for (const review of reviews) {
    const sku = normalizeSku(review.product_line);
    if (sku) {
      reviewLookup[sku] = review;
    }
  }

  // Merge reviews into trips
  for (const trip of trips) {
    const sku = normalizeSku(trip.trip_productline || trip.product_line); // Match by trip_productline
    const matchingReview = reviewLookup[sku];
    if (matchingReview) {
      trip.reviews = {
        product_line: trip.trip_productline || trip.product_line,
        sku: trip.trip_productline || trip.product_line,
        trustpilotData: matchingReview
      };
    } else {
      trip.reviews = {
        product_line: trip.trip_productline || trip.product_line,
        sku: trip.trip_productline || trip.product_line,
        message: 'No reviews found'
      };
    }
  }

  const outputFile = path.join(process.cwd(), 'final_trips.json');
  fs.writeFileSync(outputFile, JSON.stringify(trips, null, 2));
  console.log(`✅ Merged reviews into ${trips.length} trips`);
}

main().catch(err => {
  console.error('❌ Error merging reviews:', err.message);
  process.exit(1);
});