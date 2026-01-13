const axios = require('axios');
const logger = require('../utils/logger');

const SHOPIFY_ACCESS_KEY = process.env.SHOPIFY_ACCESS_KEY;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

function getShopifyApiUrl(shopDomain) {
  const domain = shopDomain.replace(/\.myshopify\.com$/, '');
  return `https://${domain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;
}

function formatShippingAddress(deliveryAddress) {
  if (!deliveryAddress) return null;
  
  const fullName = deliveryAddress.fullName || '';
  const nameParts = fullName.split(' ').filter(p => p);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  const region = deliveryAddress.region || '';
  const city = deliveryAddress.city || '';
  const warehouseAddress = deliveryAddress.warehouseAddress || '';
  const address1 = warehouseAddress || `${deliveryAddress.fullAddress || ''}`.replace(region, '').replace(city, '').trim().replace(/^,\s*|,\s*$/g, '') || '';
  
  return {
    first_name: firstName,
    last_name: lastName,
    phone: deliveryAddress.phone || '',
    address1: address1 || `Відділення Нової Пошти №${deliveryAddress.warehouseNumber || ''}`,
    city: city,
    province: region,
    country: 'UA',
    zip: ''
  };
}

function formatBillingAddress(customer, deliveryAddress) {
  const address = formatShippingAddress(deliveryAddress);
  if (!address) {
    const fullName = customer?.fullName || '';
    const nameParts = fullName.split(' ').filter(p => p);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    return {
      first_name: firstName,
      last_name: lastName,
      phone: customer?.phone || '',
      address1: '',
      city: '',
      province: '',
      country: 'UA',
      zip: ''
    };
  }
  return address;
}

function formatCustomer(customer, deliveryAddress) {
  const fullName = deliveryAddress?.fullName || customer?.fullName || '';
  const nameParts = fullName.split(' ').filter(p => p);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  return {
    first_name: firstName,
    last_name: lastName,
    email: customer?.email || '',
    phone: deliveryAddress?.phone || customer?.phone || ''
  };
}

async function createOrder(orderData) {
  if (!SHOPIFY_ACCESS_KEY) {
    throw new Error('SHOPIFY_ACCESS_KEY is not configured');
  }

  const shopDomain = orderData.shop?.domain;
  if (!shopDomain) {
    throw new Error('Shop domain is missing');
  }

  const apiUrl = getShopifyApiUrl(shopDomain);
  const cart = orderData.cart || {};
  const items = cart.items || [];
  const customer = orderData.customer || {};
  const deliveryAddress = orderData.deliveryAddress || {};

  if (!items || items.length === 0) {
    throw new Error('No items in cart');
  }

  const lineItems = items.map(item => {
    const lineItem = {
      variant_id: item.variant_id || item.id,
      quantity: item.quantity || 1
    };
    
    if (item.price && item.price > 0) {
      lineItem.price = (item.price / 100).toFixed(2);
    }
    
    return lineItem;
  });

  const orderPayload = {
    order: {
      line_items: lineItems,
      customer: formatCustomer(customer, deliveryAddress),
      billing_address: formatBillingAddress(customer, deliveryAddress),
      shipping_address: formatShippingAddress(deliveryAddress),
      financial_status: 'pending',
      fulfillment_status: null,
      note: `Order created via CRM integration. Delivery: ${deliveryAddress.fullAddress || 'N/A'}`,
      currency: cart.currency || 'UAH',
      tags: 'crm-integration'
    }
  };

  try {
    logger.shopify({
      action: 'CREATE_ORDER_REQUEST',
      shop: shopDomain,
      payload: orderPayload
    });

    const response = await axios.post(`${apiUrl}/orders.json`, orderPayload, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const order = response.data?.order;
    
    logger.shopify({
      action: 'CREATE_ORDER_SUCCESS',
      shop: shopDomain,
      orderId: order?.id,
      orderNumber: order?.order_number,
      name: order?.name
    });

    return order;
  } catch (error) {
    logger.error('SHOPIFY_CREATE_ORDER', error);
    throw error;
  }
}

async function closeOrder(shopDomain, orderId) {
  if (!SHOPIFY_ACCESS_KEY) {
    throw new Error('SHOPIFY_ACCESS_KEY is not configured');
  }

  if (!shopDomain || !orderId) {
    throw new Error('Shop domain and order ID are required');
  }

  const apiUrl = getShopifyApiUrl(shopDomain);

  try {
    logger.shopify({
      action: 'CLOSE_ORDER_REQUEST',
      shop: shopDomain,
      orderId: orderId
    });

    const response = await axios.post(`${apiUrl}/orders/${orderId}/close.json`, {}, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const order = response.data?.order;
    
    logger.shopify({
      action: 'CLOSE_ORDER_SUCCESS',
      shop: shopDomain,
      orderId: order?.id,
      closed: order?.closed
    });

    return order;
  } catch (error) {
    logger.error('SHOPIFY_CLOSE_ORDER', error);
    throw error;
  }
}

module.exports = {
  createOrder,
  closeOrder
};

