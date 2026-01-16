const axios = require('axios');
const logger = require('../utils/logger');
const { NOVA_POSHTA_CACHE_TTL, REQUEST_TIMEOUT } = require('../config/constants');

const API_URL = 'https://api.novaposhta.ua/v2.0/json/';
const API_KEY = process.env.NOVA_POSHTA_API_KEY || '';
const cache = new Map();

const apiRequest = async (method, properties, timeout = REQUEST_TIMEOUT.NOVA_POSHTA) => {
  const response = await axios.post(API_URL, {
    apiKey: API_KEY,
    modelName: 'Address',
    calledMethod: method,
    methodProperties: properties
  }, { timeout, headers: { 'Content-Type': 'application/json' } });
  
  return response.data;
};

const getCached = (key) => {
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.timestamp) < NOVA_POSHTA_CACHE_TTL) {
    return cached.data;
  }
  return null;
};

const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

async function findLocationRef(location) {
  try {
    const data = await apiRequest('getCities', { FindByString: location, Limit: 5 });
    return data?.success && data?.data?.length > 0 ? data.data[0].Ref : null;
  } catch (error) {
    logger.error('NOVA_POSHTA_FIND_LOCATION', error);
    return null;
  }
}

async function getWarehouses(location, cityRef = null) {
  try {
    const data = await apiRequest(
      'getWarehouses',
      cityRef ? { CityRef: cityRef, Limit: 500 } : { CityName: location, Limit: 500 },
      REQUEST_TIMEOUT.NOVA_POSHTA * 2
    );
    
    if (data?.success && Array.isArray(data.data)) {
      return data.data
        .map(w => ({
          number: w.Number || w.number || '',
          address: w.ShortAddress || w.Description || w.description || '',
          description: w.Description || w.description || ''
        }))
        .filter(w => w.number && w.address);
    }
    
    if (data?.errors?.length > 0) {
      throw new Error(data.errors[0]);
    }
    
    return [];
  } catch (error) {
    logger.error('NOVA_POSHTA_GET_WAREHOUSES', error);
    throw error;
  }
}

async function searchWarehouses(location) {
  const cacheKey = location.toLowerCase().trim();
  const cached = getCached(cacheKey);
  if (cached) return { success: true, warehouses: cached };
  
  try {
    const cityRef = await findLocationRef(location);
    const warehouses = await getWarehouses(location, cityRef);
    setCache(cacheKey, warehouses);
    return { success: true, warehouses };
  } catch (error) {
    logger.error('NOVA_POSHTA_SEARCH_WAREHOUSES', error);
    
    const cached = getCached(cacheKey);
    if (error.message.includes('many requests') && cached) {
      return { success: true, warehouses: cached };
    }
    
    return { success: false, warehouses: [], message: error.message };
  }
}

async function findAreaRef(regionName) {
  try {
    const data = await apiRequest('getAreas', {});
    if (data?.success && Array.isArray(data.data)) {
      const area = data.data.find(a => {
        const areaName = (a.Description || '').toLowerCase();
        return areaName.includes(regionName.toLowerCase()) || regionName.toLowerCase().includes(areaName);
      });
      return area?.Ref || null;
    }
    return null;
  } catch (error) {
    logger.error('NOVA_POSHTA_FIND_AREA', error);
    return null;
  }
}

async function searchCities(query, region = null) {
  const cacheKey = `cities_${query.toLowerCase().trim()}_${region || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, cities: cached };
  
  try {
    const areaRef = region ? await findAreaRef(region) : null;
    const methodProperties = { FindByString: query, Limit: 50 };
    if (areaRef) methodProperties.AreaRef = areaRef;
    
    const data = await apiRequest('getCities', methodProperties);
    
    if (data?.success && Array.isArray(data.data)) {
      let cities = data.data
        .map(c => ({
          name: c.Description || '',
          ref: c.Ref || '',
          area: c.AreaDescription || ''
        }))
        .filter(c => c.name);
      
      if (region && !areaRef) {
        const regionLower = region.toLowerCase();
        cities = cities.filter(c => {
          const area = (c.area || '').toLowerCase();
          return area.includes(regionLower) || regionLower.includes(area);
        });
      }
      
      setCache(cacheKey, cities);
      return { success: true, cities };
    }
    
    return { success: true, cities: [] };
  } catch (error) {
    logger.error('NOVA_POSHTA_SEARCH_CITIES', error);
    
    const cached = getCached(cacheKey);
    if (error.message.includes('many requests') && cached) {
      return { success: true, cities: cached };
    }
    
    return { success: false, cities: [], message: error.message };
  }
}

module.exports = { searchWarehouses, searchCities };
