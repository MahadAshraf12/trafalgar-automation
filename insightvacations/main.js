import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const API_BASE = process.env.TTC_API_BASE || 'https://api.ttc.com';
const API_TOKEN = process.env.VITE_TTC_API_TOKEN;
const INCLUDE = process.env.INCLUDE || 'content,departures';
const REGION = 'us';

function basicAuthHeader(token) {
  const pair = `token:${token}`;
  return `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`;
}

async function fetchBrandTours(brand, page = 1, limit = 50) {
  const url = `${API_BASE}/brands/${brand}/tours?regions=${REGION}&page=${page}&limit=${limit}&include=${INCLUDE}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(API_TOKEN)
    }
  });
  if (res.status === 401) throw new Error('401 Unauthorized - check API token.');
  if (res.status === 403) throw new Error('403 Forbidden - token not permitted.');
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

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
  console.log('🚀 Starting Insight Vacations end-to-end flow');
  console.log('-------------------------------------------');

  // 1) Fetch trips if missing
  const toursFile = join(__dirname, 'insight-tours-us.json');
  if (!existsSync(toursFile)) {
    console.log('1) ▶️ Fetching Insight trips from API...');
    if (!API_TOKEN) { throw new Error('VITE_TTC_API_TOKEN missing in .env'); }
    let page = 1;
    const allTours = [];
    let hasMore = true;
    while (hasMore) {
      const result = await fetchBrandTours('insightvacations', page, 50);
      const tours = result?.tours || [];
      if (tours.length === 0) break;
      allTours.push(...tours);
      const totalPages = result.totalPages || 1;
      hasMore = page < totalPages;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }
    const { writeFileSync } = await import('fs');
    writeFileSync(toursFile, JSON.stringify({ tours: allTours }, null, 2));
    console.log('1) ✅ Trips fetched');
  } else {
    console.log('1) ✅ Tours JSON present');
  }

  // 2) Build insight_urls.json from tours JSON
  console.log('2) ▶️ Extracting Insight URLs...');
  await runNode('extract_insight_urls.js');
  console.log('2) ✅ URLs extracted');

  // 3) Extract latest SKUs from tour data
  console.log('3) ▶️ Extracting latest SKUs from tour data...');
  await runNode('extract_latest_skus.js');
  console.log('3) ✅ Latest SKUs extracted');

  // 4) Scrape trip ratings and activity levels
  console.log('4) ▶️ Scraping trip ratings and activity levels...');
  await runNode('scrape_trip_data.js');
  console.log('4) ✅ Trip ratings and activity levels scraped');

  // 5) Build trips JSON (with ratings)
  console.log('5) ▶️ Building trips JSON (with ratings)...');
  await runNode('trips.js');
  console.log('5) ✅ Trips JSON built');

  // 6) Build trip details JSON
  console.log('6) ▶️ Building trip details JSON...');
  await runNode('trip_details.js');
  console.log('6) ✅ Trip details JSON built');

  // 7) Fetch Feefo reviews for all trips (50 reviews per trip)
  console.log('7) ▶️ Fetching Feefo reviews for all trips...');
  await runNode('fetch_feefo_reviews.js');
  console.log('7) ✅ Feefo reviews fetched');

  // 8) Merge reviews with trips data
  console.log('8) ▶️ Merging reviews with trips data...');
  await runNode('merge_reviews_with_trips.js');
  console.log('8) ✅ Reviews merged with trips');

  // 9) Generate standardized keywords using OpenAI
  console.log('9) ▶️ Generating standardized keywords with OpenAI...');
  await runNode('standardised_keywords.js');
  console.log('9) ✅ Standardized keywords generated');

  // 10) Merge keywords back into trips data
  console.log('10) ▶️ Merging standardized keywords with trips data...');
  await runNode('merge_keywords_with_trips.js');
  console.log('10) ✅ Keywords merged with trips');

  // 11) Insert/Update DB
  console.log('11) ▶️ Inserting/updating database...');
  await runNode('insert_to_db.js');
  console.log('11) ✅ Database upsert complete');

  console.log('✨ Flow complete');
}

main().catch(err => {
  console.error('❌ Flow failed:', err.message);
  process.exit(1);
});