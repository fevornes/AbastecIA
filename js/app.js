let vehicles = [];
let stations = [];
let selectedVehicleId = null;
let editingVehicle = null;
let editingStation = null;
let allRefuels = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let consumptionChart = null;

function $(id) { return document.getElementById(id); }

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function showLoading() {
  let el = $('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    el.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
}

function hideLoading() {
  const el = $('loading-overlay');
  if (el) el.classList.add('hidden');
}

async function withLoading(fn) {
  showLoading();
  try { return await fn(); }
  finally { hideLoading(); }
}

// --- Dark mode ---
function toggleDark() {
  document.body.classList.toggle('dark');
  localStorage.setItem('dark-mode', document.body.classList.contains('dark'));
  const btn = $('dark-toggle');
  if (btn) btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
}

// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    if (tab.dataset.tab === 'refuels') { loadRefuelVehicleSelect(); }
    if (tab.dataset.tab === 'stations') { loadStations(); }
  });
});

// --- Vehicles ---
async function loadVehicles() {
  try {
    vehicles = await withLoading(() => api.vehicles.list());
    renderVehicles();
  } catch (e) { toast(e.message, 'error'); }
}

function renderVehicles() {
  const el = $('vehicle-list');
  if (!vehicles.length) {
    el.innerHTML = '<div class="empty"><p>Nenhum veículo cadastrado</p></div>';
    return;
  }
  el.innerHTML = vehicles.map(v => `
    <div class="vehicle-card ${selectedVehicleId === v.id ? 'selected' : ''}" data-id="${v.id}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h3>${esc(v.name)}</h3>
          <small>${v.plate ? esc(v.plate) : 'Sem placa'}</small>
        </div>
        <div class="actions">
          <button class="btn btn-outline btn-sm btn-edit-vehicle" data-id="${v.id}">Editar</button>
          <button class="btn btn-danger btn-sm btn-del-vehicle" data-id="${v.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.vehicle-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      selectedVehicleId = card.dataset.id;
      renderVehicles();
    });
  });

  el.querySelectorAll('.btn-edit-vehicle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = vehicles.find(x => x.id === btn.dataset.id);
      if (!v) return;
      editingVehicle = v.id;
      $('vehicle-name').value = v.name;
      $('vehicle-plate').value = v.plate || '';
      $('btn-add-vehicle').textContent = 'Atualizar';
    });
  });

  el.querySelectorAll('.btn-del-vehicle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Excluir veículo e todos os abastecimentos?')) return;
      try {
        await withLoading(() => api.vehicles.delete(btn.dataset.id));
        toast('Veículo excluído');
        if (selectedVehicleId === btn.dataset.id) selectedVehicleId = null;
        await loadVehicles();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

$('btn-add-vehicle').addEventListener('click', async () => {
  const name = $('vehicle-name').value.trim();
  if (!name) return toast('Nome é obrigatório', 'error');
  try {
    await withLoading(async () => {
      if (editingVehicle) {
        await api.vehicles.update(editingVehicle, { name, plate: $('vehicle-plate').value.trim() });
        toast('Veículo atualizado');
        editingVehicle = null;
        $('btn-add-vehicle').textContent = 'Adicionar';
      } else {
        await api.vehicles.create({ name, plate: $('vehicle-plate').value.trim() });
        toast('Veículo adicionado');
      }
    });
    $('vehicle-name').value = '';
    $('vehicle-plate').value = '';
    await loadVehicles();
  } catch (e) { toast(e.message, 'error'); }
});

// --- Refuels ---
async function loadRefuelVehicleSelect() {
  try {
    vehicles = await withLoading(() => api.vehicles.list());
    const sel = $('refuel-vehicle');
    sel.innerHTML = '<option value="">-- Selecione --</option>' +
      vehicles.map(v => `<option value="${v.id}">${esc(v.name)}${v.plate ? ' - ' + esc(v.plate) : ''}</option>`).join('');
    sel.value = selectedVehicleId || '';
    await loadStationsSelect();
    if (selectedVehicleId) loadRefuels();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadStationsSelect() {
  try {
    stations = await api.stations.list();
    const cities = [...new Set(stations.map(s => s.city).filter(Boolean))].sort();
    const citySel = $('refuel-city');
    citySel.innerHTML = '<option value="">-- Selecione --</option>' +
      cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const selectedCity = citySel.value;
    if (selectedCity) {
      const filtered = stations.filter(s => s.city === selectedCity);
      $('refuel-station').innerHTML = '<option value="">-- Selecione --</option>' +
        filtered.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    } else {
      $('refuel-station').innerHTML = '<option value="">-- Selecione uma cidade --</option>';
    }
  } catch (e) { /* ignore */ }
}

$('refuel-city').addEventListener('change', () => {
  const city = $('refuel-city').value;
  if (!city) {
    $('refuel-station').innerHTML = '<option value="">-- Selecione uma cidade --</option>';
    $('refuel-station').value = '';
    return;
  }
  const filtered = stations.filter(s => s.city === city);
  const sel = $('refuel-station');
  sel.innerHTML = '<option value="">-- Selecione --</option>' +
    filtered.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = '';
});

$('refuel-vehicle').addEventListener('change', () => {
  selectedVehicleId = $('refuel-vehicle').value;
  if (selectedVehicleId) { loadRefuels(); renderVehicles(); }
  else { $('refuel-list').innerHTML = ''; $('refuel-stats').innerHTML = ''; destroyChart(); }
});

function calcRefuel(sourceId) {
  const l = parseFloat($('refuel-liters').value) || 0;
  const p = parseFloat($('refuel-price').value) || 0;
  const t = parseFloat($('refuel-total').value) || 0;
  if (l && p && !t) {
    $('refuel-total').value = (l * p).toFixed(2);
  } else if (t && l && !p) {
    $('refuel-price').value = (t / l).toFixed(3);
  } else if (t && p && !l) {
    $('refuel-liters').value = (t / p).toFixed(2);
  }
}
['refuel-liters', 'refuel-price', 'refuel-total'].forEach(id => {
  $(id).addEventListener('input', () => calcRefuel(id));
});

$('btn-add-refuel').addEventListener('click', async () => {
  const vehicleId = $('refuel-vehicle').value;
  if (!vehicleId) return toast('Selecione um veículo', 'error');
  const km = parseFloat($('refuel-km').value) || null;
  const liters = parseFloat($('refuel-liters').value);
  const pricePerLiter = parseFloat($('refuel-price').value);
  if (!liters || !pricePerLiter) return toast('Preencha Litros e Preço', 'error');

  let receipt = null;
  const fileInput = $('refuel-receipt');
  if (fileInput.files.length) {
    try {
      const uploadRes = await api.upload(fileInput.files[0]);
      receipt = uploadRes.url;
    } catch (e) { toast('Erro no upload: ' + e.message, 'error'); return; }
  }

  try {
    await withLoading(() => api.refuels.create({
      vehicleId,
      date: $('refuel-date').value || new Date().toISOString().slice(0, 10),
      km, liters, pricePerLiter,
      totalCost: parseFloat($('refuel-total').value) || (liters * pricePerLiter),
      isFullTank: $('refuel-fulltank').checked,
      notes: $('refuel-notes').value.trim() || null,
      receipt,
      stationId: $('refuel-station').value || null,
      fuelType: $('refuel-fuel').value || null,
    }));
    toast('Abastecimento registrado');
    $('refuel-km').value = '';
    $('refuel-liters').value = '';
    $('refuel-price').value = '';
    $('refuel-total').value = '';
    $('refuel-notes').value = '';
    $('refuel-receipt').value = '';
    await loadRefuels();
  } catch (e) { toast(e.message, 'error'); }
});

async function loadRefuels() {
  if (!selectedVehicleId) return;
  try {
    allRefuels = await withLoading(() => api.refuels.list(selectedVehicleId));
    currentPage = 1;
    renderRefuels();
    renderRefuelStats();
    renderChart();
  } catch (e) { toast(e.message, 'error'); }
}

function renderRefuelStats() {
  const el = $('refuel-stats');
  const list = allRefuels;
  if (list.length < 2) { el.innerHTML = ''; return; }

  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const fullTanks = sorted.filter(r => r.is_full_tank);

  let consumption = null;
  if (fullTanks.length >= 2) {
    const lastTwo = fullTanks.slice(-2);
    const kmDiff = lastTwo[1].km - lastTwo[0].km;
    const litersSum = lastTwo[1].liters;
    consumption = kmDiff > 0 && litersSum > 0 ? (kmDiff / litersSum).toFixed(1) : null;
  }

  let totalLiters = 0, totalCost = 0;
  list.forEach(r => { totalLiters += r.liters; totalCost += r.total_cost; });

  const kmTotal = list.reduce((max, r) => r.km != null && r.km > max ? r.km : max, 0);
  const avgCostPerLiter = totalLiters > 0 ? (totalCost / totalLiters).toFixed(3) : 0;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:16px">
      <div style="background:var(--primary-light);padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:var(--text-muted)">Total Gasto</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--primary)">R$ ${totalCost.toFixed(2)}</div>
      </div>
      <div style="background:var(--primary-light);padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:var(--text-muted)">Total Litros</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--primary)">${totalLiters.toFixed(1)} L</div>
      </div>
      ${consumption ? `
      <div style="background:var(--success-bg);padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:var(--text-muted)">Consumo Médio</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--success-text)">${consumption} km/L</div>
      </div>` : ''}
      <div style="background:var(--primary-light);padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:var(--text-muted)">Preço Médio</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--primary)">R$ ${avgCostPerLiter}</div>
      </div>
      <div style="background:var(--primary-light);padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:var(--text-muted)">Abastecimentos</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--primary)">${list.length}</div>
      </div>
      <div style="background:var(--primary-light);padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:var(--text-muted)">KM Total</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--primary)">${kmTotal > 0 ? kmTotal.toFixed(0) + ' km' : '-'}</div>
      </div>
    </div>
  `;
}

