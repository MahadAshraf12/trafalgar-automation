import fs from 'fs';
import axios from 'axios';

// Read the trip codes file
function readTripCodes() {
  const filePath = 'trip_codes.json';

  if (!fs.existsSync(filePath)) {
    throw new Error(`JSON file not found: ${filePath}. Run scrape_trip_codes.js first.`);
  }

  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

async function fetchFeefoReviews() {
  const tripCodes = readTripCodes();

  // Production mode - process ALL trips
  const allTripCodes = tripCodes;

  console.log(`📊 Processing ${allTripCodes.length} trips (production mode) to get 50 reviews each (using pagination)`);
  console.log(`🧠 Initial memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);
  console.log(`⏱️  Estimated time: ~${Math.ceil(allTripCodes.length * 3 * 1.5 / 60)} minutes (${allTripCodes.length} trips × 3 pages × 1.5s delays)`);

  const allReviews = [];
  const REVIEWS_PER_TRIP = 50; // Target 50 reviews per trip
  const REVIEWS_PER_PAGE = 20; // API returns 20 per page
  const PAGES_NEEDED = Math.ceil(REVIEWS_PER_TRIP / REVIEWS_PER_PAGE); // 3 pages for 50 reviews
  const BATCH_SIZE = 5; // Process 5 trips at a time for memory safety
  const BATCH_DELAY = 2000; // 2 second delay between batches

  // Process in batches to manage memory
  for (let i = 0; i < allTripCodes.length; i += BATCH_SIZE) {
    const batch = allTripCodes.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allTripCodes.length / BATCH_SIZE);

    console.log(`\n🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} trips, ${i + 1}-${Math.min(i + BATCH_SIZE, allTripCodes.length)} of ${allTripCodes.length})`);
    console.log(`🧠 Memory before batch: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);

    for (const trip of batch) {
    if (!trip.trip_code) {
      console.log(`⏭️  Skipping ${trip.trip_name} - no trip code`);
      continue;
    }

    console.log(`\n🏷️  Processing: ${trip.trip_name} (${trip.trip_code})`);
    const tripReviews = [];

    // Fetch multiple pages to get up to 50 reviews per trip
    for (let page = 1; page <= PAGES_NEEDED; page++) {
      try {
        const baseUrl = 'https://www.trafalgar.com/en-us/feefo/getreviews';
        const params = {
          merchantId: 'trafalgar-travel',
          productSearchCode: `${trip.trip_code}*`,
          page: page,
          rating: 0,
          sort: '-updated_date'
        };

        console.log(`📄 Fetching page ${page}/${PAGES_NEEDED} for ${trip.trip_code}`);

        const response = await axios.get(baseUrl, {
          params: params,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.trafalgar.com/'
          },
          timeout: 30000
        });

        const reviewData = response.data;

        // Parse reviews from this page
        if (reviewData && reviewData.reviews && Array.isArray(reviewData.reviews)) {
          reviewData.reviews.forEach(review => {
            // Stop if we already have 50 reviews for this trip
            if (tripReviews.length >= REVIEWS_PER_TRIP) return;

            // The API returns reviews with service and products nested
            const serviceReview = review.service || {};
            const products = review.products || [];

            // Extract all review content including responses and detailed text
            let fullReviewText = '';

            // Add main service review
            if (serviceReview.review) {
              fullReviewText += serviceReview.review + ' ';
            }

            // Add all product reviews and responses
            products.forEach(product => {
              if (product.review) {
                fullReviewText += product.review + ' ';
              }
              if (product.response) {
                fullReviewText += product.response + ' ';
              }
            });

            // Clean up the text (remove extra whitespace)
            fullReviewText = fullReviewText.trim().replace(/\s+/g, ' ');

            // Get the highest rating from service or products
            let highestRating = serviceReview.rating ? parseInt(serviceReview.rating) : 0;
            products.forEach(product => {
              if (product.rating) {
                const productRating = parseInt(product.rating);
                if (productRating > highestRating) {
                  highestRating = productRating;
                }
              }
            });

            // Only include reviews with meaningful content
            if (fullReviewText.trim() !== '' && highestRating > 0) {
              tripReviews.push({
                trip_id: trip.trip_id,
                trip_name: trip.trip_name,
                trip_code: trip.trip_code,
                reviewer_name: review.username || 'Anonymous',
                rating: highestRating,
                review_text: fullReviewText,
                review_title: serviceReview.title || products[0]?.title || 'Review',
                review_date: serviceReview.createdAt || null,
                source: 'trafalgar-feefo-api',
                page_fetched: page,
                products_reviewed: products.length,
                product_ratings: products.map(p => ({
                  title: p.title || '',
                  rating: p.rating ? parseInt(p.rating) : null,
                  review: p.review || '',
                  response: p.response || ''
                }))
              });
            }
          });
        }

        console.log(`📄 Page ${page}: Found ${reviewData.reviews?.length || 0} reviews (${tripReviews.length}/${REVIEWS_PER_TRIP} total)`);

        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Error fetching page ${page} for ${trip.trip_code}:`, error.message);
        // Continue with next page
      }
    }

    console.log(`✅ Collected ${tripReviews.length} total reviews for ${trip.trip_name} (${trip.trip_code})`);

    // Add all reviews for this trip
    allReviews.push(...tripReviews);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Delay between trips
    await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Memory management between batches
    console.log(`🧠 Memory after batch: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log(`🧹 GC triggered - Memory after GC: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);
    }

    // Delay between batches (except for the last batch)
    if (i + BATCH_SIZE < allTripCodes.length) {
      console.log(`⏳ Waiting ${BATCH_DELAY}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  // Save all reviews to JSON file
  const outputFile = 'feefo_reviews_trafalgar.json';
  const targetPerTrip = REVIEWS_PER_TRIP;
  const totalTarget = allTripCodes.length * targetPerTrip;

  fs.writeFileSync(outputFile, JSON.stringify({
    total_reviews: allReviews.length,
    trips_processed: allTripCodes.length,
    target_reviews_per_trip: targetPerTrip,
    total_target: totalTarget,
    target_achieved: allReviews.length >= totalTarget,
    reviews_per_trip_avg: (allReviews.length / allTripCodes.length).toFixed(1),
    memory_efficient: true,
    batch_processing: true,
    test_mode: false, // Now processing ALL trips
    reviews: allReviews,
    generated_at: new Date().toISOString()
  }, null, 2));

  console.log(`\n✅ Saved ${allReviews.length} Feefo reviews to ${outputFile}`);
  console.log(`📊 Average reviews per trip: ${(allReviews.length / allTripCodes.length).toFixed(1)}`);
  console.log(`🎯 Target: ${targetPerTrip} reviews per trip (${totalTarget} total) - ${allReviews.length >= totalTarget ? '✅ Achieved' : '⚠️ Partial'}`);
  console.log(`🧠 Memory efficient: Batched processing with GC triggers`);
  console.log(`📝 Pagination: ${PAGES_NEEDED} pages per trip (${REVIEWS_PER_PAGE} reviews/page)`);
  console.log(`🧪 Mode: Full Production (${allTripCodes.length} trips)`);
}

// Run the function
fetchFeefoReviews().catch(console.error);