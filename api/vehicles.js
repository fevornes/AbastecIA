const { cors, json, readBody, query, getIdFromUrl, initDb } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  await initDb();

  const id = getIdFromUrl(req.url, '/api/vehicles');

  try {
    if (req.method === 'GET' && !id) {
      const result = await query('SELECT * FROM vehicles ORDER BY created_at DESC');
      return json(res, 200, result.rows);
    }
    if (req.method === 'GET' && id) {
      const result = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
      if (!result.rows.length) return json(res, 404, { error: 'Veículo não encontrado' });
      return json(res, 200, result.rows[0]);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Nome é obrigatório' });
      const vid = crypto.randomUUID();
      const r = await query('INSERT INTO vehicles (id,name,plate,created_at) VALUES ($1,$2,$3,NOW()) RETURNING *', [vid, name, body.plate || null]);
      return json(res, 201, r.rows[0]);
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Nome é obrigatório' });
      await query('UPDATE vehicles SET name=$1, plate=$2 WHERE id=$3', [name, body.plate || null, id]);
      const r = await query('SELECT * FROM vehicles WHERE id=$1', [id]);
      if (!r.rows.length) return json(res, 404, { error: 'Veículo não encontrado' });
      return json(res, 200, r.rows[0]);
    }
    if (req.method === 'DELETE' && id) {
      await query('DELETE FROM refuels WHERE vehicle_id=$1', [id]);
      await query('DELETE FROM vehicles WHERE id=$1', [id]);
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('vehicles error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};
