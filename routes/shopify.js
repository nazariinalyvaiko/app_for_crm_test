const express = require('express');
const router = express.Router();
const { extractOrderId, buildAddressUrl } = require('../utils/order');
const { corsMiddleware, setCorsHeaders } = require('../middleware/cors');
const { ORDER_STORAGE_TTL } = require('../config/constants');
const { processOrderToCrm } = require('./crm');

const orderStorage = new Map();

const storeOrder = (orderId, orderData) => {
  orderStorage.set(orderId, orderData);
  setTimeout(() => orderStorage.delete(orderId), ORDER_STORAGE_TTL);
};

router.use(corsMiddleware);

router.post('/checkout', async (req, res) => {
  setCorsHeaders(res, req.headers.origin);
  
  const orderData = req.body;
  const orderId = extractOrderId(orderData);
  
  if (!orderData.deliveryAddress) {
    storeOrder(orderId, orderData);
    return res.json({
      success: true,
      redirectUrl: buildAddressUrl(req, orderId),
      addressUrl: buildAddressUrl(req, orderId)
    });
  }
  
  try {
    const result = await processOrderToCrm(orderData);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing order with CRM service',
      error: error.message
    });
  }
});

router.get('/order/:orderId', (req, res) => {
  setCorsHeaders(res, req.headers.origin);
  
  const orderData = orderStorage.get(req.params.orderId);
  if (!orderData) {
    return res.status(404).json({
      success: false,
      message: 'Order not found or expired'
    });
  }
  
  res.json({ success: true, orderData });
});

module.exports = router;
