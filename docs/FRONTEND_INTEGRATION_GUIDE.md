# Руководство по интеграции фронтенда

## Быстрый старт

### 1. Базовые настройки

```javascript
// config/api.js
const API_BASE_URL = 'http://localhost:5000/';  // или ваш production URL

// Утилита для API запросов
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    ...options
  };
  
  // Для FormData не устанавливаем Content-Type (браузер сделает это сам)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  
  return data;
}
```

### 2. Компонент создания Load

```javascript
// components/LoadForm.jsx
import { useState } from 'react';

function LoadForm() {
  const [formData, setFormData] = useState({
    customer: null,
    carrier: null,
    type: { freight: true, vehicle: false },
    freight: { shipment: [] },
    pickup: { address: {} },
    delivery: { address: {} }
  });
  
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Поиск существующего Customer
  const searchCustomer = async (companyName) => {
    if (!companyName) return [];
    
    try {
      const response = await apiRequest(`/customers/search?q=${companyName}`);
      return response.data;
    } catch (error) {
      console.error('Customer search failed:', error);
      return [];
    }
  };
  
  // Поиск существующего Carrier
  const searchCarrier = async (searchTerm) => {
    if (!searchTerm) return [];
    
    try {
      const response = await apiRequest(`/carriers/search?q=${searchTerm}`);
      return response.data;
    } catch (error) {
      console.error('Carrier search failed:', error);
      return [];
    }
  };
  
  // Создание Load
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const formDataToSend = new FormData();
      
      // Customer
      if (formData.customer?.id) {
        // Использовать существующего
        formDataToSend.append('customer', JSON.stringify({ id: formData.customer.id }));
      } else if (formData.customer?.companyName) {
        // Создать новый
        formDataToSend.append('customer', JSON.stringify(formData.customer));
      }
      
      // Carrier
      if (formData.carrier?.id) {
        // Использовать существующего
        formDataToSend.append('carrier', JSON.stringify({ id: formData.carrier.id }));
      } else if (formData.carrier?.name || formData.carrier?.companyName) {
        // Создать новый
        formDataToSend.append('carrier', JSON.stringify(formData.carrier));
      }
      
      // Остальные данные
      formDataToSend.append('type', JSON.stringify(formData.type));
      formDataToSend.append('freight', JSON.stringify(formData.freight));
      formDataToSend.append('pickup', JSON.stringify(formData.pickup));
      formDataToSend.append('delivery', JSON.stringify(formData.delivery));
      formDataToSend.append('status', 'Listed');
      
      // Файлы
      files.forEach(file => {
        formDataToSend.append('files', file);
      });
      
      const response = await apiRequest('/loads', {
        method: 'POST',
        body: formDataToSend
      });
      
      if (response.success) {
        alert('Load создан успешно!');
        console.log('Created Load:', response.data);
      }
    } catch (error) {
      alert(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Поля формы */}
      <button type="submit" disabled={loading}>
        {loading ? 'Создание...' : 'Создать Load'}
      </button>
    </form>
  );
}
```

### 3. Компонент выбора Carrier с автодополнением

```javascript
// components/CarrierSelector.jsx
import { useState, useEffect } from 'react';

function CarrierSelector({ value, onChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState(value);
  
  // Поиск с задержкой (debounce)
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      try {
        const response = await apiRequest(`/carriers/search?q=${searchTerm}`);
        setSearchResults(response.data);
        setShowResults(true);
      } catch (error) {
        console.error('Search failed:', error);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);
  
  const handleSelect = (carrier) => {
    setSelectedCarrier(carrier);
    setSearchTerm(`${carrier.name}${carrier.companyName ? ` - ${carrier.companyName}` : ''}`);
    setShowResults(false);
    onChange(carrier);
  };
  
  const handleNewCarrier = () => {
    // Пользователь хочет создать нового Carrier
    setSelectedCarrier(null);
    onChange({ name: searchTerm }); // Начальные данные для нового Carrier
  };
  
  return (
    <div className="carrier-selector">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Поиск Carrier..."
        onFocus={() => searchResults.length > 0 && setShowResults(true)}
      />
      
      {showResults && searchResults.length > 0 && (
        <div className="dropdown">
          {searchResults.map(carrier => (
            <div
              key={carrier.id}
              onClick={() => handleSelect(carrier)}
              className="dropdown-item"
            >
              <strong>{carrier.name}</strong>
              {carrier.companyName && <span> - {carrier.companyName}</span>}
              {carrier.mcNumber && <span> (MC: {carrier.mcNumber})</span>}
            </div>
          ))}
          <div
            onClick={handleNewCarrier}
            className="dropdown-item new-item"
          >
            + Создать нового: "{searchTerm}"
          </div>
        </div>
      )}
      
      {selectedCarrier && (
        <div className="selected-carrier">
          Выбран: {selectedCarrier.name}
          {selectedCarrier.id && <span> (существующий)</span>}
          {!selectedCarrier.id && <span> (новый)</span>}
        </div>
      )}
    </div>
  );
}
```

### 4. Компонент списка Loads с фильтрацией

