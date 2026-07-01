function getAuthHeaders() {
  const token = localStorage.getItem('access_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const api = {
  async request(path, opts = {}) {
    const headers = { ...getAuthHeaders(), ...opts.headers };
    const res = await fetch(path, { credentials: 'include', ...opts, headers });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  },

  vehicles: {
    list: () => api.request('/api/vehicles'),
    get: (id) => api.request(`/api/vehicles?id=${id}`),
    create: (data) => api.request('/api/vehicles', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    update: (id, data) => api.request(`/api/vehicles?id=${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    delete: (id) => api.request(`/api/vehicles?id=${id}`, { method: 'DELETE' }),
  },

  refuels: {
    list: (vehicleId) => api.request(`/api/refuels${vehicleId ? `?vehicleId=${vehicleId}` : ''}`),
    get: (id) => api.request(`/api/refuels?id=${id}`),
    create: (data) => api.request('/api/refuels', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    update: (id, data) => api.request(`/api/refuels?id=${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    delete: (id) => api.request(`/api/refuels?id=${id}`, { method: 'DELETE' }),
  },

  stations: {
    list: (city) => api.request(`/api/fuel-stations${city ? `?city=${encodeURIComponent(city)}` : ''}`),
    create: (data) => api.request('/api/fuel-stations', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    update: (id, data) => api.request(`/api/fuel-stations?id=${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    delete: (id) => api.request(`/api/fuel-stations?id=${id}`, { method: 'DELETE' }),
    setPrice: (stationId, fuelType, price) => api.request('/api/fuel-prices', { method: 'PUT', body: JSON.stringify({ stationId, fuelType, price }), headers: { 'Content-Type': 'application/json' } }),
    deletePrice: (stationId, fuelType) => api.request('/api/fuel-prices', { method: 'DELETE', body: JSON.stringify({ stationId, fuelType }), headers: { 'Content-Type': 'application/json' } }),
  },

  upload: async (file) => {
    const fd = new FormData();
    fd.append('receipt', file);
    const token = localStorage.getItem('access_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/api/upload', { method: 'POST', body: fd, headers });
    if (!res.ok) throw new Error('Falha no upload');
    return res.json();
  },
};