function renderRefuels() {
  const el = $('refuel-list');
  const list = allRefuels;
  if (!list.length) {
    el.innerHTML = '<div class="empty"><p>Nenhum abastecimento registrado</p></div>';
    return;
  }

  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Data</th><th>KM</th><th>Litros</th><th>R$/L</th><th>Combustível</th><th>Total</th><th>Tanque</th><th>Comprovante</th><th></th></tr></thead>
    <tbody>${pageItems.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.km != null ? r.km : '-'}</td>
        <td>${r.liters.toFixed(2)}</td>
        <td>R$ ${Number(r.price_per_liter).toFixed(3)}</td>
        <td>${r.fuel_type ? (FUEL_TYPES.find(f => f.key === r.fuel_type)?.label || esc(r.fuel_type)) : '-'}</td>
        <td>R$ ${Number(r.total_cost).toFixed(2)}</td>
        <td>${r.is_full_tank ? '✅' : '❌'}</td>
        <td>${r.receipt ? `<a href="${esc(r.receipt)}" target="_blank" style="color:var(--primary)">📎 Ver</a>` : '-'}</td>
        <td>
          <button class="btn btn-outline btn-sm btn-edit-refuel" data-id="${r.id}">Editar</button>
          <button class="btn btn-danger btn-sm btn-del-refuel" data-id="${r.id}">Excluir</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table></div>`;

  // Pagination
  if (totalPages > 1) {
    let pagHtml = '<div class="pagination">';
    pagHtml += `<button class="page-btn" data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>&laquo; Anterior</button>`;
    for (let i = 1; i <= totalPages; i++) {
      pagHtml += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    pagHtml += `<button class="page-btn" data-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>Próximo &raquo;</button>`;
    pagHtml += `<span class="page-info">${start + 1}-${Math.min(start + PAGE_SIZE, list.length)} de ${list.length}</span>`;
    pagHtml += '</div>';
    el.innerHTML += pagHtml;

    el.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.page === 'prev' && currentPage > 1) currentPage--;
        else if (btn.dataset.page === 'next' && currentPage < totalPages) currentPage++;
        else if (btn.dataset.page !== 'prev' && btn.dataset.page !== 'next') currentPage = parseInt(btn.dataset.page);
        renderRefuels();
      });
    });
  }

  // Edit refuel
  el.querySelectorAll('.btn-edit-refuel').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = allRefuels.find(x => x.id === btn.dataset.id);
      if (r) openEditRefuelModal(r);
    });
  });

  // Delete refuel
  el.querySelectorAll('.btn-del-refuel').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este abastecimento?')) return;
      try {
        await withLoading(() => api.refuels.delete(btn.dataset.id));
        toast('Abastecimento excluído');
        await loadRefuels();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// --- Edit Refuel Modal ---
function openEditRefuelModal(r) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Editar Abastecimento</h3>
      <div class="form-group">
        <label>Data</label>
        <input type="date" id="edit-refuel-date" value="${r.date}">
      </div>
      <div class="row">
        <div class="form-group">
          <label>KM</label>
          <input type="number" step="0.1" id="edit-refuel-km" value="${r.km != null ? r.km : ''}">
        </div>
        <div class="form-group">
          <label>Litros</label>
          <input type="number" step="0.01" id="edit-refuel-liters" value="${r.liters}">
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label>Preço por Litro (R$)</label>
          <input type="number" step="0.001" id="edit-refuel-price" value="${r.price_per_liter}">
        </div>
        <div class="form-group">
          <label>Valor Total (R$)</label>
          <input type="number" step="0.01" id="edit-refuel-total" value="${r.total_cost}">
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label>Combustível</label>
          <select id="edit-refuel-fuel">
            ${FUEL_TYPES.map(ft => `<option value="${ft.key}" ${r.fuel_type === ft.key ? 'selected' : ''}>${ft.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:center;justify-content:center">
          <label style="margin-bottom:0;cursor:pointer;display:flex;align-items:center;gap:6px">
            <input type="checkbox" id="edit-refuel-fulltank" ${r.is_full_tank ? 'checked' : ''} style="width:16px;height:16px"> Tanque completo
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="edit-refuel-notes" rows="2">${r.notes || ''}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" id="btn-edit-refuel-cancel">Cancelar</button>
        <button class="btn btn-primary" id="btn-edit-refuel-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Auto-calc any two of three
  function calcEditRefuel(sourceId) {
    const l = parseFloat($('edit-refuel-liters').value) || 0;
    const p = parseFloat($('edit-refuel-price').value) || 0;
    const t = parseFloat($('edit-refuel-total').value) || 0;
    if (l && p && !t) {
      $('edit-refuel-total').value = (l * p).toFixed(2);
    } else if (t && l && !p) {
      $('edit-refuel-price').value = (t / l).toFixed(3);
    } else if (t && p && !l) {
      $('edit-refuel-liters').value = (t / p).toFixed(2);
    }
  }
  ['edit-refuel-liters', 'edit-refuel-price', 'edit-refuel-total'].forEach(id => {
    $(id).addEventListener('input', () => calcEditRefuel(id));
  });

  $('btn-edit-refuel-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  $('btn-edit-refuel-save').addEventListener('click', async () => {
    const liters = parseFloat($('edit-refuel-liters').value);
    const pricePerLiter = parseFloat($('edit-refuel-price').value);
    if (!liters || !pricePerLiter) return toast('Preencha Litros e Preço', 'error');
    try {
      await withLoading(() => api.refuels.update(r.id, {
        date: $('edit-refuel-date').value,
        km: parseFloat($('edit-refuel-km').value) || null,
        liters, pricePerLiter,
        totalCost: parseFloat($('edit-refuel-total').value) || (liters * pricePerLiter),
        isFullTank: $('edit-refuel-fulltank').checked,
        notes: $('edit-refuel-notes').value.trim() || null,
        fuelType: $('edit-refuel-fuel').value || null,
      }));
      toast('Abastecimento atualizado');
      overlay.remove();
      await loadRefuels();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// --- Chart ---
function destroyChart() {
  if (consumptionChart) { consumptionChart.destroy(); consumptionChart = null; }
}

function renderChart() {
  const container = $('chart-container');
  const list = allRefuels;
  if (list.length < 2) { container.innerHTML = ''; return; }

  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = sorted.map(r => r.date);
  const costData = sorted.map(r => r.total_cost);
  const litersData = sorted.map(r => r.liters);

  container.innerHTML = '<h3>Histórico de Abastecimentos</h3><canvas id="consumption-chart"></canvas>';

  destroyChart();
  const ctx = document.getElementById('consumption-chart').getContext('2d');

  const isDark = document.body.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)';
  const textColor = isDark ? '#aaa' : '#666';

  consumptionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Valor (R$)',
          data: costData,
          backgroundColor: 'rgba(26,115,232,.6)',
          borderColor: 'rgba(26,115,232,1)',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Litros',
          data: litersData,
          backgroundColor: 'rgba(46,125,50,.5)',
          borderColor: 'rgba(46,125,50,1)',
          borderWidth: 1,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { beginAtZero: true, position: 'left', ticks: { color: textColor }, grid: { color: gridColor }, title: { display: true, text: 'R$', color: textColor } },
        y1: { beginAtZero: true, position: 'right', ticks: { color: textColor }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Litros', color: textColor } },
      }
    }
  });
}

