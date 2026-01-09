const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning', 'Accept']
}));

app.use(express.json());

app.post('/api/checkout', (req, res) => {
  const orderData = req.body;

  res.status(200).json({
    redirectUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  });
});

module.exports = app;
