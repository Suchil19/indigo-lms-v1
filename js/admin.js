import { auth, db } from './firebase-config.js';
import { COURSES_CATALOG } from './courses-data.js';
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================================================
// CONFIGURACIÓN CENTRALIZADA DE EMAILJS (CREDENCIALES REALES)
// ==========================================================================
const EMAILJS_CONFIG = {
  PUBLIC_KEY: "Sme5UkbtF9t2q26pn",
  SERVICE_ID: "service_dsymu5l",
  TEMPLATE_ID: "template_pcm3pus"
};

if (window.emailjs && EMAILJS_CONFIG.PUBLIC_KEY) {
  emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
}

let allUsers = [];
let allSchools = [];
let pendingExcelRows = [];
let unsubscribeUsersListener = null;

// ==========================================================================
// FUNCIÓN HELPER PARA MOSTRAR NOTIFICACIONES TOAST ABAJO EN VERDE/ROJO
// ==========================================================================
function showToast(message, type = 'success') {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast-notification show ${type === 'success' ? 'toast-success' : 'toast-error'}`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// ==========================================================================
// RENDERIZADO DEL SELECTOR DE CURSOS DESDE CATÁLOGO
// ==========================================================================
export function renderAdminCoursesSelector() {
  const container = document.getElementById('admin-courses-checkboxes-container');
  if (!container) return;

  container.innerHTML = '';
  const coursesList = Object.values(COURSES_CATALOG);

  if (coursesList.length === 0) {
    container.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-secondary);">No hay cursos disponibles en el catálogo.</span>';
    return;
  }

  coursesList.forEach(course => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';
    label.style.padding = '6px 8px';
    label.style.borderRadius = '6px';
    label.style.background = 'var(--card-bg, #ffffff)';
    label.style.border = '1px solid var(--border-color, #e5e7eb)';
    label.style.cursor = 'pointer';
    label.style.fontSize = '0.85rem';

    label.innerHTML = `
      <input type="checkbox" class="admin-course-checkbox" value="${course.id}">
      <span>${course.icon || '📘'} <strong>${course.title}</strong></span>
    `;
    container.appendChild(label);
  });
}

export function getSelectedCoursesFromAdmin() {
  const checkboxes = document.querySelectorAll('.admin-course-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function setSelectAdminCourses(coursesArray = []) {
  const checkboxes = document.querySelectorAll('.admin-course-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = coursesArray.includes(cb.value);
  });
}

// ==========================================================================
// ENVÍO DE NOTIFICACIONES VÍA EMAILJS CON ENLACE COMPLETO
// ==========================================================================
async function sendNotificationEmail(recipientEmail, role, school) {
  if (!window.emailjs || !EMAILJS_CONFIG.PUBLIC_KEY) return;

  // Construir la URL completa asegurando el archivo de destino
  const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
  const directLink = `${baseUrl}dashboard.html`;

  const templateParams = {
    to_email: recipientEmail,
    user_role: role,
    user_school: school,
    platform_link: directLink // Se envía la URL absoluta (ej: https://tusitio.com/dashboard.html)
  };

  try {
    await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, templateParams);
    console.log(`Notificación enviada a ${recipientEmail}`);
  } catch (err) {
    console.error(`Error enviando notificación a ${recipientEmail}:`, err);
  }
}
// ==========================================================================
// CÓDIGO PRINCIPAL ADMIN Y GESTIÓN DE ESCUELAS
// ==========================================================================
export async function initAdminPanel() {
  renderAdminCoursesSelector();
  await loadSchoolsCatalog();
  listenToUsersRealtime();
  setupAdminEventListeners();
}

async function loadSchoolsCatalog() {
  const schoolSelects = [
    document.getElementById('admin-user-school-select'),
    document.getElementById('batch-school-select')
  ];

  try {
    onSnapshot(collection(db, "schools"), (snapshot) => {
      allSchools = [];
      let optionsHTML = '<option value="General">General / Sin Institución</option>';

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        allSchools.push({ id: docSnap.id, ...data });
        optionsHTML += `<option value="${data.name}">${data.name} (${data.domain || 'Sin Dominio'})</option>`;
      });

      schoolSelects.forEach(select => {
        if (select) select.innerHTML = optionsHTML;
      });

      renderSchoolsTable();
    });
  } catch (err) {
    console.error("Error al cargar catálogo de escuelas:", err);
  }
}

function renderSchoolsTable() {
  const tbody = document.getElementById('admin-schools-tbody');
  if (!tbody) return;

  if (allSchools.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 15px;">No hay instituciones registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  allSchools.forEach(school => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    tr.innerHTML = `
      <td style="padding: 8px;"><strong>${school.name}</strong></td>
      <td style="padding: 8px;"><code style="background: var(--input-bg); padding: 2px 6px; border-radius: 4px;">${school.domain || 'N/A'}</code></td>
      <td style="padding: 8px;">${school.logo ? `<img src="${school.logo}" alt="Logo" style="height: 24px; object-fit: contain;">` : '<span style="opacity:0.5;">Sin Logo</span>'}</td>
      <td style="padding: 8px;">
        <button type="button" class="btn btn-sm btn-outline btn-edit-school" data-id="${school.id}">✏️ Editar</button>
        <button type="button" class="btn btn-sm btn-danger btn-delete-school" data-id="${school.id}">🗑️ Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-edit-school').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const schoolId = e.target.getAttribute('data-id');
      const school = allSchools.find(s => s.id === schoolId);
      if (!school) return;

      document.getElementById('school-doc-id').value = school.id;
      document.getElementById('school-name-input').value = school.name || '';
      document.getElementById('school-domain-input').value = school.domain || '';
      document.getElementById('school-logo-input').value = school.logo || '';
      
      const formTitle = document.getElementById('school-form-title');
      const btnCancel = document.getElementById('btn-cancel-school-edit');
      if (formTitle) formTitle.textContent = '✏️ Editar Institución';
      if (btnCancel) btnCancel.style.display = 'inline-block';

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.btn-delete-school').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const schoolId = e.target.getAttribute('data-id');
      if (confirm(`¿Estás seguro de eliminar esta institución?`)) {
        try {
          await deleteDoc(doc(db, "schools", schoolId));
          showToast("Institución eliminada correctamente", "success");
        } catch (err) {
          showToast("Error al eliminar escuela: " + err.message, "error");
        }
      }
    });
  });
}

