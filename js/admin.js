import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { COURSES_CATALOG } from './courses-data.js';
import { initNavbar } from './navbar.js';

initNavbar();

const formRole = document.getElementById('form-assign-role');
const emailInput = document.getElementById('user-email');
const dataList = document.getElementById('users-datalist');
const statusMsg = document.getElementById('role-status-msg');
const tableBody = document.getElementById('users-table-body');
const btnReset = document.getElementById('btn-reset-form');

const previewModal = document.getElementById('preview-student-modal');
const btnOpenPreviewModal = document.getElementById('btn-open-preview-modal');
const btnClosePreviewModal = document.getElementById('btn-close-preview-modal');
const btnPreviewGeneric = document.getElementById('btn-preview-generic');
const searchPreviewInput = document.getElementById('search-preview-input');
const previewStudentsList = document.getElementById('preview-students-list');

let allRegisteredStudents = [];

// 1. Validar sesión de Administrador
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const emailKey = user.email.toLowerCase();
  const userDocRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userDocRef);

  const assignedRef = doc(db, "assigned_roles", emailKey);
  const assignedSnap = await getDoc(assignedRef);

  let isAdmin = false;
  if (docSnap.exists() && docSnap.data().role === 'admin') {
    isAdmin = true;
  } else if (assignedSnap.exists() && assignedSnap.data().role === 'admin') {
    isAdmin = true;
  }

  if (!isAdmin) {
    window.location.href = 'dashboard.html';
    return;
  }

  await refreshUsersTable();
});

// 2. Cargar tabla de usuarios
async function refreshUsersTable() {
  try {
    const assignedSnapshot = await getDocs(collection(db, "assigned_roles"));
    tableBody.innerHTML = '';
    dataList.innerHTML = '';
    allRegisteredStudents = [];

    if (assignedSnapshot.empty) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center">No hay alumnos registrados aún.</td></tr>`;
      return;
    }

    assignedSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const email = data.email || docSnap.id;
      const role = data.role || 'student';
      const allowedCourses = data.allowedCourses || [];

      allRegisteredStudents.push({ email, role, allowedCourses });

      const option = document.createElement('option');
      option.value = email;
      dataList.appendChild(option);

      const tr = document.createElement('tr');
      const coursesHTML = allowedCourses.map(id => {
        const title = COURSES_CATALOG[id] ? COURSES_CATALOG[id].title : id;
        return `<span class="course-tag-item">${title}</span>`;
      }).join(' ') || '<em class="text-center">Sin cursos asignados</em>';

      const roleBadgeClass = role === 'admin' ? 'badge-admin' : 'badge-student';

      tr.innerHTML = `
        <td><strong>${email}</strong></td>
        <td><span class="badge-role ${roleBadgeClass}">${role}</span></td>
        <td>${coursesHTML}</td>
        <td>
          <button class="btn-secondary btn-sm btn-edit" data-email="${email}">Editar</button>
          <button class="btn-preview btn-sm btn-sim" data-email="${email}">Simular Vista</button>
        </td>
      `;

      tr.querySelector('.btn-edit').addEventListener('click', () => {
        emailInput.value = email;
        fetchUserPermissions(email);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      tr.querySelector('.btn-sim').addEventListener('click', () => {
        window.location.href = `dashboard.html?preview=student&previewEmail=${encodeURIComponent(email)}`;
      });

      tableBody.appendChild(tr);
    });

  } catch (error) {
    console.error("Error al cargar la tabla de usuarios:", error);
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center">Error al cargar usuarios.</td></tr>`;
  }
}

// 3. Modal de Vista Previa
if (btnOpenPreviewModal) {
  btnOpenPreviewModal.addEventListener('click', () => {
    renderPreviewStudentsList(allRegisteredStudents);
    previewModal.removeAttribute('hidden');
  });
}

if (btnClosePreviewModal) {
  btnClosePreviewModal.addEventListener('click', () => {
    previewModal.setAttribute('hidden', '');
  });
}

window.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    previewModal.setAttribute('hidden', '');
  }
});

if (btnPreviewGeneric) {
  btnPreviewGeneric.addEventListener('click', () => {
    window.location.href = 'dashboard.html?preview=student';
  });
}

