/**
 * VPS DEPLOYMENT GUIDE - Digital Ocean Droplet (1GB RAM)
 * =======================================================
 *
 * 1. SERVER SETUP:
 *    - Ubuntu 22.04 LTS
 *    - 1GB RAM, 1 vCPU, 25GB SSD
 *    - Install Node.js 18+ and npm
 *
 * 2. MEMORY OPTIMIZATION:
 *    - All scripts use --max-old-space-size=512MB (50% of 1GB RAM)
 *    - Process isolation prevents memory leaks between scripts
 *    - Streaming writes prevent large in-memory arrays
 *    - Batch processing with GC triggers
 *
 * 3. RUN COMMANDS:
 *    cd costsaver
 *    npm run main-memory-safe  # Most conservative (400MB heap)
 *    # OR
 *    npm run main             # Standard (512MB heap)
 *
 * 4. MONITORING:
 *    - htop (memory usage)
 *    - df -h (disk space)
 *    - Scripts log memory usage throughout execution
 *
 * 5. EXPECTED RESOURCE USAGE:
 *    - Peak memory: 400-600MB during OpenAI processing
 *    - Disk space: ~500MB for all JSON files
 *    - Runtime: 2-4 hours for full pipeline
 *
 * 6. FAILURE RECOVERY:
 *    - OpenAI script has checkpoint system
 *    - Review fetcher has streaming writes
 *    - Database operations use batching
 *
 * 7. CRITICAL SCRIPTS (Memory Intensive):
 *    - fetch_feefo_reviews.js: Streaming writes, batch processing
 *    - standardised_keywords.js: Checkpoint system, memory monitoring
 *    - insert_to_db.js: Batch operations, error recovery
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
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
  console.log('🚀 Starting Costsaver end-to-end flow (VPS Memory Optimized)');
  console.log('🖥️  Target: 1GB RAM VPS with --max-old-space-size=512MB');
  console.log('📊 Each script runs in separate process for memory isolation');
  console.log('-------------------------------------');

  // Memory check at start
  const memUsage = process.memoryUsage();
  console.log(`🧠 Initial memory: RSS ${Math.round(memUsage.rss / 1024 / 1024)}MB`);

  const toursFile = join(__dirname, 'costsaver-tours-us.json');

  if (!existsSync(toursFile)) {
    console.log('1) ▶️ Fetching CostSaver trips from API...');
    if (!API_TOKEN) {
      throw new Error('VITE_TTC_API_TOKEN missing in .env');
    }
    let page = 1;
    const allTours = [];
    let hasMore = true;
    while (hasMore) {
      const result = await fetchBrandTours('costsaver', page, 50);
      const tours = result?.tours || [];
      if (tours.length === 0) break;
      allTours.push(...tours);
      const totalPages = result.totalPages || 1;
      hasMore = page < totalPages;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }
    writeFileSync(toursFile, JSON.stringify({ tours: allTours }, null, 2));
    console.log('1) ✅ Trips fetched');
  } else {
    console.log('1) ✅ Tours JSON present');
  }

  console.log('2) ▶️ Extracting latest SKUs from tour data...');
  await runNode('extract_latest_skus.js');
  console.log('2) ✅ Latest SKUs extracted');

  console.log('3) ▶️ Scraping trip ratings and activity levels...');
  await runNode('scrape_trip_data.js');
  console.log('3) ✅ Trip ratings and activity levels scraped');

  console.log('4) ▶️ Building trips JSON (with ratings)...');
  await runNode('trips.js');
  console.log('4) ✅ Trips JSON built');

  console.log('5) ▶️ Building trip details JSON...');
  await runNode('trip_details.js');
  console.log('5) ✅ Trip details JSON built');

  // 6) Extract trip codes from trips data
  console.log('6) ▶️ Extracting trip codes from trips data...');
  await runNode('extract_trip_codes_from_trips.js');
  console.log('6) ✅ Trip codes extracted');

  // 7) Fetch Feefo reviews for all trips (using Feefo API v20)
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

  // Final memory check
  const finalMem = process.memoryUsage();
  console.log(`🧠 Final memory: RSS ${Math.round(finalMem.rss / 1024 / 1024)}MB`);
  console.log('💡 VPS Tip: Monitor memory with `htop` during execution');
}

main().catch(err => {
  console.error('❌ Flow failed:', err.message);
  process.exit(1);
});

