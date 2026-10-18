import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function initNavbar() {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdownMenu = document.getElementById('user-dropdown-menu');
  const navUserName = document.getElementById('nav-user-name');
  const navUserAvatar = document.getElementById('nav-user-avatar');
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  const btnDropdownLogout = document.getElementById('btn-dropdown-logout');

  const adminMenuOption = document.getElementById('admin-menu-option');
  const teacherMenuOption = document.getElementById('teacher-menu-option');

  // Toggle Menú Desplegable
  if (userMenuBtn && userDropdownMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdownMenu.hidden = !userDropdownMenu.hidden;
    });

    document.addEventListener('click', () => {
      userDropdownMenu.hidden = true;
    });
  }

  // Toggle Tema Claro/Oscuro
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

  // Cerrar Sesión
  if (btnDropdownLogout) {
    btnDropdownLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location.href = 'index.html';
      } catch (err) {
        console.error("Error al cerrar sesión:", err);
      }
    });
  }

  // Control del Estado de Autenticación y Visibilidad de Roles
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

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

      // Control Estricto de Menú según el Rol
      if (userRole === 'admin') {
        if (adminMenuOption) adminMenuOption.hidden = false;
        if (teacherMenuOption) teacherMenuOption.hidden = false;
      } else if (userRole === 'teacher') {
        if (adminMenuOption) adminMenuOption.hidden = true; // OCULTAR ADMIN
        if (teacherMenuOption) teacherMenuOption.hidden = false; // MOSTRAR PROFESOR
      } else {
        if (adminMenuOption) adminMenuOption.hidden = true;
        if (teacherMenuOption) teacherMenuOption.hidden = true;
      }

    } catch (err) {
      console.error("Error al verificar rol en navbar:", err);
    }
  });
}