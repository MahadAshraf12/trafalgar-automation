import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import JSONStream from 'JSONStream';

dotenv.config();

function ensureArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }

function inferContinentFromRegion(codeOrName) {
  if (!codeOrName) return '';
  const s = String(codeOrName).trim();
  const uc = s.toUpperCase();
  if (uc.includes('EUROPE') || uc === 'EUROPE' || uc === 'EU') return 'Europe';
  if (uc.includes('ASIA') || uc === 'ASIA' || uc === 'AS') return 'Asia';
  if (uc.includes('AFRICA') || uc === 'AFRICA' || uc === 'AF') return 'Africa';
  if (uc.includes('SOUTH AMERICA') || uc === 'SOUTH AMERICA' || uc === 'S AMERICA' || uc === 'S AM') return 'South America';
  if (uc.includes('NORTH AMERICA') || uc === 'NORTH AMERICA' || uc === 'N AMERICA' || uc === 'N AM') return 'North America';
  if (uc.includes('CENTRAL AMERICA') || uc === 'CENTRAL AMERICA' || uc === 'C AMERICA' || uc === 'C AM') return 'Central America';
  if (uc.includes('MIDDLE EAST') || uc === 'MIDDLE EAST' || uc === 'ME') return 'Middle East';
  if (uc.includes('ANTARCTICA') || uc === 'ANTARCTICA' || uc === 'AN') return 'Antarctica';
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
function safeNum(v) { if (v === undefined || v === null) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function parseDateToUTC(d) { if (!d) return null; try { if (String(d).includes('T')) return new Date(d); return new Date(String(d) + 'T00:00:00Z'); } catch { return null; } }
function daysInclusive(start, end) { const s = parseDateToUTC(start); const e = parseDateToUTC(end); if (!s || !e) return null; const msPerDay = 24*60*60*1000; const diff = Math.round((e.getTime() - s.getTime())/msPerDay); return diff + 1; }

function mapAvailability(avail) {
  if (!avail) return 0;
  const a = String(avail).toLowerCase();
  if (a === 'available') return 1;
  if (a === 'onrequest' || a === 'on_request') return 0;
  return 0;
}

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}

function isUSTour(tour) {
  if (!tour) return false;
  if (tour.websiteUrls && Array.isArray(tour.websiteUrls)) {
    return tour.websiteUrls.some(urlObj => (urlObj.sellingRegion || '').toLowerCase() === 'us');
  }
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

// Load scraped trip data (ratings, reviews, activity levels)
let scrapedDataMap = new Map();
try {
  const scrapedRaw = fs.readFileSync(path.join(process.cwd(), 'trip_data_scraped.json'), 'utf8');
  const scrapedArr = JSON.parse(scrapedRaw);
  scrapedArr.forEach(item => {
    scrapedDataMap.set(Number(item.trip_id), {
      activity_level: item.activity_level
    });
  });
  console.log(`🔗 Loaded activity levels for ${scrapedDataMap.size} trips`);
} catch (e) {
  console.warn('⚠️  trip_data_scraped.json not found or invalid. Activity levels will be null.');
}

function transformTourToDetails(tour) {
  let skuLatest = '';
  try {
    // Load latest SKUs
    const skusData = JSON.parse(fs.readFileSync('trip_sku_latest_us.json', 'utf8'));
    const skuObj = skusData.trips.find(t => t.trip_id === tour.id);
    skuLatest = skuObj ? skuObj.sku_latest : '';
  } catch {}

  const scrapedData = scrapedDataMap.get(Number(tour.id)) || {};

  const details = [];
  const tourOption = ensureArray(tour.tourOptions || tour.options || [])[0] || {};
  const seasons = ensureArray(tourOption.seasons || tourOption.season || []);
  for (const season of seasons) {
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

        let maxGroupSize = 1;
        const seasonAccom = ensureArray(season.accommodation || []);
        for (const accommodation of seasonAccom) {
          const maxP = safeNum(accommodation.maxPassengers || accommodation.maxAdults || null);
          if (maxP !== null) maxGroupSize = Math.max(maxGroupSize, maxP);
        }

        // Try to derive continent from countriesVisited in content if available
        let seasonContentContinent = '';
        for (const contentItem of season.content || []) {
          if (Array.isArray(contentItem.countriesVisited) && contentItem.countriesVisited.length > 0) {
            const c = contentItem.countriesVisited[0];
            if (c && c.continent) { seasonContentContinent = c.continent; break; }
          }
        }

        const detailsObj = {
          trip_id: tour.id,
          trip_sku: skuLatest,
          departure_id: departure.id,
          start_date: regionData.startDate || departure.operatingStartDate || departure.startDate || '',
          end_date: regionData.endDate || departure.endDate || '',
          trip_current_price: currentPrice,
          trip_prev_price: prevPrice,
          duration: duration,
          region: seasonContentContinent || getContinent(regionData) || '',
          availability: mapAvailability(availability),
          max_group_size: maxGroupSize,
          min_group_size: 1,
          avg_group_size: null,
          activity_level: scrapedData.activity_level || null,
          service_level: 'Upgraded'
        };
        details.push(detailsObj);
      }
    }
  }
  return details;
}

async function saveTripDetailsToJSON(allDetails) {
  console.log(`💾 Processing ${allDetails.length} details for trip_details JSON (Insight)...`);
  const outputPath = path.join(process.cwd(), 'trip_details_us_insight.json');
  await fs.promises.writeFile(outputPath, JSON.stringify(allDetails, null, 2));
  console.log(`✅ Saved ${allDetails.length} trip detail records to ${outputPath}`);
}

async function processTripDetailsData() {
  try {
    console.log('🚀 Starting trip_details data processing (Insight)...');
    logMemory("Start of insightvacations/trip_details.js");

    const filePath = path.join(process.cwd(), 'insight-tours-us.json');
    if (!fs.existsSync(filePath)) { throw new Error(`JSON file not found: ${filePath}. Run insightvacations/main.js first.`); }

    const allDetails = [];
    let totalTours = 0;

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const parser = JSONStream.parse('tours.*');
      stream.pipe(parser);

      parser.on('data', (tour) => {
        totalTours++;
        if (isUSTour(tour)) { const details = transformTourToDetails(tour); allDetails.push(...details); }
      });

      parser.on('end', async () => {
        logMemory("After streaming and processing details (Insight)");
        console.log(`📖 Processed ${totalTours} tours from JSON file`);
        await saveTripDetailsToJSON(allDetails);
        resolve();
      });

      parser.on('error', reject);
      stream.on('error', reject);
    });

    console.log('✅ Trip details data processing completed (Insight)!');
  } catch (error) {
    console.error('❌ Error processing trip details data (Insight):', error);
    process.exit(1);
  }
}

processTripDetailsData().catch(console.error);
