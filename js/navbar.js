import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initTheme, toggleTheme } from './theme.js';

export function initNavbar(basePath = "") {
  // 1. Inicializar preferencia de tema
  initTheme();

  const menuBtn = document.getElementById('user-menu-btn');
  const dropdownMenu = document.getElementById('user-dropdown-menu');
  const userNameSpan = document.getElementById('nav-user-name');
  const userAvatarImg = document.getElementById('nav-user-avatar');
  const adminOption = document.getElementById('admin-menu-option');
  const btnLogout = document.getElementById('btn-dropdown-logout');
  const btnToggleTheme = document.getElementById('btn-toggle-theme');

  // Alternar tema desde el desplegable
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTheme();
    });
  }

  // Desplegar u Ocultar Menú Flotante
  if (menuBtn && dropdownMenu) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdownMenu.hasAttribute('hidden');
      if (isHidden) {
        dropdownMenu.removeAttribute('hidden');
        menuBtn.classList.add('active');
      } else {
        dropdownMenu.setAttribute('hidden', '');
        menuBtn.classList.remove('active');
      }
    });

    window.addEventListener('click', () => {
      dropdownMenu.setAttribute('hidden', '');
      menuBtn.classList.remove('active');
    });
  }

  // 2. Escuchar la sesión activa y verificar si es Administrador
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = `${basePath}index.html`;
      return;
    }

    try {
      const emailKey = user.email.toLowerCase();
      
      // Consultar perfil en 'users'
      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);

      // Consultar rol asignado en 'assigned_roles'
      const assignedRef = doc(db, "assigned_roles", emailKey);
      const assignedSnap = await getDoc(assignedRef);

      let isAdmin = false;
      let userData = userSnap.exists() ? userSnap.data() : null;

      if (userData && userData.role === 'admin') {
        isAdmin = true;
      } else if (assignedSnap.exists() && assignedSnap.data().role === 'admin') {
        isAdmin = true;
      }

      // Habilitar opción de Admin si corresponde
      if (isAdmin && adminOption) {
        adminOption.removeAttribute('hidden');
      }

      // Renderizar nombre y avatar en el header
      const displayName = (userData && userData.alias) 
        ? `${userData.displayName || user.displayName} (${userData.alias})` 
        : (userData?.displayName || user.displayName || user.email);

      const avatarUrl = (userData && userData.photoURL) 
        ? userData.photoURL 
        : (user.photoURL || 'https://via.placeholder.com/32');

      if (userNameSpan) {
        userNameSpan.textContent = isAdmin ? `${displayName} (Admin)` : displayName;
      }

      if (userAvatarImg) {
        userAvatarImg.src = avatarUrl;
      }

    } catch (error) {
      console.error("Error al sincronizar el header:", error);
    }
  });

  // 3. Control del botón Cerrar Sesión
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location.href = `${basePath}index.html`;
      } catch (error) {
        console.error("Error al cerrar sesión:", error);
      }
    });
  }
}


// Ocultar la pantalla de carga cuando la página termine de renderizarse
window.addEventListener('load', () => {
  const preloadScreen = document.getElementById('app-preload');
  if (preloadScreen) {
    // Transición de salida suave
    preloadScreen.classList.add('fade-out');
    
    // Remover del flujo del DOM después de completar la animación CSS
    setTimeout(() => {
      preloadScreen.style.display = 'none';
    }, 450);
  }
});