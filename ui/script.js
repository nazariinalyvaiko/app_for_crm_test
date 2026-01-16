const elements = {
    form: document.getElementById('addressForm'),
    submitBtn: document.getElementById('submitBtn'),
    loading: document.getElementById('loading'),
    fullName: document.getElementById('fullName'),
    phone: document.getElementById('phone'),
    region: document.getElementById('region'),
    city: document.getElementById('city'),
    citySuggestions: document.getElementById('citySuggestions'),
    warehouse: document.getElementById('warehouse'),
    errorNotification: document.getElementById('errorNotification'),
    errorText: document.getElementById('errorText')
};

const warehousesCache = new Map();
let isLoadingWarehouses = false;
let citySearchTimeout = null;
let selectedCity = null;

const regions = ['Вінницька', 'Волинська', 'Дніпропетровська', 'Донецька', 'Житомирська',
    'Закарпатська', 'Запорізька', 'Івано-Франківська', 'Київська', 'Кіровоградська',
    'Луганська', 'Львівська', 'Миколаївська', 'Одеська', 'Полтавська',
    'Рівненська', 'Сумська', 'Тернопільська', 'Харківська', 'Херсонська',
    'Хмельницька', 'Черкаська', 'Чернівецька', 'Чернігівська', 'м. Київ'].sort();

regions.forEach(region => {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = region;
    elements.region.appendChild(option);
});

elements.region.addEventListener('change', () => {
    elements.city.value = '';
    elements.city.disabled = !elements.region.value;
    elements.citySuggestions.innerHTML = '';
    elements.warehouse.innerHTML = '<option value="">Спочатку оберіть населений пункт</option>';
    elements.warehouse.disabled = true;
    selectedCity = null;
    ['region', 'city', 'warehouse'].forEach(field => clearError(field + 'Error'));
});

elements.city.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearError('cityError');
    selectedCity = null;
    elements.citySuggestions.innerHTML = '';
    
    if (query.length < 2 || !elements.region.value) {
        if (!elements.region.value) {
            elements.citySuggestions.innerHTML = '<div class="suggestion-item">Спочатку оберіть область</div>';
        }
        return;
    }
    
    clearTimeout(citySearchTimeout);
    citySearchTimeout = setTimeout(() => searchCities(query), 500);
});

