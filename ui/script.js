const form = document.getElementById('addressForm');
const submitBtn = document.getElementById('submitBtn');
const loading = document.getElementById('loading');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const regionSelect = document.getElementById('region');
const cityInput = document.getElementById('city');
const citySuggestionsDiv = document.getElementById('citySuggestions');
const warehouseSelect = document.getElementById('warehouse');
const errorNotification = document.getElementById('errorNotification');
const errorText = document.getElementById('errorText');

const warehousesCache = new Map();
const citiesCache = new Map();
let isLoadingWarehouses = false;
let citySearchTimeout = null;
let selectedCity = null;

const regions = [
    'Вінницька', 'Волинська', 'Дніпропетровська', 'Донецька', 'Житомирська',
    'Закарпатська', 'Запорізька', 'Івано-Франківська', 'Київська', 'Кіровоградська',
    'Луганська', 'Львівська', 'Миколаївська', 'Одеська', 'Полтавська',
    'Рівненська', 'Сумська', 'Тернопільська', 'Харківська', 'Херсонська',
    'Хмельницька', 'Черкаська', 'Чернівецька', 'Чернігівська', 'м. Київ'
].sort();

regions.forEach(region => {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = region;
    regionSelect.appendChild(option);
});

regionSelect.addEventListener('change', (e) => {
    const selectedRegion = e.target.value;
    cityInput.value = '';
    cityInput.disabled = !selectedRegion;
    citySuggestionsDiv.innerHTML = '';
    warehouseSelect.innerHTML = '<option value="">Спочатку оберіть населений пункт</option>';
    warehouseSelect.disabled = true;
    selectedCity = null;
    
    clearError('regionError');
    clearError('cityError');
    clearError('warehouseError');
});

cityInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearError('cityError');
    selectedCity = null;
    citySuggestionsDiv.innerHTML = '';
    
    if (query.length < 2) {
        return;
    }
    
    if (!regionSelect.value) {
        citySuggestionsDiv.innerHTML = '<div class="suggestion-item">Спочатку оберіть область</div>';
        return;
    }
    
    clearTimeout(citySearchTimeout);
    citySearchTimeout = setTimeout(() => {
        searchCities(query);
    }, 500);
});

async function searchCities(query) {
    const selectedRegion = regionSelect.value;
    
    if (!selectedRegion) {
        citySuggestionsDiv.innerHTML = '<div class="suggestion-item">Спочатку оберіть область</div>';
        return;
    }
    
    try {
        const url = `/api/nova-poshta/cities?query=${encodeURIComponent(query)}&region=${encodeURIComponent(selectedRegion)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.cities && data.cities.length > 0) {
            const suggestions = data.cities.slice(0, 10);
            citySuggestionsDiv.innerHTML = suggestions.map(city => {
                return `<div class="suggestion-item" data-city="${city.name}">${city.name}</div>`;
            }).join('');
            
            citySuggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    const cityName = item.dataset.city;
                    cityInput.value = cityName;
                    selectedCity = cityName;
                    citySuggestionsDiv.innerHTML = '';
                    loadWarehouses(cityName);
                });
            });
        } else {
            citySuggestionsDiv.innerHTML = '<div class="suggestion-item">Населений пункт не знайдено</div>';
        }
    } catch (error) {
        console.error('Error searching cities:', error);
        citySuggestionsDiv.innerHTML = '<div class="suggestion-item">Помилка пошуку</div>';
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#city') && !e.target.closest('#citySuggestions')) {
        citySuggestionsDiv.innerHTML = '';
    }
});

async function loadWarehouses(city) {
    if (!city || city.trim().length === 0) {
        warehouseSelect.innerHTML = '<option value="">Спочатку оберіть населений пункт</option>';
        warehouseSelect.disabled = true;
        return;
    }
    
    warehouseSelect.innerHTML = '<option value="">Завантаження...</option>';
    warehouseSelect.disabled = true;
    
    const cacheKey = city;
    if (warehousesCache.has(cacheKey)) {
        const cached = warehousesCache.get(cacheKey);
        populateWarehouses(cached);
        return;
    }
    
    if (isLoadingWarehouses) {
        return;
    }
    
    isLoadingWarehouses = true;
    
    try {
        const response = await fetch(`/api/nova-poshta/warehouses?location=${encodeURIComponent(city)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response');
        }
        
        const data = await response.json();
        
        if (data.success && data.warehouses && data.warehouses.length > 0) {
            warehousesCache.set(cacheKey, data.warehouses);
            populateWarehouses(data.warehouses);
        } else {
            warehouseSelect.innerHTML = '<option value="">Відділення не знайдено</option>';
        }
    } catch (error) {
        console.error('Error loading warehouses:', error);
        warehouseSelect.innerHTML = '<option value="">Помилка завантаження</option>';
    } finally {
        isLoadingWarehouses = false;
    }
    
    clearError('cityError');
    clearError('warehouseError');
}

cityInput.addEventListener('blur', () => {
    setTimeout(() => {
        const city = cityInput.value.trim();
        if (city && city.length >= 2) {
            loadWarehouses(city);
        }
    }, 200);
});

cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const city = cityInput.value.trim();
        if (city && city.length >= 2) {
            selectedCity = city;
            citySuggestionsDiv.innerHTML = '';
            loadWarehouses(city);
        }
    }
});

function populateWarehouses(warehouses) {
    warehouseSelect.innerHTML = '<option value="">Оберіть відділення</option>';
    
    warehouses.forEach(warehouse => {
        const option = document.createElement('option');
        option.value = warehouse.number;
        option.textContent = `${warehouse.number} - ${warehouse.address}`;
        option.dataset.address = warehouse.address;
        warehouseSelect.appendChild(option);
    });
    
    warehouseSelect.disabled = false;
}

