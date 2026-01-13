const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const shopifyService = require('../services/shopify');
const { extractOrderId, buildAddressUrl, mergeCustomerData } = require('../utils/order');

const CRM_API_BASE_URL = process.env.CRM_API_URL || 'https://api.saguaro.com.ua';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://barefoot-9610.myshopify.com';
const ORDER_STORAGE_TTL = 30 * 60 * 1000;

const orderStorage = new Map();

function getCorsOrigin(origin) {
  if (!origin) return ALLOWED_ORIGIN;
  const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  const normalizedAllowed = ALLOWED_ORIGIN.endsWith('/') ? ALLOWED_ORIGIN.slice(0, -1) : ALLOWED_ORIGIN;
  
  if (normalizedOrigin.startsWith(normalizedAllowed) || origin.startsWith(ALLOWED_ORIGIN)) {
    return origin;
  }
  
  return ALLOWED_ORIGIN;
}

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

function getFallbackUrl(orderData) {
  if (orderData.metadata?.return_url) {
    return orderData.metadata.return_url;
  }
  
  if (orderData.shop?.domain) {
    const domain = orderData.shop.domain.replace(/\.myshopify\.com$/, '');
    return `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1`;
  }
  
  return ALLOWED_ORIGIN;
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

router.options('/checkout', (req, res) => {
  const origin = getCorsOrigin(req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).json({});
});

router.post('/checkout', async (req, res) => {
  const origin = getCorsOrigin(req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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
    let pageUrl;
    
    try {
      pageUrl = await sendToCrm(orderId, crmPayload);
    } catch (crmError) {
      logger.error('CRM_REQUEST', crmError);
      logger.shopify({
        action: 'CRM_FALLBACK',
        message: 'CRM request failed, using fallback URL',
        error: crmError.message,
        orderId
      });
    }
    
    if (!pageUrl) {
      const fallbackUrl = getFallbackUrl(orderData);
      logger.shopify({
        action: 'CRM_FALLBACK',
        message: 'No pageUrl from CRM, using fallback URL',
        fallbackUrl,
        orderId
      });
      pageUrl = fallbackUrl;
    }
    
    await createShopifyOrder(orderData);
    
    res.status(200).json({
      success: true,
      pageUrl
    });
  } catch (error) {
    logger.error('CHECKOUT_ERROR', error);
    
    const fallbackUrl = getFallbackUrl(orderData);
    logger.shopify({
      action: 'ERROR_FALLBACK',
      message: 'Checkout error, using fallback URL',
      fallbackUrl,
      error: error.message,
      orderId
    });
    
    res.status(200).json({
      success: true,
      pageUrl: fallbackUrl
    });
  }
});

router.options('/order/:orderId', (req, res) => {
  const origin = getCorsOrigin(req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

router.get('/order/:orderId', (req, res) => {
  const origin = getCorsOrigin(req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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