// --- Stations ---
let stationCityFilter = '';

async function loadStations() {
  try {
    stations = await withLoading(() => api.stations.list());
    const cities = [...new Set(stations.map(s => s.city).filter(Boolean))].sort();
    const citySel = $('filter-city');
    const currentVal = citySel.value;
    citySel.innerHTML = '<option value="">-- Todas as cidades --</option>' +
      cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    citySel.value = currentVal || '';
    const filtered = stationCityFilter ? stations.filter(s => s.city === stationCityFilter) : stations;
    renderStations(filtered);
  } catch (e) { toast(e.message, 'error'); }
}

$('filter-city').addEventListener('change', () => {
  stationCityFilter = $('filter-city').value;
  loadStations();
});

const FUEL_TYPES = [
  { key: 'gasolina_comum', label: 'Gasolina Comum' },
  { key: 'gasolina_aditivada', label: 'Gasolina Aditivada' },
  { key: 'gasolina_premium', label: 'Gasolina Premium' },
  { key: 'etanol', label: 'Etanol' },
  { key: 'diesel', label: 'Diesel' },
];

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderStations(list) {
  const data = list || stations;
  const el = $('station-list');
  if (!data.length) {
    el.innerHTML = '<div class="card"><div class="empty"><p>Nenhum posto encontrado</p></div></div>';
    return;
  }
  el.innerHTML = data.map(s => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="cursor:pointer;font-size:1.3rem" class="btn-fav" data-id="${s.id}" data-fav="${s.favorite}">${s.favorite ? '⭐' : '☆'}</span>
            <h2 style="margin-bottom:2px">${esc(s.name)}</h2>
          </div>
          <small style="color:var(--text-muted)">${s.address ? esc(s.address) : 'Sem endereço'}</small>
          ${s.city ? `<br><small style="color:var(--primary)">📍 ${esc(s.city)}${s.state ? ` - ${esc(s.state)}` : ''}</small>` : ''}
        </div>
        <div class="actions">
          <button class="btn btn-outline btn-sm btn-edit-station" data-id="${s.id}">Editar</button>
          <button class="btn btn-danger btn-sm btn-del-station" data-id="${s.id}">Excluir</button>
        </div>
      </div>
      <div class="fuel-prices" data-station="${s.id}">
        ${FUEL_TYPES.map(ft => `
          <div class="fuel-price-row">
            <label>${ft.label}</label>
            <input type="number" step="0.001" class="price-input" data-station="${s.id}" data-fuel="${ft.key}" value="${s.prices[ft.key] || ''}" placeholder="0.000">
            <button class="btn btn-primary btn-sm btn-set-price" data-station="${s.id}" data-fuel="${ft.key}">Salvar</button>
            ${s.prices[ft.key] ? `<button class="btn btn-outline btn-sm btn-del-price" data-station="${s.id}" data-fuel="${ft.key}">×</button>` : ''}
          </div>
        `).join('')}
      </div>
      <div style="margin-top:8px;font-size:.8rem;color:var(--text-muted)">
        ${s.prices.etanol && s.prices.gasolina_comum
          ? (() => {
              const ratio = s.prices.etanol / s.prices.gasolina_comum;
              const recomend = ratio <= 0.7 ? '✅ Etanol compensa' : '⛽ Gasolina compensa';
              return `Etanol: ${(ratio * 100).toFixed(0)}% da gasolina — ${recomend}`;
            })()
          : 'Cadastre Gasolina Comum e Etanol para ver a recomendação'}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.btn-edit-station').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = stations.find(x => x.id === btn.dataset.id);
      if (s) openEditStationModal(s);
    });
  });

  el.querySelectorAll('.btn-del-station').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este posto?')) return;
      try {
        await withLoading(() => api.stations.delete(btn.dataset.id));
        toast('Posto excluído');
        await loadStations();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  el.querySelectorAll('.btn-fav').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const fav = btn.dataset.fav === 'true' ? false : true;
      try {
        await api.stations.update(id, { favorite: fav });
        toast(fav ? 'Posto favoritado' : 'Favorito removido');
        await loadStations();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  el.querySelectorAll('.btn-set-price').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stationId = btn.dataset.station;
      const fuelType = btn.dataset.fuel;
      const input = document.querySelector(`.price-input[data-station="${stationId}"][data-fuel="${fuelType}"]`);
      const price = parseFloat(input.value);
      if (isNaN(price) || price <= 0) return toast('Preço inválido', 'error');
      try {
        await api.stations.setPrice(stationId, fuelType, price);
        toast('Preço salvo');
        await loadStations();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  el.querySelectorAll('.btn-del-price').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.stations.deletePrice(btn.dataset.station, btn.dataset.fuel);
        toast('Preço removido');
        await loadStations();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// --- Edit Station Modal ---
function openEditStationModal(s) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Editar Posto</h3>
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="edit-station-name" value="${esc(s.name)}">
      </div>
      <div class="form-group">
        <label>Endereço</label>
        <input type="text" id="edit-station-address" value="${esc(s.address || '')}">
      </div>
      <div class="row">
        <div class="form-group">
          <label>Cidade</label>
          <input type="text" id="edit-station-city" value="${esc(s.city || '')}">
        </div>
        <div class="form-group">
          <label>Estado</label>
          <input type="text" id="edit-station-state" value="${esc(s.state || '')}" placeholder="UF" maxlength="2">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" id="btn-edit-station-cancel">Cancelar</button>
        <button class="btn btn-primary" id="btn-edit-station-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  $('btn-edit-station-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  $('btn-edit-station-save').addEventListener('click', async () => {
    const name = $('edit-station-name').value.trim();
    if (!name) return toast('Nome é obrigatório', 'error');
    try {
      await withLoading(() => api.stations.update(s.id, {
        name,
        address: $('edit-station-address').value.trim() || null,
        city: $('edit-station-city').value.trim() || null,
        state: $('edit-station-state').value.trim() || null,
      }));
      toast('Posto atualizado');
      overlay.remove();
      await loadStations();
    } catch (e) { toast(e.message, 'error'); }
  });
}

$('btn-add-station').addEventListener('click', async () => {
  const name = $('station-name').value.trim();
  if (!name) return toast('Nome é obrigatório', 'error');
  try {
    await withLoading(() => api.stations.create({
      name,
      address: $('station-address').value.trim() || null,
      city: $('station-city').value.trim() || null,
      state: $('station-state').value.trim() || null,
    }));
    toast('Posto adicionado');
    $('station-name').value = '';
    $('station-address').value = '';
    $('station-city').value = '';
    $('station-state').value = '';
    await loadStations();
  } catch (e) { toast(e.message, 'error'); }
});

// --- Init ---
function startApp() {
  $('refuel-date').value = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark');
    const btn = $('dark-toggle');
    if (btn) btn.textContent = '☀️';
  }
  loadVehicles();
}