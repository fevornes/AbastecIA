const { cors, json, readBody, query, initDb } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  await initDb();

  try {
    if (req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://localhost');
      const stationId = urlObj.searchParams.get('stationId');
      let sql = 'SELECT * FROM fuel_prices';
      const params = [];
      if (stationId) { sql += ' WHERE station_id = $1'; params.push(stationId); }
      sql += ' ORDER BY fuel_type';
      const r = await query(sql, params);
      return json(res, 200, r.rows);
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      const { stationId, fuelType, price } = body;
      if (!stationId || !fuelType || price == null)
        return json(res, 400, { error: 'stationId, fuelType e price são obrigatórios' });
      const valid = ['gasolina_comum','gasolina_aditivada','gasolina_premium','etanol','diesel'];
      if (!valid.includes(fuelType)) return json(res, 400, { error: 'Tipo de combustível inválido' });
      const s = await query('SELECT id FROM fuel_stations WHERE id=$1', [stationId]);
      if (!s.rows.length) return json(res, 404, { error: 'Posto não encontrado' });
      const existing = await query('SELECT id FROM fuel_prices WHERE station_id=$1 AND fuel_type=$2', [stationId, fuelType]);
      if (existing.rows.length) {
        await query('UPDATE fuel_prices SET price=$1, updated_at=NOW() WHERE station_id=$2 AND fuel_type=$3', [price, stationId, fuelType]);
        const r = await query('SELECT * FROM fuel_prices WHERE station_id=$1 AND fuel_type=$2', [stationId, fuelType]);
        return json(res, 200, r.rows[0]);
      } else {
        const pid = crypto.randomUUID();
        await query('INSERT INTO fuel_prices (id,station_id,fuel_type,price,updated_at) VALUES ($1,$2,$3,$4,NOW())', [pid, stationId, fuelType, price]);
        const r = await query('SELECT * FROM fuel_prices WHERE id=$1', [pid]);
        return json(res, 201, r.rows[0]);
      }
    }
    if (req.method === 'DELETE') {
      const body = await readBody(req);
      const { stationId, fuelType } = body;
      if (!stationId || !fuelType) return json(res, 400, { error: 'stationId e fuelType são obrigatórios' });
      await query('DELETE FROM fuel_prices WHERE station_id=$1 AND fuel_type=$2', [stationId, fuelType]);
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('fuel-prices error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};
