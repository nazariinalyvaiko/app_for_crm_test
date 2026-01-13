const crypto = require('crypto');

function extractOrderId(orderData) {
  return orderData.id 
    || orderData.order_id 
    || orderData.orderId 
    || orderData.cart?.token 
    || crypto.randomBytes(16).toString('hex');
}

function buildAddressUrl(req, orderId) {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
  return `${baseUrl}/address?orderId=${orderId}`;
}

function mergeCustomerData(customer, deliveryAddress) {
  const merged = { ...customer };
  
  if (deliveryAddress?.fullName) {
    merged.fullName = deliveryAddress.fullName;
  }
  
  if (deliveryAddress?.phone) {
    merged.phone = deliveryAddress.phone;
  }
  
  return merged;
}

module.exports = {
  extractOrderId,
  buildAddressUrl,
  mergeCustomerData
};