async function getOrderData() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderDataParam = urlParams.get('orderData');
    const orderId = urlParams.get('orderId');
    
    if (orderDataParam) {
        try {
            const orderData = JSON.parse(decodeURIComponent(orderDataParam));
            localStorage.setItem('pendingOrder', JSON.stringify(orderData));
            return orderData;
        } catch (e) {
            console.error('Error parsing order data from URL:', e);
        }
    }
    
    if (orderId) {
        try {
            const response = await fetch(`/api/order/${orderId}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.orderData) {
                    localStorage.setItem('pendingOrder', JSON.stringify(result.orderData));
                    return result.orderData;
                }
            }
        } catch (e) {
            console.error('Error fetching order from server:', e);
        }
    }
    
    const stored = localStorage.getItem('pendingOrder');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing stored order:', e);
        }
    }
    
    return null;
}

function showError(fieldId) {
    const errorEl = document.getElementById(fieldId);
    if (errorEl) {
        errorEl.classList.add('show');
        const input = document.getElementById(fieldId.replace('Error', ''));
        if (input) {
            input.classList.add('error');
        }
    }
}

function clearError(fieldId) {
    const errorEl = document.getElementById(fieldId);
    if (errorEl) {
        errorEl.classList.remove('show');
        const input = document.getElementById(fieldId.replace('Error', ''));
        if (input) {
            input.classList.remove('error');
        }
    }
}

function showErrorNotification(message) {
    errorText.textContent = message;
    errorNotification.classList.add('show');
    
    setTimeout(() => {
        errorNotification.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function hideErrorNotification() {
    errorNotification.classList.remove('show');
}

function validateForm() {
    let isValid = true;
    
    if (!fullNameInput.value.trim()) {
        showError('fullNameError');
        isValid = false;
    } else {
        clearError('fullNameError');
    }
    
    const phoneValue = phoneInput.value.trim().replace(/\s/g, '');
    const phoneRegex = /^(\+?380|0)?[0-9]{9}$/;
    if (!phoneValue || !phoneRegex.test(phoneValue.replace(/^\+?380/, ''))) {
        showError('phoneError');
        isValid = false;
    } else {
        clearError('phoneError');
    }
    
    if (!regionSelect.value) {
        showError('regionError');
        isValid = false;
    } else {
        clearError('regionError');
    }
    
    if (!cityInput.value.trim() || cityInput.disabled) {
        showError('cityError');
        isValid = false;
    } else {
        clearError('cityError');
    }
    
    if (!warehouseSelect.value || warehouseSelect.disabled) {
        showError('warehouseError');
        isValid = false;
    } else {
        clearError('warehouseError');
    }
    
    return isValid;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    hideErrorNotification();
    
    if (!validateForm()) {
        return;
    }
    
    const fullName = fullNameInput.value.trim();
    let phone = phoneInput.value.trim().replace(/\s/g, '');
    if (phone.startsWith('0')) {
        phone = '+38' + phone;
    } else if (!phone.startsWith('+')) {
        phone = '+380' + phone.replace(/^380/, '');
    }
    
    const region = regionSelect.value;
    const city = cityInput.value.trim();
    const warehouseNumber = warehouseSelect.value;
    const selectedOption = warehouseSelect.options[warehouseSelect.selectedIndex];
    const warehouseAddress = selectedOption.dataset.address || selectedOption.textContent;
    
    const addressData = {
        fullName: fullName,
        phone: phone,
        region: region,
        city: city,
        warehouseNumber: warehouseNumber,
        warehouseAddress: warehouseAddress,
        fullAddress: `${region}, ${city}, Відділення Нової Пошти №${warehouseNumber}, ${warehouseAddress}`
    };
    
    submitBtn.disabled = true;
    loading.classList.add('show');
    
    try {
        localStorage.setItem('deliveryAddress', JSON.stringify(addressData));
        
        const orderData = await getOrderData();
        
        if (orderData) {
            const orderWithAddress = {
                ...orderData,
                deliveryAddress: addressData
            };
            
            const fallbackUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';
            
            let response;
            try {
                response = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(orderWithAddress)
                });
            } catch (fetchError) {
                console.error('Fetch error:', fetchError);
                window.location.href = fallbackUrl;
                return;
            }
            
            if (!response.ok) {
                console.error('Response not OK:', response.status);
                window.location.href = fallbackUrl;
                return;
            }
            
            let result;
            try {
                result = await response.json();
            } catch (jsonError) {
                console.error('JSON parse error:', jsonError);
                window.location.href = fallbackUrl;
                return;
            }
            
            if (result.pageUrl) {
                window.location.href = result.pageUrl;
            } else if (result.redirectUrl) {
                window.location.href = result.redirectUrl;
            } else if (result.paymentUrl) {
                window.location.href = result.paymentUrl;
            } else {
                window.location.href = fallbackUrl;
            }
        } else {
            window.location.href = '/checkout';
        }
    } catch (error) {
        console.error('Error:', error);
        const fallbackUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';
        window.location.href = fallbackUrl;
    }
});

phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.startsWith('380')) {
        value = '+' + value;
    } else if (value.startsWith('0')) {
        value = '+38' + value;
    } else if (value && !value.startsWith('38')) {
        value = '+380' + value;
    } else if (value) {
        value = '+' + value;
    }
    e.target.value = value;
    clearError('phoneError');
});

[fullNameInput, regionSelect, cityInput, warehouseSelect].forEach(input => {
    input.addEventListener('change', () => {
        const fieldName = input.id;
        clearError(fieldName + 'Error');
    });
    
    if (input.type === 'text') {
        input.addEventListener('input', () => {
            const fieldName = input.id;
            clearError(fieldName + 'Error');
        });
    }
});

(async () => {
    await getOrderData();
})();
