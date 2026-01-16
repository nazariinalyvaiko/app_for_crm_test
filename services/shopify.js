const axios = require('axios');
const logger = require('../utils/logger');
const { splitFullName } = require('../utils/nameFormatter');
const { handleShopifyError } = require('../utils/errorHandler');
const { SHOPIFY_API_VERSION, REQUEST_TIMEOUT } = require('../config/constants');

const SHOPIFY_ACCESS_KEY = process.env.SHOPIFY_ACCESS_KEY;

const validateAccess = () => {
  if (!SHOPIFY_ACCESS_KEY) throw new Error('SHOPIFY_ACCESS_KEY is not configured');
};

const getApiUrl = (shopDomain) => {
  const domain = shopDomain.replace(/\.myshopify\.com$/, '');
  return `https://${domain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;
};

const getHeaders = () => ({
  'X-Shopify-Access-Token': SHOPIFY_ACCESS_KEY,
  'Content-Type': 'application/json'
});

const formatAddress = (deliveryAddress) => {
  if (!deliveryAddress) return null;
  
  const { firstName, lastName } = splitFullName(deliveryAddress.fullName);
  const { region = '', city = '', warehouseAddress = '', fullAddress = '', warehouseNumber = '' } = deliveryAddress;
  
  let address1 = warehouseAddress;
  if (!address1 && fullAddress) {
    address1 = fullAddress.replace(region, '').replace(city, '').trim().replace(/^,\s*|,\s*$/g, '') || '';
  }
  if (!address1 && warehouseNumber) {
    address1 = `Відділення Нової Пошти №${warehouseNumber}`;
  }
  
  return {
    first_name: firstName,
    last_name: lastName,
    phone: deliveryAddress.phone || '',
    address1,
    city: city || '',
    province: region || '',
    country: 'UA',
    zip: ''
  };
};

const formatCustomer = (customer, deliveryAddress) => {
  const fullName = deliveryAddress?.fullName || customer?.fullName || '';
  const { firstName, lastName } = splitFullName(fullName);
  
  return {
    first_name: firstName,
    last_name: lastName,
    email: customer?.email || '',
    phone: deliveryAddress?.phone || customer?.phone || ''
  };
};

const getOrderItems = (orderData) => orderData.cart?.items || orderData.line_items || [];

const buildLineItems = (items) => {
  return items.map((item, index) => {
    const quantity = parseInt(item.quantity) || 1;
    const variantId = item.variant_id || item.id;
    
    if (!variantId) throw new Error(`Line item ${index + 1} is missing variant_id or id`);
    if (quantity <= 0) throw new Error(`Line item ${index + 1} has invalid quantity: ${quantity}`);
    
    return {
      variant_id: variantId,
      quantity,
      ...(item.price > 0 && { price: (item.price / 100).toFixed(2) })
    };
  });
};

async function createOrder(orderData) {
  validateAccess();
  
  if (!orderData.shop?.domain) throw new Error('Shop domain is missing');
  
  const items = getOrderItems(orderData);
  if (items.length === 0) throw new Error('No items in order');
  
  const { shop, customer = {}, deliveryAddress = {}, cart = {}, currency } = orderData;
  const apiUrl = getApiUrl(shop.domain);
  const shippingAddress = formatAddress(deliveryAddress);
  
  const orderPayload = {
    order: {
      line_items: buildLineItems(items),
      customer: formatCustomer(customer, deliveryAddress),
      billing_address: shippingAddress || formatAddress({ fullName: customer?.fullName }),
      shipping_address: shippingAddress,
      financial_status: 'pending',
      fulfillment_status: null,
      note: `Order created via CRM integration. Delivery: ${deliveryAddress.fullAddress || 'N/A'}`,
      currency: currency || cart.currency || 'UAH',
      tags: 'crm-integration'
    }
  };

  try {
    const response = await axios.post(`${apiUrl}/orders.json`, orderPayload, {
      headers: getHeaders(),
      timeout: REQUEST_TIMEOUT.SHOPIFY
    });

    const order = response.data?.order;
    logger.shopify({ action: 'CREATE_ORDER_SUCCESS', shop: shop.domain, orderId: order?.id });
    
    return order;
  } catch (error) {
    throw handleShopifyError(error, { shop: shop.domain, action: 'CREATE_ORDER' });
  }
}

async function updateOrderStatus(shopDomain, orderId, financialStatus) {
  validateAccess();
  if (!shopDomain || !orderId) throw new Error('Shop domain and order ID are required');

  try {
    const response = await axios.put(`${getApiUrl(shopDomain)}/orders/${orderId}.json`, {
      order: { id: orderId, financial_status: financialStatus }
    }, {
      headers: getHeaders(),
      timeout: REQUEST_TIMEOUT.SHOPIFY
    });

    return response.data?.order;
  } catch (error) {
    throw handleShopifyError(error, { shop: shopDomain, orderId, financialStatus, action: 'UPDATE_ORDER_STATUS' });
  }
}

async function closeOrder(shopDomain, orderId, markAsPaid = true) {
  validateAccess();
  if (!shopDomain || !orderId) throw new Error('Shop domain and order ID are required');

  try {
    if (markAsPaid) {
      try {
        await updateOrderStatus(shopDomain, orderId, 'paid');
      } catch (error) {
        logger.error('SHOPIFY_UPDATE_STATUS_BEFORE_CLOSE', error);
      }
    }

    const response = await axios.post(`${getApiUrl(shopDomain)}/orders/${orderId}/close.json`, {}, {
      headers: getHeaders(),
      timeout: REQUEST_TIMEOUT.SHOPIFY
    });

    return response.data?.order;
  } catch (error) {
    throw handleShopifyError(error, { shop: shopDomain, orderId, action: 'CLOSE_ORDER' });
  }
}

module.exports = { createOrder, closeOrder, updateOrderStatus };
