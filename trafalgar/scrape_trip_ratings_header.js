import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Read the JSON file
function readTourData() {
  const filePath = 'trafalgar-tours-us.json';

  if (!fs.existsSync(filePath)) {
    throw new Error(`JSON file not found: ${filePath}. Run main.js first.`);
  }

  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

// Helper to check if tour has US regions
function isUSTour(tour) {
  if (!tour) return false;

  // Check websiteUrls array for 'us' region
  if (tour.websiteUrls && Array.isArray(tour.websiteUrls)) {
    return tour.websiteUrls.some(urlObj => urlObj.sellingRegion && urlObj.sellingRegion.toLowerCase() === 'us');
  }

  // Fallback: Check sellingRegions in tour options
  if (!tour.tourOptions) return false;

  for (const option of tour.tourOptions) {
    if (!option.seasons) continue;

    for (const season of option.seasons) {
      if (!season.departures) continue;

      for (const departure of season.departures) {
        if (!departure.sellingRegions) continue;

        for (const region of departure.sellingRegions) {
          const regionName = (region.sellingRegion || '').toLowerCase();
          if (regionName.includes('us') || regionName.includes('united states') || regionName === 'us') {
            return true;
          }
        }
      }
    }
  }

  return false;
}

async function fetchTripRatings() {
  const toursData = readTourData();
  const tours = toursData.tours || [];
  const usTours = tours.filter(isUSTour);

  console.log(`📊 Found ${usTours.length} US tours to scrape for ratings`);
  console.log(`🧠 Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);

  const tripRatings = [];
  const BATCH_SIZE = 8; // Process 8 tours at a time (1GB RAM)
  const BATCH_DELAY = 1500; // 1.5 second delay between batches

  for (let i = 0; i < usTours.length; i += BATCH_SIZE) {
    const batch = usTours.slice(i, i + BATCH_SIZE);
    console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(usTours.length / BATCH_SIZE)} (${batch.length} tours)`);

    for (const tour of batch) {
    let url = '';
    const tourOption = tour.tourOptions && tour.tourOptions[0];
    if (tourOption && tourOption.websiteUrls && Array.isArray(tourOption.websiteUrls)) {
      const usUrl = tourOption.websiteUrls.find(u => u.sellingRegion === 'us');
      if (usUrl) url = usUrl.url;
    }

    // Clean and validate URL
    if (url) {
      // Remove any double protocols
      url = url.replace(/^https?:\/\/https?:\/\//, 'https://');
      // Ensure it starts with https://
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      // Basic URL validation
      try {
        new URL(url);
      } catch (e) {
        console.error(`Invalid URL for ${tour.name}: ${url}`);
        url = '';
      }
    }

    if (!url) {
      console.log(`No valid URL found for ${tour.name}`);
      tripRatings.push({
        trip_id: tour.id,
        trip_name: tour.name,
        rating: null,
        review_count: null
      });
      continue;
    }

    console.log(`Fetching: ${url}`);

    try {
      const res = await axios.get(url);
      const $ = cheerio.load(res.data);

      // Extract rating from the feefo div
      const ratingText = $('.trip-header__rating-text').text().trim();
      const rating = ratingText ? parseFloat(ratingText) : null;

      // Extract review count
      const reviewText = $('.trip-header__reviews-text p').text().trim();
      const reviewCount = reviewText ? parseInt(reviewText.replace(/[^\d]/g, '')) : null;

      // Extract tweaked icons information
      const tweakedIcons = {};
      $('.icon-with-description').each((index, element) => {
        const $el = $(element);
        const label = $el.find('.icon-with-description__label').text().trim();

        if (label === 'Travel & Accommodation') {
          const titles = $el.find('.icon-with-description__title').map((i, el) => $(el).text().trim()).get();
          tweakedIcons.travel_accommodation = titles;
        } else if (label === 'Meals') {
          const title = $el.find('.icon-with-description__title').text().trim();
          tweakedIcons.meals = title;
        } else if (label === 'Activity Level') {
          const title = $el.find('.icon-with-description__title').text().trim();
          tweakedIcons.activity_level = title;
        } else if (label === 'Itinerary') {
          tweakedIcons.itinerary_available = true;
        }
      });

      tripRatings.push({
        trip_id: tour.id,
        trip_name: tour.name,
        rating: rating,
        review_count: reviewCount,
        tweaked_icons: tweakedIcons
      });

      console.log(`${tour.name}: Rating ${rating || 'N/A'}, ${reviewCount || 0} reviews, Activity: ${tweakedIcons.activity_level || 'N/A'}`);

    } catch (err) {
      console.error('Error fetching', url, err.message);
      tripRatings.push({
        trip_id: tour.id,
        trip_name: tour.name,
        rating: null,
        review_count: null
      });
    }

    // Force garbage collection if available (Node.js with --expose-gc)
    if (global.gc) {
      global.gc();
    }
  }

    // Memory check and delay between batches
    console.log(`🧠 Memory after batch: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);

    // Delay between batches (except for the last batch)
    if (i + BATCH_SIZE < usTours.length) {
      console.log(`⏳ Waiting ${BATCH_DELAY}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  // Save results
  fs.writeFileSync('trip_ratings_header.json', JSON.stringify(tripRatings, null, 2));
  console.log('✅ trip_ratings_header.json created!');
}

// Run the function
fetchTripRatings().catch(console.error);