const express = require('express');
const router = express.Router();
const { searchWarehouses, searchCities } = require('../services/nova-poshta');
const { corsMiddleware, setCorsHeaders } = require('../middleware/cors');
const logger = require('../utils/logger');

router.use(corsMiddleware);

router.get('/warehouses', async (req, res) => {
  setCorsHeaders(res, req.headers.origin);
  
  const location = req.query.location || req.query.city;
  if (!location) {
    return res.status(400).json({ success: false, message: 'Location parameter is required' });
  }
  
  try {
    return res.json(await searchWarehouses(location));
  } catch (error) {
    logger.error('NOVA_POSHTA_WAREHOUSES_ROUTE', error);
    return res.status(500).json({
      success: false,
      warehouses: [],
      message: error.message || 'Error fetching warehouses from Nova Poshta'
    });
  }
});

router.get('/cities', async (req, res) => {
  setCorsHeaders(res, req.headers.origin);
  
  const { query, region } = req.query;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Query parameter is required (min 2 characters)' });
  }
  
  try {
    return res.json(await searchCities(query, region || null));
  } catch (error) {
    logger.error('NOVA_POSHTA_CITIES_ROUTE', error);
    return res.status(500).json({
      success: false,
      cities: [],
      message: error.message || 'Error searching cities'
    });
  }
});

module.exports = router;
