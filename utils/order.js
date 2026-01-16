const crypto = require('crypto');

const extractOrderId = (orderData) =>
  orderData.id || orderData.order_id || orderData.orderId || orderData.cart?.token || crypto.randomBytes(16).toString('hex');

const buildAddressUrl = (req, orderId) => {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
  return `${baseUrl}/address?orderId=${orderId}`;
};

const mergeCustomerData = (customer, deliveryAddress) => ({
  ...customer,
  ...(deliveryAddress?.fullName && { fullName: deliveryAddress.fullName }),
  ...(deliveryAddress?.phone && { phone: deliveryAddress.phone })
});

module.exports = { extractOrderId, buildAddressUrl, mergeCustomerData };