async function searchCities(query) {
    try {
        const url = `/api/nova-poshta/cities?query=${encodeURIComponent(query)}&region=${encodeURIComponent(elements.region.value)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success && data.cities?.length > 0) {
            const suggestions = data.cities.slice(0, 10);
            elements.citySuggestions.innerHTML = suggestions.map(city => 
                `<div class="suggestion-item" data-city="${city.name}">${city.name}</div>`
            ).join('');
            
            elements.citySuggestions.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    const cityName = item.dataset.city;
                    elements.city.value = cityName;
                    selectedCity = cityName;
                    elements.citySuggestions.innerHTML = '';
                    loadWarehouses(cityName);
                });
            });
        } else {
            elements.citySuggestions.innerHTML = '<div class="suggestion-item">Населений пункт не знайдено</div>';
        }
    } catch (error) {
        console.error('Error searching cities:', error);
        elements.citySuggestions.innerHTML = '<div class="suggestion-item">Помилка пошуку</div>';
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#city') && !e.target.closest('#citySuggestions')) {
        elements.citySuggestions.innerHTML = '';
    }
});

async function loadWarehouses(city) {
    if (!city?.trim()) {
        elements.warehouse.innerHTML = '<option value="">Спочатку оберіть населений пункт</option>';
        elements.warehouse.disabled = true;
        return;
    }
    
    if (warehousesCache.has(city)) {
        populateWarehouses(warehousesCache.get(city));
        return;
    }
    
    if (isLoadingWarehouses) return;
    
    isLoadingWarehouses = true;
    elements.warehouse.innerHTML = '<option value="">Завантаження...</option>';
    elements.warehouse.disabled = true;
    
    try {
        const response = await fetch(`/api/nova-poshta/warehouses?location=${encodeURIComponent(city)}`);
        const data = await response.json();
        
        if (data.success && data.warehouses?.length > 0) {
            warehousesCache.set(city, data.warehouses);
            populateWarehouses(data.warehouses);
        } else {
            elements.warehouse.innerHTML = '<option value="">Відділення не знайдено</option>';
        }
    } catch (error) {
        console.error('Error loading warehouses:', error);
        elements.warehouse.innerHTML = '<option value="">Помилка завантаження</option>';
    } finally {
        isLoadingWarehouses = false;
        clearError('cityError');
        clearError('warehouseError');
    }
}

elements.city.addEventListener('blur', () => {
    setTimeout(() => {
        const city = elements.city.value.trim();
        if (city.length >= 2) loadWarehouses(city);
    }, 200);
});

elements.city.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const city = elements.city.value.trim();
        if (city.length >= 2) {
            selectedCity = city;
            elements.citySuggestions.innerHTML = '';
            loadWarehouses(city);
        }
    }
});

function populateWarehouses(warehouses) {
    elements.warehouse.innerHTML = '<option value="">Оберіть відділення</option>';
    warehouses.forEach(warehouse => {
        const option = document.createElement('option');
        option.value = warehouse.number;
        option.textContent = `${warehouse.number} - ${warehouse.address}`;
        option.dataset.address = warehouse.address;
        elements.warehouse.appendChild(option);
    });
    elements.warehouse.disabled = false;
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
    
    try {
        const stored = localStorage.getItem('pendingOrder');
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.error('Error parsing stored order:', e);
        return null;
    }
}

function showError(fieldId) {
    const errorEl = document.getElementById(fieldId);
    const input = document.getElementById(fieldId.replace('Error', ''));
    if (errorEl) errorEl.classList.add('show');
    if (input) input.classList.add('error');
}

function clearError(fieldId) {
    const errorEl = document.getElementById(fieldId);
    const input = document.getElementById(fieldId.replace('Error', ''));
    if (errorEl) errorEl.classList.remove('show');
    if (input) input.classList.remove('error');
}

function showErrorNotification(message) {
    elements.errorText.textContent = message;
    elements.errorNotification.classList.add('show');
    setTimeout(() => elements.errorNotification.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

function hideErrorNotification() {
    elements.errorNotification.classList.remove('show');
}

function validateForm() {
    const validations = [
        { field: 'fullName', check: () => elements.fullName.value.trim(), error: 'fullNameError' },
        { field: 'phone', check: () => {
            const phone = elements.phone.value.trim().replace(/\s/g, '');
            return phone && /^(\+?380|0)?[0-9]{9}$/.test(phone.replace(/^\+?380/, ''));
        }, error: 'phoneError' },
        { field: 'region', check: () => elements.region.value, error: 'regionError' },
        { field: 'city', check: () => elements.city.value.trim() && !elements.city.disabled, error: 'cityError' },
        { field: 'warehouse', check: () => elements.warehouse.value && !elements.warehouse.disabled, error: 'warehouseError' }
    ];
    
    let isValid = true;
    validations.forEach(({ check, error }) => {
        if (check()) {
            clearError(error);
        } else {
            showError(error);
            isValid = false;
        }
    });
    return isValid;
}

function formatPhone(phone) {
    phone = phone.trim().replace(/\s/g, '');
    if (phone.startsWith('0')) return '+38' + phone;
    if (!phone.startsWith('+')) return '+380' + phone.replace(/^380/, '');
    return phone;
}

elements.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrorNotification();
    
    if (!validateForm()) return;
    
    const selectedOption = elements.warehouse.options[elements.warehouse.selectedIndex];
    const addressData = {
        fullName: elements.fullName.value.trim(),
        phone: formatPhone(elements.phone.value),
        region: elements.region.value,
        city: elements.city.value.trim(),
        warehouseNumber: elements.warehouse.value,
        warehouseAddress: selectedOption.dataset.address || selectedOption.textContent,
        fullAddress: `${elements.region.value}, ${elements.city.value.trim()}, Відділення Нової Пошти №${elements.warehouse.value}, ${selectedOption.dataset.address || selectedOption.textContent}`
    };
    
    elements.submitBtn.disabled = true;
    elements.loading.classList.add('show');
    
    try {
        localStorage.setItem('deliveryAddress', JSON.stringify(addressData));
        const orderData = await getOrderData();
        
        if (!orderData) {
            throw new Error('Дані замовлення не знайдено. Будь ласка, спробуйте ще раз.');
        }
        
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...orderData, deliveryAddress: addressData })
        });
        
        const result = await response.json().catch(() => ({ success: false, message: 'Помилка парсингу відповіді' }));
        
        if (!response.ok || !result.success) {
            throw new Error(result.message || `Помилка сервера: ${response.status}`);
        }
        
        const paymentUrl = result.pageUrl || result.redirectUrl || result.paymentUrl;
        if (paymentUrl) {
            window.location.href = paymentUrl;
        } else {
            throw new Error('Посилання на оплату не отримано');
        }
    } catch (error) {
        console.error('Error:', error);
        showErrorNotification(error.message || 'Сталася помилка. Будь ласка, спробуйте ще раз.');
        elements.submitBtn.disabled = false;
        elements.loading.classList.remove('show');
    }
});

elements.phone.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.startsWith('380')) value = '+' + value;
    else if (value.startsWith('0')) value = '+38' + value;
    else if (value && !value.startsWith('38')) value = '+380' + value;
    else if (value) value = '+' + value;
    e.target.value = value;
    clearError('phoneError');
});

[elements.fullName, elements.region, elements.city, elements.warehouse].forEach(input => {
    input.addEventListener('change', () => clearError(input.id + 'Error'));
    if (input.type === 'text') {
        input.addEventListener('input', () => clearError(input.id + 'Error'));
    }
});

getOrderData();
