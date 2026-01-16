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
  
  const shopifyOrderId = orderData.shopifyOrderId || orderData.shopify?.orderId || orderData.id;
  
  const payload = {
    ...rest,
    id: orderId,
    customer: mergeCustomerData(orderData.customer, deliveryAddress),
    deliveryAddress: address
  };
  if (shopifyOrderId) {
    payload.shopifyOrderId = shopifyOrderId;
  }
  
  return payload;
};

const sendOrderToCrm = async (payload) => {
  try {
    logger.shopify({ action: 'SENDING_ORDER_TO_CRM', payload: JSON.stringify(payload, null, 2) });
    
    const response = await axios.post(
      `${CRM_API_BASE_URL}/webhooks/shopify/orders`,
      payload,
      { timeout: REQUEST_TIMEOUT.CRM, headers: { 'Content-Type': 'application/json' } }
    );
    
    logger.crmResponse({ action: 'SEND_ORDER_TO_CRM_SUCCESS', response: response.data });
    return response.data;
  } catch (error) {
    const errorDetails = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      payload: payload
    };
    logger.error('CRM_SEND_ORDER_ERROR', errorDetails);
    handleApiError(error, 'CRM', { action: 'SEND_ORDER_TO_CRM', payload });
    throw error;
  }
};

const getInvoiceLink = async (shopifyOrderId) => {
  try {
    const response = await axios.get(
      `${CRM_API_BASE_URL}/webhooks/shopify/orders/${shopifyOrderId}/invoice`,
      { timeout: REQUEST_TIMEOUT.CRM, headers: { 'Content-Type': 'application/json' } }
    );
    
    const { pageUrl, invoiceId } = response.data || {};
    logger.crmResponse({ shopifyOrderId, invoiceId, pageUrl });
    
    if (!pageUrl) {
      throw new Error('CRM response missing pageUrl');
    }
    
    return { pageUrl, invoiceId };
  } catch (error) {
    handleApiError(error, 'CRM', { shopifyOrderId });
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
    await sendOrderToCrm(payload);

    const shopifyOrderId = orderData.shopifyOrderId || orderData.shopify?.orderId || orderData.id;
    
    if (!shopifyOrderId) {
      return res.status(400).json({
        success: false,
        message: 'shopifyOrderId is required to get payment link'
      });
    }
    
    const invoiceResponse = await getInvoiceLink(shopifyOrderId);
    
    if (!invoiceResponse || !invoiceResponse.pageUrl) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get payment URL from CRM'
      });
    }
    
    logger.shopify({ action: 'CRM_ORDER_SUCCESS', orderId, shopifyOrderId, invoiceId: invoiceResponse.invoiceId, pageUrl: invoiceResponse.pageUrl });
    
    res.json({ 
      success: true, 
      pageUrl: invoiceResponse.pageUrl,
      invoiceId: invoiceResponse.invoiceId 
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

const processOrderToCrm = async (orderData) => {
  const orderId = extractOrderId(orderData);
  
  if (!orderData.deliveryAddress) {
    throw new Error('Delivery address is required');
  }
  
  const payload = buildCrmPayload(orderId, orderData);
  await sendOrderToCrm(payload);
  
  const shopifyOrderId = orderData.shopifyOrderId || orderData.shopify?.orderId || orderData.id;
  
  if (!shopifyOrderId) {
    throw new Error('shopifyOrderId is required to get payment link');
  }
  
  const invoiceResponse = await getInvoiceLink(shopifyOrderId);
  
  if (!invoiceResponse || !invoiceResponse.pageUrl) {
    throw new Error('Failed to get payment URL from CRM');
  }
  
  logger.shopify({ action: 'CRM_ORDER_SUCCESS', orderId, shopifyOrderId, invoiceId: invoiceResponse.invoiceId, pageUrl: invoiceResponse.pageUrl });
  
  return { 
    success: true, 
    pageUrl: invoiceResponse.pageUrl,
    invoiceId: invoiceResponse.invoiceId 
  };
};

module.exports = router;
module.exports.processOrderToCrm = processOrderToCrm;

