let vehicles = [];
let stations = [];
let selectedVehicleId = null;
let editingVehicle = null;
let editingStation = null;

function $(id) { return document.getElementById(id); }

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    if (tab.dataset.tab === 'refuels') loadRefuelVehicleSelect();
    if (tab.dataset.tab === 'stations') loadStations();
  });
});

// --- Vehicles ---
async function loadVehicles() {
  try {
    vehicles = await api.vehicles.list();
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
        await api.vehicles.delete(btn.dataset.id);
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
    if (editingVehicle) {
      await api.vehicles.update(editingVehicle, { name, plate: $('vehicle-plate').value.trim() });
      toast('Veículo atualizado');
      editingVehicle = null;
      $('btn-add-vehicle').textContent = 'Adicionar';
    } else {
      await api.vehicles.create({ name, plate: $('vehicle-plate').value.trim() });
      toast('Veículo adicionado');
    }
    $('vehicle-name').value = '';
    $('vehicle-plate').value = '';
    await loadVehicles();
  } catch (e) { toast(e.message, 'error'); }
});

// --- Refuels ---
async function loadRefuelVehicleSelect() {
  try {
    vehicles = await api.vehicles.list();
    const sel = $('refuel-vehicle');
    sel.innerHTML = '<option value="">-- Selecione --</option>' +
      vehicles.map(v => `<option value="${v.id}">${esc(v.name)}${v.plate ? ' - ' + esc(v.plate) : ''}</option>`).join('');
    sel.value = selectedVehicleId || '';
    loadStationsSelect();
    if (selectedVehicleId) loadRefuels();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadStationsSelect() {
  try {
    stations = await api.stations.list();
    const sel = $('refuel-station');
    sel.innerHTML = '<option value="">-- Nenhum --</option>' +
      stations.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  } catch (e) { /* ignore */ }
}

$('refuel-vehicle').addEventListener('change', () => {
  selectedVehicleId = $('refuel-vehicle').value;
  if (selectedVehicleId) { loadRefuels(); renderVehicles(); }
  else { $('refuel-list').innerHTML = ''; $('refuel-stats').innerHTML = ''; }
});

// auto-calculate total
['refuel-liters', 'refuel-price'].forEach(id => {
  $(id).addEventListener('input', () => {
    const l = parseFloat($('refuel-liters').value) || 0;
    const p = parseFloat($('refuel-price').value) || 0;
    if (l && p) $('refuel-total').value = (l * p).toFixed(2);
  });
});

$('btn-add-refuel').addEventListener('click', async () => {
  const vehicleId = $('refuel-vehicle').value;
  if (!vehicleId) return toast('Selecione um veículo', 'error');
  const km = parseFloat($('refuel-km').value);
  const liters = parseFloat($('refuel-liters').value);
  const pricePerLiter = parseFloat($('refuel-price').value);
  if (!km || !liters || !pricePerLiter) return toast('Preencha KM, Litros e Preço', 'error');

  let receipt = null;
  const fileInput = $('refuel-receipt');
  if (fileInput.files.length) {
    try {
      const uploadRes = await api.upload(fileInput.files[0]);
      receipt = uploadRes.url;
    } catch (e) { toast('Erro no upload: ' + e.message, 'error'); return; }
  }

  try {
    await api.refuels.create({
      vehicleId,
      date: $('refuel-date').value || new Date().toISOString().slice(0, 10),
      km, liters, pricePerLiter,
      totalCost: parseFloat($('refuel-total').value) || (liters * pricePerLiter),
      isFullTank: $('refuel-fulltank').checked,
      notes: $('refuel-notes').value.trim() || null,
      receipt,
      stationId: $('refuel-station').value || null,
    });
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
    const list = await api.refuels.list(selectedVehicleId);
    renderRefuels(list);
    renderRefuelStats(list);
  } catch (e) { toast(e.message, 'error'); }
}

function renderRefuelStats(list) {
  const el = $('refuel-stats');
  if (list.length < 2) { el.innerHTML = ''; return; }

  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const fullTanks = sorted.filter(r => r.is_full_tank);

  if (fullTanks.length < 2) { el.innerHTML = '<p style="font-size:.85rem;color:#999">Registre ao menos 2 abastecimentos com tanque cheio para ver estatísticas</p>'; return; }

  // Calculate consumption from last two full tank refuels
  const lastTwo = fullTanks.slice(-2);
  const kmDiff = lastTwo[1].km - lastTwo[0].km;
  const litersSum = lastTwo[1].liters;
  const consumption = kmDiff > 0 && litersSum > 0 ? (kmDiff / litersSum).toFixed(1) : null;

  let totalLiters = 0, totalCost = 0;
  list.forEach(r => { totalLiters += r.liters; totalCost += r.total_cost; });

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
      <div style="background:#f0f4ff;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:#666">Total Gasto</div>
        <div style="font-size:1.2rem;font-weight:700;color:#1a73e8">R$ ${totalCost.toFixed(2)}</div>
      </div>
      <div style="background:#f0f4ff;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:#666">Total Litros</div>
        <div style="font-size:1.2rem;font-weight:700;color:#1a73e8">${totalLiters.toFixed(1)} L</div>
      </div>
      ${consumption ? `
      <div style="background:#e8f5e9;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:#666">Consumo Médio</div>
        <div style="font-size:1.2rem;font-weight:700;color:#2e7d32">${consumption} km/L</div>
      </div>` : ''}
      <div style="background:#f0f4ff;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:.7rem;color:#666">Abastecimentos</div>
        <div style="font-size:1.2rem;font-weight:700;color:#1a73e8">${list.length}</div>
      </div>
    </div>
  `;
}

function renderRefuels(list) {
  const el = $('refuel-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><p>Nenhum abastecimento registrado</p></div>';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>Data</th><th>KM</th><th>Litros</th><th>R$/L</th><th>Total</th><th>Comprovante</th><th></th></tr></thead>
    <tbody>${list.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.km}</td>
        <td>${r.liters.toFixed(2)}</td>
        <td>R$ ${Number(r.price_per_liter).toFixed(3)}</td>
        <td>R$ ${Number(r.total_cost).toFixed(2)}</td>
        <td>${r.receipt ? `<a href="${esc(r.receipt)}" target="_blank" style="color:#1a73e8">📎 Ver</a>` : '-'}</td>
        <td><button class="btn btn-danger btn-sm btn-del-refuel" data-id="${r.id}">Excluir</button></td>
      </tr>
    `).join('')}</tbody>
  </table>`;

  el.querySelectorAll('.btn-del-refuel').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este abastecimento?')) return;
      try {
        await api.refuels.delete(btn.dataset.id);
        toast('Abastecimento excluído');
        await loadRefuels();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// --- Stations ---
async function loadStations() {
  try {
    stations = await api.stations.list();
    renderStations();
  } catch (e) { toast(e.message, 'error'); }
}

const FUEL_TYPES = [
  { key: 'gasolina_comum', label: 'Gasolina Comum' },
  { key: 'gasolina_aditivada', label: 'Gasolina Aditivada' },
  { key: 'gasolina_premium', label: 'Gasolina Premium' },
  { key: 'etanol', label: 'Etanol' },
  { key: 'diesel', label: 'Diesel' },
];

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderStations() {
  const el = $('station-list');
  if (!stations.length) {
    el.innerHTML = '<div class="card"><div class="empty"><p>Nenhum posto cadastrado</p></div></div>';
    return;
  }
  el.innerHTML = stations.map(s => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h2 style="margin-bottom:2px">${esc(s.name)}</h2>
          <small style="color:#999">${s.address ? esc(s.address) : 'Sem endereço'}</small>
        </div>
        <button class="btn btn-danger btn-sm btn-del-station" data-id="${s.id}">Excluir</button>
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
      <div style="margin-top:8px;font-size:.8rem;color:#999">
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

  el.querySelectorAll('.btn-del-station').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este posto?')) return;
      try {
        await api.stations.delete(btn.dataset.id);
        toast('Posto excluído');
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

$('btn-add-station').addEventListener('click', async () => {
  const name = $('station-name').value.trim();
  if (!name) return toast('Nome é obrigatório', 'error');
  try {
    await api.stations.create({ name, address: $('station-address').value.trim() });
    toast('Posto adicionado');
    $('station-name').value = '';
    $('station-address').value = '';
    await loadStations();
  } catch (e) { toast(e.message, 'error'); }
});

// --- Init ---
loadVehicles();
