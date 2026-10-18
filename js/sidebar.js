import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { COURSES_CATALOG } from './courses-data.js';

// Calcula la ruta relativa a la raíz automáticamente según la profundidad de la URL
function getRelativeBasePath() {
  const pathname = window.location.pathname;
  if (pathname.includes('/cursos/')) {
    return '../../';
  }
  return './';
}

export function initSidebar() {
  const sidebarContainer = document.getElementById('global-sidebar');
  if (!sidebarContainer) return;

  const basePath = getRelativeBasePath();
  const currentPath = window.location.pathname;

  // 1. Inyectar HTML base del menú lateral
  sidebarContainer.innerHTML = `
    <div class="sidebar-top-actions">
      <a href="${basePath}dashboard.html" class="btn-sidebar-back">
        <span>⬅️</span>
        <span class="sidebar-text">Volver a Inicio</span>
      </a>
      <button type="button" id="btn-toggle-sidebar-collapse" class="btn-sidebar-toggle" title="Colapsar / Expandir">
        ◀
      </button>
    </div>

    <div class="sidebar-content-scroll">
      <div class="sidebar-section-header">Menú Principal</div>
      <ul class="sidebar-nav-list">
        <li class="sidebar-item">
          <a href="${basePath}dashboard.html" class="sidebar-link ${currentPath.includes('dashboard.html') ? 'active' : ''}">
            <span class="sidebar-icon">🏠</span>
            <span class="sidebar-text">Inicio / Cursos</span>
          </a>
        </li>
        <li class="sidebar-item">
          <a href="${basePath}profile.html" class="sidebar-link ${currentPath.includes('profile.html') ? 'active' : ''}">
            <span class="sidebar-icon">⚙️</span>
            <span class="sidebar-text">Mi Perfil</span>
          </a>
        </li>
      </ul>

      <div class="sidebar-section-header">Mis Cursos Enrolados</div>
      <ul id="sidebar-courses-list" class="sidebar-nav-list">
        <li class="sidebar-item"><span class="sidebar-link" style="opacity: 0.6;">Cargando mis cursos...</span></li>
      </ul>
    </div>
  `;

  // Crear elementos para móviles si no existen en el DOM
  if (!document.getElementById('sidebar-overlay-backdrop')) {
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay-backdrop';
    overlay.className = 'sidebar-overlay-backdrop';
    document.body.appendChild(overlay);
  }

  if (!document.getElementById('sidebar-mobile-fab')) {
    const fab = document.createElement('button');
    fab.id = 'sidebar-mobile-fab';
    fab.className = 'sidebar-mobile-fab';
    fab.innerHTML = `<span>📑</span> <span>Menú</span>`;
    document.body.appendChild(fab);
  }

  // 2. Controladores de interacción (Colapso y Off-canvas móvil)
  const btnCollapse = document.getElementById('btn-toggle-sidebar-collapse');
  const fabBtn = document.getElementById('sidebar-mobile-fab');
  const overlay = document.getElementById('sidebar-overlay-backdrop');

  if (btnCollapse) {
    btnCollapse.addEventListener('click', () => {
      sidebarContainer.classList.toggle('collapsed');
      const isCollapsed = sidebarContainer.classList.contains('collapsed');
      btnCollapse.textContent = isCollapsed ? '▶' : '◀';
      localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
    });

    if (localStorage.getItem('sidebar_collapsed') === 'true') {
      sidebarContainer.classList.add('collapsed');
      btnCollapse.textContent = '▶';
    }
  }

  function openMobileSidebar() {
    sidebarContainer.classList.add('mobile-open');
    if (overlay) overlay.classList.add('active');
  }

  function closeMobileSidebar() {
    sidebarContainer.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  }

  if (fabBtn) fabBtn.addEventListener('click', openMobileSidebar);
  if (overlay) overlay.addEventListener('click', closeMobileSidebar);

  // 3. Consultar permisos en Firestore y pintar los cursos a los que el usuario tiene acceso
  onAuthStateChanged(auth, async (user) => {
    const coursesListContainer = document.getElementById('sidebar-courses-list');
    if (!user || !coursesListContainer) return;

    try {
      const emailKey = user.email.toLowerCase();
      const assignedRef = doc(db, "assigned_roles", emailKey);
      const assignedSnap = await getDoc(assignedRef);

      let allowedCourses = [];
      if (assignedSnap.exists()) {
        allowedCourses = assignedSnap.data().allowedCourses || [];
      }

      if (allowedCourses.length === 0) {
        coursesListContainer.innerHTML = `
          <li class="sidebar-item">
            <span class="sidebar-link" style="opacity: 0.6; font-size: 0.85rem;">Sin cursos asignados</span>
          </li>`;
        return;
      }

      coursesListContainer.innerHTML = '';
      allowedCourses.forEach(courseId => {
        const courseData = COURSES_CATALOG[courseId];
        if (!courseData) return; // Omite si el curso ya no existe en el catálogo

        const targetUrl = `${basePath}${courseData.folderPath}/index.html`;
        const isActive = currentPath.includes(courseData.folderPath);

        const li = document.createElement('li');
        li.className = 'sidebar-item';
        li.innerHTML = `
          <a href="${targetUrl}" class="sidebar-link ${isActive ? 'active' : ''}">
            <span class="sidebar-icon">${courseData.icon || '📘'}</span>
            <span class="sidebar-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${courseData.title}
            </span>
          </a>
        `;
        coursesListContainer.appendChild(li);
      });

    } catch (err) {
      console.error("Error al construir la lista de cursos en el sidebar:", err);
    }
  });
}