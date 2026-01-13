const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const shopifyService = require('../services/shopify');

const CRM_API_BASE_URL = process.env.CRM_API_URL || 'https://api.saguaro.com.ua';

const orderStorage = new Map();

router.post('/checkout', async (req, res) => {
  const orderData = req.body;
  
  logger.shopify({
    rawOrderData: orderData,
    headers: req.headers,
    ip: req.ip
  });
  
  if (!orderData.deliveryAddress) {
    const orderId = orderData.id || orderData.order_id || orderData.orderId || orderData.cart?.token || crypto.randomBytes(16).toString('hex');
    orderStorage.set(orderId, orderData);
    
    setTimeout(() => {
      orderStorage.delete(orderId);
    }, 30 * 60 * 1000);
    
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const addressUrl = `${baseUrl}/address?orderId=${orderId}`;
    
    return res.status(200).json({
      success: true,
      redirectUrl: addressUrl,
      addressUrl: addressUrl
    });
  }
  
  logger.address({
    deliveryAddress: orderData.deliveryAddress,
    orderId: orderData.id || orderData.order_id || orderData.orderId || orderData.cart?.token
  });
  
  const orderId = orderData.id || orderData.order_id || orderData.orderId || orderData.cart?.token || '1';
  
  const customerData = orderData.customer || {};
  if (orderData.deliveryAddress?.fullName) {
    customerData.fullName = orderData.deliveryAddress.fullName;
  }
  if (orderData.deliveryAddress?.phone) {
    customerData.phone = orderData.deliveryAddress.phone;
  }

  const crmPayload = {
    id: orderId,
    shop: orderData.shop,
    customer: customerData,
    cart: orderData.cart,
    deliveryAddress: orderData.deliveryAddress,
    metadata: orderData.metadata
  };

  logger.crmRequest({
    url: `${CRM_API_BASE_URL}/webhooks/shopify/orders/${orderId}/invoice`,
    payload: crmPayload
  });

  try {
    const crmUrl = `${CRM_API_BASE_URL}/webhooks/shopify/orders/${orderId}/invoice`;
    
    const crmResponse = await axios.post(crmUrl, crmPayload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    logger.crmResponse({
      status: crmResponse.status,
      statusText: crmResponse.statusText,
      headers: crmResponse.headers,
      data: crmResponse.data
    });
    
    const pageUrl = crmResponse.data?.pageUrl;
    
    if (!pageUrl) {
      logger.error('CRM_RESPONSE', new Error('No pageUrl in CRM response'));
      return res.status(500).json({ 
        success: false,
        message: 'Failed to get payment URL from CRM' 
      });
    }

    try {
      const shopifyOrder = await shopifyService.createOrder(orderData);
      
      if (shopifyOrder && shopifyOrder.id) {
        try {
          await shopifyService.closeOrder(orderData.shop?.domain, shopifyOrder.id);
        } catch (closeError) {
          logger.error('SHOPIFY_CLOSE_ORDER', closeError);
        }
      }
    } catch (shopifyError) {
      logger.error('SHOPIFY_CREATE_ORDER', shopifyError);
    }
    
    res.status(200).json({
      success: true,
      pageUrl: pageUrl
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

