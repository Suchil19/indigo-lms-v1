import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Ocultar pantalla de carga (Preloader)
export function hidePreloader() {
  const preloadScreen = document.getElementById('app-preload');
  if (preloadScreen) {
    preloadScreen.style.display = 'none';
  }
}

// Calcular ruta relativa base si el script se ejecuta desde una subcarpeta (ej. python-intro/)
function getRelativeBasePath() {
  const path = window.location.pathname;
  // Si estamos en un subdirectorio como /python-fundamentals/index.html
  if (path.includes('/python-fundaments/') || path.includes('/diseno-ux/') || path.includes('/diseno-web-intro/') || path.includes('/excel-uno/') || path.includes('/excel-dos/')) {
    return '../';
  }
  return './';
}

export function initNavbar() {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdownMenu = document.getElementById('user-dropdown-menu');
  const navUserName = document.getElementById('nav-user-name');
  const navUserAvatar = document.getElementById('nav-user-avatar');
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  const btnDropdownLogout = document.getElementById('btn-dropdown-logout');

  const adminMenuOption = document.getElementById('admin-menu-option');
  const teacherMenuOption = document.getElementById('teacher-menu-option');

  const basePath = getRelativeBasePath();

  // 1. Menú Desplegable de Usuario
  if (userMenuBtn && userDropdownMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdownMenu.hidden = !userDropdownMenu.hidden;
    });

    document.addEventListener('click', () => {
      userDropdownMenu.hidden = true;
    });
  }

  // 2. Control de Tema Claro / Oscuro
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // 3. Cerrar Sesión
  if (btnDropdownLogout) {
    btnDropdownLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location.href = `${basePath}index.html`;
      } catch (err) {
        console.error("Error al cerrar sesión:", err);
      }
    });
  }

  // 4. Verificación de Autenticación y Control de Roles
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      hidePreloader();
      return;
    }

    // Actualizar nombre y avatar
    if (navUserName) navUserName.textContent = user.displayName || user.email.split('@')[0];
    if (navUserAvatar && user.photoURL) navUserAvatar.src = user.photoURL;

    const emailKey = user.email.toLowerCase();

    try {
      const assignedRef = doc(db, "assigned_roles", emailKey);
      const assignedSnap = await getDoc(assignedRef);

      let userRole = 'student';
      if (assignedSnap.exists()) {
        userRole = assignedSnap.data().role || 'student';
      }

      // Configurar enlaces relativos según el nivel de directorio
      if (adminMenuOption) {
        const link = adminMenuOption.querySelector('a');
        if (link) link.href = `${basePath}admin.html`;
      }

      if (teacherMenuOption) {
        const link = teacherMenuOption.querySelector('a');
        if (link) link.href = `${basePath}teacher.html`;
      }

      // Visibilidad según el rol
      if (userRole === 'admin') {
        if (adminMenuOption) adminMenuOption.hidden = false;
        if (teacherMenuOption) teacherMenuOption.hidden = false;
      } else if (userRole === 'teacher') {
        if (adminMenuOption) adminMenuOption.hidden = true;
        if (teacherMenuOption) teacherMenuOption.hidden = false;
      } else {
        if (adminMenuOption) adminMenuOption.hidden = true;
        if (teacherMenuOption) teacherMenuOption.hidden = true;
      }

    } catch (err) {
      console.error("Error al consultar permisos en el navbar:", err);
    } finally {
      hidePreloader();
    }
  });
}