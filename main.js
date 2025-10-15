import fs from "fs/promises";
import dotenv from "dotenv";
import { execSync } from 'child_process';


dotenv.config();


const API_BASE = process.env.TTC_API_BASE || "https://api.ttc.com";
const API_TOKEN = process.env.VITE_TTC_API_TOKEN;
const INCLUDE = process.env.INCLUDE || "content,departures"; // include details
const acceptHeader = "application/json"; // works fine for TTC
const REGION = "us"; // ✅ target region


function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);
}


if (!API_TOKEN) {
  console.error("❌ Error: VITE_TTC_API_TOKEN is not set. Add it to your .env file.");
  process.exit(1);
}


function basicAuthHeader(token) {
  const pair = `token:${token}` ;
  return `Basic ${Buffer.from(pair, "utf8").toString("base64")}` ;
}


async function fetchUSTours(page = 1, limit = 1000) {
  const url = `${API_BASE}/brands/trafalgar/tours?regions=${REGION}&page=${page}&limit=${limit}&include=${INCLUDE}` ;
  console.log(`🌎 Fetching US-only Trafalgar tours (page ${page})` );


  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: acceptHeader,
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(API_TOKEN),
    },
  });


  if (res.status === 401) throw new Error("401 Unauthorized - check API token.");
  if (res.status === 403) throw new Error("403 Forbidden - token not permitted.");
  if (res.status === 429) {
    const ra = res.headers.get("retry-after") || "unknown";
    throw new Error(`429 Too Many Requests. Retry-After: ${ra}` );
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}` );
  }


  const data = await res.json();
  return data;
}


(async () => {
  try {
    logMemory("Start of main.js");

    let page = 1;
    const allTours = [];
    let hasMore = true;


    console.log("🚀 Starting TTC Trafalgar US-only tours fetch...");


    while (hasMore) {
      const result = await fetchUSTours(page, 50);


      if (!result?.tours || result.tours.length === 0) break;


      console.log(`📦 Page ${page}: ${result.tours.length} tours` );
      allTours.push(...result.tours);

      // Stop if no more pages
      const totalPages = result.totalPages || 1;
      hasMore = page < totalPages;
      page++;
      await new Promise(r => setTimeout(r, 500)); // simple rate limit
    }


    console.log(`✅ Total US-only tours fetched: ${allTours.length}` );


    const outFile = `trafalgar-tours-us.json` ;
    await fs.writeFile(outFile, JSON.stringify({ tours: allTours }, null, 2), "utf8");
    console.log(`💾 Saved ${allTours.length} tours to ${outFile}` );

    logMemory("After fetching and saving tours");

    // Scrape trip codes
    console.log('📊 Scraping trip codes...');
    try {
      execSync('node scrape_trip_codes.js', { stdio: 'inherit' });
      console.log('✅ Trip codes scraped successfully!');
    } catch (err) {
      console.error('❌ Error during scraping:', err.message);
    }

    logMemory("After scraping trip codes");

    // Process trips and trip details
    console.log('📊 Processing trips and trip details...');
    try {
      execSync('node trips.js', { stdio: 'inherit' });
      execSync('node trip_details.js', { stdio: 'inherit' });
      console.log('✅ Processing completed successfully!');
    } catch (err) {
      console.error('❌ Error during processing:', err.message);
    }

    logMemory("After processing trips and details");

    // Insert to database
    console.log('🗄️ Inserting data to database...');
    try {
      execSync('node insert_to_db.js', { stdio: 'inherit' });
      console.log('✅ Database insertion completed!');
    } catch (err) {
      console.error('❌ Error during database insertion:', err.message);
    }

    logMemory("End of main.js");

  } catch (err) {
    console.error("❌ Failed to fetch/save tours:", err.message || err);
    process.exit(1);
  }
})();
