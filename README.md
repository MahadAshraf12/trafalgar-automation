# Trafalgar Automation

Master pipeline for processing travel data from Trafalgar, Insight Vacations, and CostSaver.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run all pipelines
npm start

# OR run individual pipelines
npm run trafalgar    # Only Trafalgar
npm run insight      # Only Insight Vacations
npm run costsaver    # Only CostSaver
```

## 🖥️ VPS Deployment (DigitalOcean 1GB RAM)

### Memory-Optimized Setup

```bash
# 1. Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone and setup project
git clone <your-repo>
cd trafalgar-automation
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys and database credentials

# 4. Run with memory optimization
node --expose-gc --max-old-space-size=700 main.js
```

### Memory Management Features

- **Batch Processing**: 8 tours per batch (Trafalgar), 5 tours per batch (Insight/CostSaver)
- **Smart Delays**: 1.5-2 second pauses between batches
- **Garbage Collection**: Automatic memory cleanup
- **Memory Monitoring**: Real-time RAM usage logging

### Monitoring Commands

```bash
# Monitor memory usage
htop

# Check available RAM
free -h

# Monitor Node.js process
ps aux | grep node
```

## 📊 Pipeline Architecture

```
🌟 Master Pipeline
├── 1. Trafalgar (trafalgar/)
│   ├── API fetch → tours
│   ├── Scrape trip codes
│   ├── Process trips & details
│   ├── Scrape ratings
│   ├── Fetch activity levels
│   └── Insert to Supabase
├── 2. Insight Vacations (insightvacations/)
│   ├── Extract latest SKUs
│   ├── Scrape ratings/activity levels
│   ├── Process trips & details
│   └── Insert to Supabase
└── 3. CostSaver (costsaver/)
    ├── Extract latest SKUs
    ├── Scrape ratings (activity = NULL)
    ├── Process trips & details
    └── Insert to Supabase
```

## 🔧 Configuration

### Environment Variables (.env)

```env
# TTC API
VITE_TTC_API_TOKEN=your_api_token
TTC_API_BASE=https://api.ttc.com

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Database Tables
TRIPS_TABLE=trips
TRIP_DETAILS_TABLE=trip_details

# Processing Settings
BATCH_SIZE=50
BATCH_DELAY_MS=200
```

## 📈 Performance Tuning

### For 1GB RAM VPS:

```bash
# Use these Node.js flags
node --expose-gc --max-old-space-size=700 main.js
```

### Batch Size Recommendations:

- **512MB RAM**: 5 tours per batch
- **1GB RAM**: 8-10 tours per batch ✅ (Current setup)
- **2GB+ RAM**: 20+ tours per batch

## 🐛 Troubleshooting

### Memory Issues:
- Reduce `BATCH_SIZE` in scraping scripts
- Increase `BATCH_DELAY` between batches
- Use `--expose-gc` flag

### API Rate Limits:
- Increase delays in main scripts
- Check API response headers for rate limit info

### Database Connection:
- Verify Supabase credentials
- Check network connectivity
- Monitor database connection pool

## 📝 Logs

All scripts provide detailed logging:
- Memory usage (RSS, Heap)
- Batch progress
- Error details
- Success/failure counts

## 🔄 Data Flow

1. **API Fetch** → Raw tour data from TTC API
2. **URL Construction** → Build proper trip URLs from base URLs
3. **Web Scraping** → Extract ratings, reviews, activity levels
4. **Data Processing** → Transform to database format
5. **Database Insert** → Safe UPSERT operations

