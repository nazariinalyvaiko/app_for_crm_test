const axios = require('axios');

const NOVA_POSHTA_API_URL = 'https://api.novaposhta.ua/v2.0/json/';

const NOVA_POSHTA_API_KEY = process.env.NOVA_POSHTA_API_KEY || '';

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

async function findLocationRef(location) {
  try {
    const response = await axios.post(NOVA_POSHTA_API_URL, {
      apiKey: NOVA_POSHTA_API_KEY,
      modelName: 'Address',
      calledMethod: 'getCities',
      methodProperties: {
        FindByString: location,
        Limit: 5
      }
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
      return response.data.data[0].Ref;
    }
    return null;
  } catch (error) {
    console.error('Error finding location Ref:', error.message);
    return null;
  }
}

async function getWarehouses(location, cityRef = null) {
  try {
    const requestBody = cityRef ? {
      apiKey: NOVA_POSHTA_API_KEY,
      modelName: 'Address',
      calledMethod: 'getWarehouses',
      methodProperties: {
        CityRef: cityRef,
        Limit: 500
      }
    } : {
      apiKey: NOVA_POSHTA_API_KEY,
      modelName: 'Address',
      calledMethod: 'getWarehouses',
      methodProperties: {
        CityName: location,
        Limit: 500
      }
    };
    
    const response = await axios.post(NOVA_POSHTA_API_URL, requestBody, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: function (status) {
        return status < 500;
      }
    });
    
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Invalid response format from Nova Poshta API');
    }
    
    if (response.data) {
      if (response.data.success && response.data.data && Array.isArray(response.data.data)) {
        return response.data.data.map(warehouse => ({
          number: warehouse.Number || warehouse.number || '',
          address: warehouse.ShortAddress || warehouse.Description || warehouse.description || '',
          description: warehouse.Description || warehouse.description || ''
        })).filter(w => w.number && w.address);
      } else if (response.data.errors && response.data.errors.length > 0) {
        throw new Error(response.data.errors[0] || 'API returned errors');
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error getting warehouses:', error.message);
    throw error;
  }
}

async function searchWarehouses(location) {
  const cacheKey = location.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return {
      success: true,
      warehouses: cached.warehouses
    };
  }
  
  try {
    const cityRef = await findLocationRef(location);
    const warehouses = await getWarehouses(location, cityRef);
    
    cache.set(cacheKey, {
      warehouses: warehouses,
      timestamp: Date.now()
    });
    
    return {
      success: true,
      warehouses: warehouses
    };
  } catch (error) {
    console.error('Error searching warehouses:', error.message);
    
    if (error.message.includes('many requests') && cached) {
      return {
        success: true,
        warehouses: cached.warehouses
      };
    }
    
    return {
      success: false,
      warehouses: [],
      message: error.message || 'Error fetching warehouses from Nova Poshta'
    };
  }
}

async function findAreaRef(regionName) {
  try {
    const response = await axios.post(NOVA_POSHTA_API_URL, {
      apiKey: NOVA_POSHTA_API_KEY,
      modelName: 'Address',
      calledMethod: 'getAreas',
      methodProperties: {}
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.success && response.data.data && Array.isArray(response.data.data)) {
      const area = response.data.data.find(a => {
        const areaName = (a.Description || a.description || '').toLowerCase();
        const searchName = regionName.toLowerCase();
        return areaName.includes(searchName) || searchName.includes(areaName);
      });
      
      if (area) {
        return area.Ref || area.ref || null;
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding area Ref:', error.message);
    return null;
  }
}

async function searchCities(query, region = null) {
  const cacheKey = `cities_${query.toLowerCase().trim()}_${region || 'all'}`;
  const cached = cache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return {
      success: true,
      cities: cached.cities
    };
  }

  try {
    let areaRef = null;

    if (region) {
      areaRef = await findAreaRef(region);
    }
    
    const requestBody = {
      apiKey: NOVA_POSHTA_API_KEY,
      modelName: 'Address',
      calledMethod: 'getCities',
      methodProperties: {
        FindByString: query,
        Limit: 50
      }
    };
    
    if (areaRef) {
      requestBody.methodProperties.AreaRef = areaRef;
    }
    
    const response = await axios.post(NOVA_POSHTA_API_URL, requestBody, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.success && response.data.data && Array.isArray(response.data.data)) {
      let cities = response.data.data.map(city => ({
        name: city.Description || city.description || '',
        ref: city.Ref || city.ref || '',
        area: city.AreaDescription || city.areaDescription || ''
      })).filter(c => c.name);
      
      if (region && !areaRef) {
        const regionLower = region.toLowerCase();
        cities = cities.filter(city => {
          const cityArea = (city.area || '').toLowerCase();
          return cityArea.includes(regionLower) || regionLower.includes(cityArea);
        });
      }
      
      cache.set(cacheKey, {
        cities: cities,
        timestamp: Date.now()
      });
      
      return {
        success: true,
        cities: cities
      };
    }

    return {
      success: true,
      cities: []
    };
  } catch (error) {
    console.error('Error searching cities:', error.message);

    if (error.message.includes('many requests') && cached) {
      return {
        success: true,
        cities: cached.cities
      };
    }
    
    return {
      success: false,
      cities: [],
      message: error.message || 'Error searching cities'
    };
  }
}

module.exports = {
  searchWarehouses,
  searchCities,
  findLocationRef,
  findAreaRef,
  getWarehouses
};
