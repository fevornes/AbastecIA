const { supabase, cors, json, readBody } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://localhost');
      const stationId = urlObj.searchParams.get('stationId');
      let query = supabase.from('fuel_prices').select('*');
      if (stationId) query = query.eq('station_id', stationId);
      query = query.order('fuel_type');
      const { data, error } = await query;
      if (error) throw error;
      return json(res, 200, data || []);
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      const { stationId, fuelType, price } = body;
      if (!stationId || !fuelType || price == null)
        return json(res, 400, { error: 'stationId, fuelType e price são obrigatórios' });
      const valid = ['gasolina_comum','gasolina_aditivada','gasolina_premium','etanol','diesel'];
      if (!valid.includes(fuelType)) return json(res, 400, { error: 'Tipo de combustível inválido' });
      // Check if price exists
      const { data: existing } = await supabase.from('fuel_prices').select('id').eq('station_id', stationId).eq('fuel_type', fuelType).maybeSingle();
      if (existing) {
        const { data, error } = await supabase.from('fuel_prices').update({ price }).eq('id', existing.id).select().single();
        if (error) throw error;
        return json(res, 200, data);
      } else {
        const { data, error } = await supabase.from('fuel_prices').insert({ id: crypto.randomUUID(), station_id: stationId, fuel_type: fuelType, price }).select().single();
        if (error) throw error;
        return json(res, 201, data);
      }
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req);
      const { stationId, fuelType } = body;
      if (!stationId || !fuelType) return json(res, 400, { error: 'stationId e fuelType são obrigatórios' });
      const { error } = await supabase.from('fuel_prices').delete().eq('station_id', stationId).eq('fuel_type', fuelType);
      if (error) throw error;
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('fuel-prices error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};