// ==========================================================================
// AUTOCOMPLETADO Y ESCUCHADOR EN TIEMPO REAL
// ==========================================================================
function updateEmailDatalist(users) {
  const datalist = document.getElementById('registered-emails-list');
  if (!datalist) return;

  datalist.innerHTML = '';
  users.forEach(user => {
    const option = document.createElement('option');
    option.value = user.email || user.id;
    datalist.appendChild(option);
  });
}

function listenToUsersRealtime() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  if (unsubscribeUsersListener) unsubscribeUsersListener();

  unsubscribeUsersListener = onSnapshot(collection(db, "assigned_roles"), (snapshot) => {
    allUsers = [];
    snapshot.forEach(docSnap => {
      allUsers.push({ id: docSnap.id, ...docSnap.data() });
    });
    
    updateEmailDatalist(allUsers);
    renderUsersTable(allUsers);
  });
}

function renderUsersTable(users) {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay usuarios registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  users.forEach(user => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    
    const courseBadges = (user.allowedCourses || []).map(courseId => {
      const course = COURSES_CATALOG[courseId];
      return `<span class="badge badge-info" style="margin-right: 4px; display: inline-flex; align-items: center; gap: 3px;">${course ? course.icon : '📘'} ${course ? course.title : courseId}</span>`;
    }).join(' ');

    tr.innerHTML = `
      <td style="padding: 10px;"><input type="checkbox" class="admin-user-checkbox" value="${user.id}"></td>
      <td style="padding: 10px;"><strong>${user.email || user.id}</strong></td>
      <td style="padding: 10px;"><span class="badge badge-role-${user.role}">${user.role || 'student'}</span></td>
      <td style="padding: 10px;">${user.school || 'General'}</td>
      <td style="padding: 10px;">${courseBadges || '<span style="opacity:0.5;">Sin Cursos</span>'}</td>
      <td style="padding: 10px;">
        <button type="button" class="btn btn-sm btn-outline btn-edit-user" data-id="${user.id}">✏️ Editar</button>
        <button type="button" class="btn btn-sm btn-danger btn-delete-user" data-id="${user.id}">🗑️ Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  setupRowActionButtons();
}

function setupRowActionButtons() {
  document.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.target.getAttribute('data-id');
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;

      document.getElementById('admin-user-email-input').value = user.email || user.id;
      document.getElementById('admin-user-role-select').value = user.role || 'student';
      document.getElementById('admin-user-school-select').value = user.school || 'General';
      setSelectAdminCourses(user.allowedCourses || []);

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.getAttribute('data-id');
      if (confirm(`¿Eliminar el acceso para ${userId}?`)) {
        try {
          await deleteDoc(doc(db, "assigned_roles", userId));
          showToast("Usuario eliminado correctamente", "success");
        } catch (err) {
          showToast("Error al eliminar usuario: " + err.message, "error");
        }
      }
    });
  });
}

// ==========================================================================
// VISTA PREVIA EXCEL
// ==========================================================================
function renderExcelPreviewTable() {
  const container = document.getElementById('excel-preview-container');
  const tbody = document.getElementById('excel-preview-tbody');
  const countSpan = document.getElementById('excel-preview-count');

  if (!container || !tbody) return;

  if (pendingExcelRows.length === 0) {
    container.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  if (countSpan) countSpan.textContent = pendingExcelRows.length;
  tbody.innerHTML = '';

  const selectedCourses = getSelectedCoursesFromAdmin();
  const courseBadgesText = selectedCourses.map(id => {
    const course = COURSES_CATALOG[id];
    return `${course ? course.icon : '📘'} ${course ? course.title : id}`;
  }).join(', ');

  pendingExcelRows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';

    tr.innerHTML = `
      <td style="padding: 8px;"><strong>${row.email}</strong></td>
      <td style="padding: 8px;"><span class="badge badge-role-${row.role}">${row.role}</span></td>
      <td style="padding: 8px;">
        <span class="badge badge-info">${row.school}</span>
      </td>
      <td style="padding: 8px; font-size: 0.8rem; color: var(--text-secondary);">
        ${courseBadgesText || 'Sin cursos seleccionados'}
      </td>
      <td style="padding: 8px; text-align: center;">
        <button type="button" class="btn btn-sm btn-danger btn-remove-preview-item" data-index="${index}">
          🗑️ Descartar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-remove-preview-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      pendingExcelRows.splice(idx, 1);
      renderExcelPreviewTable();
    });
  });
}

