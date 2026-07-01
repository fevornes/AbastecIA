const { supabase, cors, json, readBody, getIdFromUrl, verifyAuth } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const userId = await verifyAuth(req);
  if (!userId) return json(res, 401, { error: 'Não autenticado' });

  const id = getIdFromUrl(req.url);
  const urlObj = new URL(req.url, 'http://localhost');
  const vehicleId = urlObj.searchParams.get('vehicleId');

  try {
    if (req.method === 'GET' && !id) {
      let query = supabase.from('refuels').select('*').eq('user_id', userId);
      if (vehicleId) query = query.eq('vehicle_id', vehicleId);
      query = query.order('date', { ascending: false }).order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return json(res, 200, data || []);
    }
    if (req.method === 'GET' && id) {
      const { data, error } = await supabase.from('refuels').select('*').eq('id', id).eq('user_id', userId).single();
      if (error) return json(res, 404, { error: 'Abastecimento não encontrado' });
      return json(res, 200, data);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const { vehicleId: vid, date, km, liters, pricePerLiter, totalCost, isFullTank, notes, receipt, stationId, fuelType } = body;
      if (!vid || liters == null || pricePerLiter == null)
        return json(res, 400, { error: 'vehicleId, liters e pricePerLiter são obrigatórios' });
      const { data, error } = await supabase.from('refuels').insert({
        id: crypto.randomUUID(), vehicle_id: vid, date: date || new Date().toISOString().slice(0, 10),
        km, liters, price_per_liter: pricePerLiter, total_cost: totalCost ?? (Number(liters) * Number(pricePerLiter)),
        is_full_tank: isFullTank ?? true, notes: notes || null, receipt: receipt || null, station_id: stationId || null,
        fuel_type: fuelType || null, user_id: userId,
      }).select().single();
      if (error) throw error;
      return json(res, 201, data);
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req);
      const { date, km, liters, pricePerLiter, totalCost, isFullTank, notes, receipt, stationId, fuelType } = body;
      const { data: existing } = await supabase.from('refuels').select('id').eq('id', id).eq('user_id', userId).single();
      if (!existing) return json(res, 404, { error: 'Abastecimento não encontrado' });
      const updates = {};
      if (date !== undefined) updates.date = date;
      if (km !== undefined) updates.km = km;
      if (liters !== undefined) updates.liters = liters;
      if (pricePerLiter !== undefined) updates.price_per_liter = pricePerLiter;
      if (totalCost !== undefined) updates.total_cost = totalCost;
      if (isFullTank !== undefined) updates.is_full_tank = isFullTank;
      if (notes !== undefined) updates.notes = notes;
      if (receipt !== undefined) updates.receipt = receipt;
      if (stationId !== undefined) updates.station_id = stationId;
      if (fuelType !== undefined) updates.fuel_type = fuelType;
      const { data, error } = await supabase.from('refuels').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return json(res, 200, data);
    }
    if (req.method === 'DELETE' && id) {
      const { data: existing } = await supabase.from('refuels').select('id').eq('id', id).eq('user_id', userId).single();
      if (!existing) return json(res, 404, { error: 'Abastecimento não encontrado' });
      const { error } = await supabase.from('refuels').delete().eq('id', id);
      if (error) throw error;
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('refuels error:', JSON.stringify(err.message || err));
    json(res, 500, { error: err.message || 'Erro interno' });
  }
};
