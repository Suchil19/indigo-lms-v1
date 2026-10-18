import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { COURSES_CATALOG } from './courses-data.js';
import { initNavbar } from './navbar.js';

// Inicializar la barra de navegación y sincronización de tema claro/oscuro
initNavbar();

const coursesContainer = document.getElementById('courses-container');
const studentSchoolBadge = document.getElementById('student-school-badge');
const previewBanner = document.getElementById('preview-mode-banner');
const previewStudentEmailText = document.getElementById('preview-student-email-text');

let currentUserEmail = '';

// Validar autenticación o parámetro de simulación desde el panel de administración
onAuthStateChanged(auth, async (user) => {
  const urlParams = new URLSearchParams(window.location.search);
  const previewType = urlParams.get('preview');
  const previewEmailParam = urlParams.get('previewEmail');

  if (!user && !previewEmailParam) {
    window.location.href = 'index.html';
    return;
  }

  if (previewType === 'student' && previewEmailParam) {
    currentUserEmail = previewEmailParam.toLowerCase();
    if (previewBanner) {
      previewBanner.removeAttribute('hidden');
      if (previewStudentEmailText) previewStudentEmailText.textContent = currentUserEmail;
    }
  } else if (user) {
    currentUserEmail = user.email.toLowerCase();
  }

  await loadUserCoursesAndSchool(currentUserEmail);
});

// Cargar la escuela e instituciones asignadas desde Firestore
async function loadUserCoursesAndSchool(email) {
  if (!coursesContainer) return;

  try {
    coursesContainer.innerHTML = '<p class="text-center">Cargando tus cursos asignados...</p>';

    const assignedRef = doc(db, "assigned_roles", email);
    const assignedSnap = await getDoc(assignedRef);

    let allowedCourseIds = [];
    let userSchoolName = 'Sin Institución Asignada';

    if (assignedSnap.exists()) {
      const data = assignedSnap.data();
      allowedCourseIds = data.allowedCourses || [];
      userSchoolName = data.school || 'Sin Institución Asignada';
    }

    if (studentSchoolBadge) {
      studentSchoolBadge.textContent = userSchoolName;
    }

    renderCoursesCards(allowedCourseIds);

  } catch (error) {
    console.error("Error al consultar cursos del estudiante:", error);
    coursesContainer.innerHTML = '<p class="text-center text-danger">Error al cargar la lista de cursos.</p>';
  }
}

// Renderizar las tarjetas de los cursos habilitados
function renderCoursesCards(courseIds) {
  coursesContainer.innerHTML = '';

  if (courseIds.length === 0) {
    coursesContainer.innerHTML = `
      <div class="empty-courses-box" style="text-align: center; padding: 40px; background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border-color); width: 100%;">
        <h3>🎓 No tienes cursos asignados aún</h3>
        <p style="color: var(--text-secondary); margin-top: 8px;">Ponte en contacto con tu profesor o administrador de la institución para solicitar acceso a tus materias.</p>
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'courses-grid';
  grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; width: 100%;';

  courseIds.forEach(id => {
    const course = COURSES_CATALOG[id];
    if (!course) return;

    const card = document.createElement('div');
    card.className = 'course-card';
    card.style.cssText = 'background: var(--card-bg); border-radius: 10px; border: 1px solid var(--border-color); overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s ease, box-shadow 0.2s ease;';

    card.innerHTML = `
      <div class="course-card-body" style="padding: 20px;">
        <span class="course-tag" style="background: rgba(37, 99, 235, 0.1); color: #2563eb; font-size: 0.75rem; font-weight: bold; padding: 4px 8px; border-radius: 4px; text-transform: uppercase;">Curso Habilitado</span>
        <h3 style="margin: 12px 0 8px 0; font-size: 1.2rem; color: var(--text-color);">${course.title}</h3>
        <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.4; margin: 0;">${course.description || 'Ingresa al contenido del curso y completa tus módulos de aprendizaje.'}</p>
      </div>
      <div class="course-card-footer" style="padding: 15px 20px; background: var(--input-bg); border-top: 1px solid var(--border-color); text-align: right;">
        <a href="${course.folderPath}" class="btn-primary" style="display: inline-block; padding: 8px 16px; font-size: 0.9rem; border-radius: 6px; text-decoration: none; font-weight: bold;">Entrar al Curso →</a>
      </div>
    `;

    grid.appendChild(card);
  });

  coursesContainer.appendChild(grid);
}