const logger = require('./logger');

const handleShopifyError = (error, context = {}) => {
  logger.error('SHOPIFY_ERROR', {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
    ...context,
    originalError: error
  });
  
  const errorMessage = error.response?.data?.errors
    ? `${error.message} - ${JSON.stringify(error.response.data.errors)}`
    : error.message;
  
  const newError = new Error(`Failed to ${context.action || 'process Shopify request'}: ${errorMessage}`);
  newError.status = error.response?.status || 500;
  return newError;
};

const handleApiError = (error, serviceName, context = {}) => {
  logger.error(`${serviceName}_ERROR`, {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
    ...context,
    originalError: error
  });
  throw error;
};

module.exports = { handleShopifyError, handleApiError };
