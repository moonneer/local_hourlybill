const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const toggleBtn = document.getElementById('toggle-mode');
const errorEl = document.getElementById('login-error');
const titleEl = document.getElementById('login-title');
const subtitleEl = document.getElementById('login-subtitle');

let isSignup = false;

const showError = (msg) => {
  errorEl.textContent = msg || '';
  errorEl.style.display = msg ? 'block' : 'none';
};

const setLoading = (loading) => {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? 'Please wait...' : (isSignup ? 'Create account' : 'Sign in');
};

toggleBtn.addEventListener('click', () => {
  isSignup = !isSignup;
  titleEl.textContent = isSignup ? 'Create account' : 'Sign in';
  subtitleEl.textContent = isSignup
    ? 'Enter your email and a password (min 8 characters).'
    : 'Enter your email and password to continue.';
  submitBtn.textContent = isSignup ? 'Create account' : 'Sign in';
  toggleBtn.textContent = isSignup ? 'Already have an account? Sign in' : 'Create account';
  showError();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showError('Email and password are required.');
    return;
  }
  if (isSignup && password.length < 8) {
    showError('Password must be at least 8 characters.');
    return;
  }
  setLoading(true);
  const url = isSignup ? '/api/signup' : '/api/login';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  setLoading(false);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showError(data.error || (isSignup ? 'Sign up failed.' : 'Sign in failed.'));
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') || 'index.html';
  window.location.replace(redirect.startsWith('/') ? redirect : redirect);
});
