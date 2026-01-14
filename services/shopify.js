const axios = require('axios');
const logger = require('../utils/logger');
const { splitFullName } = require('../utils/nameFormatter');

const SHOPIFY_ACCESS_KEY = process.env.SHOPIFY_ACCESS_KEY;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const ORDER_STORAGE_TTL = 30 * 60 * 1000;

function getShopifyApiUrl(shopDomain) {
  const domain = shopDomain.replace(/\.myshopify\.com$/, '');
  return `https://${domain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;
}

function formatAddressLine(deliveryAddress) {
  const { region = '', city = '', warehouseAddress = '', fullAddress = '', warehouseNumber = '' } = deliveryAddress;
  
  if (warehouseAddress) return warehouseAddress;
  
  if (fullAddress) {
    return fullAddress
      .replace(region, '')
      .replace(city, '')
      .trim()
      .replace(/^,\s*|,\s*$/g, '') || '';
  }
  
  return warehouseNumber ? `Відділення Нової Пошти №${warehouseNumber}` : '';
}

function formatShippingAddress(deliveryAddress) {
  if (!deliveryAddress) return null;
  
  const { firstName, lastName } = splitFullName(deliveryAddress.fullName);
  
  return {
    first_name: firstName,
    last_name: lastName,
    phone: deliveryAddress.phone || '',
    address1: formatAddressLine(deliveryAddress),
    city: deliveryAddress.city || '',
    province: deliveryAddress.region || '',
    country: 'UA',
    zip: ''
  };
}

function formatBillingAddress(customer, deliveryAddress) {
  const shippingAddress = formatShippingAddress(deliveryAddress);
  
  if (shippingAddress) return shippingAddress;
  
  const { firstName, lastName } = splitFullName(customer?.fullName);
  
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

function formatCustomer(customer, deliveryAddress) {
  const fullName = deliveryAddress?.fullName || customer?.fullName || '';
  const { firstName, lastName } = splitFullName(fullName);
  
  return {
    first_name: firstName,
    last_name: lastName,
    email: customer?.email || '',
    phone: deliveryAddress?.phone || customer?.phone || ''
  };
}

function getShopifyHeaders() {
  return {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_KEY,
    'Content-Type': 'application/json'
  };
}

function getOrderItems(orderData) {
  return orderData.cart?.items || orderData.line_items || [];
}

function validateOrderData(orderData) {
  if (!SHOPIFY_ACCESS_KEY) {
    throw new Error('SHOPIFY_ACCESS_KEY is not configured');
  }
  
  if (!orderData.shop?.domain) {
    throw new Error('Shop domain is missing');
  }
  
  const items = getOrderItems(orderData);
  if (items.length === 0) {
    throw new Error('No items in order');
  }
}

async function createOrder(orderData) {
  validateOrderData(orderData);
  
  const shopDomain = orderData.shop.domain;
  const apiUrl = getShopifyApiUrl(shopDomain);
  const { cart = {}, customer = {}, deliveryAddress = {} } = orderData;
  const items = getOrderItems(orderData);

  const lineItems = items.map((item, index) => {
    const quantity = parseInt(item.quantity) || 1;
    const variantId = item.variant_id || item.id;
    
    if (!variantId) {
      throw new Error(`Line item ${index + 1} is missing variant_id or id`);
    }
    
    if (quantity <= 0) {
      throw new Error(`Line item ${index + 1} has invalid quantity: ${quantity}`);
    }
    
    logger.shopify({
      action: 'PROCESSING_LINE_ITEM',
      variantId,
      quantity,
      originalQuantity: item.quantity,
      price: item.price
    });
    
    return {
      variant_id: variantId,
      quantity: quantity,
      ...(item.price > 0 && { price: (item.price / 100).toFixed(2) })
    };
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
      currency: orderData.currency || cart.currency || 'UAH',
      tags: 'crm-integration'
    }
  };

  try {
    logger.shopify({
      action: 'CREATE_ORDER_REQUEST',
      shop: shopDomain,
      itemsCount: lineItems.length,
      lineItems: lineItems,
      payload: orderPayload
    });

    const response = await axios.post(`${apiUrl}/orders.json`, orderPayload, {
      headers: getShopifyHeaders(),
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
    const errorDetails = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      shop: shopDomain
    };
    
    logger.error('SHOPIFY_CREATE_ORDER', {
      ...errorDetails,
      originalError: error
    });
    
    throw new Error(
      `Failed to create Shopify order: ${error.message}${error.response?.data?.errors ? ' - ' + JSON.stringify(error.response.data.errors) : ''}`
    );
  }
}

async function updateOrderStatus(shopDomain, orderId, financialStatus) {
  if (!SHOPIFY_ACCESS_KEY) {
    throw new Error('SHOPIFY_ACCESS_KEY is not configured');
  }
  
  if (!shopDomain || !orderId) {
    throw new Error('Shop domain and order ID are required');
  }
  
  const apiUrl = getShopifyApiUrl(shopDomain);

  try {
    logger.shopify({
      action: 'UPDATE_ORDER_STATUS_REQUEST',
      shop: shopDomain,
      orderId: orderId,
      financialStatus: financialStatus
    });

    const response = await axios.put(`${apiUrl}/orders/${orderId}.json`, {
      order: {
        id: orderId,
        financial_status: financialStatus
      }
    }, {
      headers: getShopifyHeaders(),
      timeout: 10000
    });

    const order = response.data?.order;
    
    logger.shopify({
      action: 'UPDATE_ORDER_STATUS_SUCCESS',
      shop: shopDomain,
      orderId: order?.id,
      financialStatus: order?.financial_status
    });

    return order;
  } catch (error) {
    const errorDetails = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      shop: shopDomain,
      orderId: orderId,
      financialStatus: financialStatus
    };
    
    logger.error('SHOPIFY_UPDATE_ORDER_STATUS', {
      ...errorDetails,
      originalError: error
    });
    
    throw new Error(
      `Failed to update order status: ${error.message}${error.response?.data?.errors ? ' - ' + JSON.stringify(error.response.data.errors) : ''}`
    );
  }
}

async function closeOrder(shopDomain, orderId, markAsPaid = true) {
  if (!SHOPIFY_ACCESS_KEY) {
    throw new Error('SHOPIFY_ACCESS_KEY is not configured');
  }
  
  if (!shopDomain || !orderId) {
    throw new Error('Shop domain and order ID are required');
  }
  
  const apiUrl = getShopifyApiUrl(shopDomain);

  try {
    if (markAsPaid) {
      logger.shopify({
        action: 'MARKING_ORDER_AS_PAID_BEFORE_CLOSE',
        shop: shopDomain,
        orderId: orderId
      });
      
      try {
        await updateOrderStatus(shopDomain, orderId, 'paid');
      } catch (updateError) {
        // Якщо не вдалося оновити статус, логуємо але продовжуємо закриття
        // щоб ордер все одно закрився (хоча інвентар може повернутися)
        logger.error('SHOPIFY_UPDATE_STATUS_BEFORE_CLOSE', {
          message: 'Failed to mark order as paid before close, continuing with close anyway',
          error: updateError.message,
          shop: shopDomain,
          orderId: orderId
        });
      }
    }

    logger.shopify({
      action: 'CLOSE_ORDER_REQUEST',
      shop: shopDomain,
      orderId: orderId,
      markAsPaid: markAsPaid
    });

    const response = await axios.post(`${apiUrl}/orders/${orderId}/close.json`, {}, {
      headers: getShopifyHeaders(),
      timeout: 10000
    });

    const order = response.data?.order;
    
    logger.shopify({
      action: 'CLOSE_ORDER_SUCCESS',
      shop: shopDomain,
      orderId: order?.id,
      closed: order?.closed,
      financialStatus: order?.financial_status
    });

    return order;
  } catch (error) {
    const errorDetails = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      shop: shopDomain,
      orderId: orderId
    };
    
    logger.error('SHOPIFY_CLOSE_ORDER', {
      ...errorDetails,
      originalError: error
    });
    
    throw new Error(
      `Failed to close Shopify order: ${error.message}${error.response?.data?.errors ? ' - ' + JSON.stringify(error.response.data.errors) : ''}`
    );
  }
}

module.exports = {
  createOrder,
  closeOrder,
  updateOrderStatus
};

