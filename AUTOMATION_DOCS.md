# Trafalgar Automation - Data Pipeline Documentation

This project automates the collection, processing, and storage of tour data from three travel brands: Trafalgar, Costsaver, and Insight Vacations.

## Project Structure

```
trafalgar_automation/
├── trafalgar/           # Trafalgar tours pipeline
├── costsaver/           # Costsaver tours pipeline
├── insightvacations/    # Insight Vacations pipeline
├── json_files/          # Shared JSON data files
├── output/              # Processed output data
├── package.json         # Root dependencies and scripts
├── .env                 # Environment variables
└── server.js            # Optional Express server
```

## Automated Data Pipelines

Each brand has its own automated pipeline that runs the following steps in sequence:

### 1. API Data Fetching
- Fetches tour data from the TTC (The Travel Corporation) API
- Filters for US-region tours only
- Saves raw tour data to JSON files

### 2. Trip Code Scraping
- Scrapes trip codes from brand websites using Puppeteer
- Extracts unique identifiers for each tour
- Saves trip codes to JSON for later processing

### 3. Trip Data Processing
- Processes raw API data into structured trip records
- Extracts pricing, dates, descriptions, and metadata
- Generates trip JSON files with normalized data

### 4. Trip Details Processing
- Creates detailed departure records for each trip
- Includes pricing, availability, duration, and region data
- Saves comprehensive trip details JSON

### 5. Ratings Scraping
- Scrapes customer reviews and ratings from Feefo
- Extracts star ratings and review counts
- Updates trip records with rating data

### 6. Activity Level Fetching
- Scrapes activity level information from brand websites
- Categorizes tours by physical activity requirements
- Adds activity metadata to trip records

### 7. Database Insertion
- Inserts processed data into Supabase database
- Handles upserts for existing records
- Logs successful insertions and errors

## Brand-Specific Pipelines

### Trafalgar Pipeline (`trafalgar/`)

**Entry Point:** `trafalgar/main.js`

**Scripts Executed:**
1. `scrape_trip_codes.js` - Trip code extraction
2. `trips.js` - Trip data processing
3. `trip_details.js` - Detailed departure processing
4. `scrape-trafalgar-feefo-fixed-2.js` - Ratings scraping
5. `fetch-activity-level.js` - Activity level data
6. `insert_to_db.js` - Database insertion

**Data Files:**
- `trafalgar-tours-us.json` - Raw API data
- `trip_codes.json` - Scraped trip codes
- `trips.json` - Processed trip records
- `trip_details_us.json` - Detailed departure data
- `trip_ratings.json` - Rating information

### Costsaver Pipeline (`costsaver/`)

**Entry Point:** `costsaver/main.js`

**Scripts Executed:**
1. `extract_costsaver_urls.js` - URL extraction (if needed)
2. `fetch_feefo_div_content.js` - Feefo content scraping
3. `extract_ratings.js` - Rating extraction
4. `trips.js` - Trip data processing
5. `trip_details.js` - Detailed departure processing
6. `insert_to_db.js` - Database insertion

**Key Differences:**
- Uses pre-existing `costsaver_urls.json` for URL data
- Includes additional Feefo content extraction steps
- May have different rating processing logic

### Insight Vacations Pipeline (`insightvacations/`)

**Entry Point:** `insightvacations/main.js`

**Scripts Executed:**
1. `extract_insight_urls.js` - URL extraction from API data
2. `scrape_trip_codes.js` - Trip code scraping
3. `fetch_feefo_div_content.js` - Feefo content scraping
4. `extract_ratings.js` - Rating extraction
5. `trips.js` - Trip data processing
6. `trip_details.js` - Detailed departure processing
7. `insert_to_db.js` - Database insertion

**Key Differences:**
- Extracts URLs from API response data
- Includes trip code scraping step
- Similar Feefo processing to Costsaver

## Running the Pipelines

### Individual Brand Execution

**Trafalgar:**
```bash
cd trafalgar
npm start
```

**Costsaver:**
```bash
cd costsaver
npm start
```

**Insight Vacations:**
```bash
cd insightvacations
npm start
```

### Root-Level Execution

From the project root, you can run Trafalgar pipeline:
```bash
npm start
```

## Environment Configuration

Each pipeline requires the following environment variables (set in `.env` files):

- `VITE_TTC_API_TOKEN` - TTC API authentication token
- `VITE_TTC_API_BASE` - TTC API base URL (default: https://api.ttc.com)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

## Data Flow

1. **API Fetch** → Raw tour data from TTC
2. **Scraping** → Trip codes and ratings from websites
3. **Processing** → Structured JSON data
4. **Storage** → Supabase database insertion

## Error Handling

- Each step includes try-catch blocks
- Failed operations are logged but don't stop the pipeline
- Error logs are saved to files (e.g., `failed_upserts.json`)
- Memory usage is monitored throughout execution

## Dependencies

- **Node.js** >= 18
- **Puppeteer** - Web scraping
- **Cheerio** - HTML parsing
- **Axios** - HTTP requests
- **Supabase JS** - Database operations
- **JSONStream** - Large JSON file processing

## Monitoring

The pipelines include memory monitoring and progress logging:
- RSS and heap memory usage tracking
- Step-by-step progress indicators
- Success/error counts for each operation

## Maintenance

- Regularly update Puppeteer and browser dependencies
- Monitor API rate limits and adjust delays as needed
- Clean up temporary data files periodically
- Review and update selectors for website changes