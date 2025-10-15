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

async function fetchTripCodes() {
  const toursData = readTourData();
  const tours = toursData.tours || [];
  const usTours = tours.filter(isUSTour);

  const tripCodes = [];

  for (const tour of usTours) {
    let url = '';
    const tourOption = tour.tourOptions && tour.tourOptions[0];
    if (tourOption && tourOption.websiteUrls && Array.isArray(tourOption.websiteUrls)) {
      const usUrl = tourOption.websiteUrls.find(u => u.sellingRegion === 'us');
      if (usUrl) url = usUrl.url;
    }

    if (!url) {
      tripCodes.push({ trip_id: tour.id, trip_name: tour.name, trip_code: null });
      continue;
    }

    try {
      const res = await axios.get(url);
      const $ = cheerio.load(res.data);
      let tripCode = $('.trip-hero__trip-code').text().trim();
      tripCode = tripCode.replace('Trip code:', '').trim();
      tripCodes.push({ trip_id: tour.id, trip_name: tour.name, trip_code: tripCode || null });
      console.log(`${tour.name}: ${tripCode || 'NO CODE FOUND'}`);
    } catch (err) {
      console.error('Error fetching', url, err.message);
      tripCodes.push({ trip_id: tour.id, trip_name: tour.name, trip_code: null });
    }
  }

  // Save results
  fs.writeFileSync('trip_codes.json', JSON.stringify(tripCodes, null, 2));
  console.log('✅ trip_codes.json created!');
}

// Run the function
fetchTripCodes().catch(console.error);
