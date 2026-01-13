require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT =3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning', 'Accept'],
  credentials: false
}));

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' https:; script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );
  next();
});


const shopifyRoutes = require('./routes/shopify');
app.use('/api', shopifyRoutes);

const novaPoshtaRoutes = require('./routes/nova-poshta');
app.use('/api/nova-poshta', novaPoshtaRoutes);

const crmRoutes = require('./routes/crm');
app.use('/api/crm', crmRoutes);

app.get('/address', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'ui')));

module.exports = app;
if (process.env.VERCEL !== '1') {
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
