/**
 * CostSaver Feefo Reviews Fetcher - Memory Optimized for VPS Deployment
 *
 * VPS DEPLOYMENT GUIDE:
 * 1. Run with GC exposed: node --expose-gc --max-old-space-size=512 fetch_feefo_reviews.js
 * 2. Use production mode: NODE_ENV=production node --expose-gc --max-old-space-size=512 fetch_feefo_reviews.js --production
 * 3. Monitor memory: Script logs RSS memory usage throughout execution
 * 4. Batch processing: Processes 3 trips at a time to prevent memory spikes
 * 5. Streaming writes: Reviews written to disk immediately, not stored in memory
 * 6. GC triggers: Manual garbage collection between batches when available
 *
 * Memory optimizations:
 * - Streaming JSON writer prevents large in-memory arrays
 * - Batch processing limits concurrent memory usage
 * - Explicit GC calls free unused objects
 * - Reduced batch size (3) for VPS stability
 * - Increased delays prevent API rate limiting
 */

import fs from 'fs';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { Transform } from 'stream';

// Streaming JSON writer for memory efficiency
class StreamingJSONWriter {
  constructor(filename) {
    this.filename = filename;
    this.writeStream = createWriteStream(filename, { flags: 'w', encoding: 'utf8' });
    this.firstItem = true;
    this.metadata = null;
  }

  setMetadata(metadata) {
    this.metadata = metadata;
  }

  writeReview(review) {
    if (this.firstItem) {
      // Write opening of JSON structure
      this.writeStream.write('{\n');
      if (this.metadata) {
        Object.keys(this.metadata).forEach(key => {
          this.writeStream.write(`  "${key}": ${JSON.stringify(this.metadata[key])},\n`);
        });
      }
      this.writeStream.write('  "reviews": [\n');
      this.firstItem = false;
    } else {
      this.writeStream.write(',\n');
    }
    this.writeStream.write(`    ${JSON.stringify(review, null, 4)}`);
  }

  close() {
    if (this.firstItem) {
      // No reviews written
      this.writeStream.write('{\n');
      if (this.metadata) {
        Object.keys(this.metadata).forEach(key => {
          this.writeStream.write(`  "${key}": ${JSON.stringify(this.metadata[key])},\n`);
        });
      }
      this.writeStream.write('  "reviews": []\n}');
    } else {
      this.writeStream.write('\n  ]\n}');
    }
    this.writeStream.end();
  }
}

