import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Read the JSON file
function readTourData() {
  const filePath = path.join(process.cwd(), 'trafalgar-tours-us.json');

  if (!fs.existsSync(filePath)) {
    throw new Error(`JSON file not found: ${filePath}. Run main.js first.`);
  }

  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

// Helper functions from working example
function ensureArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function safeNum(v) { if (v === undefined || v === null) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function parseDateToUTC(d) { if (!d) return null; try { if (String(d).includes('T')) return new Date(d); return new Date(String(d) + 'T00:00:00Z'); } catch { return null; } }
function daysInclusive(start, end) { const s = parseDateToUTC(start); const e = parseDateToUTC(end); if (!s || !e) return null; const msPerDay = 24*60*60*1000; const diff = Math.round((e.getTime() - s.getTime())/msPerDay); return diff + 1; }

function first(arr, fallback = null) {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : fallback;
}

// Try to infer a continent from a provided region/country/continent string or common code
function inferContinentFromRegion(codeOrName) {
  if (!codeOrName) return '';
  const s = String(codeOrName).trim();
  const uc = s.toUpperCase();

  // quick direct continent words
  if (uc.includes('NORTH AMERICA') || uc === 'NORTH AMERICA' || uc === 'N AMERICA' || uc === 'N AM') return 'North America';
  if (uc.includes('SOUTH AMERICA') || uc === 'SOUTH AMERICA' || uc === 'S AMERICA' || uc === 'S AM') return 'South America';
  if (uc.includes('EUROPE') || uc === 'EUROPE') return 'Europe';
  if (uc.includes('ASIA') || uc === 'ASIA') return 'Asia';
  if (uc.includes('AFRICA') || uc === 'AFRICA') return 'Africa';
  if (uc.includes('OCEANIA') || uc.includes('AUSTRALIA') || uc === 'OCEANIA') return 'Oceania';

  // small mapping for common country codes/names -> continent (extend as needed)
  const map = {
    'US': 'North America', 'USA': 'North America', 'UNITED STATES': 'North America',
    'CA': 'North America', 'CANADA': 'North America',
    'MX': 'North America', 'MEXICO': 'North America',
    'BR': 'South America', 'BRAZIL': 'South America', 'AR': 'South America', 'ARGENTINA': 'South America',
    'GB': 'Europe', 'UK': 'Europe', 'UNITED KINGDOM': 'Europe', 'FR': 'Europe', 'FRANCE': 'Europe',
    'DE': 'Europe', 'GERMANY': 'Europe', 'ES': 'Europe', 'SPAIN': 'Europe', 'IT': 'Europe', 'ITALY': 'Europe',
    'CN': 'Asia', 'CHINA': 'Asia', 'JP': 'Asia', 'JAPAN': 'Asia', 'IN': 'Asia', 'INDIA': 'Asia',
    'AU': 'Oceania', 'AUSTRALIA': 'Oceania', 'NZ': 'Oceania', 'NEW ZEALAND': 'Oceania',
    'ZA': 'Africa', 'SOUTH AFRICA': 'Africa', 'EG': 'Africa', 'EGYPT': 'Africa'
  };

  if (map[uc]) return map[uc];

  // if it's a longer string try some keywords
  if (uc.includes('EURO') || uc.includes('E.U.')) return 'Europe';
  if (uc.includes('ASIA')) return 'Asia';
  if (uc.includes('AFR') || uc.includes('AFRIC')) return 'Africa';
  if (uc.includes('AMERIC') || uc.includes('AMER')) {
    // ambiguous — try to detect south/north
    if (uc.includes('SOUTH')) return 'South America';
    return 'North America';
  }

  // fallback: return original trimmed string (so at least something is present) or empty
  return s;
}

function getContinent(regionData = {}) {
  // Prefer explicit continent fields if present, then try to infer from sellingRegion or sellingRegionName
  const prefer = regionData.continent || regionData.sellingRegionContinent || regionData.continentName || '';
  if (prefer) return prefer;

  const candidate = regionData.sellingRegion || regionData.sellingRegionName || regionData.region || '';
  const inferred = inferContinentFromRegion(candidate);
  if (inferred) return inferred;

  // last resort: empty string
  return '';
}

function extractBannerImageFromContent(contentItems = []) {
  // Try to find the largest photo named 'primary_image' or any photo with a url
  const images = [];
  for (const item of contentItems) {
    (item.images || []).forEach(i => images.push(i));
  }
  const primary = images
    .filter(i => i.type === 'photo' && i.url)
    .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  return primary?.url || '';
}

function normalizePrice(price) {
  // The source had nested price objects; return a numeric (or 0) if possible
  if (!price) return 0;
  if (typeof price === 'number') return price;
  if (typeof price === 'string') {
    const n = Number(price.replace(/[^0-9.\-]+/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  if (price.adultPrice && price.adultPrice.discounted != null) return Number(price.adultPrice.discounted) || 0;
  if (price.adultPrice && price.adultPrice.full != null) return Number(price.adultPrice.full) || 0;
  return 0;
}

// Extract price using sophisticated logic from working example
function extractPrice(seasons) {
  if (!seasons || !Array.isArray(seasons)) return null;

  // Look through all seasons and their content blocks for pricing
  for (const season of seasons) {
    const contentBlocks = ensureArray(season.content || []);

    for (const contentBlock of contentBlocks) {
      // Check fromPrice in contentBlock
      const fromPrice = contentBlock.fromPrice;
      if (fromPrice) {
        if (typeof fromPrice.adultPrice === 'object') {
          const adult = fromPrice.adultPrice;
          if (adult.discounted !== undefined && adult.discounted !== null) {
            return safeNum(adult.discounted);
          }
          if (adult.full !== undefined && adult.full !== null) {
            return safeNum(adult.full);
          }
        } else if (typeof fromPrice.adultPrice === 'number' || typeof fromPrice.adultPrice === 'string') {
          return safeNum(fromPrice.adultPrice);
        }
      }

      // Check departures in contentBlock
      const departures = ensureArray(contentBlock.departures || []);
      for (const dep of departures) {
        const sellingRegions = ensureArray(dep.sellingRegions || []);
        for (const sr of sellingRegions) {
          const prices = ensureArray(sr.prices || []);
          for (const p of prices) {
            const adult = p.adultPrice || p.adult;
            if (adult) {
              if (adult.discounted !== undefined && adult.discounted !== null) {
                return safeNum(adult.discounted);
              }
              if (adult.full !== undefined && adult.full !== null) {
                return safeNum(adult.full);
              }
            }
          }
        }
      }
    }
  }

  return null;
}

// Extract banner image from tour data
function extractBannerImage(tour) {
  // Look for images in various places
  if (tour.images && Array.isArray(tour.images) && tour.images.length > 0) {
    return tour.images[0].image_href || tour.images[0].url || null;
  }
  return null;
}

// Calculate duration using inclusive calculation from working example
function calculateDurationFromSeasons(seasons) {
  if (!seasons || !Array.isArray(seasons)) return null;

  for (const season of seasons) {
    const contentBlocks = ensureArray(season.content || []);

    for (const contentBlock of contentBlocks) {
      const departures = ensureArray(contentBlock.departures || []);

      for (const dep of departures) {
        const sellingRegions = ensureArray(dep.sellingRegions || []);
        for (const sr of sellingRegions) {
          const startDate = sr.startDate || sr.operatingStartDate || dep.startDate || dep.operatingStartDate;
          const endDate = sr.endDate || sr.operatingEndDate || dep.endDate || dep.operatingEndDate;

          if (startDate && endDate) {
            return daysInclusive(startDate, endDate);
          }
        }
      }
    }

    // Also check direct season departures
    const directDeps = ensureArray(season.departures || []);
    for (const dep of directDeps) {
      const sellingRegions = ensureArray(dep.sellingRegions || []);
      for (const sr of sellingRegions) {
        const startDate = sr.startDate || sr.operatingStartDate || dep.startDate || dep.operatingStartDate;
        const endDate = sr.endDate || sr.operatingEndDate || dep.endDate || dep.operatingEndDate;

        if (startDate && endDate) {
          return daysInclusive(startDate, endDate);
        }
      }
    }
  }

  return null;
}

// Helper function to check if a tour has US regions
function isUSTour(tour) {
  if (!tour) return false;

  // Check websiteUrls array for 'us' region
  if (tour.websiteUrls && Array.isArray(tour.websiteUrls)) {
    return tour.websiteUrls.some(urlObj =>
      urlObj.sellingRegion && urlObj.sellingRegion.toLowerCase() === 'us'
    );
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

// Transform tour data to the required JSON format
function transformTourData(tour) {
  // Load trip codes
  const tripCodesData = JSON.parse(fs.readFileSync('trip_codes.json', 'utf8'));
  const tripCodeObj = tripCodesData.find(tc => tc.trip_id === tour.id);
  const tripCode = tripCodeObj ? tripCodeObj.trip_code : '';

  const trip = {};
  trip.trip_id = tour.id || null;
  trip.trip_product_line = tripCode || tour.tourType || '';
  trip.region = ''; // Will be populated from departures

  // Get description (first content.description we can find)
  let description = '';
  for (const option of tour.tourOptions || []) {
    for (const season of option.seasons || []) {
      const contentItem = first(season.content, {});
      if (contentItem && contentItem.description) {
        description = contentItem.description;
        break;
      }
    }
    if (description) break;
  }
  trip.trip_description = description;

  // Banner image - improved: aggregate content items per season and find largest primary
  let bannerImage = '';
  for (const option of tour.tourOptions || []) {
    for (const season of option.seasons || []) {
      const contentItems = season.content || [];
      const candidate = extractBannerImageFromContent(contentItems);
      if (candidate) {
        bannerImage = candidate;
        break;
      }
    }
    if (bannerImage) break;
  }
  trip.banner_image = bannerImage;

  // Group sizes from accommodation
  const groupPassengers = [];
  for (const option of tour.tourOptions || []) {
    for (const season of option.seasons || []) {
      for (const accom of season.accommodation || []) {
        if (accom.maxPassengers != null) groupPassengers.push(Number(accom.maxPassengers));
      }
    }
  }
  if (groupPassengers.length > 0) {
    trip.group_size_max = Math.max(...groupPassengers);
    const minGroup = Math.min(...groupPassengers);
    trip.group_size_avg = Math.floor((trip.group_size_max + minGroup) / 2);
  } else {
    trip.group_size_max = 1;
    trip.group_size_avg = 1;
  }

  // All departures and advertised_departures
  trip.departures = [];
  trip.advertised_departures = [];
  trip.trip_current_price = 0;

  for (const option of tour.tourOptions || []) {
    for (const season of option.seasons || []) {

      // --- NEW: try to extract continent from contentItem.countriesVisited (preferred) ---
      // Use first content item with countriesVisited and take the first country's continent
      let seasonContentContinent = '';
      for (const contentItem of season.content || []) {
        if (Array.isArray(contentItem.countriesVisited) && contentItem.countriesVisited.length > 0) {
          const c = contentItem.countriesVisited[0];
          if (c && c.continent) {
            seasonContentContinent = c.continent;
            break;
          }
        }
      }
      // if trip-level region isn't set, set it to seasonContentContinent (first found)
      if (!trip.region && seasonContentContinent) {
        trip.region = seasonContentContinent;
      }
      // --- end new ---

      for (const departure of season.departures || []) {
        for (const regionData of departure.sellingRegions || []) {
          const startDate = regionData.startDate || departure.operatingStartDate || '';
          const endDate = regionData.endDate || '';
          const duration = daysInclusive(startDate, endDate) || 0;

          const priceObj = first(regionData.prices, {});
          const currentPrice = normalizePrice(priceObj?.adultPrice?.discounted ?? priceObj?.adultPrice ?? priceObj);
          const prevPrice = normalizePrice(priceObj?.adultPrice?.full ?? priceObj?.adultPrice ?? priceObj);

          let availability = regionData.availability || 'available';
          if (Array.isArray(regionData.days) && regionData.days.length > 0) {
            availability = regionData.days[0].availability || availability;
          }

          // derive continent for this regionData
          // prefer explicit regionData continent, then try inference, then fall back to seasonContentContinent, then trip.region
          const continentValue = getContinent(regionData) || seasonContentContinent || trip.region || '';

          trip.departures.push({
            departure_id: departure.id || '',
            start_date: startDate,
            end_date: endDate,
            region: seasonContentContinent, // Keep as 'us' as requested
            availability: availability,
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

          if (currentPrice > trip.trip_current_price) {
            trip.trip_current_price = currentPrice;
          }

          // set trip-level region if not set yet (first non-empty)
          if (!trip.region && continentValue) {
            trip.region = continentValue;
          }
        }
      }
    }
  }

  // Duration: use first departure if available
  if (trip.departures.length > 0) {
    const firstDep = trip.departures[0];
    trip.duration = daysInclusive(firstDep.start_date, firstDep.end_date) || 0;
  } else {
    trip.duration = 0;
  }

  trip.reviews = null;

  return trip;
}

// Save trips to JSON file
async function saveTripsToJSON(tours) {
  console.log(`💾 Processing ${tours.length} tours for trips JSON...`);

  // Filter for US tours only
  const usTours = tours.filter(isUSTour);
  console.log(`🇺🇸 Filtered to ${usTours.length} US tours (from ${tours.length} total)`);

  const transformedTrips = usTours.map(transformTourData);

  // Save to JSON file
  const outputPath = path.join(process.cwd(), 'trips.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(transformedTrips, null, 2));
    console.log(`✅ Saved ${transformedTrips.length} trips to ${outputPath}`);
    return { successCount: transformedTrips.length, errorCount: 0 };
  } catch (error) {
    console.error('❌ Error saving trips JSON:', error);
    return { successCount: 0, errorCount: transformedTrips.length };
  }
}

// Main function
async function processTripsData() {
  try {
    console.log('🚀 Starting trips data processing...');

    // Read JSON data
    const toursData = readTourData();
    const tours = toursData.tours || []; // Extract tours array
    console.log(`📖 Read ${tours.length} tours from JSON file`);

    // Save to JSON
    const results = await saveTripsToJSON(tours);

    console.log('✅ Trips data processing completed!');
    console.log(`📈 Summary: ${results.successCount} trips saved to JSON, ${results.errorCount} errors`);

  } catch (error) {
    console.error('❌ Error processing trips data:', error);
    process.exit(1);
  }
}

// Run the script
processTripsData().catch(console.error);
