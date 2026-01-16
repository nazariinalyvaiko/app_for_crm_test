module.exports = {
  ORDER_STORAGE_TTL: 30 * 60 * 1000, // 30 хвилин
  CRM_API_BASE_URL: process.env.CRM_API_URL || 'https://api.saguaro.com.ua',
  SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION || '2024-01',
  NOVA_POSHTA_CACHE_TTL: 60 * 60 * 1000, // 1 година
  REQUEST_TIMEOUT: {
    SHOPIFY: 15000,
    CRM: 10000,
    NOVA_POSHTA: 5000
  }
};

