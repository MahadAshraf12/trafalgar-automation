import fs from 'fs';

// Clean trip code according to rules
function cleanTripCode(tripCode) {
  if (!tripCode || typeof tripCode !== 'string') return tripCode;

  let cleaned = tripCode.trim();

  // Remove 'M' from the end
  if (cleaned.endsWith('M')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Remove 'AM' from the end
  if (cleaned.endsWith('AM')) {
    cleaned = cleaned.slice(0, -2);
  }

  // Remove 'BB' from the end
  if (cleaned.endsWith('BB')) {
    cleaned = cleaned.slice(0, -2);
  }

  // Remove 'A' from the end (but not if it's part of a longer suffix we already handled)
  if (cleaned.endsWith('A') && !cleaned.endsWith('AM')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Remove 'X' from the start
  if (cleaned.startsWith('X')) {
    cleaned = cleaned.slice(1);
  }

  // Remove 'Q' from the start if SKU is 5 characters
  if (cleaned.startsWith('Q') && cleaned.length === 5) {
    cleaned = cleaned.slice(1);
  }

  // Remove 'S' from the start only if SKU is 5+ characters
  if (cleaned.startsWith('S') && cleaned.length >= 5) {
    cleaned = cleaned.slice(1);
  }

  // Remove 'AD' from the end
  if (cleaned.endsWith('AD')) {
    cleaned = cleaned.slice(0, -2);
  }

  // Remove 'R' from the end
  if (cleaned.endsWith('R')) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned;
}

// Read trips data
function readTripsData() {
  const tripsFile = 'trips_costsaver.json';

  if (!fs.existsSync(tripsFile)) {
    throw new Error(`Trips file not found: ${tripsFile}`);
  }

  console.log(`📖 Reading trips from: ${tripsFile}`);
  const data = fs.readFileSync(tripsFile, 'utf8');
  return JSON.parse(data);
}

// Extract trip codes from trips data
function extractTripCodes(tripsData) {
  console.log(`🔄 Extracting and cleaning trip codes from ${tripsData.length} trips...`);

  const tripCodes = tripsData.map(trip => {
    const rawTripCode = trip.trip_product_line || trip.trip_sku || '';
    const cleanedTripCode = cleanTripCode(rawTripCode);

    if (rawTripCode !== cleanedTripCode) {
      console.log(`🧹 Cleaned trip code: "${rawTripCode}" → "${cleanedTripCode}"`);
    }

    return {
      trip_id: trip.trip_id,
      trip_name: trip.trip_name,
      trip_code: cleanedTripCode
    };
  }).filter(item => item.trip_code && item.trip_code.trim() !== '');

  console.log(`✅ Extracted and cleaned ${tripCodes.length} trip codes`);
  return tripCodes;
}

// Save trip codes to JSON file
function saveTripCodes(tripCodes) {
  const outputFile = 'trip_codes_costsaver.json';

  console.log(`💾 Saving trip codes to: ${outputFile}`);

  fs.writeFileSync(outputFile, JSON.stringify(tripCodes, null, 2));

  console.log(`✅ Saved ${tripCodes.length} trip codes`);
  console.log(`📏 File size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);
}

// Main function
function main() {
  try {
    console.log('🚀 Extracting trip codes from trips_costsaver.json...');

    // Read trips data
    const tripsData = readTripsData();

    // Extract trip codes
    const tripCodes = extractTripCodes(tripsData);

    // Save to file
    saveTripCodes(tripCodes);

    console.log('✅ Trip codes extraction completed successfully!');

  } catch (error) {
    console.error('❌ Error during trip codes extraction:', error);
    process.exit(1);
  }
}

// Run the script
main();