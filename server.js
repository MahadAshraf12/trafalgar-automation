import express from 'express';
import path from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// API proxy for Supabase
app.use('/supabase', createProxyMiddleware({
  target: process.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co',
  changeOrigin: true,
  pathRewrite: {
    '^/supabase': '', // Remove /supabase prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add Supabase authentication headers
    if (process.env.VITE_SUPABASE_ANON_KEY) {
      proxyReq.setHeader('apikey', process.env.VITE_SUPABASE_ANON_KEY);
      proxyReq.setHeader('Authorization', `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`);
    }
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Prefer', 'return=representation');
  },
  onError: (err, req, res) => {
    console.error('Supabase proxy error:', err);
    res.status(500).json({ error: 'Supabase proxy error' });
  }
}));

// API proxy for TTC
app.use('/api', createProxyMiddleware({
  target: process.env.VITE_TTC_API_BASE || 'https://api.ttc.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // Remove /api prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add authentication header
    if (process.env.VITE_TTC_API_TOKEN) {
      const token = process.env.VITE_TTC_API_TOKEN;
      const auth = Buffer.from(`token:${token}`).toString('base64');
      proxyReq.setHeader('Authorization', `Basic ${auth}`);
    }
    proxyReq.setHeader('Accept', 'application/json');
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error' });
  }
}));

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`TTC API Base: ${process.env.VITE_TTC_API_BASE || 'https://api.ttc.com'}`);
  console.log(`TTC API Token: ${process.env.VITE_TTC_API_TOKEN ? 'Set' : 'Not set'}`);
  console.log(`Supabase URL: ${process.env.VITE_SUPABASE_URL ? 'Set' : 'Not set'}`);
  console.log(`Supabase Key: ${process.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Not set'}`);
});