if (searchPreviewInput) {
  searchPreviewInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    const filtered = allRegisteredStudents.filter(s => s.email.toLowerCase().includes(query));
    renderPreviewStudentsList(filtered);
  });
}

function renderPreviewStudentsList(students) {
  previewStudentsList.innerHTML = '';

  if (students.length === 0) {
    previewStudentsList.innerHTML = `<p class="text-center">No se encontraron estudiantes.</p>`;
    return;
  }

  students.forEach(student => {
    const item = document.createElement('div');
    item.className = 'preview-student-item';
    item.innerHTML = `
      <div>
        <div class="preview-student-email">${student.email}</div>
        <div class="preview-student-courses">${student.allowedCourses.length} curso(s) asignado(s)</div>
      </div>
      <button type="button" class="btn-primary btn-sm">Ver Vista</button>
    `;

    item.addEventListener('click', () => {
      window.location.href = `dashboard.html?preview=student&previewEmail=${encodeURIComponent(student.email)}`;
    });

    previewStudentsList.appendChild(item);
  });
}

async function fetchUserPermissions(email) {
  if (!email) return;

  const checkboxes = document.querySelectorAll('input[name="courses"]');
  checkboxes.forEach(cb => cb.checked = false);

  try {
    const assignedRoleRef = doc(db, "assigned_roles", email);
    const docSnap = await getDoc(assignedRoleRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById('user-role').value = data.role || 'student';

      const allowedCourses = data.allowedCourses || [];
      checkboxes.forEach(cb => {
        cb.checked = allowedCourses.includes(cb.value);
      });

      statusMsg.style.color = '#2563eb';
      statusMsg.textContent = `Modificando accesos para ${email}.`;
    } else {
      statusMsg.style.color = '#4b5563';
      statusMsg.textContent = `Registrando nuevo alumno: ${email}. Selecciona sus cursos.`;
    }
  } catch (error) {
    console.error("Error al consultar permisos:", error);
  }
}

if (emailInput) {
  emailInput.addEventListener('input', (e) => {
    const value = e.target.value.trim().toLowerCase();
    if (value.includes('@')) {
      fetchUserPermissions(value);
    }
  });
}

// 4. Guardar accesos y notificar por EmailJS
if (formRole) {
  formRole.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    const role = document.getElementById('user-role').value;

    const selectedCourses = [];
    const checkboxes = document.querySelectorAll('input[name="courses"]:checked');
    checkboxes.forEach(cb => selectedCourses.push(cb.value));

    try {
      // Guardar asignación en Firestore
      await setDoc(doc(db, "assigned_roles", email), {
        email: email,
        role: role,
        allowedCourses: selectedCourses,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Construir los enlaces directos a los cursos
      const originUrl = window.location.origin;
      const coursesLinksFormatted = selectedCourses.map(id => {
        const course = COURSES_CATALOG[id];
        return course ? `- ${course.title}: ${originUrl}/${course.folderPath}` : '';
      }).filter(Boolean).join('\n');

      // Envío de correo electrónico con credenciales configuradas
      if (typeof emailjs !== 'undefined' && selectedCourses.length > 0) {
        emailjs.send("service_dsymu5l", "template_0xjhs89", {
          to_email: email,
          courses_list: coursesLinksFormatted,
          dashboard_url: `${originUrl}/dashboard.html`
        }).then(() => {
          console.log("Notificación enviada con éxito por correo a " + email);
        }).catch(err => {
          console.warn("Error al enviar el correo vía EmailJS:", err);
        });
      }

      statusMsg.style.color = '#15803d';
      statusMsg.textContent = `¡Guardado con éxito! Accesos asignados a ${email} y correo procesado.`;

      resetForm();
      await refreshUsersTable();
    } catch (error) {
      console.error("Error al guardar permisos:", error);
      statusMsg.style.color = '#b91c1c';
      statusMsg.textContent = "Error al actualizar los accesos en Firestore.";
    }
  });
}

function resetForm() {
  formRole.reset();
  const checkboxes = document.querySelectorAll('input[name="courses"]');
  checkboxes.forEach(cb => cb.checked = false);
}

if (btnReset) {
  btnReset.addEventListener('click', () => {
    resetForm();
    statusMsg.textContent = '';
  });
}