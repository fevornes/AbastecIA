const { cors, json, readBody, query, getIdFromUrl, initDb } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  await initDb();

  const id = getIdFromUrl(req.url, '/api/refuels');
  const urlObj = new URL(req.url, 'http://localhost');
  const vehicleId = urlObj.searchParams.get('vehicleId');

  try {
    if (req.method === 'GET' && !id) {
      let sql = 'SELECT r.*, rs.name as station_name FROM refuels r LEFT JOIN fuel_stations rs ON r.station_id = rs.id';
      const params = [];
      if (vehicleId) { sql += ' WHERE r.vehicle_id = $1'; params.push(vehicleId); }
      sql += ' ORDER BY r.date DESC, r.created_at DESC';
      const result = await query(sql, params);
      return json(res, 200, result.rows);
    }
    if (req.method === 'GET' && id) {
      const r = await query('SELECT r.*, rs.name as station_name FROM refuels r LEFT JOIN fuel_stations rs ON r.station_id = rs.id WHERE r.id = $1', [id]);
      if (!r.rows.length) return json(res, 404, { error: 'Abastecimento não encontrado' });
      return json(res, 200, r.rows[0]);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const { vehicleId: vid, date, km, liters, pricePerLiter, totalCost, isFullTank, notes, receipt, stationId } = body;
      if (!vid || km == null || liters == null || pricePerLiter == null)
        return json(res, 400, { error: 'vehicleId, km, liters e pricePerLiter são obrigatórios' });
      const v = await query('SELECT id FROM vehicles WHERE id=$1', [vid]);
      if (!v.rows.length) return json(res, 404, { error: 'Veículo não encontrado' });
      const rid = crypto.randomUUID();
      const r = await query(
        'INSERT INTO refuels (id,vehicle_id,date,km,liters,price_per_liter,total_cost,is_full_tank,notes,receipt,station_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING *',
        [rid, vid, date || new Date().toISOString().slice(0, 10), km, liters, pricePerLiter, totalCost ?? (Number(liters) * Number(pricePerLiter)), isFullTank ?? true, notes || null, receipt || null, stationId || null]
      );
      return json(res, 201, r.rows[0]);
    }
    if (req.method === 'DELETE' && id) {
      await query('DELETE FROM refuels WHERE id=$1', [id]);
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('refuels error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};
