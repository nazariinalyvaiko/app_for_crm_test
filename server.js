const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning', 'Accept'],
  credentials: false
}));

app.use(express.json());

// Set Content-Security-Policy headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );
  next();
});

app.post('/api/checkout', (req, res) => {
  const orderData = req.body;
  console.log('Order data:', orderData);

  res.status(200).json({
    redirectUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1'
  });
  /*
  try {
    const crmResponse = await axios.post('!!!crm-server!!!', orderData, { timeout: 5000 });
    const { paymentUrl } = crmResponse.data;
    if (!paymentUrl) return res.status(500).json({ message: 'Failed to get payment URL from CRM.' });
    res.status(200).json({ paymentUrl });
  } catch (error) {
    res.status(500).json({ message: 'Error processing order with CRM service.', error: error.message });
  }
  */
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
});
