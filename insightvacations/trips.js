import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import JSONStream from 'JSONStream';

dotenv.config();

function ensureArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function safeNum(v) { if (v === undefined || v === null) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function parseDateToUTC(d) { if (!d) return null; try { if (String(d).includes('T')) return new Date(d); return new Date(String(d) + 'T00:00:00Z'); } catch { return null; } }
function daysInclusive(start, end) { const s = parseDateToUTC(start); const e = parseDateToUTC(end); if (!s || !e) return null; const msPerDay = 24*60*60*1000; const diff = Math.round((e.getTime() - s.getTime())/msPerDay); return diff + 1; }

function first(arr, fallback = null) { return Array.isArray(arr) && arr.length > 0 ? arr[0] : fallback; }

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

// Load scraped trip data (ratings, reviews, activity levels)
let scrapedDataMap = new Map();
try {
  const scrapedRaw = fs.readFileSync(path.join(process.cwd(), 'trip_data_scraped.json'), 'utf8');
  const scrapedArr = JSON.parse(scrapedRaw);
  scrapedArr.forEach(item => {
    scrapedDataMap.set(Number(item.trip_id), {
      avg_rating: item.rating,
      total_reviews: item.review_count,
      activity_level: item.activity_level
    });
  });
  console.log(`🔗 Loaded scraped data for ${scrapedDataMap.size} trips`);
} catch (e) {
  console.warn('⚠️  trip_data_scraped.json not found or invalid. Using defaults.');
}

function inferContinentFromRegion(codeOrName) {
  if (!codeOrName) return '';
  const s = String(codeOrName).trim();
  const uc = s.toUpperCase();
  if (uc.includes('NORTH AMERICA') || uc === 'NORTH AMERICA' || uc === 'N AMERICA' || uc === 'N AM') return 'North America';
  if (uc.includes('SOUTH AMERICA') || uc === 'SOUTH AMERICA' || uc === 'S AMERICA' || uc === 'S AM') return 'South America';
  if (uc.includes('EUROPE') || uc === 'EUROPE') return 'Europe';
  if (uc.includes('ASIA') || uc === 'ASIA') return 'Asia';
  if (uc.includes('AFRICA') || uc === 'AFRICA') return 'Africa';
  if (uc.includes('OCEANIA') || uc.includes('AUSTRALIA') || uc === 'OCEANIA') return 'Oceania';
  return s;
}

function getContinent(regionData = {}) {
  const prefer = regionData.continent || regionData.sellingRegionContinent || regionData.continentName || '';
  if (prefer) return prefer;
  const candidate = regionData.sellingRegion || regionData.sellingRegionName || regionData.region || '';
  const inferred = inferContinentFromRegion(candidate);
  if (inferred) return inferred;
  return '';
}

function extractBannerImageFromContent(contentItems = []) {
  const images = [];
  for (const item of contentItems) { (item.images || []).forEach(i => images.push(i)); }
  const primary = images.filter(i => i.type === 'photo' && i.url).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  return primary?.url || '';
}

function normalizePrice(price) {
  if (!price) return 0;
  if (typeof price === 'number') return price;
  if (typeof price === 'string') { const n = Number(price.replace(/[^0-9.\-]+/g, '')); return Number.isFinite(n) ? n : 0; }
  if (price.adultPrice && price.adultPrice.discounted != null) return Number(price.adultPrice.discounted) || 0;
  if (price.adultPrice && price.adultPrice.full != null) return Number(price.adultPrice.full) || 0;
  return 0;
}

function extractPrice(seasons) {
  if (!seasons || !Array.isArray(seasons)) return null;
  for (const season of seasons) {
    const contentBlocks = ensureArray(season.content || []);
    for (const contentBlock of contentBlocks) {
      const fromPrice = contentBlock.fromPrice;
      if (fromPrice) {
        if (typeof fromPrice.adultPrice === 'object') {
          const adult = fromPrice.adultPrice;
          if (adult.discounted !== undefined && adult.discounted !== null) { return safeNum(adult.discounted); }
          if (adult.full !== undefined && adult.full !== null) { return safeNum(adult.full); }
        } else if (typeof fromPrice.adultPrice === 'number' || typeof fromPrice.adultPrice === 'string') { return safeNum(fromPrice.adultPrice); }
      }
    }
  }
  return null;
}

function isUSTour(tour) {
  if (!tour) return false;
  if (tour.websiteUrls && Array.isArray(tour.websiteUrls)) { return tour.websiteUrls.some(urlObj => (urlObj.sellingRegion || '').toLowerCase() === 'us'); }
  if (!tour.tourOptions) return false;
  for (const option of tour.tourOptions) {
    if (!option.seasons) continue;
    for (const season of option.seasons) {
      if (!season.departures) continue;
      for (const departure of season.departures) {
        if (!departure.sellingRegions) continue;
        for (const region of departure.sellingRegions) {
          const rn = (region.sellingRegion || '').toLowerCase();
          if (rn.includes('us') || rn.includes('united states') || rn === 'us') return true;
        }
      }
    }
  }
  return false;
}

function transformTourData(tour) {
  let skuLatest = '';
  try {
    // Load latest SKUs
    const skusData = JSON.parse(fs.readFileSync('trip_sku_latest_us.json', 'utf8'));
    const skuObj = skusData.trips.find(t => t.trip_id === tour.id);
    skuLatest = skuObj ? skuObj.sku_latest : '';
  } catch (error) {
    console.error('Error loading SKUs:', error.message);
  }

  // Load trip cities if available
  // let tripCities = [];
  // try {
  //   const citiesData = JSON.parse(fs.readFileSync('trip_itinerary_locations.json', 'utf8'));
  //   const tripCitiesData = citiesData.data.find(t => t.trip_id === tour.id);
  //   tripCities = tripCitiesData ? tripCitiesData.Cities || [] : [];
  // } catch (error) {
  //   console.error('Error loading trip cities:', error.message);
  // }

  const trip = {};
  trip.trip_id = tour.id || null;
  trip.trip_name = tour.name || tour.title || tour.tourName || '';
  trip.trip_product_line = skuLatest || tour.tourType || '';
  trip.region = '';
  // trip.trip_cities = tripCities;

  const scrapedData = scrapedDataMap.get(Number(tour.id)) || {};
  const avg_rating = safeNum(scrapedData.avg_rating);
  const total_reviews = safeNum(scrapedData.total_reviews);
  const activity_level = scrapedData.activity_level || null;

  trip.avg_rating = avg_rating;
  trip.total_reviews = total_reviews;
  trip.activity_level = activity_level;
  trip.service_level = 'Upgraded';

  let description = '';
  for (const option of tour.tourOptions || []) {
    for (const season of option.seasons || []) {
      const contentItem = first(season.content, {});
      if (contentItem && contentItem.description) { description = contentItem.description; break; }
    }
    if (description) break;
  }
  trip.trip_description = description;

  let bannerImage = '';
  for (const option of tour.tourOptions || []) {
    for (const season of option.seasons || []) {
      const contentItems = season.content || [];
      const candidate = extractBannerImageFromContent(contentItems);
      if (candidate) { bannerImage = candidate; break; }
    }
    if (bannerImage) break;
  }
  trip.banner_image = bannerImage;

  trip.departures = [];
  trip.advertised_departures = [];
  trip.trip_current_price = 0;

  for (const option of tour.tourOptions || []) {
    for (const season of option.seasons || []) {
      // Try to derive continent from countriesVisited in content
      let seasonContentContinent = '';
      for (const contentItem of season.content || []) {
        if (Array.isArray(contentItem.countriesVisited) && contentItem.countriesVisited.length > 0) {
          const c = contentItem.countriesVisited[0];
          if (c && c.continent) { seasonContentContinent = c.continent; break; }
        }
      }

      for (const departure of season.departures || []) {
        for (const regionData of departure.sellingRegions || []) {
          const startDate = regionData.startDate || departure.operatingStartDate || '';
          const endDate = regionData.endDate || '';
          const duration = daysInclusive(startDate, endDate) || 0;
          const priceObj = (regionData.prices || [])[0] || {};
          const currentPrice = normalizePrice(priceObj?.adultPrice?.discounted ?? priceObj?.adultPrice ?? priceObj);
          const prevPrice = normalizePrice(priceObj?.adultPrice?.full ?? priceObj?.adultPrice ?? priceObj);
          const availability = (regionData.days && regionData.days[0]?.availability) || regionData.availability || 'available';
          const continentValue = seasonContentContinent || getContinent(regionData) || '';

          trip.departures.push({
            departure_id: departure.id || '',
            start_date: startDate,
            end_date: endDate,
            region: continentValue,
            availability,
            currency: regionData.currency || 'USD',
            current_amount: String(currentPrice),
            previous_amount: String(prevPrice),
            duration_days: duration
          });

          trip.advertised_departures.push({
            currency: regionData.currency || 'USD',
            departure_id: departure.id || '',
            current_amount: String(currentPrice),
            previous_amount: String(prevPrice)
          });

          if (currentPrice > trip.trip_current_price) { trip.trip_current_price = currentPrice; }
          if (!trip.region && continentValue) { trip.region = continentValue; }
        }
      }
    }
  }

  if (trip.departures.length > 0) {
    const firstDep = trip.departures[0];
    trip.duration = daysInclusive(firstDep.start_date, firstDep.end_date) || 0;
  } else { trip.duration = 0; }

  return trip;
}

async function saveTripsToJSON(transformedTrips) {
  console.log(`💾 Processing ${transformedTrips.length} trips for trips JSON (Insight)...`);
  const outputPath = path.join(process.cwd(), 'trips_insight.json');
  try {
    fs.writeFileSync(outputPath, JSON.stringify(transformedTrips, null, 2));
    console.log(`✅ Saved ${transformedTrips.length} trips to ${outputPath}`);
    return { successCount: transformedTrips.length, errorCount: 0 };
  } catch (error) {
    console.error('❌ Error saving trips JSON (Insight):', error);
    return { successCount: 0, errorCount: transformedTrips.length };
  }
}

async function processTripsData() {
  try {
    console.log('🚀 Starting trips data processing (Insight Vacations)...');
    logMemory("Start of insightvacations/trips.js");

    const filePath = path.join(process.cwd(), 'insight-tours-us.json');
    if (!fs.existsSync(filePath)) { throw new Error(`JSON file not found: ${filePath}. Run insightvacations/main.js first.`); }

    const tours = [];
    let totalTours = 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const parser = JSONStream.parse('tours.*');
      stream.pipe(parser);

      parser.on('data', (tour) => {
        totalTours++;
        if (isUSTour(tour)) { tours.push(transformTourData(tour)); }
      });

      parser.on('end', async () => {
        logMemory("After streaming and processing tours (Insight)");
        console.log(`📖 Processed ${totalTours} tours from JSON file`);
        const usToursCount = tours.length;
        console.log(`🇺🇸 Filtered to ${usToursCount} US tours (from ${totalTours} total)`);
        const results = await saveTripsToJSON(tours);
        logMemory("After saving trips JSON (Insight)");
        console.log('✅ Trips data processing completed (Insight)!');
        console.log(`📈 Summary: ${results.successCount} trips saved to JSON, ${results.errorCount} errors`);
        resolve();
      });

      parser.on('error', reject);
      stream.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Error processing trips data (Insight):', error);
    process.exit(1);
  }
}

processTripsData().catch(console.error);
