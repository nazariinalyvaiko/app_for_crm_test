const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const shopifyService = require('../services/shopify');
const { extractOrderId, buildAddressUrl, mergeCustomerData } = require('../utils/order');

const CRM_API_BASE_URL = process.env.CRM_API_URL || 'https://api.saguaro.com.ua';
const ORDER_STORAGE_TTL = 30 * 60 * 1000;

const orderStorage = new Map();

function storeOrder(orderId, orderData) {
  orderStorage.set(orderId, orderData);
  setTimeout(() => orderStorage.delete(orderId), ORDER_STORAGE_TTL);
}

function handleOrderWithoutAddress(req, res, orderData) {
  const orderId = extractOrderId(orderData);
  storeOrder(orderId, orderData);
  
  const addressUrl = buildAddressUrl(req, orderId);
  
  return res.status(200).json({
    success: true,
    redirectUrl: addressUrl,
    addressUrl
  });
}

function buildCrmPayload(orderId, orderData) {
  return {
    id: orderId,
    shop: orderData.shop,
    customer: mergeCustomerData(orderData.customer, orderData.deliveryAddress),
    cart: orderData.cart,
    deliveryAddress: orderData.deliveryAddress,
    metadata: orderData.metadata
  };
}

async function sendToCrm(orderId, crmPayload) {
  const crmUrl = `${CRM_API_BASE_URL}/webhooks/shopify/orders/${orderId}/invoice`;
  
  logger.crmRequest({ url: crmUrl, payload: crmPayload });
  
  const response = await axios.post(crmUrl, crmPayload, {
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
  });
  
  logger.crmResponse({
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    data: response.data
  });
  
  return response.data?.pageUrl;
}

async function createShopifyOrder(orderData) {
  try {
    const shopifyOrder = await shopifyService.createOrder(orderData);
    
    if (shopifyOrder?.id) {
      await shopifyService.closeOrder(orderData.shop?.domain, shopifyOrder.id);
    }
  } catch (error) {
    logger.error('SHOPIFY_ORDER_CREATION', error);
  }
}

router.post('/checkout', async (req, res) => {
  const orderData = req.body;
  
  logger.shopify({
    rawOrderData: orderData,
    headers: req.headers,
    ip: req.ip
  });
  
  if (!orderData.deliveryAddress) {
    return handleOrderWithoutAddress(req, res, orderData);
  }
  
  const orderId = extractOrderId(orderData);
  
  logger.address({
    deliveryAddress: orderData.deliveryAddress,
    orderId
  });
  
  try {
    const crmPayload = buildCrmPayload(orderId, orderData);
    const pageUrl = await sendToCrm(orderId, crmPayload);
    
    if (!pageUrl) {
      logger.error('CRM_RESPONSE', new Error('No pageUrl in CRM response'));
      return res.status(500).json({
        success: false,
        message: 'Failed to get payment URL from CRM'
      });
    }
    
    await createShopifyOrder(orderData);
    
    res.status(200).json({
      success: true,
      pageUrl
    });
  } catch (error) {
    logger.error('CRM_REQUEST', error);
    
    res.status(500).json({
      success: false,
      message: 'Error processing order with CRM service',
      error: error.message
    });
  }
});

router.get('/order/:orderId', (req, res) => {
  const { orderId } = req.params;
  const orderData = orderStorage.get(orderId);
  
  if (!orderData) {
    return res.status(404).json({
      success: false,
      message: 'Order not found or expired'
    });
  }
  
  res.status(200).json({
    success: true,
    orderData: orderData
  });
});

module.exports = router;

