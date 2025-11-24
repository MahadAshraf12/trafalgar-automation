// scrape-trafalgar-feefo-fixed-2.js
import fs from "fs/promises";
import { load } from "cheerio";
import pLimit from "p-limit";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// CONFIG
const INPUT_FILE = "trafalgar_trips_with_sku_cleaned.json";
const OUTPUT_FILE = "trip_ratings.json";
const ERROR_FILE = "trip_ratings_errors.json";

const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15000;
const RETRIES = 2;
const USER_AGENT = "Mozilla/5.0 (compatible; Bot/1.0; +https://example.com/bot)";

// Supabase client (env vars set in GitHub Actions)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --------------------
// Helper functions
// --------------------
async function fetchWithTimeout(url, opts = {}, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function parseRatingAndCount(html) {
  const $ = load(html);
  const header = $(".trip-header__info-row").first();
  const feefo = header.find(".trip-header__feefo").first();
  const context = feefo.length ? feefo : header.length ? header : $.root();

  const contextTextRaw = (context.text() || "").replace(/\s+/g, " ").trim();

  // Glued pattern: "4.5336 reviews"
  const gluedRegex = /([0-5](?:\.\d)?)[\s\-–—:]*([\d,]{1,12})\s*(?:reviews|review|votes)/i;
  const gluedMatch = contextTextRaw.match(gluedRegex);
  if (gluedMatch) {
    const avg = parseFloat(gluedMatch[1]);
    const total = parseInt(gluedMatch[2].replace(/,/g, ""), 10);
    return { avg: Number(avg.toFixed(1)), total: Number.isFinite(total) ? total : null };
  }

  // Mask rating and extract total
  const ratingRegex = /\b([0-5](?:\.\d)?)\b/;
  const ratingMatch = ratingRegex.exec(contextTextRaw);
  let avg = null;
  let maskedText = contextTextRaw;

  if (ratingMatch) {
    avg = parseFloat(ratingMatch[1]);
    const idx = ratingMatch.index;
    maskedText = contextTextRaw.slice(0, idx) + " ".repeat(ratingMatch[0].length) + contextTextRaw.slice(idx + ratingMatch[0].length);
  }

  let total = null;
  const countRegex = /([\d,]{1,12})\s*(?:reviews|review|votes)/i;
  const countParenRegex = /\(([\d,]{1,12})\)/;
  let mCount = maskedText.match(countRegex) || maskedText.match(countParenRegex);
  if (mCount) total = parseInt((mCount[1] || "").replace(/,/g, ""), 10);

  avg = avg === null ? null : Number(avg.toFixed(1));
  total = Number.isInteger(total) ? total : null;
  return { avg, total };
}

async function scrapeOne(trip) {
  const { trip_id, trip_sku, url } = trip;
  let lastErr = null;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const parsed = parseRatingAndCount(html);

      return { trip_id, trip_sku, avg_rating: parsed.avg, total_reviews: parsed.total };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }

  return { trip_id, trip_sku, avg_rating: null, total_reviews: null, error: lastErr?.message || "unknown" };
}
async function updateTripsInSupabase(results) {
  for (const trip of results) {
    const { trip_id, trip_sku, avg_rating, total_reviews } = trip;

    // Skip failed scrapes
    if (avg_rating === null && total_reviews === null) continue;

    const { error } = await supabase
      .from("trips")
      .update({ avg_rating, total_reviews })      // only these 2 columns
      .eq("trip_id", trip_id)                     // map by trip_id
      .eq("trip_provider", "TRAFALGAR");         // only TRAFALGAR trips

    if (error) {
      console.error(`Error updating trip_id ${trip_id}:`, error.message);
    } else {
      console.log(`Updated trip_id ${trip_id}: avg_rating=${avg_rating}, total_reviews=${total_reviews}`);
    }
  }
}


// --------------------
// Main
// --------------------
(async () => {
  try {
    const raw = await fs.readFile(INPUT_FILE, "utf8");
    const trips = JSON.parse(raw);

    const limit = pLimit(CONCURRENCY);
    console.log(`Starting scrape of ${trips.length} trips`);

    const tasks = trips.map((trip) => limit(() => scrapeOne(trip)));
    const results = await Promise.all(tasks);

    // Save JSON output
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2));

    // Save errors separately
    const errors = results.filter((r) => r.error);
    if (errors.length) await fs.writeFile(ERROR_FILE, JSON.stringify(errors, null, 2));

    console.log(`Scrape done. Total: ${results.length}, Errors: ${errors.length}`);

    // Update Supabase
    await updateTripsInSupabase(results);
    console.log("All trips updated in Supabase ✅");
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();
