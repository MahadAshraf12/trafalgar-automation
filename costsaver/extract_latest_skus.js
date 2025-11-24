import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Input and output file paths
const INPUT_FILE = join(__dirname, 'costsaver-tours-us.json');
const OUTPUT_FILE = join(__dirname, 'trip_sku_latest_costsaver.json');

/**
 * Extracts the year suffix from a SKU (e.g., "E962N27" -> 27)
 * @param {string} sku - The SKU to parse
 * @returns {number} The year suffix, or -1 if not found
 */
function parseYearSuffix(sku) {
  if (!sku) return -1;
  const m = sku.match(/N(\d{2})$/);
  return m ? parseInt(m[1], 10) : -1;
}

/**
 * Removes the year suffix from a SKU (e.g., "E962N27" -> "E962")
 * @param {string} sku - The SKU to clean
 * @returns {string} The cleaned SKU
 */
function cleanSku(sku) {
  if (!sku) return '';
  return sku.replace(/N\d{2}$/, '');
}

async function extractLatestSkus() {
  try {
    console.log('📂 Reading CostSaver tour data...');
    const raw = await readFile(INPUT_FILE, 'utf8');
    const data = JSON.parse(raw);

    if (!data.tours || !Array.isArray(data.tours)) {
      throw new Error('Invalid JSON structure: expected {tours: [...]}');
    }

    // Group SKUs by trip_id
    const skuMap = new Map();

    console.log('🔍 Extracting SKU values from tour content...');

    // Process each tour
    for (const tour of data.tours) {
      if (!tour.id || !tour.tourOptions) continue;

      // Process each tour option
      for (const option of tour.tourOptions) {
        if (!option.seasons) continue;

        // Process each season
        for (const season of option.seasons) {
          if (!season.content) continue;

          // Process each content item
          for (const content of season.content) {
            if (!content.id) continue;

            const tripId = tour.id;
            const sku = content.id.trim();

            // Initialize array for this trip_id if not exists
            if (!skuMap.has(tripId)) {
              skuMap.set(tripId, []);
            }

            // Add SKU to the array
            skuMap.get(tripId).push({
              sku: sku,
              year: parseYearSuffix(sku),
              trip_name: tour.name || 'N/A'
            });
          }
        }
      }
    }

    console.log(`📊 Found SKUs for ${skuMap.size} trips`);

    // Find the latest SKU for each trip (highest year suffix)
    const latestSkus = [];

    for (const [tripId, skus] of skuMap.entries()) {
      // Find the SKU with the highest year
      let bestSku = null;
      let highestYear = -1;

      for (const skuData of skus) {
        if (skuData.year > highestYear) {
          bestSku = skuData;
          highestYear = skuData.year;
        }
      }

      if (bestSku) {
        latestSkus.push({
          trip_id: tripId,
          trip_name: bestSku.trip_name,
          sku_latest: cleanSku(bestSku.sku),
          year_suffix: bestSku.year,
          original_sku: bestSku.sku
        });
      }
    }

    // Sort by trip_id for consistent output
    latestSkus.sort((a, b) => a.trip_id - b.trip_id);

    // Create output format
    const output = {
      count: latestSkus.length,
      generated_at: new Date().toISOString(),
      source_file: INPUT_FILE,
      trips: latestSkus
    };

    // Write to file
    await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));

    console.log(`✅ Extracted ${latestSkus.length} latest SKUs`);
    console.log(`📄 JSON saved to: ${OUTPUT_FILE}`);

    // Show sample
    if (latestSkus.length > 0) {
      console.log('\n📋 Sample results:');
      latestSkus.slice(0, 3).forEach(item => {
        console.log(`  Trip ${item.trip_id}: ${item.original_sku} → ${item.sku_latest} (year ${item.year_suffix})`);
      });
    }

  } catch (error) {
    console.error('❌ Error extracting latest SKUs:', error.message);
    process.exit(1);
  }
}

// Run the extraction
extractLatestSkus();