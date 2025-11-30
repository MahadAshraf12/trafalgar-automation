import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();


function runNode(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('🚀 Starting G Adventures end-to-end flow');
  console.log('-------------------------------------------');

  let page = 0;
  while (true) {
    console.log(`\n--- Processing batch ${page} ---`);

    // 1) Fetch trips for this page
    console.log('1) ▶️ Fetching G Adventures tours from API...');
    process.env.CURRENT_PAGE = page.toString();
    await runNode('trips.js');
    console.log('1) ✅ Trips fetched');

    // Check if this batch has trips
    const toursFile = join(__dirname, 'g_adventures-tours.json');
    const toursData = JSON.parse(readFileSync(toursFile, 'utf8'));
    const tours = toursData.tours || [];
    if (tours.length === 0) {
      console.log('No more trips to process.');
      break;
    }

    // 2) Fetch and process trip details and departures
    console.log('2) ▶️ Fetching and processing trip details and departures...');
    await runNode('trip_details.js');
    console.log('2) ✅ Trip details and departures processed');

    // 3) Fetch Trustpilot reviews for all trips
    console.log('3) ▶️ Fetching Trustpilot reviews for all trips...');
    await runNode('fetch_trustpilot_reviews.js');
    console.log('3) ✅ Trustpilot reviews fetched');

    // 4) Extract reviews from API data
    console.log('4) ▶️ Extracting reviews from API data...');
    await runNode('extract_reviews_from_api.js');
    console.log('4) ✅ Reviews extracted from API');

    // 5) Merge reviews with trips data
    console.log('5) ▶️ Merging reviews with trips data...');
    await runNode('merge_reviews_with_trips.js');
    console.log('5) ✅ Reviews merged with trips');

    // 6) Generate standardized keywords using OpenAI
    console.log('6) ▶️ Generating standardized keywords with OpenAI...');
    await runNode('standardised_keywords.js');
    console.log('6) ✅ Standardized keywords generated');

    // 7) Merge keywords back into trips data
    console.log('7) ▶️ Merging standardized keywords with trips data...');
    await runNode('merge_keywords_with_trips.js');
    console.log('7) ✅ Keywords merged with trips');

    // 8) Create final G Adventures trips data
    console.log('8) ▶️ Creating final G Adventures trips data...');
    await runNode('g_adventures_trips.js');
    console.log('8) ✅ Final trips data created');

    // 9) Extract G Adventures trip details data
    console.log('9) ▶️ Extracting G Adventures trip details data...');
    await runNode('g_adventures_trip_details.js');
    console.log('9) ✅ G Adventures trip details extracted');

    // 10) Insert/Update DB
    console.log('10) ▶️ Inserting/updating database...');
    await runNode('insert_to_db.js');
    console.log('10) ✅ Database upsert complete');

    // 15) Extract G Adventures trip details data
    console.log('15) ▶️ Extracting G Adventures trip details data...');
    await runNode('g_adventures_trip_details.js');
    console.log('15) ✅ G Adventures trip details extracted');

    // 16) Insert/Update DB
    console.log('16) ▶️ Inserting/updating database...');
    await runNode('insert_to_db.js');
    console.log('16) ✅ Database upsert complete');

    page++;

    // If less than 50, it's the last batch
    if (tours.length < 50) {
      break;
    }
  }

  // Cleanup intermediate files
  console.log('Cleaning up intermediate files...');
  const fs = await import('fs');
  const filesToClean = [
    'g_adventures-tours.json',
    'trips_with_departures.json',
    'trustpilot_reviews.json',
    'fullll_final_cleaned_trips.json',
    'final_trips.json',
    'trips_with_standardised_keywords_gadventures.json',
    'keywords_checkpoint_gadventures.json'
  ];
  for (const file of filesToClean) {
    const path = join(__dirname, file);
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
      console.log(`🗑️  Removed ${file}`);
    }
  }

  console.log('✨ Flow complete - all intermediate files cleaned up');
}

main().catch(err => {
  console.error('❌ Flow failed:', err.message);
  process.exit(1);
});