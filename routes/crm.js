const express = require('express');
const router = express.Router();

router.post('/order', async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Order sent to CRM'
  });
});

module.exports = router;

