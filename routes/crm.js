const express = require('express');
const router = express.Router();

router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

router.post('/order', async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Order sent to CRM'
  });
});

module.exports = router;

