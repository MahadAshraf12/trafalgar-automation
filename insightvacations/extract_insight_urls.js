import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function extractInsightURLs() {
  try {
    const inputFile = join(__dirname, 'insight-tours-us.json');
    const outputFile = join(__dirname, 'insight_urls.json');

    const data = JSON.parse(await readFile(inputFile, 'utf8'));
    if (!data.tours || !Array.isArray(data.tours)) {
      throw new Error('Invalid JSON structure: expected {tours: [...]}');
    }

    const result = [];
    for (const tour of data.tours) {
      if (!tour?.id || !tour?.name) continue;

      let usUrl = null;
      // top-level websiteUrls
      if (Array.isArray(tour.websiteUrls)) {
        const hit = tour.websiteUrls.find(u => (u?.sellingRegion || '').toLowerCase() === 'us' && u.url);
        if (hit) usUrl = hit.url;
      }
      // nested under tourOptions[*].websiteUrls
      if (!usUrl && Array.isArray(tour.tourOptions)) {
        for (const opt of tour.tourOptions) {
          const hit = (opt.websiteUrls || []).find(u => (u?.sellingRegion || '').toLowerCase() === 'us' && u.url);
          if (hit) { usUrl = hit.url; break; }
        }
      }

      if (usUrl) {
        result.push({ trip_id: tour.id, name: tour.name, url: usUrl });
      }
    }

    await writeFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`✅ Extracted ${result.length} Insight URLs -> ${outputFile}`);
  } catch (err) {
    console.error('❌ Error extracting Insight URLs:', err.message);
    process.exit(1);
  }
}

extractInsightURLs();