// ==========================================================================
// EVENT LISTENERS GLOBALES
// ==========================================================================
function setupAdminEventListeners() {
  // Formulario Institución
  const schoolForm = document.getElementById('admin-school-form');
  const btnCancelSchool = document.getElementById('btn-cancel-school-edit');

  if (btnCancelSchool) {
    btnCancelSchool.addEventListener('click', () => {
      if (schoolForm) schoolForm.reset();
      document.getElementById('school-doc-id').value = '';
      document.getElementById('school-form-title').textContent = '🏫 Registrar / Editar Institución (Escuela)';
      btnCancelSchool.style.display = 'none';
    });
  }

  if (schoolForm) {
    schoolForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const docId = document.getElementById('school-doc-id').value;
      const name = document.getElementById('school-name-input').value.trim();
      const domain = document.getElementById('school-domain-input').value.trim().toLowerCase();
      const logo = document.getElementById('school-logo-input').value.trim();

      if (!name) return;

      const schoolRefId = docId || name.toLowerCase().replace(/[^a-z0-9]/g, '-');

      try {
        await setDoc(doc(db, "schools", schoolRefId), {
          name: name,
          domain: domain || '',
          logo: logo || '',
          updatedAt: new Date().toISOString()
        }, { merge: true });

        showToast("Institución guardada exitosamente", "success");
        schoolForm.reset();
        document.getElementById('school-doc-id').value = '';
        if (btnCancelSchool) btnCancelSchool.style.display = 'none';
        document.getElementById('school-form-title').textContent = '🏫 Registrar / Editar Institución (Escuela)';

      } catch (err) {
        showToast("Error al guardar institución: " + err.message, "error");
      }
    });
  }

  // Autocompletado de Correo al escribir
  const emailInput = document.getElementById('admin-user-email-input');
  if (emailInput) {
    emailInput.addEventListener('input', (e) => {
      const typedEmail = e.target.value.trim().toLowerCase();
      const existingUser = allUsers.find(u => (u.email || u.id).toLowerCase() === typedEmail);

      if (existingUser) {
        document.getElementById('admin-user-role-select').value = existingUser.role || 'student';
        document.getElementById('admin-user-school-select').value = existingUser.school || 'General';
        setSelectAdminCourses(existingUser.allowedCourses || []);
      } else {
        allSchools.forEach(sch => {
          if (sch.domain && typedEmail.endsWith(sch.domain.toLowerCase())) {
            document.getElementById('admin-user-school-select').value = sch.name;
          }
        });
      }
    });
  }

  // Formulario Individual de Usuario
  const formSingle = document.getElementById('admin-single-user-form');
  if (formSingle) {
    formSingle.addEventListener('submit', async (e) => {
      e.preventDefault();
      const roleSelect = document.getElementById('admin-user-role-select');
      const schoolSelect = document.getElementById('admin-user-school-select');

      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const role = roleSelect ? roleSelect.value : 'student';
      const school = schoolSelect ? schoolSelect.value : 'General';
      const allowedCourses = getSelectedCoursesFromAdmin();

      if (!email) return;

      try {
        await setDoc(doc(db, "assigned_roles", email), {
          email: email,
          role: role,
          school: school,
          allowedCourses: allowedCourses,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await sendNotificationEmail(email, role, school);

        showToast(`Acceso guardado con éxito para ${email}`, "success");
        formSingle.reset();
        setSelectAdminCourses([]);

      } catch (err) {
        showToast("Error al guardar en Firestore: " + err.message, "error");
      }
    });
  }

  // Acciones en Lote
  const btnApplyBatch = document.getElementById('btn-apply-batch-action');
  if (btnApplyBatch) {
    btnApplyBatch.addEventListener('click', async () => {
      const selectedCheckboxes = document.querySelectorAll('.admin-user-checkbox:checked');
      if (selectedCheckboxes.length === 0) {
        showToast("Selecciona al menos un usuario de la tabla", "error");
        return;
      }

      const action = document.getElementById('admin-batch-action-select').value;
      const targetSchool = document.getElementById('batch-school-select')?.value || 'General';

      if (!confirm(`¿Ejecutar la acción sobre ${selectedCheckboxes.length} usuarios?`)) return;

      try {
        const batch = writeBatch(db);

        selectedCheckboxes.forEach(cb => {
          const userId = cb.value;
          const userRef = doc(db, "assigned_roles", userId);

          if (action === 'delete') {
            batch.delete(userRef);
          } else if (action === 'make_teacher') {
            batch.update(userRef, { role: 'teacher' });
          } else if (action === 'make_student') {
            batch.update(userRef, { role: 'student' });
          } else if (action === 'change_school') {
            batch.update(userRef, { school: targetSchool });
          }
        });

        await batch.commit();
        showToast("¡Acción en lote completada exitosamente!", "success");

      } catch (err) {
        showToast("Error en lote: " + err.message, "error");
      }
    });
  }

  // Checkbox Seleccionar Todos
  const selectAll = document.getElementById('admin-select-all-users');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      document.querySelectorAll('.admin-user-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
      });
    });
  }

  // Excel Upload
  const excelInput = document.getElementById('admin-excel-file-input');
  if (excelInput) {
    excelInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (typeof XLSX === 'undefined') {
        showToast("Error: La librería SheetJS no está cargada.", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet);

          if (rows.length === 0) {
            showToast("El archivo Excel no contiene datos.", "error");
            return;
          }

          pendingExcelRows = [];

          rows.forEach(row => {
            const email = (row.email || row.Correo || row.correo || '').toString().trim().toLowerCase();
            if (!email) return;

            let matchedSchool = row.school || row.Escuela || 'General';
            if (matchedSchool === 'General') {
              allSchools.forEach(sch => {
                if (sch.domain && email.endsWith(sch.domain.toLowerCase())) {
                  matchedSchool = sch.name;
                }
              });
            }

            pendingExcelRows.push({
              email: email,
              role: (row.role || row.Rol || 'student').toString().trim().toLowerCase(),
              school: matchedSchool
            });
          });

          renderExcelPreviewTable();
          showToast(`Se generó la vista previa de ${pendingExcelRows.length} registros`, "success");

        } catch (err) {
          showToast("Error al leer archivo Excel: " + err.message, "error");
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Confirmar Excel
  const btnConfirmExcel = document.getElementById('btn-confirm-excel-import');
  if (btnConfirmExcel) {
    btnConfirmExcel.addEventListener('click', async () => {
      if (pendingExcelRows.length === 0) return;

      if (!confirm(`¿Deseas guardar definitivamente los ${pendingExcelRows.length} alumnos mostrados en la vista previa?`)) {
        return;
      }

      try {
        const batch = writeBatch(db);
        const allowedCourses = getSelectedCoursesFromAdmin();

        pendingExcelRows.forEach(row => {
          const userRef = doc(db, "assigned_roles", row.email);
          batch.set(userRef, {
            email: row.email,
            role: row.role,
            school: row.school,
            allowedCourses: allowedCourses,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        });

        await batch.commit();
        showToast(`¡Se guardaron ${pendingExcelRows.length} registros exitosamente!`, "success");

        pendingExcelRows = [];
        renderExcelPreviewTable();
        if (excelInput) excelInput.value = '';

      } catch (err) {
        showToast("Error al guardar en Firestore: " + err.message, "error");
      }
    });
  }

  // Cancelar Excel
  const btnCancelExcel = document.getElementById('btn-cancel-excel-preview');
  if (btnCancelExcel) {
    btnCancelExcel.addEventListener('click', () => {
      pendingExcelRows = [];
      renderExcelPreviewTable();
      if (excelInput) excelInput.value = '';
      showToast("Vista previa cancelada", "error");
    });
  }
}

// Auto-inicialización
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('admin.html')) {
    initAdminPanel();
  }
});