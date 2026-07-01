const { supabase, cors, json, readBody, getIdFromUrl, verifyAuth } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const userId = await verifyAuth(req);
  if (!userId) return json(res, 401, { error: 'Não autenticado' });

  const id = getIdFromUrl(req.url);

  try {
    if (req.method === 'GET' && !id) {
      const { data, error } = await supabase.from('vehicles').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return json(res, 200, data);
    }
    if (req.method === 'GET' && id) {
      const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).eq('user_id', userId).single();
      if (error) return json(res, 404, { error: 'Veículo não encontrado' });
      return json(res, 200, data);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Nome é obrigatório' });
      const { data, error } = await supabase.from('vehicles').insert({ id: crypto.randomUUID(), name, plate: body.plate || null, user_id: userId }).select().single();
      if (error) throw error;
      return json(res, 201, data);
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Nome é obrigatório' });
      const { data: existing } = await supabase.from('vehicles').select('id').eq('id', id).eq('user_id', userId).single();
      if (!existing) return json(res, 404, { error: 'Veículo não encontrado' });
      const { data, error } = await supabase.from('vehicles').update({ name, plate: body.plate || null }).eq('id', id).select().single();
      if (error) return json(res, 404, { error: 'Veículo não encontrado' });
      return json(res, 200, data);
    }
    if (req.method === 'DELETE' && id) {
      const { data: existing } = await supabase.from('vehicles').select('id').eq('id', id).eq('user_id', userId).single();
      if (!existing) return json(res, 404, { error: 'Veículo não encontrado' });
      await supabase.from('refuels').delete().eq('vehicle_id', id);
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      res.writeHead(204); res.end(); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('vehicles error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};