```javascript
// components/LoadList.jsx
import { useState, useEffect } from 'react';

function LoadList() {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    status: '',
    search: ''
  });
  const [pagination, setPagination] = useState({});
  
  const fetchLoads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: filters.page,
        limit: filters.limit,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && { search: filters.search })
      });
      
      const response = await apiRequest(`/loads?${params}`);
      setLoads(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to fetch loads:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchLoads();
  }, [filters]);
  
  return (
    <div>
      {/* Фильтры */}
      <div className="filters">
        <input
          type="text"
          placeholder="Поиск..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
        >
          <option value="">Все статусы</option>
          <option value="Listed">Listed</option>
          <option value="Dispatched">Dispatched</option>
          <option value="Picked up">Picked up</option>
          <option value="Delivered">Delivered</option>
        </select>
      </div>
      
      {/* Список Loads */}
      {loading ? (
        <div>Загрузка...</div>
      ) : (
        <div className="loads-list">
          {loads.map(load => (
            <div key={load.id} className="load-card">
              <h3>Order ID: {load.orderId}</h3>
              <p>Status: {load.status}</p>
              <p>Customer: {load.customer?.companyName || 'N/A'}</p>
              <p>Carrier: {load.carrier?.name || 'N/A'}</p>
              <p>BOL: {load.billOfLadingNumber}</p>
            </div>
          ))}
        </div>
      )}
      
      {/* Пагинация */}
      <div className="pagination">
        <button
          disabled={filters.page === 1}
          onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
        >
          Назад
        </button>
        <span>
          Страница {filters.page} из {pagination.totalPages}
        </span>
        <button
          disabled={filters.page >= pagination.totalPages}
          onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
        >
          Вперед
        </button>
      </div>
    </div>
  );
}
```

### 5. Обновление статуса Load

```javascript
// utils/loadActions.js
export const updateLoadStatus = async (loadId, newStatus) => {
  try {
    const response = await apiRequest(`/loads/${loadId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    
    return response.data;
  } catch (error) {
    throw new Error(`Failed to update status: ${error.message}`);
  }
};

// Использование
await updateLoadStatus('507f1f77bcf86cd799439013', 'Dispatched');
```

### 6. Загрузка и скачивание PDF

```javascript
// utils/pdfActions.js
export const generateBOL = async (loadId) => {
  try {
    const response = await apiRequest(`/loads/${loadId}/bol`);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to generate BOL: ${error.message}`);
  }
};

export const downloadPDF = (filename) => {
  window.open(`${API_BASE_URL}/loads/download/${filename}`, '_blank');
};

// Использование
const bolResult = await generateBOL(loadId);
console.log('BOL generated:', bolResult.filename);
downloadPDF(bolResult.filename);
```

### 7. Обработка ошибок

```javascript
// utils/errorHandler.js
export const handleApiError = (error) => {
  if (error.message.includes('Validation failed')) {
    // Показать ошибки валидации
    return 'Проверьте правильность заполнения полей';
  }
  
  if (error.message.includes('Duplicate entry')) {
    return 'Запись с такими данными уже существует';
  }
  
  if (error.message.includes('not found')) {
    return 'Запись не найдена';
  }
  
  return 'Произошла ошибка. Попробуйте еще раз';
};

// Использование в компоненте
try {
  await apiRequest('/loads', { method: 'POST', body: formData });
} catch (error) {
  const errorMessage = handleApiError(error);
  alert(errorMessage);
}
```

### 8. Типы TypeScript (опционально)

```typescript
// types/api.ts
export interface Load {
  id: string;
  orderId: string;
  billOfLadingNumber: string;
  customer: Customer | null;
  carrier: Carrier | null;
  type: {
    freight: boolean;
    vehicle: boolean;
  };
  freight?: Freight;
  vehicle?: Vehicle;
  pickup: Location;
  delivery: Location;
  status: 'Listed' | 'Dispatched' | 'Picked up' | 'Delivered' | 'On Hold' | 'Cancelled';
  dates: {
    assignedDate?: string;
    pickupDate?: string;
    deliveryDate?: string;
    aging?: string;
  };
  tracking?: string;
  documents: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Carrier {
  id?: string;
  name: string;
  phoneNumber?: string;
  email?: string;
  companyName?: string;
  mcNumber?: string;
  dotNumber?: string;
  address?: Address;
  emails?: string[];
  photos?: string[];
}

export interface Customer {
  id?: string;
  companyName: string;
  customerAddress: Address;
  emails?: string[];
  phoneNumber?: string;
}

export interface Address {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  name?: string;
  contactPhone?: string;
}

export interface Location {
  locationName?: string;
  address: Address;
  contactPhone?: string;
  notes?: string;
  date?: string;
  images?: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  details?: any;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}
```

---

## Рекомендации

1. **Кэширование:** Используйте кэш для списков Carrier и Customer, чтобы не делать лишние запросы
2. **Оптимистичные обновления:** Обновляйте UI сразу, не дожидаясь ответа сервера
3. **Валидация на клиенте:** Проверяйте данные перед отправкой на сервер
4. **Обработка загрузки:** Показывайте индикаторы загрузки для лучшего UX
5. **Ошибки сети:** Обрабатывайте случаи, когда сеть недоступна

---

## Примеры использования

См. полную документацию в `API_DOCUMENTATION.md` для детальных примеров всех API endpoints.

