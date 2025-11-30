import fs from 'fs';
import path from 'path';

function mapAvailability(avail) {
  if (!avail) return 0;
  const a = String(avail).toLowerCase();
  if (a === 'available') return 1;
  if (a === 'onrequest' || a === 'on_request') return 0;
  return 0;
}

function daysInclusive(start, end) {
  if (!start || !end) return null;
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  if (isNaN(s) || isNaN(e)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((e - s) / msPerDay);
  return diff + 1;
}

async function main() {
  console.log('▶️ Extracting G Adventures trip details for database...');

  const inputFile = path.join(process.cwd(), 'fullll_final_cleaned_trips.json');
  if (!fs.existsSync(inputFile)) {
    throw new Error('fullll_final_cleaned_trips.json not found.');
  }

  const trips = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const allDetails = [];

  for (const trip of trips) {
    if (Array.isArray(trip.departures)) {
      for (const dep of trip.departures) {
        // Extract USD price
        const usdPrice = Array.isArray(dep.lowest_pp2a_prices)
          ? dep.lowest_pp2a_prices.find(p => p.currency === 'USD')
          : null;
        const currentPrice = usdPrice ? usdPrice.amount : 0;
        const prevPrice = currentPrice; // Assuming same

        allDetails.push({
          trip_id: trip.id,
          trip_sku: trip.product_line,
          departure_id: dep.id,
          start_date: dep.start_date,
          end_date: dep.finish_date,
          trip_current_price: currentPrice,
          trip_prev_price: prevPrice,
          duration: daysInclusive(dep.start_date, dep.finish_date),
          region: trip.region,
          availability: mapAvailability(dep.availability?.status),
          max_group_size: 3, // Default
          min_group_size: 1,
          avg_group_size: null,
          activity_level: trip.activity_level,
          service_level: trip.service_level
        });
      }
    }
  }

  const outputFile = path.join(process.cwd(), 'g_adventures_trip_details.json');
  fs.writeFileSync(outputFile, JSON.stringify(allDetails, null, 2));
  console.log(`✅ Extracted ${allDetails.length} trip details to g_adventures_trip_details.json`);
}

main().catch(err => {
  console.error('❌ Error extracting trip details:', err.message);
  process.exit(1);
});