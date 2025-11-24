/**
 * simple-fetch-costsaver-trips.js
 *
 * Usage:
 *   1) Save file
 *   2) Set env vars or edit below:
 *      - API_KEY (required) : your TTC API key
 *      - TRIPS_URL (required): full trips endpoint, e.g. https://api.ttc.example.com/v1/trips
 *      - BRAND (optional) : CostSaver (will append as ?brand=CostSaver if provided)
 *   3) node simple-fetch-costsaver-trips.js
 *
 * Notes:
 *  - This script uses global fetch (Node 18+). If you run older Node, install node-fetch or use axios.
 *  - It pages using page & pageSize. If TTC uses cursor style pagination, update `params` accordingly.
 */

const fs = require('fs');
const { URL } = require('url');

const API_KEY = process.env.API_KEY || '<PUT_YOUR_API_KEY_HERE>';
const TRIPS_URL = process.env.TRIPS_URL || '<PUT_TRIPS_URL_HERE>'; // e.g. https://api.ttc.example.com/v1/trips
const BRAND = process.env.BRAND || 'CostSaver'; // optional: will send ?brand=CostSaver
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const OUTPUT = process.env.OUTPUT || 'costsaver-trips-simple.json';

if (!API_KEY || API_KEY.includes('<PUT_')) {
  console.error('ERROR: set your API_KEY in environment or inside the script.');
  process.exit(1);
}
if (!TRIPS_URL || TRIPS_URL.includes('<PUT_')) {
  console.error('ERROR: set TRIPS_URL (the TTC trips endpoint).');
  process.exit(1);
}

async function tryRequest(url, headers) {
  // return { ok, status, json }
  try {
    const res = await fetch(url, { headers, method: 'GET' });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch(e) { json = text; }
    return { ok: res.ok, status: res.status, json, headers: res.headers };
  } catch (err) {
    return { ok: false, status: null, error: err.message };
  }
}

async function requestWithAutoKey(url, attempt = 0) {
  // Try common placements for API key
  const attempts = [
    { name: 'Authorization: Bearer', headers: { Authorization: `Bearer ${API_KEY}` } },
    { name: 'x-api-key', headers: { 'x-api-key': API_KEY } },
    { name: 'Authorization: ApiKey', headers: { Authorization: `ApiKey ${API_KEY}` } },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const { name, headers } = attempts[i];
    const r = await tryRequest(url, headers);
    if (r.ok) {
      // success
      return { success: true, method: name, result: r };
    }
    // If 401/403, try next placement
    if (r.status && (r.status === 401 || r.status === 403)) {
      // continue to next attempt
      continue;
    }
    // For other failures (network), return it so caller can decide
    if (!r.status) return { success: false, error: 'Network error: ' + (r.error || 'unknown') };
    // If 404, 400, 429 etc, return that result (not authentication)
    if (r.status >= 400 && r.status < 500) return { success: false, status: r.status, body: r.json };
  }

  return { success: false, error: 'All auth header placements tried; got auth errors or no success.' };
}

function buildUrlWithParams(base, params) {
  const u = new URL(base);
  Object.keys(params).forEach(k => {
    if (params[k] !== undefined && params[k] !== null) u.searchParams.set(k, params[k]);
  });
  return u.toString();
}

(async () => {
  console.log('Starting simple trip fetch...');
  let page = 1;
  const all = [];

  while (true) {
    const params = { page, pageSize: PAGE_SIZE };
    if (BRAND) params.brand = BRAND;
    const url = buildUrlWithParams(TRIPS_URL, params);

    console.log(`Fetching page ${page} ...`);
    const res = await requestWithAutoKey(url);
    if (!res.success) {
      console.error('Request failed:', res.error || { status: res.status, body: res.body });
      process.exit(1);
    }

    const body = res.result.json;
    // Try common locations for items array
    let items = null;
    if (Array.isArray(body)) items = body;
    else if (body && Array.isArray(body.data)) items = body.data;
    else if (body && Array.isArray(body.trips)) items = body.trips;
    else {
      // fallback: find first array value in body
      if (body && typeof body === 'object') {
        for (const v of Object.values(body)) {
          if (Array.isArray(v)) { items = v; break; }
        }
      }
    }

    if (!items) {
      console.warn('Could not locate trips array in response. Inspecting response body:');
      console.log(JSON.stringify(body, null, 2));
      process.exit(1);
    }

    console.log(`Got ${items.length} items`);
    all.push(...items);

    // Stop if less than pageSize (end), or no items
    if (items.length === 0 || items.length < PAGE_SIZE) break;

    page++;
    // safety stop to avoid infinite loop
    if (page > 10000) {
      console.error('Aborting: too many pages.');
      break;
    }
  }

  // Save to file
  fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2));
  console.log(`Done — fetched ${all.length} trips. Saved to ${OUTPUT}`);
})();
