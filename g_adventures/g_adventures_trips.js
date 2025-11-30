import fs from 'fs';
import path from 'path';

async function main() {
  console.log('▶️ Creating final G Adventures trips data...');

  const inputFile = path.join(process.cwd(), 'final_trips.json');
  if (!fs.existsSync(inputFile)) {
    throw new Error('final_trips.json not found.');
  }

  const trips = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  const finalTrips = trips.map(trip => ({
    id: trip.id || trip.trip_id,
    name: trip.name,
    product_line: trip.product_line || trip.trip_productline,
    slug: trip.slug,
    description: trip.description,
    region: trip.region,
    service_level: trip.service_level,
    activity_level: trip.activity_level,
    banner_image: trip.banner_image,
    departures: trip.departures || [],
    advertised_departures: trip.advertised_departures || [],
    duration: trip.duration,
    trip_current_price: trip.trip_current_price,
    avg_rating: trip.avg_rating,
    total_reviews: trip.total_reviews,
    trip_provider: trip.trip_provider,
    standardised_keywords: trip.standardised_keywords || []
  }));

  const outputFile = path.join(process.cwd(), 'trips_gadventuress.json');
  fs.writeFileSync(outputFile, JSON.stringify(finalTrips, null, 2));
  console.log(`✅ Created final trips data: ${finalTrips.length} trips`);
}

main().catch(err => {
  console.error('❌ Error creating final trips data:', err.message);
  process.exit(1);
});