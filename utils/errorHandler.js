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
  const errorData = {
    message: error.message,
    status: error.response?.status,
    statusText: error.response?.statusText,
    data: error.response?.data,
    url: error.config?.url,
    method: error.config?.method,
    ...context
  };
  
  logger.error(`${serviceName}_ERROR`, errorData);
  throw error;
};

module.exports = { handleShopifyError, handleApiError };
