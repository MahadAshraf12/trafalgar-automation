import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const API_KEY = 'live_eec383bc168a13b46dc9ec70bc02254b2d52f894';

async function fetchDetail(href) {
  const res = await fetch(href, {
    method: 'GET',
    headers: {
      'X-Application-Key': API_KEY,
      'Accept': 'application/json',
      'Accept-Language': 'en'
    }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function fetchDepartures(href) {
  const res = await fetch(href, {
    method: 'GET',
    headers: {
      'X-Application-Key': API_KEY,
      'Accept': 'application/json',
      'Accept-Language': 'en'
    }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

function getTodayISOString() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().split('T')[0];
}

function isFutureOrToday(dateStr) {
  if (!dateStr) return false;
  return dateStr >= getTodayISOString();
}

function normalizeActivityName(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/^\s*\d+\s*-\s*/, '').trim();
}

function extractLevels(trip) {
  let service_level = null;
  let activity_level = null;

  const categories = [];
  if (Array.isArray(trip.categories)) categories.push(...trip.categories);
  if (Array.isArray(trip.details)) {
    for (const detail of trip.details) {
      if (Array.isArray(detail.categories)) categories.push(...detail.categories);
    }
  }

  for (const cat of categories) {
    const typeLabel = (cat?.category_type?.label || '').toLowerCase();
    const name = cat?.name;
    if (!name) continue;
    if (typeLabel === 'service level') {
      service_level = name;
    } else if (typeLabel === 'physical grading' || typeLabel === 'activity level') {
      activity_level = name;
    }
  }

  if (activity_level) {
    activity_level = normalizeActivityName(activity_level);
    const mapping = {
      'Easy': 'Leisurely',
      'Light': 'Leisurely',
      'Average': 'Balanced',
      'Demanding': 'Dynamic',
      'Challenging': 'Dynamic'
    };
    activity_level = mapping[activity_level] || activity_level;
  }

  return { service_level, activity_level };
}

function extractAdvertisedDepartures(departures) {
  if (!Array.isArray(departures)) return [];
  return departures
    .filter(dep => isFutureOrToday(dep.start_date))
    .map(dep => {
      const usdPrice = Array.isArray(dep.lowest_pp2a_prices)
        ? dep.lowest_pp2a_prices.find(p => p.currency === 'USD')
        : null;
      return {
        href: dep.href,
        currency: 'USD',
        departure_id: dep.id,
        current_amount: usdPrice ? usdPrice.amount : null,
        previous_amount: usdPrice ? usdPrice.amount : null
      };
    });
}

async function main() {
  console.log('▶️ Fetching and processing trip details and departures...');

  // Read basic tours
  const toursFile = path.join(process.cwd(), 'g_adventures-tours.json');
  if (!fs.existsSync(toursFile)) {
    throw new Error('g_adventures-tours.json not found.');
  }
  const toursData = JSON.parse(fs.readFileSync(toursFile, 'utf8'));
  const basicTours = toursData.tours || [];

  const processedTrips = [];

  for (const basicTour of basicTours) {
    if (!basicTour.href) continue;

    try {
      // Fetch full details
      const detail = await fetchDetail(basicTour.href);
      console.log(`✅ Fetched details for ${basicTour.id}`);

      // Fetch departures if available
      let departures = [];
      if (detail.departures?.href) {
        const depData = await fetchDepartures(detail.departures.href);
        departures = depData.results || [];
        console.log(`✅ Fetched ${departures.length} departures for ${basicTour.id}`);
      }

      // Filter future departures and calculate duration
      const futureDepartures = departures
        .filter(dep => isFutureOrToday(dep.start_date))
        .map(dep => {
          if (dep.start_date && dep.finish_date) {
            const start = new Date(dep.start_date);
            const end = new Date(dep.finish_date);
            dep.duration_days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          } else {
            dep.duration_days = null;
          }
          return dep;
        });

      // Extract levels
      const { service_level, activity_level } = extractLevels(detail);

      // Extract advertised departures
      const advertised_departures = extractAdvertisedDepartures(futureDepartures);

      // Skip if no future departures
      if (advertised_departures.length === 0) {
        console.log(`⚠️ Skipping ${basicTour.id} - no future departures`);
        continue;
      }

      // Build processed trip
      const processedTrip = {
        id: detail.id,
        name: detail.name,
        product_line: basicTour.product_line,
        slug: basicTour.slug,
        description: detail.description,
        region: detail.geography?.region?.name || 'Unknown',
        service_level: service_level,
        activity_level: activity_level,
        banner_image: detail.images?.find(img => img.type === 'BANNER')?.image_href || null,
        departures: futureDepartures,
        advertised_departures: advertised_departures,
        duration: futureDepartures[0]?.duration_days || null,
        trip_current_price: advertised_departures[0]?.current_amount || null,
        avg_rating: null, // Will be filled later
        total_reviews: null, // Will be filled later
        trip_provider: 'G_ADVENTURES'
      };

      processedTrips.push(processedTrip);

      await new Promise(r => setTimeout(r, 300)); // Rate limit

    } catch (err) {
      console.error(`❌ Error processing ${basicTour.id}:`, err.message);
    }
  }

  const outputFile = path.join(process.cwd(), 'fullll_final_cleaned_trips.json');
  fs.writeFileSync(outputFile, JSON.stringify(processedTrips, null, 2));
  console.log(`✅ Processed ${processedTrips.length} trips to fullll_final_cleaned_trips.json`);
}

main().catch(err => {
  console.error('❌ Error processing trips:', err.message);
  process.exit(1);
});