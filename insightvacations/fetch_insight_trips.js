import { writeFile } from 'fs/promises';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.VITE_TTC_API_TOKEN || process.env.API_KEY || '';
const TRIPS_URL = process.env.TRIPS_URL || '';
const BRAND = process.env.BRAND || 'InsightVacations';
const REGIONS = process.env.REGIONS || '';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const USE_FULL_URL = String(process.env.USE_FULL_URL || 'false').toLowerCase() === 'true';
const OUTPUT = process.env.OUTPUT || 'insight-tours-us.json';

if (!API_KEY) {
  console.error('ERROR: Missing API key. Set VITE_TTC_API_TOKEN or API_KEY in .env');
  process.exit(1);
}
if (!TRIPS_URL) {
  console.error('ERROR: Missing TRIPS_URL. Set TRIPS_URL in .env to the TTC trips endpoint.');
  process.exit(1);
}

async function tryRequest(url, baseHeaders) {
  try {
    const res = await fetch(url, { headers: baseHeaders, method: 'GET' });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, json, headers: res.headers };
  } catch (err) {
    return { ok: false, status: null, error: err.message };
  }
}

async function requestWithAutoKey(url) {
  const variants = [
    { headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' } },
    { headers: { 'x-api-key': API_KEY, 'Accept': 'application/json' } },
    { headers: { 'Authorization': `ApiKey ${API_KEY}`, 'Accept': 'application/json' } }
  ];
  for (const v of variants) {
    const r = await tryRequest(url, v.headers);
    if (r.ok) return r;
    if (r.status && r.status !== 401 && r.status !== 403) return r; // non-auth error, stop
  }
  // last resort: append apiKey as query param
  try {
    const u = new URL(url);
    if (!u.searchParams.has('apiKey')) u.searchParams.set('apiKey', API_KEY);
    const r = await tryRequest(u.toString(), { 'Accept': 'application/json' });
    return r;
  } catch (e) {
    return { ok: false, status: null, error: e.message };
  }
}

function buildUrlWithParams(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    // don't override if already present
    if (!u.searchParams.has(k)) {
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

(async () => {
  console.log('Starting Insight Vacations trip fetch...');
  const all = [];

  // One-shot mode for full URLs already containing query params
  if (USE_FULL_URL) {
    const url = TRIPS_URL;
    console.log(`Fetching (one-shot) -> ${url}`);
    const r = await requestWithAutoKey(url);
    if (!r.ok) {
      console.error('Request failed:', r.status, r.error || JSON.stringify(r.json).slice(0, 300));
      process.exit(1);
    }
    const tours = Array.isArray(r.json?.tours) ? r.json.tours : (Array.isArray(r.json) ? r.json : []);
    console.log(`Got ${tours.length} tours`);
    all.push(...tours);
  } else {
    // Paged mode: add brand/regions params unless already embedded in URL
    let page = 1;
    const brandInPath = /\/brands\//i.test(TRIPS_URL);
    while (true) {
      const url = buildUrlWithParams(TRIPS_URL, {
        brand: brandInPath ? undefined : BRAND,
        regions: REGIONS || undefined,
        page,
        pageSize: PAGE_SIZE
      });
      console.log(`Fetching page ${page} -> ${url}`);
      const r = await requestWithAutoKey(url);
      if (!r.ok) {
        console.error('Request failed:', r.status, r.error || JSON.stringify(r.json).slice(0, 300));
        process.exit(1);
      }
      const tours = Array.isArray(r.json?.tours) ? r.json.tours : (Array.isArray(r.json) ? r.json : []);
      console.log(`Got ${tours.length} tours`);
      all.push(...tours);
      if (tours.length < PAGE_SIZE) break;
      page += 1;
      await new Promise(res => setTimeout(res, 300));
    }
  }

  const payload = { tours: all };
  await writeFile(OUTPUT, JSON.stringify(payload, null, 2));
  console.log(`Saved ${all.length} tours to ${OUTPUT}`);
})();
