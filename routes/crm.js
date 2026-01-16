const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { extractOrderId, mergeCustomerData } = require('../utils/order');
const { corsMiddleware, setCorsHeaders } = require('../middleware/cors');
const { handleApiError } = require('../utils/errorHandler');
const { CRM_API_BASE_URL, REQUEST_TIMEOUT } = require('../config/constants');

const buildCrmPayload = (orderId, orderData) => {
  const { deliveryAddress, ...rest } = orderData;
  const { fullName, phone, ...address } = deliveryAddress || {};
  
  return {
    ...rest,
    id: orderId,
    customer: mergeCustomerData(orderData.customer, deliveryAddress),
    deliveryAddress: address
  };
};

const sendToCrm = async (orderId, payload) => {
  try {
    const response = await axios.post(
      `${CRM_API_BASE_URL}/webhooks/shopify/orders/${orderId}/invoice`,
      payload,
      { timeout: REQUEST_TIMEOUT.CRM, headers: { 'Content-Type': 'application/json' } }
    );
    
    const { pageUrl, invoiceId } = response.data || {};
    logger.crmResponse({ orderId, invoiceId, pageUrl });
    
    if (!pageUrl) {
      throw new Error('CRM response missing pageUrl');
    }
    
    return { pageUrl, invoiceId };
  } catch (error) {
    handleApiError(error, 'CRM', { orderId });
    throw error;
  }
};

router.use(corsMiddleware);

router.post('/order', async (req, res) => {
  setCorsHeaders(res, req.headers.origin);
  
  const orderData = req.body;
  const orderId = extractOrderId(orderData);
  
  if (!orderData.deliveryAddress) {
    return res.status(400).json({
      success: false,
      message: 'Delivery address is required'
    });
  }
  
  try {
    const payload = buildCrmPayload(orderId, orderData);
    const crmResponse = await sendToCrm(orderId, payload);
    
    if (!crmResponse || !crmResponse.pageUrl) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get payment URL from CRM'
      });
    }
    
    logger.shopify({ action: 'CRM_ORDER_SUCCESS', orderId, invoiceId: crmResponse.invoiceId, pageUrl: crmResponse.pageUrl });
    
    res.json({ 
      success: true, 
      pageUrl: crmResponse.pageUrl,
      invoiceId: crmResponse.invoiceId 
    });
  } catch (error) {
    logger.error('CRM_ORDER_ERROR', error);
    res.status(500).json({
      success: false,
      message: 'Error processing order with CRM service',
      error: error.message
    });
  }
});

// Експортуємо функції для використання в інших модулях
const processOrderToCrm = async (orderData) => {
  const orderId = extractOrderId(orderData);
  
  if (!orderData.deliveryAddress) {
    throw new Error('Delivery address is required');
  }
  
  const payload = buildCrmPayload(orderId, orderData);
  const crmResponse = await sendToCrm(orderId, payload);
  
  if (!crmResponse || !crmResponse.pageUrl) {
    throw new Error('Failed to get payment URL from CRM');
  }
  
  logger.shopify({ action: 'CRM_ORDER_SUCCESS', orderId, invoiceId: crmResponse.invoiceId, pageUrl: crmResponse.pageUrl });
  
  return { 
    success: true, 
    pageUrl: crmResponse.pageUrl,
    invoiceId: crmResponse.invoiceId 
  };
};

module.exports = router;
module.exports.processOrderToCrm = processOrderToCrm;

