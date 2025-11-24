import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import JSONStream from 'JSONStream';

dotenv.config();

function ensureArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
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
  const map = { 'US': 'North America', 'USA': 'North America', 'UNITED STATES': 'North America', 'CA': 'North America', 'CANADA': 'North America', 'MX': 'North America', 'MEXICO': 'North America', 'BR': 'South America', 'BRAZIL': 'South America', 'AR': 'South America', 'ARGENTINA': 'South America', 'GB': 'Europe', 'UK': 'Europe', 'UNITED KINGDOM': 'Europe', 'FR': 'Europe', 'FRANCE': 'Europe', 'DE': 'Europe', 'GERMANY': 'Europe', 'ES': 'Europe', 'SPAIN': 'Europe', 'IT': 'Europe', 'ITALY': 'Europe', 'CN': 'Asia', 'CHINA': 'Asia', 'JP': 'Asia', 'JAPAN': 'Asia', 'IN': 'Asia', 'INDIA': 'Asia', 'AU': 'Oceania', 'AUSTRALIA': 'Oceania', 'NZ': 'Oceania', 'NEW ZEALAND': 'Oceania', 'ZA': 'Africa', 'SOUTH AFRICA': 'Africa', 'EG': 'Africa', 'EGYPT': 'Africa' };
  if (map[uc]) return map[uc];
  if (uc.includes('EURO') || uc.includes('E.U.')) return 'Europe';
  if (uc.includes('ASIA')) return 'Asia';
  if (uc.includes('AFR') || uc.includes('AFRIC')) return 'Africa';
  if (uc.includes('AMERIC') || uc.includes('AMER')) { if (uc.includes('SOUTH')) return 'South America'; return 'North America'; }
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

function isUSTour(tour) {
  if (!tour) return false;
  if (tour.websiteUrls && Array.isArray(tour.websiteUrls)) {
    return tour.websiteUrls.some(urlObj => urlObj.sellingRegion && urlObj.sellingRegion.toLowerCase() === 'us');
  }
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

function transformTourToDetails(tour) {
  let skuLatest = '';
  try {
    // Load latest SKUs
    const skusData = JSON.parse(fs.readFileSync('trip_sku_latest_costsaver.json', 'utf8'));
    const skuObj = skusData.trips.find(t => t.trip_id === tour.id);
    skuLatest = skuObj ? skuObj.sku_latest : '';
  } catch {}

  const details = [];
  const trip = {};
  trip.region = '';

  const tourOption = ensureArray(tour.tourOptions || tour.options || [])[0] || {};
  const seasons = ensureArray(tourOption.seasons || tourOption.season || []);
  for (const season of seasons) {
    let seasonContentContinent = '';
    for (const contentItem of season.content || []) {
      if (Array.isArray(contentItem.countriesVisited) && contentItem.countriesVisited.length > 0) {
        const c = contentItem.countriesVisited[0];
        if (c && c.continent) { seasonContentContinent = c.continent; break; }
      }
    }
    if (!seasonContentContinent) {
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
          trip_sku: skuLatest || departure.id || `dep_${startDate}_${tour.id}`,
          departure_id: departure.id || `dep_${startDate}_${tour.id}`,
          start_date: startDate,
          end_date: endDate,
          trip_current_price: currentPrice,
          trip_prev_price: prevPrice,
          duration: duration,
          region: continentValue,
          availability: mapAvailability(availability),
          max_group_size: maxGroupSize,
          min_group_size: 1,
          avg_group_size: null,
          activity_level: null,
          service_level: 'Basic'
        });
      }
    }

    const contentBlocks = ensureArray(season.content || []);
    for (const cb of contentBlocks) {
      const cbDepartures = ensureArray(cb.departures || cb.departure || []);
      for (const dep of cbDepartures) {
        const sellingRegions = ensureArray(dep.sellingRegions || []);
        for (const regionData of sellingRegions) {
          if (!regionData.sellingRegion) continue;
          if (!regionData.sellingRegion.toLowerCase().includes('us')) continue;

          const startDate = regionData.startDate || dep.operatingStartDate || '';
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
          for (const cbInner of contentBlocks) {
            const cbAccom = ensureArray(cbInner.accommodation || cbInner.accommodationList || []);
            for (const accommodation of cbAccom) {
              const maxP = safeNum(accommodation.maxPassengers || accommodation.maxAdults || null);
              if (maxP !== null) maxGroupSize = Math.max(maxGroupSize, maxP);
            }
          }

          const continentValue = getContinent(regionData) || seasonContentContinent || trip.region || '';

          details.push({
            trip_id: Number(tour.id) || null,
            trip_sku: skuLatest || dep.id || `dep_${startDate}_${tour.id}`,
            departure_id: dep.id || `dep_${startDate}_${tour.id}`,
            start_date: startDate,
            end_date: endDate,
            trip_current_price: currentPrice,
            trip_prev_price: prevPrice,
            duration: duration,
            region: continentValue,
            availability: mapAvailability(availability),
            max_group_size: maxGroupSize,
            min_group_size: 1,
            avg_group_size: null,
            activity_level: null,
            service_level: 'Basic'
          });
        }
      }
    }
  }

  return details;
}

async function saveTripDetailsToJSON(allDetails) {
  console.log(`💾 Processing ${allDetails.length} details for trip_details JSON (CostSaver)...`);
  if (allDetails.length > 0) {
    try {
      const outputPath = path.join(process.cwd(), 'trip_details_us_costsaver.json');
      await fs.promises.writeFile(outputPath, JSON.stringify(allDetails, null, 2));
      console.log(`✅ Saved ${allDetails.length} trip detail records to ${outputPath}`);
      return { successCount: allDetails.length, errorCount: 0, totalDetails: allDetails.length };
    } catch (error) {
      console.error('❌ Error saving trip details JSON (CostSaver):', error);
      return { successCount: 0, errorCount: allDetails.length, totalDetails: allDetails.length };
    }
  }
  console.log(`Trip Details Results: 0 successful, 0 errors, ${allDetails.length} total rows processed`);
  return { successCount: 0, errorCount: 0, totalDetails: allDetails.length };
}

async function processTripDetailsData() {
  try {
    console.log('🚀 Starting trip_details data processing (CostSaver)...');
    logMemory("Start of costsaver/trip_details.js");

    const filePath = path.join(process.cwd(), 'costsaver-tours-us.json');
    if (!fs.existsSync(filePath)) { throw new Error(`JSON file not found: ${filePath}. Run costsaver/main.js first.`); }

    const allDetails = [];
    let totalTours = 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const parser = JSONStream.parse('tours.*');
      stream.pipe(parser);

      parser.on('data', (tour) => {
        totalTours++;
        if (isUSTour(tour)) { const details = transformTourToDetails(tour); allDetails.push(...details); }
      });

      parser.on('end', async () => {
        logMemory("After streaming and processing details (CostSaver)");
        console.log(`📖 Processed ${totalTours} tours from JSON file`);
        console.log(`🇺🇸 Filtered to US tours (from ${totalTours} total)`);
        const results = await saveTripDetailsToJSON(allDetails);
        logMemory("After saving trip_details JSON (CostSaver)");
        console.log('✅ Trip details data processing completed (CostSaver)!');
        console.log(`📈 Summary: ${results.successCount} rows saved to JSON, ${results.errorCount} errors, ${results.totalDetails} total rows processed`);
        resolve();
      });

      parser.on('error', reject);
      stream.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Error processing trip details data (CostSaver):', error);
    process.exit(1);
  }
}

processTripDetailsData().catch(console.error);