// Read the trip codes file
function readTripCodes() {
  const filePath = 'trip_codes_costsaver.json';

  if (!fs.existsSync(filePath)) {
    throw new Error(`JSON file not found: ${filePath}. Run extract_trip_codes_from_trips.js first.`);
  }

  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

async function fetchFeefoReviews() {
  const tripCodes = readTripCodes();

  // Production mode - process all trips
  const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  const allTripCodes = tripCodes; // Process ALL trips

  console.log(`📊 Processing ${allTripCodes.length} trips (${isProduction ? 'production' : 'full'} mode) to get 50 reviews each (using pagination)`);
  console.log(`🧠 Initial memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);
  console.log(`⏱️  Estimated time: ~${Math.ceil(allTripCodes.length * 3 * 1.5 / 60)} minutes (${allTripCodes.length} trips × 3 pages × 1.5s delays)`);

  // Use streaming writer for memory efficiency
  const outputFile = 'feefo_reviews_costsaver.json';
  const jsonWriter = new StreamingJSONWriter(outputFile);

  const REVIEWS_PER_TRIP = 50; // Target 50 reviews per trip
  const REVIEWS_PER_PAGE = 50; // Feefo API v20 returns up to 50 per page
  const BATCH_SIZE = 3; // Reduced batch size for VPS memory safety
  const BATCH_DELAY = 3000; // Increased delay between batches for VPS

  let totalReviewsCount = 0;

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
    let page = 1;
    let totalPages = 1; // Will be updated from API response

    while (page <= totalPages && tripReviews.length < REVIEWS_PER_TRIP) {
      try {
        const baseUrl = 'https://api.feefo.com/api/20/reviews/all';
        const params = {
          page: page,
          page_size: 50, // Get more reviews per page
          merchant_identifier: 'costsaver-trafalgar',
          product_sku: `${trip.trip_code}*`,
          full_thread: 'include',
          enhanced_insight: 'include',
          empty_product_comments: 'include',
          since_period: 'all'
        };

        console.log(`📄 Fetching page ${page}/${totalPages} for ${trip.trip_code} (${tripReviews.length}/${REVIEWS_PER_TRIP} reviews so far)`);

        const response = await axios.get(baseUrl, {
          params: params,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://www.costsavertours.com/'
          },
          timeout: 30000
        });

        const reviewData = response.data;

        // Update total pages from API response
        if (reviewData.summary && reviewData.summary.meta && reviewData.summary.meta.pages && page === 1) {
          totalPages = Math.min(reviewData.summary.meta.pages, Math.ceil(REVIEWS_PER_TRIP / 50));
          console.log(`📊 Total pages available: ${reviewData.summary.meta.pages}, will fetch up to: ${totalPages}`);
        }

        // Parse reviews from Feefo API v20 response
        if (reviewData && reviewData.reviews && Array.isArray(reviewData.reviews)) {
          console.log(`📊 Found ${reviewData.reviews.length} reviews on page ${page}`);

          reviewData.reviews.forEach(review => {
            // Stop if we already have 50 reviews for this trip
            if (tripReviews.length >= REVIEWS_PER_TRIP) return;

            // Feefo API v20 structure
            const customer = review.customer || {};
            const service = review.service || {};
            const products = review.products || [];

            // Extract all review content
            let fullReviewText = '';

            // Add service review text
            if (service.review) {
              fullReviewText += service.review + ' ';
            }

            // Add all product reviews
            products.forEach(product => {
              if (product.review) {
                fullReviewText += product.review + ' ';
              }
            });

            // Clean up the text (remove extra whitespace)
            fullReviewText = fullReviewText.trim().replace(/\s+/g, ' ');

            // Get the highest rating from service or products
            let highestRating = 0;

            // Check service rating
            if (service.rating && service.rating.rating) {
              highestRating = Math.max(highestRating, parseInt(service.rating.rating));
            }

            // Check product ratings
            products.forEach(product => {
              if (product.rating && product.rating.rating) {
                highestRating = Math.max(highestRating, parseInt(product.rating.rating));
              }
            });

            // Only include reviews with meaningful content
            if (fullReviewText.trim() !== '' && highestRating > 0) {
              tripReviews.push({
                trip_id: trip.trip_id,
                trip_name: trip.trip_name,
                trip_code: trip.trip_code,
                reviewer_name: customer.display_name || 'Anonymous',
                rating: highestRating,
                review_text: fullReviewText,
                review_title: service.title || 'Review',
                review_date: review.created_at || review.last_updated_date || null,
                source: 'cost-saver-feefo-api-v20',
                page_fetched: page,
                products_reviewed: products.length,
                service_rating: service.rating ? parseInt(service.rating.rating) : null,
                service_review: service.review || '',
                product_ratings: products.map(p => ({
                  title: p.product ? p.product.title : '',
                  sku: p.product ? p.product.sku : '',
                  rating: p.rating ? parseInt(p.rating.rating) : null,
                  review: p.review || ''
                })),
                url: review.url || null
              });
            }
          });

          console.log(`📄 Page ${page}: Added ${reviewData.reviews.length} reviews (${tripReviews.length}/${REVIEWS_PER_TRIP} total)`);
        } else {
          console.log(`⚠️  No reviews found on page ${page} or invalid response structure`);
          break; // Stop if no reviews found
        }

        // Check if we've reached the total pages or have enough reviews
        if (page >= totalPages || tripReviews.length >= REVIEWS_PER_TRIP) {
          break;
        }

        page++;

        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`📄 Page ${page}: Found ${reviewData.reviews?.length || 0} reviews (${tripReviews.length}/${REVIEWS_PER_TRIP} total)`);

        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Error fetching page ${page} for ${trip.trip_code}:`, error.message);
        // Continue with next page
      }
    }

    console.log(`✅ Collected ${tripReviews.length} total reviews for ${trip.trip_name} (${trip.trip_code})`);

    // Write reviews to stream immediately (memory efficient)
    tripReviews.forEach(review => {
      jsonWriter.writeReview(review);
      totalReviewsCount++;
    });

    // Clear tripReviews array to free memory
    tripReviews.length = 0;

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

  // Set metadata and close streaming writer
  const targetPerTrip = REVIEWS_PER_TRIP;
  const totalTarget = allTripCodes.length * targetPerTrip;

  jsonWriter.setMetadata({
    total_reviews: totalReviewsCount,
    trips_processed: allTripCodes.length,
    target_reviews_per_trip: targetPerTrip,
    total_target: totalTarget,
    target_achieved: totalReviewsCount >= totalTarget,
    reviews_per_trip_avg: (totalReviewsCount / allTripCodes.length).toFixed(1),
    memory_efficient: true,
    batch_processing: true,
    streaming_write: true,
    test_mode: false, // Now processing ALL trips
    generated_at: new Date().toISOString()
  });

  jsonWriter.close();

  console.log(`\n✅ Saved ${totalReviewsCount} Feefo reviews to ${outputFile}`);
  console.log(`📊 Average reviews per trip: ${(totalReviewsCount / allTripCodes.length).toFixed(1)}`);
  console.log(`🎯 Target: ${targetPerTrip} reviews per trip (${totalTarget} total) - ${totalReviewsCount >= totalTarget ? '✅ Achieved' : '⚠️ Partial'}`);
  console.log(`🧠 Memory efficient: Streaming write + batched processing with GC triggers`);
  console.log(`📝 Pagination: Dynamic (based on API total_pages, up to ${REVIEWS_PER_PAGE} reviews/page)`);
  console.log(`🔗 API: Feefo API v20 (api.feefo.com/api/20/reviews/all)`);
  console.log(`🏷️  Merchant: costsaver-trafalgar`);
  console.log(`🧪 Mode: Full Production (${allTripCodes.length} trips)`);
}

// Run the function
fetchFeefoReviews().catch(console.error);