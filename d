warning: in the working copy of 'insert_to_db.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'node_modules/.package-lock.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'package-lock.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'package.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'trip_details.js', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/insert_to_db.js b/insert_to_db.js[m
[1mindex 970d679..a1d8807 100644[m
[1m--- a/insert_to_db.js[m
[1m+++ b/insert_to_db.js[m
[36m@@ -4,6 +4,11 @@[m
 import fs from "fs";[m
 import { createClient } from "@supabase/supabase-js";[m
 [m
[32m+[m[32mfunction logMemory(label) {[m
[32m+[m[32m  const mem = process.memoryUsage();[m
[32m+[m[32m  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);[m
[32m+[m[32m}[m
[32m+[m
 // ---------------- Configuration ----------------[m
 const SUPABASE_URL = process.env.SUPABASE_URL || "https://vrcnwvcsvsudmtokdapd.supabase.co";[m
 const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyY253dmNzdnN1ZG10b2tkYXBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1Nzk5NjUsImV4cCI6MjA3MzE1NTk2NX0.n_0YTReO8Qqyfi-ajw2ixKl4yOne5xbaf9dBNqo-ius"; // service_role key preferred[m
[36m@@ -91,6 +96,8 @@[m [masync function upsertBatch(table, entries, conflictKey) {[m
 }[m
 [m
 (async () => {[m
[32m+[m[32m  logMemory("Start of insert_to_db.js");[m
[32m+[m
   let totalSuccess = 0;[m
   let totalFailed = 0;[m
   const failedDetails = [];[m
[36m@@ -136,6 +143,7 @@[m [masync function upsertBatch(table, entries, conflictKey) {[m
     console.log("Wrote failed details to", pathErr);[m
   }[m
 [m
[32m+[m[32m  logMemory("End of insert_to_db.js");[m
   console.log("Done.");[m
   process.exit(0);[m
 })();[m
[1mdiff --git a/main.js b/main.js[m
[1mindex 6d7b570..7ca0947 100644[m
[1m--- a/main.js[m
[1m+++ b/main.js[m
[36m@@ -13,6 +13,12 @@[m [mconst acceptHeader = "application/json"; // works fine for TTC[m
 const REGION = "us"; // ✅ target region[m
 [m
 [m
[32m+[m[32mfunction logMemory(label) {[m
[32m+[m[32m  const mem = process.memoryUsage();[m
[32m+[m[32m  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m
 if (!API_TOKEN) {[m
   console.error("❌ Error: VITE_TTC_API_TOKEN is not set. Add it to your .env file.");[m
   process.exit(1);[m
[36m@@ -59,6 +65,8 @@[m [masync function fetchUSTours(page = 1, limit = 1000) {[m
 [m
 (async () => {[m
   try {[m
[32m+[m[32m    logMemory("Start of main.js");[m
[32m+[m
     let page = 1;[m
     const allTours = [];[m
     let hasMore = true;[m
[36m@@ -92,6 +100,8 @@[m [masync function fetchUSTours(page = 1, limit = 1000) {[m
     await fs.writeFile(outFile, JSON.stringify({ tours: allTours }, null, 2), "utf8");[m
     console.log(`💾 Saved ${allTours.length} tours to ${outFile}` );[m
 [m
[32m+[m[32m    logMemory("After fetching and saving tours");[m
[32m+[m
     // Scrape trip codes[m
     console.log('📊 Scraping trip codes...');[m
     try {[m
[36m@@ -101,6 +111,8 @@[m [masync function fetchUSTours(page = 1, limit = 1000) {[m
       console.error('❌ Error during scraping:', err.message);[m
     }[m
 [m
[32m+[m[32m    logMemory("After scraping trip codes");[m
[32m+[m
     // Process trips and trip details[m
     console.log('📊 Processing trips and trip details...');[m
     try {[m
[36m@@ -111,6 +123,8 @@[m [masync function fetchUSTours(page = 1, limit = 1000) {[m
       console.error('❌ Error during processing:', err.message);[m
     }[m
 [m
[32m+[m[32m    logMemory("After processing trips and details");[m
[32m+[m
     // Insert to database[m
     console.log('🗄️ Inserting data to database...');[m
     try {[m
[36m@@ -120,6 +134,8 @@[m [masync function fetchUSTours(page = 1, limit = 1000) {[m
       console.error('❌ Error during database insertion:', err.message);[m
     }[m
 [m
[32m+[m[32m    logMemory("End of main.js");[m
[32m+[m
   } catch (err) {[m
     console.error("❌ Failed to fetch/save tours:", err.message || err);[m
     process.exit(1);[m
[1mdiff --git a/node_modules/.package-lock.json b/node_modules/.package-lock.json[m
[1mindex e1388c0..a3b6b09 100644[m
[1m--- a/node_modules/.package-lock.json[m
[1m+++ b/node_modules/.package-lock.json[m
[36m@@ -556,6 +556,31 @@[m
         "node": ">=0.10.0"[m
       }[m
     },[m
[32m+[m[32m    "node_modules/jsonparse": {[m
[32m+[m[32m      "version": "1.3.1",[m
[32m+[m[32m      "resolved": "https://registry.npmjs.org/jsonparse/-/jsonparse-1.3.1.tgz",[m
[32m+[m[32m      "integrity": "sha512-POQXvpdL69+CluYsillJ7SUhKvytYjW9vG/GKpnf+xP8UWgYEM/RaMzHHofbALDiKbbP1W8UEYmgGl39WkPZsg==",[m
[32m+[m[32m      "engines": [[m
[32m+[m[32m        "node >= 0.2.0"[m
[32m+[m[32m      ],[m
[32m+[m[32m      "license": "MIT"[m
[32m+[m[32m    },[m
[32m+[m[32m    "node_modules/JSONStream": {[m
[32m+[m[32m      "version": "1.3.5",[m
[32m+[m[32m      "resolved": "https://registry.npmjs.org/JSONStream/-/JSONStream-1.3.5.tgz",[m
[32m+[m[32m      "integrity": "sha512-E+iruNOY8VV9s4JEbe1aNEm6MiszPRr/UfcHMz0TQh1BXSxHK+ASV1R6W4HpjBhSeS+54PIsAMCBmwD06LLsqQ==",[m
[32m+[m[32m      "license": "(MIT OR Apache-2.0)",[m
[32m+[m[32m      "dependencies": {[m
[32m+[m[32m        "jsonparse": "^1.2.0",[m
[32m+[m[32m        "through": ">=2.2.7 <3"[m
[32m+[m[32m      },[m
[32m+[m[32m      "bin": {[m
[32m+[m[32m        "JSONStream": "bin.js"[m
[32m+[m[32m      },[m
[32m+[m[32m      "engines": {[m
[32m+[m[32m        "node": "*"[m
[32m+[m[32m      }[m
[32m+[m[32m    },[m
     "node_modules/math-intrinsics": {[m
       "version": "1.1.0",[m
       "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",[m
[36m@@ -659,6 +684,12 @@[m
       "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",[m
       "license": "MIT"[m
     },[m
[32m+[m[32m    "node_modules/through": {[m
[32m+[m[32m      "version": "2.3.8",[m
[32m+[m[32m      "resolved": "https://registry.npmjs.org/through/-/through-2.3.8.tgz",[m
[32m+[m[32m      "integrity": "sha512-w89qg7PI8wAdvX60bMDP+bFoD5Dvhm9oLheFp5O4a2QF0cSBGsBX4qZmadPMvVqlLJBBci+WqGGOAPvcDeNSVg==",[m
[32m+[m[32m      "license": "MIT"[m
[32m+[m[32m    },[m
     "node_modules/tr46": {[m
       "version": "0.0.3",[m
       "resolved": "https://registry.npmjs.org/tr46/-/tr46-0.0.3.tgz",[m
[1mdiff --git a/package-lock.json b/package-lock.json[m
[1mindex 6f8cc5e..88ae7be 100644[m
[1m--- a/package-lock.json[m
[1m+++ b/package-lock.json[m
[36m@@ -9,7 +9,8 @@[m
         "@supabase/supabase-js": "^2.39.0",[m
         "axios": "^1.6.0",[m
         "cheerio": "^1.0.0",[m
[31m-        "dotenv": "^17.2.3"[m
[32m+[m[32m        "dotenv": "^17.2.3",[m
[32m+[m[32m        "JSONStream": "^1.3.5"[m
       }[m
     },[m
     "node_modules/@supabase/auth-js": {[m
[36m@@ -564,6 +565,31 @@[m
         "node": ">=0.10.0"[m
       }[m
     },[m
[32m+[m[32m    "node_modules/jsonparse": {[m
[32m+[m[32m      "version": "1.3.1",[m
[32m+[m[32m      "resolved": "https://registry.npmjs.org/jsonparse/-/jsonparse-1.3.1.tgz",[m
[32m+[m[32m      "integrity": "sha512-POQXvpdL69+CluYsillJ7SUhKvytYjW9vG/GKpnf+xP8UWgYEM/RaMzHHofbALDiKbbP1W8UEYmgGl39WkPZsg==",[m
[32m+[m[32m      "engines": [[m
[32m+[m[32m        "node >= 0.2.0"[m
[32m+[m[32m      ],[m
[32m+[m[32m      "license": "MIT"[m
[32m+[m[32m    },[m
[32m+[m[32m    "node_modules/JSONStream": {[m
[32m+[m[32m      "version": "1.3.5",[m
[32m+[m[32m      "resolved": "https://registry.npmjs.org/JSONStream/-/JSONStream-1.3.5.tgz",[m
[32m+[m[32m      "integrity": "sha512-E+iruNOY8VV9s4JEbe1aNEm6MiszPRr/UfcHMz0TQh1BXSxHK+ASV1R6W4HpjBhSeS+54PIsAMCBmwD06LLsqQ==",[m
[32m+[m[32m      "license": "(MIT OR Apache-2.0)",[m
[32m+[m[32m      "dependencies": {[m
[32m+[m[32m        "jsonparse": "^1.2.0",[m
[32m+[m[32m        "through": ">=2.2.7 <3"[m
[32m+[m[32m      },[m
[32m+[m[32m      "bin": {[m
[32m+[m[32m        "JSONStream": "bin.js"[m
[32m+[m[32m      },[m
[32m+[m[32m      "engines": {[m
[32m+[m[32m        "node": "*"[m
[32m+[m[32m      }[m
[32m+[m[32m    },[m
     "node_modules/math-intrinsics": {[m
       "version": "1.1.0",[m
       "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",[m
[36m@@ -667,6 +693,12 @@[m
       "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",[m
       "license": "MIT"[m
     },[m
[32m+[m[32m    "node_modules/through": {[m
[32m+[m[32m      "version": "2.3.8",[m
[32m+[m[32m      "resolved": "https://registry.npmjs.org/through/-/through-2.3.8.tgz",[m
[32m+[m[32m      "integrity": "sha512-w89qg7PI8wAdvX60bMDP+bFoD5Dvhm9oLheFp5O4a2QF0cSBGsBX4qZmadPMvVqlLJBBci+WqGGOAPvcDeNSVg==",[m
[32m+[m[32m      "license": "MIT"[m
[32m+[m[32m    },[m
     "node_modules/tr46": {[m
       "version": "0.0.3",[m
       "resolved": "https://registry.npmjs.org/tr46/-/tr46-0.0.3.tgz",[m
[1mdiff --git a/package.json b/package.json[m
[1mindex 0c4812a..213de5d 100644[m
[1m--- a/package.json[m
[1m+++ b/package.json[m
[36m@@ -1,9 +1,10 @@[m
 {[m
   "type": "module",[m
   "dependencies": {[m
[31m-    "dotenv": "^17.2.3",[m
[32m+[m[32m    "@supabase/supabase-js": "^2.39.0",[m
     "axios": "^1.6.0",[m
     "cheerio": "^1.0.0",[m
[31m-    "@supabase/supabase-js": "^2.39.0"[m
[32m+[m[32m    "dotenv": "^17.2.3",[m
[32m+[m[32m    "JSONStream": "^1.3.5"[m
   }[m
 }[m
[1mdiff --git a/trip_details.js b/trip_details.js[m
[1mindex 8aa7e1c..024ea7e 100644[m
[1m--- a/trip_details.js[m
[1m+++ b/trip_details.js[m
[36m@@ -1,28 +1,22 @@[m
 import fs from 'fs';[m
 import path from 'path';[m
 import dotenv from 'dotenv';[m
[32m+[m[32mimport JSONStream from 'JSONStream';[m
 [m
 // Load environment variables from .env file[m
 dotenv.config();[m
 [m
[31m-// Read the JSON file[m
[31m-function readTourData() {[m
[31m-  const filePath = path.join(process.cwd(), 'trafalgar-tours-us.json');[m
[31m-[m
[31m-  if (!fs.existsSync(filePath)) {[m
[31m-    throw new Error(`JSON file not found: ${filePath}. Run main.js first.`);[m
[31m-  }[m
[31m-[m
[31m-  const data = fs.readFileSync(filePath, 'utf8');[m
[31m-  return JSON.parse(data);[m
[31m-}[m
[31m-[m
 // Helper functions from working example[m
 function ensureArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }[m
 function safeNum(v) { if (v === undefined || v === null) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }[m
 function parseDateToUTC(d) { if (!d) return null; try { if (String(d).includes('T')) return new Date(d); return new Date(String(d) + 'T00:00:00Z'); } catch { return null; } }[m
 function daysInclusive(start, end) { const s = parseDateToUTC(start); const e = parseDateToUTC(end); if (!s || !e) return null; const msPerDay = 24*60*60*1000; const diff = Math.round((e.getTime() - s.getTime())/msPerDay); return diff + 1; }[m
 [m
[32m+[m[32mfunction logMemory(label) {[m
[32m+[m[32m  const mem = process.memoryUsage();[m
[32m+[m[32m  console.log(`${label} - RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, External: ${Math.round(mem.external / 1024 / 1024)}MB`);[m
[32m+[m[32m}[m
[32m+[m
 // Try to infer a continent from a provided region/country/continent string or common code[m
 function inferContinentFromRegion(codeOrName) {[m
   if (!codeOrName) return '';[m
[36m@@ -263,22 +257,8 @@[m [mfunction transformTourToDetails(tour) {[m
 }[m
 [m
 // Save trip details to JSON file[m
[31m-async function saveTripDetailsToJSON(tours) {[m
[31m-  console.log(`💾 Processing ${tours.length} tours for trip_details JSON...`);[m
[31m-[m
[31m-  // Filter for US tours only[m
[31m-  const usTours = tours.filter(isUSTour);[m
[31m-  console.log(`🇺🇸 Filtered to ${usTours.length} US tours (from ${tours.length} total)`);[m
[31m-[m
[31m-  let totalDetails = 0;[m
[31m-  const allDetails = [];[m
[31m-[m
[31m-  for (const tour of usTours) {[m
[31m-    const details = transformTourToDetails(tour);[m
[31m-    allDetails.push(...details);[m
[31m-  }[m
[31m-[m
[31m-  totalDetails = allDetails.length;[m
[32m+[m[32masync function saveTripDetailsToJSON(allDetails) {[m
[32m+[m[32m  console.log(`💾 Processing ${allDetails.length} details for trip_details JSON...`);[m
 [m
   if (allDetails.length > 0) {[m
     try {[m
[36m@@ -288,32 +268,62 @@[m [masync function saveTripDetailsToJSON(tours) {[m
       const outputPath = path.join(process.cwd(), 'trip_details_us.json');[m
       await fs.promises.writeFile(outputPath, JSON.stringify(allDetails, null, 2));[m
 [m
[31m-      console.log(`Saved ${allDetails.length} trip detail records to ${outputPath}`);[m
[31m-      return { successCount: allDetails.length, errorCount: 0, totalDetails };[m
[32m+[m[32m      console.log(`✅ Saved ${allDetails.length} trip detail records to ${outputPath}`);[m
[32m+[m[32m      return { successCount: allDetails.length, errorCount: 0, totalDetails: allDetails.length };[m
     } catch (error) {[m
[31m-      console.error('Error saving trip details JSON:', error);[m
[31m-      return { successCount: 0, errorCount: allDetails.length, totalDetails };[m
[32m+[m[32m      console.error('❌ Error saving trip details JSON:', error);[m
[32m+[m[32m      return { successCount: 0, errorCount: allDetails.length, totalDetails: allDetails.length };[m
     }[m
   }[m
 [m
[31m-  console.log(`Trip Details Results: 0 successful, 0 errors, ${totalDetails} total rows processed`);[m
[31m-  return { successCount: 0, errorCount: 0, totalDetails };[m
[32m+[m[32m  console.log(`Trip Details Results: 0 successful, 0 errors, ${allDetails.length} total rows processed`);[m
[32m+[m[32m  return { successCount: 0, errorCount: 0, totalDetails: allDetails.length };[m
 }[m
 // Main function[m
 async function processTripDetailsData() {[m
   try {[m
     console.log('🚀 Starting trip_details data processing...');[m
[32m+[m[32m    logMemory("Start of trip_details.js");[m
 [m
[31m-    // Read JSON data[m
[31m-    const toursData = readTourData();[m
[31m-    const tours = toursData.tours || [];[m
[31m-    console.log(`📖 Read ${tours.length} tours from JSON file`);[m
[32m+[m[32m    const filePath = path.join(process.cwd(), 'trafalgar-tours-us.json');[m
[32m+[m[32m    if (!fs.existsSync(filePath)) {[m
[32m+[m[32m      throw new Error(`JSON file not found: ${filePath}. Run main.js first.`);[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m    const allDetails = [];[m
[32m+[m[32m    let totalTours = 0;[m
 [m
[31m-    // Save to JSON[m
[31m-    const results = await saveTripDetailsToJSON(tours);[m
[32m+[m[32m    return new Promise((resolve, reject) => {[m
[32m+[m[32m      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });[m
[32m+[m[32m      const parser = JSONStream.parse('tours.*');[m
[32m+[m[32m      stream.pipe(parser);[m
 [m
[31m-    console.log('✅ Trip details data processing completed!');[m
[31m-    console.log(`📈 Summary: ${results.successCount} rows saved to JSON, ${results.errorCount} errors, ${results.totalDetails} total rows processed`);[m
[32m+[m[32m      parser.on('data', (tour) => {[m
[32m+[m[32m        totalTours++;[m
[32m+[m[32m        if (isUSTour(tour)) {[m
[32m+[m[32m          const details 