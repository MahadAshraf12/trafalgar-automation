import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Read the JSON file
function readTourData() {
  const filePath = 'insight-tours-us.json';

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

async function scrapeTripData() {
  const toursData = readTourData();
  const tours = toursData.tours || [];
  const usTours = tours.filter(isUSTour);

  console.log(`📊 Found ${usTours.length} US tours to scrape`);
  console.log(`🧠 Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);

  const tripData = [];
  const BATCH_SIZE = 5; // Process 5 tours at a time for low memory
  const BATCH_DELAY = 2000; // 2 second delay between batches

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

      // Handle base URLs that need trip slug appended
      if (url === 'https://www.insightvacations.com/en-us' ||
          url === 'https://www.insightvacations.com/en-us/' ||
          url.endsWith('/en-us') ||
          url.endsWith('/en-us/')) {
        // Convert trip name to slug format
        const tripSlug = tour.name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and dashes
          .replace(/\s+/g, '-') // Replace spaces with dashes
          .replace(/-+/g, '-') // Replace multiple dashes with single dash
          .replace(/^-|-$/g, ''); // Remove leading/trailing dashes

        // Construct proper trip URL
        url = `https://www.insightvacations.com/en-us/tours/${tripSlug}`;
        console.log(`Constructed URL for ${tour.name}: ${url}`);
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
      tripData.push({
        trip_id: tour.id,
        trip_name: tour.name,
        rating: null,
        review_count: null,
        activity_level: null,
        travel_styles: null
      });
      continue;
    }

    console.log(`Fetching: ${url}`);

    try {
      const res = await axios.get(url);
      const $ = cheerio.load(res.data);

      // Extract rating from the Feefo div
      const ratingText = $('.trip-header__rating-text').text().trim();
      const rating = ratingText ? parseFloat(ratingText) : null;

      // Extract review count
      const reviewText = $('.trip-header__reviews-text p').text().trim();
      const reviewCount = reviewText ? parseInt(reviewText.replace(/[^\d]/g, '')) : null;

      // Extract all travel style information from trip-hero__travel-styles div
      let travelStylesText = '';
      const travelStylesDiv = $('.trip-hero__travel-styles');
      if (travelStylesDiv.length > 0) {
        // Get all text content from the travel styles div
        const textElements = travelStylesDiv.find('.icon-text__text.trip-hero__travel-style__text');
        const textArray = textElements.map((i, el) => $(el).text().trim()).get();

        // Join with newlines - include everything
        travelStylesText = textArray.join('\n');
      }

      // Extract activity level - try to find it in the travel styles text
      let activityLevel = null;
      const activityLevelWords = ['Balanced', 'Dynamic', 'Leisurely'];
      if (travelStylesText) {
        const lines = travelStylesText.split('\n');
        for (const line of lines) {
          if (activityLevelWords.some(word => line.toLowerCase().includes(word.toLowerCase()))) {
            activityLevel = line.trim();
            break;
          }
        }
      }

      tripData.push({
        trip_id: tour.id,
        trip_name: tour.name,
        rating: rating,
        review_count: reviewCount,
        activity_level: activityLevel,
        travel_styles: travelStylesText
      });

      console.log(`${tour.name}: Rating ${rating || 'N/A'}, ${reviewCount || 0} reviews, Activity: ${activityLevel || 'N/A'}`);

    } catch (err) {
      console.error('Error fetching', url, err.message);
      tripData.push({
        trip_id: tour.id,
        trip_name: tour.name,
        rating: null,
        review_count: null,
        activity_level: null,
        travel_styles: null
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
  fs.writeFileSync('trip_data_scraped.json', JSON.stringify(tripData, null, 2));
  console.log('✅ trip_data_scraped.json created!');
}

// Run the function
scrapeTripData().catch(console.error);