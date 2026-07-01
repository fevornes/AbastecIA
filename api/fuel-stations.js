const { supabase, cors, json, readBody, getIdFromUrl } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const id = getIdFromUrl(req.url);
  const urlObj = new URL(req.url, 'http://localhost');
  const city = urlObj.searchParams.get('city');

  try {
    if (req.method === 'GET') {
      let query = supabase.from('fuel_stations').select('*');
      if (city) query = query.ilike('city', `%${city}%`);
      query = query.order('favorite', { ascending: false }).order('name');
      const { data: stations, error: sErr } = await query;
      if (sErr) throw sErr;

      const { data: prices, error: pErr } = await supabase.from('fuel_prices').select('*');
      if (pErr) throw pErr;

      const priceMap = {};
      for (const row of (prices || [])) {
        if (!priceMap[row.station_id]) priceMap[row.station_id] = {};
        priceMap[row.station_id][row.fuel_type] = row.price;
      }
      const result = (stations || []).map(s => ({ ...s, prices: priceMap[s.id] || {} }));
      return json(res, 200, result);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Nome é obrigatório' });
      const { data, error } = await supabase.from('fuel_stations').insert({
        id: crypto.randomUUID(), name, address: body.address || null,
        city: body.city || null, state: body.state || null,
        favorite: body.favorite || false,
      }).select().single();
      if (error) throw error;
      return json(res, 201, { ...data, prices: {} });
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req);
      const updates = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.address !== undefined) updates.address = body.address;
      if (body.city !== undefined) updates.city = body.city;
      if (body.state !== undefined) updates.state = body.state;
      if (body.favorite !== undefined) updates.favorite = body.favorite;
      const { data, error } = await supabase.from('fuel_stations').update(updates).eq('id', id).select().single();
      if (error) return json(res, 404, { error: 'Posto não encontrado' });
      return json(res, 200, data);
    }
    if (req.method === 'DELETE' && id) {
      await supabase.from('fuel_prices').delete().eq('station_id', id);
      const { error } = await supabase.from('fuel_stations').delete().eq('id', id);
      if (error) throw error;
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('fuel-stations error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};
