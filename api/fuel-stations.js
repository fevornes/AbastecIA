const { cors, json, readBody, query, getIdFromUrl, initDb } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  await initDb();

  const id = getIdFromUrl(req.url, '/api/fuel-stations');

  try {
    if (req.method === 'GET') {
      const stations = await query('SELECT * FROM fuel_stations ORDER BY name');
      const prices = await query('SELECT * FROM fuel_prices');
      const priceMap = {};
      for (const row of prices.rows) {
        if (!priceMap[row.station_id]) priceMap[row.station_id] = {};
        priceMap[row.station_id][row.fuel_type] = row.price;
      }
      const result = stations.rows.map(s => ({ ...s, prices: priceMap[s.id] || {} }));
      return json(res, 200, result);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Nome é obrigatório' });
      const sid = crypto.randomUUID();
      await query('INSERT INTO fuel_stations (id,name,address,created_at) VALUES ($1,$2,$3,NOW())', [sid, name, body.address || null]);
      return json(res, 201, { id: sid, name, address: body.address || null, prices: {} });
    }
    if (req.method === 'DELETE' && id) {
      await query('DELETE FROM fuel_prices WHERE station_id=$1', [id]);
      await query('DELETE FROM fuel_stations WHERE id=$1', [id]);
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('fuel-stations error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};
