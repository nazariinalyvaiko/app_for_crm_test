const express = require('express');
const router = express.Router();
const { searchWarehouses, searchCities } = require('../services/nova-poshta');

router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

router.get('/warehouses', async (req, res) => {
  const location = req.query.location || req.query.city;
  
  if (!location) {
    return res.status(400).json({ 
      success: false, 
      message: 'Location parameter is required' 
    });
  }
  
  try {
    const result = await searchWarehouses(location);
    return res.json(result);
  } catch (error) {
    console.error('Nova Poshta API error:', error.message);
    return res.status(500).json({
      success: false,
      warehouses: [],
      message: error.message || 'Error fetching warehouses from Nova Poshta'
    });
  }
});

router.get('/cities', async (req, res) => {
  const query = req.query.query;
  const region = req.query.region || null;
  
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ 
      success: false, 
      message: 'Query parameter is required (min 2 characters)' 
    });
  }
  
  try {
    const result = await searchCities(query, region);
    return res.json(result);
  } catch (error) {
    console.error('Nova Poshta API error:', error.message);
    return res.status(500).json({
      success: false,
      cities: [],
      message: error.message || 'Error searching cities'
    });
  }
});

module.exports = router;

