let vehicles = [];
let stations = [];
let allRefuels = [];
let selectedVehicleId = null;
let editingVehicle = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let consumptionChart = null;
let currentPeriod = 'all';

function $(id) { return document.getElementById(id); }

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const FUEL_TYPES = [
  { key: 'gasolina_comum', label: 'Gasolina Comum' },
  { key: 'gasolina_aditivada', label: 'Gasolina Aditivada' },
  { key: 'gasolina_premium', label: 'Gasolina Premium' },
  { key: 'etanol', label: 'Etanol' },
  { key: 'diesel', label: 'Diesel' },
];

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
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
    $('tab-' + tab.dataset.tab).classList.remove('hidden');
    if (tab.dataset.tab === 'dashboard') loadDashboard();
    if (tab.dataset.tab === 'refuels') loadRefuelVehicleSelect();
    if (tab.dataset.tab === 'stations') loadStations();
  });
});

// --- Period filter ---
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    renderRefuels();
    renderRefuelStats();
  });
});

function filterByPeriod(list) {
  if (currentPeriod === 'all') return list;
  const now = new Date();
  let start;
  if (currentPeriod === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (currentPeriod === '3months') {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else if (currentPeriod === '6months') {
    start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  } else if (currentPeriod === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  }
  return list.filter(r => new Date(r.date) >= start);
}

// --- CSV Export ---
function exportCSV() {
  const list = filterByPeriod(allRefuels);
  if (!list.length) return toast('Nenhum dado para exportar', 'error');
  const headers = ['Data', 'KM', 'Litros', 'Preco/L', 'Combustivel', 'Total', 'Tanque Completo', 'Posto', 'Observacoes'];
  const rows = list.map(r => [
    r.date, r.km || '', r.liters, r.price_per_liter,
    r.fuel_type ? (FUEL_TYPES.find(f => f.key === r.fuel_type)?.label || r.fuel_type) : '',
    r.total_cost, r.is_full_tank ? 'Sim' : 'Nao', '', r.notes || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'abastecia_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado com sucesso');
}

$('btn-export-csv').addEventListener('click', exportCSV);

// --- Dashboard ---
async function loadDashboard() {
  try {
    vehicles = await api.vehicles.list();
    stations = await api.stations.list();
    let allR = [];
    for (const v of vehicles) {
      const r = await api.refuels.list(v.id);
      allR = allR.concat(r);
    }
    allRefuels = allR;
    renderDashboard();
    renderCompareStations();
    renderSavingsBanner();
  } catch (e) { toast(e.message, 'error'); }
}

function renderDashboard() {
  const el = $('dashboard-grid');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRefuels = allRefuels.filter(r => new Date(r.date) >= monthStart);
  const totalMonth = monthRefuels.reduce((s, r) => s + r.total_cost, 0);
  const totalAll = allRefuels.reduce((s, r) => s + r.total_cost, 0);
  const litersMonth = monthRefuels.reduce((s, r) => s + r.liters, 0);

  const sorted = [...allRefuels].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastRefuel = sorted[0];

  let avgPerMonth = 0;
  if (allRefuels.length) {
    const dates = allRefuels.map(r => new Date(r.date));
    const earliest = new Date(Math.min(...dates));
    const months = Math.max(1, (now - earliest) / (1000 * 60 * 60 * 24 * 30));
    avgPerMonth = totalAll / months;
  }

  el.innerHTML =
    '<div class="dash-card"><div class="dash-label">Gasto Este Mes</div><div class="dash-value">R$ ' + totalMonth.toFixed(2) + '</div><div class="dash-sub">' + monthRefuels.length + ' abastecimento(s)</div></div>' +
    '<div class="dash-card"><div class="dash-label">Total Geral</div><div class="dash-value">R$ ' + totalAll.toFixed(2) + '</div><div class="dash-sub">' + allRefuels.length + ' registros</div></div>' +
    '<div class="dash-card"><div class="dash-label">Media Mensal</div><div class="dash-value">R$ ' + avgPerMonth.toFixed(2) + '</div><div class="dash-sub">' + litersMonth.toFixed(1) + 'L este mes</div></div>' +
    '<div class="dash-card"><div class="dash-label">Ultimo Abastecimento</div><div class="dash-value">' + (lastRefuel ? lastRefuel.date : '-') + '</div><div class="dash-sub">' + (lastRefuel ? 'R$ ' + Number(lastRefuel.total_cost).toFixed(2) : 'Nenhum') + '</div></div>';
}

function renderSavingsBanner() {
  const el = $('savings-banner');
  if (!stations.length || !allRefuels.length) { el.innerHTML = ''; return; }
  const priceMap = {};
  for (const s of stations) {
    if (s.prices && s.prices.gasolina_comum) {
      priceMap[s.id] = { name: s.name, price: s.prices.gasolina_comum };
    }
  }
  const entries = Object.values(priceMap);
  if (entries.length < 2) { el.innerHTML = ''; return; }
  entries.sort((a, b) => a.price - b.price);
  const cheapest = entries[0];
  const avgLiters = allRefuels.reduce((s, r) => s + r.liters, 0) / allRefuels.length;
  const avgPrice = allRefuels.reduce((s, r) => s + r.price_per_liter, 0) / allRefuels.length;
  const potentialSavings = (avgPrice - cheapest.price) * avgLiters;
  if (potentialSavings <= 0) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="savings-banner"><div class="savings-icon">💡</div><div class="savings-text">Se abastecer no <strong>' + esc(cheapest.name) + '</strong> (o mais barato), voce economizaria cerca de</div><div class="savings-amount">R$ ' + potentialSavings.toFixed(2) + '/abastecida</div></div>';
}

function renderCompareStations() {
  const el = $('compare-stations');
  const withPrices = stations.filter(s => s.prices && Object.keys(s.prices).length > 0);
  if (!withPrices.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🏪</div><p>Cadastre postos com precos para comparar</p></div>';
    return;
  }
  const ranked = withPrices.map(s => {
    const prices = Object.values(s.prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return { ...s, avgPrice: avg };
  }).sort((a, b) => a.avgPrice - b.avgPrice);

  el.innerHTML = '<div class="stagger">' + ranked.map((s, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const fuelInfo = s.prices.gasolina_comum ? 'R$ ' + Number(s.prices.gasolina_comum).toFixed(3) + '/L gasolina' : 'R$ ' + s.avgPrice.toFixed(3) + ' media';
    return '<div class="compare-card"><div class="compare-rank ' + rankClass + '">' + (i + 1) + '</div><div class="compare-name">' + esc(s.name) + '<br><small style="color:var(--text-muted)">' + fuelInfo + '</small></div></div>';
  }).join('') + '</div>';
}

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
    el.innerHTML = '<div class="empty"><div class="empty-icon">🚗</div><p>Adicione seu primeiro veiculo</p><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'vehicle-name\').focus()">+ Adicionar Veiculo</button></div>';
    return;
  }
  el.innerHTML = '<div class="stagger">' + vehicles.map(v => {
    const refuelCount = allRefuels.filter(r => r.vehicle_id === v.id).length;
    return '<div class="vehicle-card ' + (selectedVehicleId === v.id ? 'selected' : '') + '" data-id="' + v.id + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><h3>' + esc(v.name) + '</h3><small>' + (v.plate ? esc(v.plate) : 'Sem placa') + (refuelCount ? ' · ' + refuelCount + ' abast.' : '') + '</small></div>' +
      '<div class="actions">' +
      '<button class="btn btn-outline btn-sm btn-edit-vehicle" data-id="' + v.id + '">✏️ Editar</button>' +
      '<button class="btn btn-danger btn-sm btn-del-vehicle" data-id="' + v.id + '">🗑️</button>' +
      '</div></div></div>';
  }).join('') + '</div>';

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
      $('btn-add-vehicle').textContent = '✏️ Atualizar';
    });
  });

  el.querySelectorAll('.btn-del-vehicle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Excluir veiculo e todos os abastecimentos?')) return;
      try {
        await withLoading(() => api.vehicles.delete(btn.dataset.id));
        toast('Veiculo excluido');
        if (selectedVehicleId === btn.dataset.id) selectedVehicleId = null;
        await loadVehicles();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

$('btn-add-vehicle').addEventListener('click', async () => {
  const name = $('vehicle-name').value.trim();
  if (!name) return toast('Nome e obrigatorio', 'error');
  try {
    await withLoading(async () => {
      if (editingVehicle) {
        await api.vehicles.update(editingVehicle, { name, plate: $('vehicle-plate').value.trim() });
        toast('Veiculo atualizado');
        editingVehicle = null;
        $('btn-add-vehicle').textContent = '➕ Adicionar';
      } else {
        await api.vehicles.create({ name, plate: $('vehicle-plate').value.trim() });
        toast('Veiculo adicionado');
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
      vehicles.map(v => '<option value="' + v.id + '">' + esc(v.name) + (v.plate ? ' - ' + esc(v.plate) : '') + '</option>').join('');
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
      cities.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    const selectedCity = citySel.value;
    if (selectedCity) {
      const filtered = stations.filter(s => s.city === selectedCity);
      $('refuel-station').innerHTML = '<option value="">-- Selecione --</option>' +
        filtered.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
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
    filtered.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
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
  if (sourceId === 'refuel-liters' && l && p) {
    $('refuel-total').value = (l * p).toFixed(2);
  } else if (sourceId === 'refuel-price' && l && p) {
    $('refuel-total').value = (l * p).toFixed(2);
  } else if (sourceId === 'refuel-total' && t && p) {
    $('refuel-liters').value = (t / p).toFixed(2);
  } else if (sourceId === 'refuel-total' && t && l) {
    $('refuel-price').value = (t / l).toFixed(3);
  } else if (sourceId === 'refuel-price' && t && !l) {
    $('refuel-liters').value = (t / p).toFixed(2);
  } else if (sourceId === 'refuel-liters' && t && !p) {
    $('refuel-price').value = (t / l).toFixed(3);
  }
}
['refuel-liters', 'refuel-price', 'refuel-total'].forEach(id => {
  $(id).addEventListener('input', () => calcRefuel(id));
});

$('btn-add-refuel').addEventListener('click', async () => {
  const vehicleId = $('refuel-vehicle').value;
  if (!vehicleId) return toast('Selecione um veiculo', 'error');
  const km = parseFloat($('refuel-km').value) || null;
  const liters = parseFloat($('refuel-liters').value);
  const pricePerLiter = parseFloat($('refuel-price').value);
  if (!liters || !pricePerLiter) return toast('Preencha Litros e Preco', 'error');

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
  const list = filterByPeriod(allRefuels);
  if (list.length < 2) { el.innerHTML = list.length ? '<p style="font-size:.85rem;color:var(--text-muted)">Registre mais abastecimentos para ver estatisticas</p>' : ''; return; }

  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
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
  const avgCostPerLiter = totalLiters > 0 ? (totalCost / totalLiters).toFixed(3) : 0;

  el.innerHTML =
    '<div class="dashboard-grid">' +
    '<div class="dash-card" style="border-left-color:var(--primary)"><div class="dash-label">Total Gasto</div><div class="dash-value">R$ ' + totalCost.toFixed(2) + '</div></div>' +
    '<div class="dash-card" style="border-left-color:var(--primary)"><div class="dash-label">Total Litros</div><div class="dash-value">' + totalLiters.toFixed(1) + ' L</div></div>' +
    (consumption ? '<div class="dash-card" style="border-left-color:var(--success-text)"><div class="dash-label">Consumo Medio</div><div class="dash-value">' + consumption + ' km/L</div></div>' : '') +
    '<div class="dash-card" style="border-left-color:var(--primary)"><div class="dash-label">Preco Medio</div><div class="dash-value">R$ ' + avgCostPerLiter + '</div></div>' +
    '<div class="dash-card" style="border-left-color:var(--primary)"><div class="dash-label">Abastecimentos</div><div class="dash-value">' + list.length + '</div></div>' +
    '</div>';
}

function renderRefuels() {
  const el = $('refuel-list');
  const list = filterByPeriod(allRefuels);
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">⛽</div><p>Nenhum abastecimento registrado</p><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'refuel-km\').focus()">+ Registrar Abastecimento</button></div>';
    return;
  }

  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  el.innerHTML = '<div class="table-wrap"><table>' +
    '<thead><tr><th>Data</th><th>KM</th><th>Litros</th><th>R$/L</th><th>Combustivel</th><th>Total</th><th>Tanque</th><th></th></tr></thead>' +
    '<tbody>' + pageItems.map(r =>
      '<tr>' +
      '<td>' + r.date + '</td>' +
      '<td>' + (r.km != null ? r.km : '-') + '</td>' +
      '<td>' + r.liters.toFixed(2) + '</td>' +
      '<td>R$ ' + Number(r.price_per_liter).toFixed(3) + '</td>' +
      '<td>' + (r.fuel_type ? (FUEL_TYPES.find(f => f.key === r.fuel_type)?.label || esc(r.fuel_type)) : '-') + '</td>' +
      '<td><strong>R$ ' + Number(r.total_cost).toFixed(2) + '</strong></td>' +
      '<td>' + (r.is_full_tank ? '✅' : '❌') + '</td>' +
      '<td>' +
      '<button class="btn btn-outline btn-sm btn-edit-refuel" data-id="' + r.id + '">✏️</button> ' +
      '<button class="btn btn-danger btn-sm btn-del-refuel" data-id="' + r.id + '">🗑️</button>' +
      '</td></tr>'
    ).join('') +
    '</tbody></table></div>';

  if (totalPages > 1) {
    let pagHtml = '<div class="pagination">';
    pagHtml += '<button class="page-btn" data-page="prev" ' + (currentPage <= 1 ? 'disabled' : '') + '>&laquo;</button>';
    for (let i = 1; i <= totalPages; i++) {
      pagHtml += '<button class="page-btn ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    pagHtml += '<button class="page-btn" data-page="next" ' + (currentPage >= totalPages ? 'disabled' : '') + '>&raquo;</button>';
    pagHtml += '<span class="page-info">' + (start + 1) + '-' + Math.min(start + PAGE_SIZE, list.length) + ' de ' + list.length + '</span>';
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

  el.querySelectorAll('.btn-edit-refuel').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = allRefuels.find(x => x.id === btn.dataset.id);
      if (r) openEditRefuelModal(r);
    });
  });

  el.querySelectorAll('.btn-del-refuel').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este abastecimento?')) return;
      try {
        await withLoading(() => api.refuels.delete(btn.dataset.id));
        toast('Abastecimento excluido');
        await loadRefuels();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// --- Edit Refuel Modal ---
function openEditRefuelModal(r) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal"><h3>Editar Abastecimento</h3>' +
    '<div class="form-group"><label>Data</label><input type="date" id="edit-refuel-date" value="' + r.date + '"></div>' +
    '<div class="row"><div class="form-group"><label>KM</label><input type="number" step="0.1" id="edit-refuel-km" value="' + (r.km != null ? r.km : '') + '"></div>' +
    '<div class="form-group"><label>Litros</label><input type="number" step="0.01" id="edit-refuel-liters" value="' + r.liters + '"></div></div>' +
    '<div class="row"><div class="form-group"><label>Preco por Litro (R$)</label><input type="number" step="0.001" id="edit-refuel-price" value="' + r.price_per_liter + '"></div>' +
    '<div class="form-group"><label>Valor Total (R$)</label><input type="number" step="0.01" id="edit-refuel-total" value="' + r.total_cost + '"></div></div>' +
    '<div class="row"><div class="form-group"><label>Combustivel</label><select id="edit-refuel-fuel">' +
    FUEL_TYPES.map(ft => '<option value="' + ft.key + '" ' + (r.fuel_type === ft.key ? 'selected' : '') + '>' + ft.label + '</option>').join('') +
    '</select></div><div class="form-group" style="display:flex;align-items:center;justify-content:center"><label style="margin-bottom:0;cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" id="edit-refuel-fulltank" ' + (r.is_full_tank ? 'checked' : '') + ' style="width:16px;height:16px"> Tanque completo</label></div></div>' +
    '<div class="form-group"><label>Observacoes</label><textarea id="edit-refuel-notes" rows="2">' + (r.notes || '') + '</textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-outline" id="btn-edit-refuel-cancel">Cancelar</button><button class="btn btn-primary" id="btn-edit-refuel-save">Salvar</button></div></div>';
  document.body.appendChild(overlay);

  function calcEditRefuel(sourceId) {
    const l = parseFloat($('edit-refuel-liters').value) || 0;
    const p = parseFloat($('edit-refuel-price').value) || 0;
    const t = parseFloat($('edit-refuel-total').value) || 0;
    if (sourceId === 'edit-refuel-liters' && l && p) {
      $('edit-refuel-total').value = (l * p).toFixed(2);
    } else if (sourceId === 'edit-refuel-price' && l && p) {
      $('edit-refuel-total').value = (l * p).toFixed(2);
    } else if (sourceId === 'edit-refuel-total' && t && p) {
      $('edit-refuel-liters').value = (t / p).toFixed(2);
    } else if (sourceId === 'edit-refuel-total' && t && l) {
      $('edit-refuel-price').value = (t / l).toFixed(3);
    } else if (sourceId === 'edit-refuel-price' && t && !l) {
      $('edit-refuel-liters').value = (t / p).toFixed(2);
    } else if (sourceId === 'edit-refuel-liters' && t && !p) {
      $('edit-refuel-price').value = (t / l).toFixed(3);
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
    if (!liters || !pricePerLiter) return toast('Preencha Litros e Preco', 'error');
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
  const list = filterByPeriod(allRefuels);
  if (list.length < 2) { container.innerHTML = ''; return; }
  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  container.innerHTML = '<h3>Historico de Abastecimentos</h3><div style="position:relative;height:250px"><canvas id="consumption-chart"></canvas></div>';
  destroyChart();
  const ctx = document.getElementById('consumption-chart').getContext('2d');
  const isDark = document.body.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';
  const textColor = isDark ? '#aaa' : '#666';

  consumptionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(r => r.date),
      datasets: [
        { label: 'Valor (R$)', data: sorted.map(r => r.total_cost), backgroundColor: 'rgba(114,188,210,.7)', borderColor: '#72BCD2', borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
        { label: 'Litros', data: sorted.map(r => r.liters), backgroundColor: 'rgba(255,152,0,.5)', borderColor: '#ff9800', borderWidth: 1, borderRadius: 4, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor, usePointStyle: true, padding: 16 } } },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45 }, grid: { color: gridColor } },
        y: { beginAtZero: true, position: 'left', ticks: { color: textColor }, grid: { color: gridColor }, title: { display: true, text: 'R$', color: textColor } },
        y1: { beginAtZero: true, position: 'right', ticks: { color: textColor }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Litros', color: textColor } }
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
      cities.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    citySel.value = currentVal || '';
    const filtered = stationCityFilter ? stations.filter(s => s.city === stationCityFilter) : stations;
    renderStations(filtered);
  } catch (e) { toast(e.message, 'error'); }
}

$('filter-city').addEventListener('change', () => {
  stationCityFilter = $('filter-city').value;
  loadStations();
});

function renderStations(list) {
  const data = list || stations;
  const el = $('station-list');
  if (!data.length) {
    el.innerHTML = '<div class="card"><div class="empty"><div class="empty-icon">🏪</div><p>Nenhum posto encontrado</p><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'station-name\').focus()">+ Adicionar Posto</button></div></div>';
    return;
  }
  el.innerHTML = '<div class="stagger">' + data.map(s => {
    const fuelRows = FUEL_TYPES.map(ft =>
      '<div class="fuel-price-row"><label>' + ft.label + '</label>' +
      '<input type="number" step="0.001" class="price-input" data-station="' + s.id + '" data-fuel="' + ft.key + '" value="' + (s.prices[ft.key] || '') + '" placeholder="0.000">' +
      '<button class="btn btn-primary btn-sm btn-set-price" data-station="' + s.id + '" data-fuel="' + ft.key + '">💾</button>' +
      (s.prices[ft.key] ? '<button class="btn btn-outline btn-sm btn-del-price" data-station="' + s.id + '" data-fuel="' + ft.key + '">×</button>' : '') +
      '</div>'
    ).join('');

    const ratioInfo = s.prices.etanol && s.prices.gasolina_comum
      ? (() => {
          const ratio = s.prices.etanol / s.prices.gasolina_comum;
          return ratio <= 0.7 ? '✅ Etanol compensa (' + (ratio * 100).toFixed(0) + '%)' : '⛽ Gasolina compensa (' + (ratio * 100).toFixed(0) + '%)';
        })()
      : '';

    return '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<div style="flex:1"><div style="display:flex;align-items:center;gap:8px">' +
      '<span style="cursor:pointer;font-size:1.3rem" class="btn-fav" data-id="' + s.id + '" data-fav="' + s.favorite + '">' + (s.favorite ? '⭐' : '☆') + '</span>' +
      '<h2 style="margin-bottom:2px">' + esc(s.name) + '</h2></div>' +
      '<small style="color:var(--text-muted)">' + (s.address ? esc(s.address) : '') + '</small>' +
      (s.city ? '<br><small style="color:var(--primary)">📍 ' + esc(s.city) + (s.state ? ' - ' + esc(s.state) : '') + '</small>' : '') +
      '</div><div class="actions">' +
      '<button class="btn btn-outline btn-sm btn-edit-station" data-id="' + s.id + '">✏️</button>' +
      '<button class="btn btn-danger btn-sm btn-del-station" data-id="' + s.id + '">🗑️</button>' +
      '</div></div>' +
      '<div class="fuel-prices">' + fuelRows + '</div>' +
      (ratioInfo ? '<div style="margin-top:8px;font-size:.8rem;color:var(--text-muted)">' + ratioInfo + '</div>' : '') +
      '</div>';
  }).join('') + '</div>';

  el.querySelectorAll('.btn-edit-station').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = stations.find(x => x.id === btn.dataset.id);
      if (s) openEditStationModal(s);
    });
  });
  el.querySelectorAll('.btn-del-station').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este posto?')) return;
      try { await withLoading(() => api.stations.delete(btn.dataset.id)); toast('Posto excluido'); await loadStations(); }
      catch (e) { toast(e.message, 'error'); }
    });
  });
  el.querySelectorAll('.btn-fav').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fav = btn.dataset.fav === 'true' ? false : true;
      try { await api.stations.update(btn.dataset.id, { favorite: fav }); toast(fav ? 'Favoritado' : 'Desfavoritado'); await loadStations(); }
      catch (e) { toast(e.message, 'error'); }
    });
  });
  el.querySelectorAll('.btn-set-price').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = document.querySelector('.price-input[data-station="' + btn.dataset.station + '"][data-fuel="' + btn.dataset.fuel + '"]');
      const price = parseFloat(input.value);
      if (isNaN(price) || price <= 0) return toast('Preco invalido', 'error');
      try { await api.stations.setPrice(btn.dataset.station, btn.dataset.fuel, price); toast('Preco salvo'); await loadStations(); }
      catch (e) { toast(e.message, 'error'); }
    });
  });
  el.querySelectorAll('.btn-del-price').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { await api.stations.deletePrice(btn.dataset.station, btn.dataset.fuel); toast('Preco removido'); await loadStations(); }
      catch (e) { toast(e.message, 'error'); }
    });
  });
}

