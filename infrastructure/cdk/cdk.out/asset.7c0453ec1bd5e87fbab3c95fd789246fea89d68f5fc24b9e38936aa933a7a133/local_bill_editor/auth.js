/**
 * Auth utilities: check session, redirect to login, render profile bar.
 */
let currentUser = null;

const fetchMe = async () => {
  const response = await fetch('/api/me', { credentials: 'include' });
  if (response.status === 401) return { user: null, authRequired: true };
  if (!response.ok) return { user: null, authRequired: false };
  const data = await response.json();
  return { user: data.user || null, authRequired: false };
};

const requiresAuth = async () => {
  const { user, authRequired } = await fetchMe();
  currentUser = user;
  if (authRequired) {
    const q = new URLSearchParams();
    q.set('redirect', window.location.pathname + window.location.search);
    window.location.replace(`login.html?${q.toString()}`);
    return false;
  }
  return true;
};

const checkAuth = async () => {
  const { user } = await fetchMe();
  currentUser = user;
  return user;
};

const logout = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  currentUser = null;
  window.location.replace('login.html');
};

const getCurrentUser = () => currentUser;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Abort previous outside-click / Escape listeners when profile bar is re-rendered. */
let profileMenuListenersAbort = null;

const renderProfileBar = (user) => {
  if (!user) return '';
  const displayName = user.displayName || user.email || 'Account';
  const avatarHtml = user.avatarUrl
    ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" class="profile-avatar" />`
    : '<span class="profile-avatar-placeholder"></span>';
  return `
    <div class="profile-bar">
      <div class="profile-menu">
        <button type="button" class="profile-menu-trigger" id="profile-menu-trigger" aria-expanded="false" aria-haspopup="true" aria-controls="profile-menu-dropdown">
          ${avatarHtml}
          <span class="profile-name">${escapeHtml(displayName)}</span>
          <span class="profile-menu-chevron" aria-hidden="true"></span>
        </button>
        <div class="profile-menu-dropdown" id="profile-menu-dropdown" role="menu" hidden>
          <div class="profile-menu-placeholder" role="presentation">Workspace settings — coming soon</div>
          <div class="profile-menu-placeholder" role="presentation">Notifications — coming soon</div>
          <div class="profile-menu-separator" role="separator"></div>
          <button type="button" class="profile-menu-item" id="profile-edit-btn" role="menuitem">Edit profile</button>
          <button type="button" class="profile-menu-item profile-menu-item-danger" id="logout-btn" role="menuitem">Log out</button>
        </div>
      </div>
    </div>
  `;
};

const setupProfileBar = (user) => {
  const container = document.getElementById('profile-bar-container');
  if (!container) return;
  profileMenuListenersAbort?.abort();
  profileMenuListenersAbort = new AbortController();
  const { signal } = profileMenuListenersAbort;

  container.innerHTML = renderProfileBar(user);

  const trigger = document.getElementById('profile-menu-trigger');
  const dropdown = document.getElementById('profile-menu-dropdown');
  const menuRoot = container.querySelector('.profile-menu');

  const isOpen = () => dropdown && !dropdown.hidden;

  const closeMenu = () => {
    if (dropdown) dropdown.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    if (dropdown) dropdown.hidden = false;
    trigger?.setAttribute('aria-expanded', 'true');
  };

  const toggleMenu = () => {
    if (isOpen()) closeMenu();
    else openMenu();
  };

  trigger?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation();
      toggleMenu();
    },
    { signal }
  );

  dropdown?.addEventListener('click', (e) => e.stopPropagation(), { signal });

  document.addEventListener(
    'click',
    (e) => {
      if (!isOpen()) return;
      if (menuRoot && menuRoot.contains(e.target)) return;
      closeMenu();
    },
    { signal, capture: true }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && isOpen()) closeMenu();
    },
    { signal }
  );

  document.getElementById('profile-edit-btn')?.addEventListener(
    'click',
    () => {
      closeMenu();
      showProfileModal(getCurrentUser());
    },
    { signal }
  );

  document.getElementById('logout-btn')?.addEventListener(
    'click',
    () => {
      closeMenu();
      logout();
    },
    { signal }
  );
};

if (typeof window !== 'undefined') {
  window.requiresAuth = requiresAuth;
  window.checkAuth = checkAuth;
  window.setupProfileBar = setupProfileBar;
  window.getCurrentUser = getCurrentUser;
  window.logout = logout;
}

const showProfileModal = (user) => {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal profile-modal">
      <h3>Profile</h3>
      <form id="profile-form">
        <label>Display name</label>
        <input type="text" id="profile-display-name" value="${escapeHtml(user.displayName || '')}" placeholder="${escapeHtml(user.email || '')}" />
        <label>Avatar URL</label>
        <input type="url" id="profile-avatar-url" value="${escapeHtml(user.avatarUrl || '')}" placeholder="https://..." />
        <div class="modal-actions">
          <button type="button" id="profile-cancel" class="button-link">Cancel</button>
          <button type="submit" class="button-link primary">Save</button>
        </div>
      </form>
    </div>
  `;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('profile-cancel')?.addEventListener('click', close);
  document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('profile-display-name').value.trim();
    const avatarUrl = document.getElementById('profile-avatar-url').value.trim();
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ displayName, avatarUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to save profile.');
      return;
    }
    const data = await res.json();
    currentUser = data.profile;
    setupProfileBar(currentUser);
    close();
  });
  document.body.appendChild(overlay);
};
