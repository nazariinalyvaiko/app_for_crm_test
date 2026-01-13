const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const shopifyService = require('../services/shopify');
const { extractOrderId, buildAddressUrl, mergeCustomerData } = require('../utils/order');
const { corsMiddleware, setCorsHeaders } = require('../middleware/cors');

const CRM_API_BASE_URL = process.env.CRM_API_URL || 'https://api.saguaro.com.ua';
const ORDER_STORAGE_TTL = 30 * 60 * 1000;

const orderStorage = new Map();

function storeOrder(orderId, orderData) {
  orderStorage.set(orderId, orderData);
  setTimeout(() => orderStorage.delete(orderId), ORDER_STORAGE_TTL);
}

function handleOrderWithoutAddress(req, res, orderData) {
  const orderId = extractOrderId(orderData);
  
  logger.shopify({
    action: 'STORING_ORDER_WITHOUT_ADDRESS',
    orderId,
    orderDataKeys: Object.keys(orderData),
    cartItemsCount: orderData.cart?.items?.length || 0,
    cartItems: orderData.cart?.items || [],
    fullOrderData: orderData
  });
  
  storeOrder(orderId, orderData);
  
  const addressUrl = buildAddressUrl(req, orderId);
  
  return res.status(200).json({
    success: true,
    redirectUrl: addressUrl,
    addressUrl
  });
}

function buildCrmPayload(orderId, orderData) {
  const deliveryAddress = { ...orderData.deliveryAddress };
  delete deliveryAddress.fullName;
  delete deliveryAddress.phone;
  
  return {
    ...orderData,
    id: orderId,
    customer: mergeCustomerData(orderData.customer, orderData.deliveryAddress),
    deliveryAddress: deliveryAddress
  };
}

async function sendToCrm(orderId, crmPayload) {
  const crmUrl = `${CRM_API_BASE_URL}/webhooks/shopify/orders/${orderId}/invoice`;
  
  
  try {
    const response = await axios.post(crmUrl, crmPayload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    const fullResponseJson = JSON.stringify(response.data, null, 2);
    console.log('=== FULL JSON FROM CRM ===');
    console.log(fullResponseJson);
    
    logger.crmResponse({
      fullJsonFromCrm: fullResponseJson
    });
    
    return response.data?.pageUrl;
  } catch (error) {
    console.error('=== CRM REQUEST ERROR ===');
    console.error('Error:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);
    throw error;
  }
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

router.use(corsMiddleware);

router.post('/checkout', async (req, res) => {
  console.log('=== CHECKOUT REQUEST START ===');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body keys:', Object.keys(req.body || {}));
  
  setCorsHeaders(res, req.headers.origin);
  
  const orderData = req.body;
  const orderId = extractOrderId(orderData);
  
  console.log('Extracted orderId:', orderId);
  console.log('Order data structure:');
  console.log('  - orderData.cart?.items:', orderData.cart?.items?.length || 0, 'items');
  console.log('  - orderData.line_items:', orderData.line_items?.length || 0, 'items');
  console.log('  - orderData.items:', orderData.items?.length || 0, 'items');
  
  const fullOrderDataJson = JSON.stringify(orderData, null, 2);
  console.log('=== FULL JSON FROM SHOPIFY ===');
  console.log(fullOrderDataJson);
  
  logger.shopify({
    fullJsonFromShopify: fullOrderDataJson
  });
  
  if (!orderData.deliveryAddress) {
    return handleOrderWithoutAddress(req, res, orderData);
  }
  
  try {
    const crmPayload = buildCrmPayload(orderId, orderData);
    
    const fullCrmPayloadJson = JSON.stringify(crmPayload, null, 2);
    console.log('=== FULL JSON TO CRM ===');
    console.log(fullCrmPayloadJson);
    
    logger.crmRequest({
      fullJsonToCrm: fullCrmPayloadJson
    });
    
    const pageUrl = await sendToCrm(orderId, crmPayload);
    
    if (!pageUrl) {
      logger.error('CRM_RESPONSE', new Error('No pageUrl in CRM response'));
      return res.status(500).json({
        success: false,
        message: 'Failed to get payment URL from CRM'
      });
    }
    
    logger.shopify({
      action: 'CREATING_SHOPIFY_ORDER',
      orderId,
      pageUrl
    });
    
    await createShopifyOrder(orderData);
    
    logger.shopify({
      action: 'SUCCESS',
      orderId,
      pageUrl,
      message: 'Order processed successfully, redirecting to payment'
    });
    
    res.status(200).json({
      success: true,
      pageUrl
    });
  } catch (error) {
    console.error('=== CHECKOUT ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    
    logger.error('CRM_REQUEST', error);
    
    logger.shopify({
      action: 'ERROR',
      orderId,
      error: error.message,
      errorStack: error.stack,
      errorResponse: error.response?.data,
      errorStatus: error.response?.status
    });
    
    res.status(500).json({
      success: false,
      message: 'Error processing order with CRM service',
      error: error.message
    });
  }
  
  console.log('=== CHECKOUT REQUEST END ===');
});

router.get('/order/:orderId', (req, res) => {
  setCorsHeaders(res, req.headers.origin);
  
  const { orderId } = req.params;
  const orderData = orderStorage.get(orderId);
  
  if (!orderData) {
    return res.status(404).json({
      success: false,
      message: 'Order not found or expired'
    });
  }
  
  logger.shopify({
    action: 'RETRIEVING_STORED_ORDER',
    orderId,
    orderDataKeys: Object.keys(orderData),
    cartItemsCount: orderData.cart?.items?.length || 0,
    cartItems: orderData.cart?.items || [],
    hasCart: !!orderData.cart
  });
  
  res.status(200).json({
    success: true,
    orderData
  });
});

module.exports = router;

