require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === '1';

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' https:",
  "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: *",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://barefoot-9610.myshopify.com';

function getCorsOrigin(origin) {
  if (!origin) return ALLOWED_ORIGIN;
  
  const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  const normalizedAllowed = ALLOWED_ORIGIN.endsWith('/') ? ALLOWED_ORIGIN.slice(0, -1) : ALLOWED_ORIGIN;
  
  return (normalizedOrigin === normalizedAllowed || origin === ALLOWED_ORIGIN)
    ? origin
    : ALLOWED_ORIGIN;
}

app.use((req, res, next) => {
  const origin = getCorsOrigin(req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, ALLOWED_ORIGIN);
    }
    
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const normalizedAllowed = ALLOWED_ORIGIN.endsWith('/') ? ALLOWED_ORIGIN.slice(0, -1) : ALLOWED_ORIGIN;
    
    if (normalizedOrigin === normalizedAllowed || origin === ALLOWED_ORIGIN) {
      callback(null, true);
    } else {
      callback(null, ALLOWED_ORIGIN);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  next();
});

app.use('/api', require('./routes/shopify'));
app.use('/api/nova-poshta', require('./routes/nova-poshta'));
app.use('/api/crm', require('./routes/crm'));

app.get('/address', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'ui')));

app.use((err, req, res, next) => {
  const origin = getCorsOrigin(req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

if (!isVercel) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
    console.log('Available routes:');
    console.log('  POST /api/checkout - Shopify checkout');
    console.log('  GET  /api/order/:orderId - Get order by ID');
    console.log('  GET  /api/nova-poshta/warehouses - Nova Poshta warehouses');
    console.log('  GET  /api/nova-poshta/cities - Nova Poshta cities search');
    console.log('  POST /api/crm/order - CRM order');
    console.log('  GET  /address - Address input page');
  });
}

module.exports = app;
