import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_KEY = process.env.G_ADVENTURES_API_KEY;

async function fetchTourDossiers(page = 1, maxPerPage = 50) {
  const url = `https://rest.gadventures.com/tour_dossiers/?max_per_page=${maxPerPage}&page=${page}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Application-Key': API_KEY,
      'Accept': 'application/json',
      'Accept-Language': 'en'
    }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function main() {
  console.log('▶️ Fetching G Adventures tours from API...');
  const page = parseInt(process.env.CURRENT_PAGE || '0');
  const result = await fetchTourDossiers(page, 50);
  const tours = result?.results || [];
  const toursFile = path.join(process.cwd(), 'g_adventures-tours.json');
  fs.writeFileSync(toursFile, JSON.stringify({ tours }, null, 2));
  console.log(`✅ Fetched ${tours.length} tours for page ${page}`);
}

main().catch(err => {
  console.error('❌ Error fetching tours:', err.message);
  process.exit(1);
});