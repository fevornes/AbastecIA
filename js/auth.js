let currentUser = null;

function getToken() { return localStorage.getItem('access_token'); }
function getUser() { return currentUser; }

async function initAuth() {
  const hash = window.location.hash;
  if (hash && hash.includes('access_token') && hash.includes('type=recovery')) {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    showNewPasswordScreen(accessToken);
    return false;
  }
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    currentUser = { id: payload.sub, email: payload.email };
    return true;
  } catch { return false; }
}

async function login(email, password) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  localStorage.setItem('access_token', data.session.access_token);
  currentUser = data.user;
  return data;
}

async function signup(email, password) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  if (data.session) {
    localStorage.setItem('access_token', data.session.access_token);
    currentUser = data.user;
  }
  return data;
}

async function resetPassword(email) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'resetPassword', email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

async function updatePassword(password, accessToken) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updatePassword', password, accessToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  if (data.session) {
    localStorage.setItem('access_token', data.session.access_token);
    currentUser = data.user;
  }
  return data;
}

function logout() {
  localStorage.removeItem('access_token');
  currentUser = null;
}

function showAuth() {
  document.querySelector('.tabs').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

function hideAuth() {
  document.querySelector('.tabs').classList.remove('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('auth-screen').classList.add('hidden');
}

function showLoginScreen() {
  showAuth();
  document.getElementById('auth-screen').innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h1>AbastecIA</h1>
        <p class="auth-subtitle">Controle de abastecimento</p>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <form id="auth-form">
          <input type="email" id="auth-email" placeholder="Email" required>
          <input type="password" id="auth-password" placeholder="Senha" required>
          <button type="submit" id="auth-submit">Entrar</button>
          <button type="button" id="auth-forgot" class="auth-link-btn">Esqueceu a senha?</button>
          <button type="button" id="auth-toggle" class="auth-toggle-btn">Criar conta</button>
        </form>
      </div>
    </div>
  `;

  let isLogin = true;

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-submit');
    const errorEl = document.getElementById('auth-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Aguarde...';
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        const result = await signup(email, password);
        if (!result.session) {
          errorEl.textContent = 'Conta criada! Verifique seu email para confirmar.';
          errorEl.className = 'auth-success';
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = isLogin ? 'Entrar' : 'Criar conta';
          return;
        }
      }
      hideAuth();
      startApp();
      showLogoutButton();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.className = 'auth-error';
      errorEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = isLogin ? 'Entrar' : 'Criar conta';
  });

  document.getElementById('auth-toggle').addEventListener('click', () => {
    isLogin = !isLogin;
    document.getElementById('auth-submit').textContent = isLogin ? 'Entrar' : 'Criar conta';
    document.getElementById('auth-toggle').textContent = isLogin ? 'Criar conta' : 'Já tenho conta';
    document.getElementById('auth-forgot').style.display = isLogin ? 'block' : 'none';
  });

  document.getElementById('auth-forgot').addEventListener('click', () => {
    showForgotScreen();
  });
}

function showForgotScreen() {
  showAuth();
  document.getElementById('auth-screen').innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h1>AbastecIA</h1>
        <p class="auth-subtitle">Recuperar senha</p>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>
        <form id="forgot-form">
          <input type="email" id="forgot-email" placeholder="Seu email" required>
          <button type="submit" id="forgot-submit">Enviar link de recuperação</button>
          <button type="button" id="forgot-back" class="auth-toggle-btn">Voltar ao login</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    const btn = document.getElementById('forgot-submit');
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      await resetPassword(email);
      successEl.textContent = 'Email de recuperação enviado! Verifique sua caixa de entrada.';
      successEl.style.display = 'block';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = 'Enviar link de recuperação';
  });

  document.getElementById('forgot-back').addEventListener('click', () => {
    showLoginScreen();
  });
}

function showNewPasswordScreen(accessToken) {
  showAuth();
  document.getElementById('auth-screen').innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h1>AbastecIA</h1>
        <p class="auth-subtitle">Nova senha</p>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <form id="newpw-form">
          <input type="password" id="newpw-password" placeholder="Nova senha" required minlength="6">
          <input type="password" id="newpw-confirm" placeholder="Confirmar senha" required minlength="6">
          <button type="submit" id="newpw-submit">Salvar nova senha</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('newpw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('newpw-password').value;
    const confirm = document.getElementById('newpw-confirm').value;
    const btn = document.getElementById('newpw-submit');
    const errorEl = document.getElementById('auth-error');
    errorEl.style.display = 'none';

    if (pw !== confirm) {
      errorEl.textContent = 'As senhas não coincidem';
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      await updatePassword(pw, accessToken);
      window.history.replaceState(null, '', window.location.pathname);
      hideAuth();
      startApp();
      showLogoutButton();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = 'Salvar nova senha';
  });
}

function showLogoutButton() {
  // Defined inline in index.html
}