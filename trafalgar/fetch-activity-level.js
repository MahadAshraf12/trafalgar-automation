import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const INPUT_FILE = "./trafalgar_trips_with_sku_cleaned.json"; // your input file
const OUTPUT_FILE = "./json_files/trip_tweaked_icons.json"; // output file

// Step 1 — Read all trip objects
function readTrips() {
  const raw = fs.readFileSync(INPUT_FILE, "utf-8");
  return JSON.parse(raw);
}

// Step 2 — Extract structured data from .tweaked-icons-with-description-set
async function fetchTweakedIcons(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(".tweaked-icons-with-description-set", { timeout: 10000 });

    const icons = await page.evaluate(() => {
      const sets = document.querySelectorAll(".tweaked-icons-with-description-set");
      const data = [];

      sets.forEach(set => {
        // Find all icon+description pairs inside this section
        const items = set.querySelectorAll(".icon-with-description, .tweaked-icon-with-description");
        const sectionData = {};

        items.forEach(item => {
          const text = item.innerText.trim();
          // Try to split into label + value
          const match = text.match(/^(.+?):?\s+(.+)$/);
          if (match && match[1] && match[2]) {
            sectionData[match[1].trim()] = match[2].trim();
          } else {
            // fallback for entries like "Activity Level Balanced"
            const parts = text.split(/\s+/);
            if (parts.length > 1) {
              sectionData[parts.slice(0, -1).join(" ")] = parts.at(-1);
            } else {
              sectionData[text] = true; // single item, no clear value
            }
          }
        });

        if (Object.keys(sectionData).length > 0) data.push(sectionData);
      });

      return data;
    });

    return icons;
  } catch (err) {
    console.log("❌ Error for", url, ":", err.message);
    return [];
  }
}

// Step 3 — Main
async function main() {
  const trips = readTrips();
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  const page = await browser.newPage();
  // Set a stable user agent and timeouts for VPS environments
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
  page.setDefaultTimeout(30000);

  const results = [];

  for (const trip of trips) {
    const { trip_id, name, url } = trip;
    if (!url) continue;

    console.log(`Fetching (${trip_id}) ${name}`);
    const iconsData = await fetchTweakedIcons(page, url);
    console.log(` → Found ${iconsData.length} sections\n`);

    // Pull out Activity Level from the scraped sections
    let activityLevel = null;
    for (const section of iconsData) {
      for (const [k, v] of Object.entries(section)) {
        if (k && typeof k === 'string' && k.toLowerCase().includes('activity level')) {
          activityLevel = String(v).trim();
          break;
        }
      }
      if (activityLevel) break;
    }

    results.push({
      trip_id,
      name,
      url,
      activity_level: activityLevel,
      tweaked_icons: iconsData,
    });
  }

  await browser.close();

  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");
  console.log(`✅ Done — results saved to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
