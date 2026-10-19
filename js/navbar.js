import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function hidePreloader() {
  const preloadScreen = document.getElementById('app-preload');
  if (preloadScreen) {
    preloadScreen.style.display = 'none';
  }
}

function getRelativeBasePath() {
  const path = window.location.pathname;
  if (path.includes('/cursos/')) {
    return '../../';
  }
  return './';
}

export function initNavbar() {
  const navbarContainer = document.getElementById('navbar-container');
  const basePath = getRelativeBasePath();

  if (navbarContainer) {
    navbarContainer.innerHTML = `
      <header class="navbar">
        <a href="/dashboard.html" class="brand-title">
          <svg class="svg-icon" viewBox="0 0 24 24" style="color: var(--primary-color);"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>
          Plataforma Escolar
        </a>
        
        <div class="user-profile">
          <div class="user-menu-container">
            <button id="user-menu-btn" class="user-menu-btn" aria-haspopup="true" aria-expanded="false" type="button">
              <img id="nav-user-avatar" src="https://www.gstatic.com/images/branding/product/1x/avatar_square_grey_48dp.png" alt="Avatar" class="nav-avatar">
              <span id="nav-user-name" class="user-name-text">Cargando...</span>
              <svg class="menu-arrow svg-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
            </button>

            <div id="user-dropdown-menu" class="dropdown-menu" hidden>
              <div style="padding: 12px 18px; border-bottom: 1px solid var(--border-color);">
                <p style="margin: 0; font-size: 0.75rem; color: var(--text-secondary);">Sesión iniciada como</p>
                <p id="dropdown-user-email" style="margin: 2px 0 0 0; font-size: 0.85rem; font-weight: 600; word-break: break-all;"></p>
              </div>

              <a href="/profile.html" class="dropdown-item">
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                Mi Perfil
              </a>

              <button id="btn-toggle-theme" class="dropdown-item" type="button">
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
                Cambiar Tema
              </button>

              <div id="admin-menu-option" style="display: none;">
                <div class="dropdown-divider"></div>
                <a href="/admin.html" class="dropdown-item" style="color: var(--primary-color);">
                  <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                  Panel de Administración
                </a>
              </div>

              <div class="dropdown-divider"></div>
              <button id="btn-dropdown-logout" class="dropdown-item text-danger" type="button">
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  setupNavbarLogic();
}

function setupNavbarLogic() {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdownMenu = document.getElementById('user-dropdown-menu');
  const btnDropdownLogout = document.getElementById('btn-dropdown-logout');
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  const adminMenuOption = document.getElementById('admin-menu-option');

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }

  if (userMenuBtn && userDropdownMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = userDropdownMenu.hasAttribute('hidden');
      if (isHidden) {
        userDropdownMenu.removeAttribute('hidden');
        userMenuBtn.classList.add('active');
      } else {
        userDropdownMenu.setAttribute('hidden', '');
        userMenuBtn.classList.remove('active');
      }
    });

    document.addEventListener('click', () => {
      userDropdownMenu.setAttribute('hidden', '');
      userMenuBtn.classList.remove('active');
    });

    userDropdownMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      hidePreloader();
      return;
    }

    const email = user.email.trim().toLowerCase();
    const displayName = user.displayName || email.split('@')[0];
    const photoURL = user.photoURL || 'https://www.gstatic.com/images/branding/product/1x/avatar_square_grey_48dp.png';

    const nameEl = document.getElementById('nav-user-name');
    const emailEl = document.getElementById('dropdown-user-email');
    const avatarEl = document.getElementById('nav-user-avatar');

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = email;
    if (avatarEl) avatarEl.src = photoURL;

    try {
      const roleRef = doc(db, "assigned_roles", email);
      const roleSnap = await getDoc(roleRef);

      let role = 'student';
      if (roleSnap.exists()) {
        role = (roleSnap.data().role || 'student').trim().toLowerCase();
      }

      if ((role === 'admin' || email === 'suchiltv@gmail.com') && adminMenuOption) {
        adminMenuOption.style.display = 'block';
      }
    } catch (err) {
      console.error("Error al consultar permisos en el navbar:", err);
    } finally {
      hidePreloader();
    }
  });

  // 🚀 Cierre de sesión blindado utilizando ruta absoluta raíz
  if (btnDropdownLogout) {
    btnDropdownLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        localStorage.removeItem('is_impersonating');
        localStorage.removeItem('impersonate_user_email');
        localStorage.clear();
        await signOut(auth);
      } catch (err) {
        console.error("Error al cerrar sesión:", err);
      } finally {
        window.location.replace('/index.html');
      }
    });
  }
}