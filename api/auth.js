const { supabase, anonClient, cors, json, readBody } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const body = await readBody(req);
    const { action, email, password, accessToken } = body;

    if (!action) return json(res, 400, { error: 'action é obrigatório' });

    if (action === 'signup') {
      if (!email || !password) return json(res, 400, { error: 'email e password são obrigatórios' });
      const { data, error } = await anonClient.auth.signUp({ email, password });
      if (error) return json(res, 400, { error: error.message });
      if (data.user && !data.session) {
        await supabase.auth.admin.updateUserById(data.user.id, { email_confirm: true });
        const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({ email, password });
        if (!loginError && loginData.session) {
          return json(res, 200, { user: loginData.user, session: loginData.session });
        }
      }
      return json(res, 200, { user: data.user, session: data.session });
    }

    if (action === 'login') {
      if (!email || !password) return json(res, 400, { error: 'email e password são obrigatórios' });
      const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
      if (error) return json(res, 401, { error: error.message });
      return json(res, 200, { user: data.user, session: data.session });
    }

    if (action === 'resetPassword') {
      if (!email) return json(res, 400, { error: 'email é obrigatório' });
      const { error } = await anonClient.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://abastecia.vercel.app',
      });
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { message: 'Email de recuperação enviado' });
    }

    if (action === 'updatePassword') {
      if (!password || !accessToken) return json(res, 400, { error: 'password e accessToken são obrigatórios' });
      const { data: userData, error: getUserErr } = await supabase.auth.getUser(accessToken);
      if (getUserErr || !userData?.user) return json(res, 400, { error: 'Token inválido ou expirado' });
      const userId = userData.user.id;
      const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, { password });
      if (updateErr) return json(res, 400, { error: updateErr.message });
      const email = userData.user.email;
      const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({ email, password });
      if (!loginError && loginData.session) {
        return json(res, 200, { user: loginData.user, session: loginData.session });
      }
      return json(res, 200, { user: userData.user });
    }

    return json(res, 400, { error: 'action inválida' });
  } catch (err) {
    console.error('auth error:', err);
    json(res, 500, { error: 'Erro interno' });
  }
};