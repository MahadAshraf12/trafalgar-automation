import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const BUSINESS_UNIT_ID = '501e93b700006400051925b6';
const REVIEWS_PER_PAGE = 50; // as per user request

async function fetchReviews(sku) {
  const url = `https://widget.trustpilot.com/trustbox-data/5763bccae0a06d08e809ecbb`;
  const params = new URLSearchParams({
    businessUnitId: BUSINESS_UNIT_ID,
    locale: 'en-US',
    sku: sku,
    reviewsPerPage: REVIEWS_PER_PAGE.toString(),
    page: '1'
  });
  const res = await fetch(`${url}?${params}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function main() {
  console.log('▶️ Fetching Trustpilot reviews...');
  const tripsFile = path.join(process.cwd(), 'fullll_final_cleaned_trips.json');
  if (!fs.existsSync(tripsFile)) {
    throw new Error('fullll_final_cleaned_trips.json not found. Run trip_details.js first.');
  }
  const trips = JSON.parse(fs.readFileSync(tripsFile, 'utf8'));
  console.log(`📊 Loaded ${trips.length} trips from fullll_final_cleaned_trips.json`);

  const reviews = [];
  for (const trip of trips) {
    console.log(`🔍 Trip object:`, JSON.stringify(trip).slice(0, 300));
    const sku = trip.trip_productline || trip.product_line || trip.trip_id || trip.id;
    console.log(`🔍 Processing trip ${trip.trip_id || trip.id} with SKU: ${sku}`);
    if (sku) {
      try {
        const reviewData = await fetchReviews(sku);
        console.log(`✅ Got review data for ${sku}:`, JSON.stringify(reviewData).slice(0, 200));
        reviews.push({
          product_line: sku,
          ...reviewData
        });
        await new Promise(r => setTimeout(r, 500)); // rate limit
      } catch (err) {
        console.error(`❌ Error fetching reviews for ${sku}:`, err.message);
        reviews.push({
          product_line: sku,
          error: err.message
        });
      }
    } else {
      console.log(`⚠️ No SKU for trip ${trip.id}`);
    }
  }

  const reviewsFile = path.join(process.cwd(), 'trustpilot_reviews.json');
  fs.writeFileSync(reviewsFile, JSON.stringify(reviews, null, 2));
  console.log(`✅ Fetched reviews for ${reviews.length} trips`);
}

main().catch(err => {
  console.error('❌ Error fetching reviews:', err.message);
  process.exit(1);
});