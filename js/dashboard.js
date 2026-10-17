import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { COURSES_CATALOG } from './courses-data.js';
import { initNavbar } from './navbar.js';

initNavbar();

const previewBanner = document.getElementById('admin-preview-banner');
const coursesGrid = document.getElementById('courses-grid');
const statusMsg = document.getElementById('courses-status-msg');

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isPreviewMode = urlParams.get('preview') === 'student';
  const previewEmail = urlParams.get('previewEmail'); // Correo específico a simular

  try {
    const userDocRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userDocRef);
    const userRole = docSnap.exists() ? docSnap.data().role : 'student';

    if (userRole === 'admin' && !isPreviewMode) {
      window.location.href = 'admin.html';
      return;
    }

    if (userRole === 'admin' && isPreviewMode) {
      if (previewBanner) {
        previewBanner.hidden = false;
        if (previewEmail) {
          previewBanner.innerHTML = `Modo Vista previa activo para el alumno: <strong>${previewEmail}</strong>. <a href="admin.html">Regresar al Panel Admin</a>`;
        }
      }
    }

    // Si el admin solicitó la vista previa de un usuario específico, consultamos ese correo
    const emailToRender = (userRole === 'admin' && previewEmail) 
      ? previewEmail.toLowerCase() 
      : user.email.toLowerCase();

    await renderUserCourses(emailToRender);

  } catch (error) {
    console.error("Error al validar el perfil:", error);
    if (statusMsg) statusMsg.textContent = "Ocurrió un error al verificar tu sesión.";
  }
});

async function renderUserCourses(email) {
  try {
    const assignedRef = doc(db, "assigned_roles", email);
    const assignedSnap = await getDoc(assignedRef);

    let allowedCourses = [];

    if (assignedSnap.exists() && assignedSnap.data().allowedCourses) {
      allowedCourses = assignedSnap.data().allowedCourses;
    }

    if (allowedCourses.length === 0) {
      statusMsg.textContent = `Aún no hay cursos asignados para ${email}.`;
      coursesGrid.innerHTML = '';
      return;
    }

    statusMsg.textContent = `Mostrando ${allowedCourses.length} curso(s) activo(s) de ${email}:`;
    coursesGrid.innerHTML = '';

    let coursesRendered = 0;

    allowedCourses.forEach(courseId => {
      const course = COURSES_CATALOG[courseId];
      if (course) {
        const card = createCourseCard(course);
        coursesGrid.appendChild(card);
        coursesRendered++;
      }
    });

    if (coursesRendered === 0) {
      statusMsg.textContent = "Los cursos asignados no coinciden con el catálogo disponible.";
    }

  } catch (error) {
    console.error("Error al cargar los cursos desde Firestore:", error);
    statusMsg.textContent = "Ocurrió un error al consultar los cursos asignados.";
  }
}

function createCourseCard(course) {
  const card = document.createElement('div');
  card.className = 'course-card';
  card.innerHTML = `
    <div>
      <span class="card-tag">${course.tag}</span>
      <h3>${course.title}</h3>
      <p>${course.description}</p>
    </div>
    <button class="btn-start-course" data-path="${course.folderPath}">Entrar al Curso</button>
  `;

  card.querySelector('.btn-start-course').addEventListener('click', (e) => {
    const targetPath = e.target.getAttribute('data-path');
    window.location.href = targetPath;
  });

  return card;
}