function openEditStationModal(s) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal"><h3>Editar Posto</h3>' +
    '<div class="form-group"><label>Nome</label><input type="text" id="edit-station-name" value="' + esc(s.name) + '"></div>' +
    '<div class="form-group"><label>Endereco</label><input type="text" id="edit-station-address" value="' + esc(s.address || '') + '"></div>' +
    '<div class="row"><div class="form-group"><label>Cidade</label><input type="text" id="edit-station-city" value="' + esc(s.city || '') + '"></div>' +
    '<div class="form-group"><label>Estado</label><input type="text" id="edit-station-state" value="' + esc(s.state || '') + '" placeholder="UF" maxlength="2"></div></div>' +
    '<div class="modal-actions"><button class="btn btn-outline" id="btn-edit-station-cancel">Cancelar</button>' +
    '<button class="btn btn-primary" id="btn-edit-station-save">Salvar</button></div></div>';
  document.body.appendChild(overlay);
  $('btn-edit-station-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  $('btn-edit-station-save').addEventListener('click', async () => {
    const name = $('edit-station-name').value.trim();
    if (!name) return toast('Nome e obrigatorio', 'error');
    try {
      await withLoading(() => api.stations.update(s.id, {
        name, address: $('edit-station-address').value.trim() || null,
        city: $('edit-station-city').value.trim() || null, state: $('edit-station-state').value.trim() || null,
      }));
      toast('Posto atualizado'); overlay.remove(); await loadStations();
    } catch (e) { toast(e.message, 'error'); }
  });
}

$('btn-add-station').addEventListener('click', async () => {
  const name = $('station-name').value.trim();
  if (!name) return toast('Nome e obrigatorio', 'error');
  try {
    await withLoading(() => api.stations.create({
      name, address: $('station-address').value.trim() || null,
      city: $('station-city').value.trim() || null, state: $('station-state').value.trim() || null,
    }));
    toast('Posto adicionado');
    $('station-name').value = ''; $('station-address').value = '';
    $('station-city').value = ''; $('station-state').value = '';
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
  loadDashboard();
}
