import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import JSONStream from 'JSONStream';

// Load environment variables from .env file
dotenv.config();

// Helper functions from working example
function ensureArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function safeNum(v) { if (v === undefined || v === null) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function parseDateToUTC(d) { if (!d) return null; try { if (String(d).includes('T')) return new Date(d); return new Date(String(d) + 'T00:00:00Z'); } catch { return null; } }
function daysInclusive(start, end) { const s = parseDateToUTC(start); const e = parseDateToUTC(end); if (!s || !e) return null; const msPerDay = 24*60*60*1000; const diff = Math.round((e.getTime() - s.getTime())/msPerDay); return diff + 1; }

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
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

// Transform tour data to trip details format
function transformTourToDetails(tour) {
  // Load trip codes
  const tripCodesData = JSON.parse(fs.readFileSync('trip_codes.json', 'utf8'));
  const tripCodeObj = tripCodesData.find(tc => tc.trip_id === tour.id);
  const tripCode = tripCodeObj ? tripCodeObj.trip_code : '';

  const details = [];
  const trip = {};
  trip.region = ''; // Will be populated from departures

  const tourOption = ensureArray(tour.tourOptions || tour.options || [])[0] || {};
  const seasons = ensureArray(tourOption.seasons || tourOption.season || []);
  for (const season of seasons) {
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

    if (!seasonContentContinent) {
      // If no continent found in tour content, try to infer from sellingRegion or sellingRegionName
      seasonContentContinent = inferContinentFromRegion(season.sellingRegion || season.sellingRegionName || '');
    }

    const departures = ensureArray(season.departures || []);
    for (const departure of departures) {
      const sellingRegions = ensureArray(departure.sellingRegions || []);

      for (const regionData of sellingRegions) {

        const startDate = regionData.startDate || departure.operatingStartDate || '';
        const endDate = regionData.endDate || '';
        const duration = daysInclusive(startDate, endDate);

        const priceObj = ensureArray(regionData.prices || [])[0] || {};
        const adultPrice = priceObj.adultPrice || priceObj.adult || {};
        const currentPrice = adultPrice.discounted || adultPrice.full || 0;
        const prevPrice = adultPrice.full || adultPrice.oldFullPrice || adultPrice.base || 0;

        let availability = regionData.availability || null;
        if (regionData.days && Array.isArray(regionData.days) && regionData.days.length > 0) {
          availability = regionData.days[0].availability || availability;
        }

        const seasonAccom = ensureArray(season.accommodation || []);
        let maxGroupSize = 1;
        for (const accommodation of seasonAccom) {
          const maxP = safeNum(accommodation.maxPassengers || accommodation.maxAdults || null);
          if (maxP !== null) maxGroupSize = Math.max(maxGroupSize, maxP);
        }

        const continentValue = seasonContentContinent || getContinent(regionData) || trip.region || '';

        details.push({
          trip_id: Number(tour.id) || null,
          trip_sku: tripCode || departure.id || `dep_${startDate}_${tour.id}`,
          departure_id: departure.id || `dep_${startDate}_${tour.id}`,
          start_date: startDate,
          end_date: endDate,
          trip_current_price: currentPrice,
          trip_prev_price: prevPrice,
          duration: duration,
          region: continentValue,
          availability: availability,
          max_group_size: maxGroupSize,
          min_group_size: 1,
          avg_group_size: null
        });
      }
    }

    // Now continue to contentBlocks departures below
    const contentBlocks = ensureArray(season.content || []);
    for (const cb of contentBlocks) {
      const cbDepartures = ensureArray(cb.departures || cb.departure || []);
      for (const dep of cbDepartures) {
        const sellingRegions = ensureArray(dep.sellingRegions || []);

        for (const regionData of sellingRegions) {
          if (!regionData.sellingRegion) continue;
          if (!regionData.sellingRegion.toLowerCase().includes('us')) continue; // only US regions

          const startDate = regionData.startDate || dep.operatingStartDate || '';
          const endDate = regionData.endDate || '';
          const duration = daysInclusive(startDate, endDate);

          const priceObj = ensureArray(regionData.prices || [])[0] || {};
          const adultPrice = priceObj.adultPrice || priceObj.adult || {};
          const currentPrice = adultPrice.discounted || adultPrice.full || 0;
          const prevPrice = adultPrice.full || adultPrice.oldFullPrice || adultPrice.base || 0;

          // Fetch availability from days if present, otherwise fallback
          let availability = regionData.availability || null;
          if (regionData.days && Array.isArray(regionData.days) && regionData.days.length > 0) {
            availability = regionData.days[0].availability || availability;
          }

          // Extract max_group_size from accommodation
          const seasonAccom = ensureArray(season.accommodation || []);
          let maxGroupSize = 1;
          for (const accommodation of seasonAccom) {
            const maxP = safeNum(accommodation.maxPassengers || accommodation.maxAdults || null);
            if (maxP !== null) maxGroupSize = Math.max(maxGroupSize, maxP);
          }

          // Check content blocks for accommodation too
          for (const cbInner of contentBlocks) {
            const cbAccom = ensureArray(cbInner.accommodation || cbInner.accommodationList || []);
            for (const accommodation of cbAccom) {
              const maxP = safeNum(accommodation.maxPassengers || accommodation.maxAdults || null);
              if (maxP !== null) maxGroupSize = Math.max(maxGroupSize, maxP);
            }
          }

          // derive continent for this regionData
          // prefer explicit regionData continent, then try inference, then fall back to seasonContentContinent, then trip.region
          const continentValue = getContinent(regionData) || seasonContentContinent || trip.region || '';

          details.push({
            trip_id: Number(tour.id) || null,
            trip_sku: tripCode || dep.id || `dep_${startDate}_${tour.id}`,
            departure_id: dep.id || `dep_${startDate}_${tour.id}`,
            start_date: startDate,
            end_date: endDate,
            trip_current_price: currentPrice,
            trip_prev_price: prevPrice,
            duration: duration,
            region: continentValue,
            availability: availability,
            max_group_size: maxGroupSize,
            min_group_size: 1,
            avg_group_size: null
          });
        }
      }
    }
  }

  return details;
}

// Save trip details to JSON file
async function saveTripDetailsToJSON(allDetails) {
  console.log(`💾 Processing ${allDetails.length} details for trip_details JSON...`);

  if (allDetails.length > 0) {
    try {
      console.log(`Saving ${allDetails.length} detail records...`);

      // Save to JSON file
      const outputPath = path.join(process.cwd(), 'trip_details_us.json');
      await fs.promises.writeFile(outputPath, JSON.stringify(allDetails, null, 2));

      console.log(`✅ Saved ${allDetails.length} trip detail records to ${outputPath}`);
      return { successCount: allDetails.length, errorCount: 0, totalDetails: allDetails.length };
    } catch (error) {
      console.error('❌ Error saving trip details JSON:', error);
      return { successCount: 0, errorCount: allDetails.length, totalDetails: allDetails.length };
    }
  }

  console.log(`Trip Details Results: 0 successful, 0 errors, ${allDetails.length} total rows processed`);
  return { successCount: 0, errorCount: 0, totalDetails: allDetails.length };
}
// Main function
async function processTripDetailsData() {
  try {
    console.log('🚀 Starting trip_details data processing...');
    logMemory("Start of trip_details.js");

    const filePath = path.join(process.cwd(), 'trafalgar-tours-us.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`JSON file not found: ${filePath}. Run main.js first.`);
    }

    const allDetails = [];
    let totalTours = 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const parser = JSONStream.parse('tours.*');
      stream.pipe(parser);

      parser.on('data', (tour) => {
        totalTours++;
        if (isUSTour(tour)) {
          const details = transformTourToDetails(tour);
          allDetails.push(...details);
        }
      });

      parser.on('end', async () => {
        logMemory("After streaming and processing details");
        console.log(`📖 Processed ${totalTours} tours from JSON file`);
        const usToursCount = allDetails.length; // Approximate, since details are per departure
        console.log(`🇺🇸 Filtered to US tours (from ${totalTours} total)`);

        // Save to JSON
        const results = await saveTripDetailsToJSON(allDetails);

        logMemory("After saving trip_details JSON");
        console.log('✅ Trip details data processing completed!');
        console.log(`📈 Summary: ${results.successCount} rows saved to JSON, ${results.errorCount} errors, ${results.totalDetails} total rows processed`);
        resolve();
      });

      parser.on('error', reject);
      stream.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Error processing trip details data:', error);
    process.exit(1);
  }
}

// Run the script
processTripDetailsData().catch(console.error);
