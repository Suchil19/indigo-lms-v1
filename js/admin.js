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
let pendingExcelGroups = [];
let pendingExcelGroupStudents = []; 
let unsubscribeUsersListener = null;

// ==========================================================================
// NOTIFICACIÓN FLOTANTE (TOAST)
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
// RENDERIZADO DEL SELECTOR DE CURSOS
// ==========================================================================
export function renderAdminCoursesSelector() {
  const container = document.getElementById('admin-courses-checkboxes-container');
  if (!container) return;

  container.innerHTML = '';
  const coursesList = Object.values(COURSES_CATALOG);

  if (coursesList.length === 0) {
    container.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-secondary);">No hay cursos disponibles.</span>';
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
// ENVÍO DE NOTIFICACIONES VÍA EMAILJS CON ENLACES VÁLIDOS
// ==========================================================================
async function sendNotificationEmail(recipientEmail, role, school) {
  if (!window.emailjs || !EMAILJS_CONFIG.PUBLIC_KEY) return;

  const origin = window.location.origin;
  const path = window.location.pathname.replace('admin.html', '');
  const directLink = `${origin}${path}dashboard.html`;

  const templateParams = {
    to_email: recipientEmail,
    user_role: role,
    user_school: school,
    platform_link: directLink
  };

  try {
    await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, templateParams);
    console.log(`Notificación enviada a ${recipientEmail}`);
  } catch (err) {
    console.error(`Error enviando notificación a ${recipientEmail}:`, err);
  }
}

// ==========================================================================
// CÓDIGO PRINCIPAL ADMIN Y GESTIÓN DE ESCUELAS / GRUPOS
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
    document.getElementById('group-school-select'),
    document.getElementById('excel-groups-school-select')
  ];

  try {
    onSnapshot(collection(db, "schools"), (snapshot) => {
      allSchools = [];
      let optionsHTML = '<option value="General">General / Sin Institución</option>';
      let createGroupOptions = '<option value="">-- Selecciona una Escuela --</option>';

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        allSchools.push({ id: docSnap.id, ...data });

        optionsHTML += `<option value="${data.name}">${data.name} (${data.domain || 'Sin Dominio'})</option>`;
        createGroupOptions += `<option value="${data.name}">${data.name}</option>`;
      });

      schoolSelects.forEach(select => {
        if (!select) return;
        if (select.id === 'group-school-select' || select.id === 'excel-groups-school-select') {
          select.innerHTML = createGroupOptions;
        } else {
          select.innerHTML = optionsHTML;
        }
      });

      renderSchoolsTable();
      renderSchoolGroupsChips();
    });
  } catch (err) {
    console.error("Error al cargar escuelas:", err);
  }
}

function renderSchoolGroupsChips() {
  const container = document.getElementById('school-groups-list-container');
  if (!container) return;

  if (allSchools.length === 0) {
    container.innerHTML = '<span style="opacity: 0.6;">No hay escuelas para mostrar grupos.</span>';
    return;
  }

  let html = '<strong>Resumen de Grupos por Escuela:</strong><div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">';

  allSchools.forEach(sch => {
    const groups = sch.groups || [];
    const groupBadges = groups.length > 0 
      ? groups.map(g => `<span class="badge badge-info" style="margin-right: 4px; display: inline-flex; align-items: center; gap: 4px;">${g} <button type="button" class="btn-delete-group" data-school="${sch.id}" data-group="${g}" style="background:none; border:none; color:red; cursor:pointer; font-weight:bold; padding:0;">×</button></span>`).join(' ')
      : '<span style="opacity: 0.5;">Sin grupos registrados</span>';

    html += `<div style="background: var(--input-bg); padding: 8px 12px; border-radius: 6px;">
      <strong>${sch.name}:</strong> ${groupBadges}
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;

  document.querySelectorAll('.btn-delete-group').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const schoolId = e.target.getAttribute('data-school');
      const groupName = e.target.getAttribute('data-group');
      const schoolObj = allSchools.find(s => s.id === schoolId);

      if (schoolObj && confirm(`¿Eliminar el grupo '${groupName}' de ${schoolObj.name}?`)) {
        const updatedGroups = (schoolObj.groups || []).filter(g => g !== groupName);
        try {
          await updateDoc(doc(db, "schools", schoolId), { groups: updatedGroups });
          showToast(`Grupo '${groupName}' eliminado`, "success");
        } catch (err) {
          showToast("Error al eliminar grupo: " + err.message, "error");
        }
      }
    });
  });
}

function updateGroupSelectDropdown(schoolName, targetDropdownId) {
  const dropdown = document.getElementById(targetDropdownId);
  if (!dropdown) return;

  const schoolObj = allSchools.find(s => s.name === schoolName);
  const groups = schoolObj ? (schoolObj.groups || []) : [];

  let optionsHTML = '<option value="Sin Grupo">Sin Grupo Asignado</option>';
  groups.forEach(g => {
    optionsHTML += `<option value="${g}">${g}</option>`;
  });

  dropdown.innerHTML = optionsHTML;
}

// ==========================================================================
// RENDERIZADO DE TABLA DE ESCUELAS CON GRUPOS Y ALUMNOS ANIDADOS
// ==========================================================================
function renderSchoolsTable() {
  const tbody = document.getElementById('admin-schools-tbody');
  if (!tbody) return;

  if (allSchools.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 15px;">No hay instituciones registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  
  allSchools.forEach(school => {
    const trSchool = document.createElement('tr');
    trSchool.style.borderBottom = '1px solid var(--border-color)';
    trSchool.style.background = 'var(--input-bg)';
    
    trSchool.innerHTML = `
      <td style="padding: 10px; font-weight: bold; font-size: 0.95rem;">🏫 ${school.name}</td>
      <td style="padding: 10px;"><code style="background: var(--card-bg); padding: 2px 6px; border-radius: 4px;">${school.domain || 'Sin Dominio'}</code></td>
      <td style="padding: 10px;">${school.logo ? `<img src="${school.logo}" alt="Logo" style="height: 24px; object-fit: contain;">` : '<span style="opacity:0.5;">Sin Logo</span>'}</td>
      <td style="padding: 10px;">
        <button type="button" class="btn btn-sm btn-outline btn-edit-school" data-id="${school.id}">✏️ Editar</button>
        <button type="button" class="btn btn-sm btn-danger btn-delete-school" data-id="${school.id}">🗑️ Eliminar</button>
      </td>
    `;
    tbody.appendChild(trSchool);

    const groups = school.groups || [];

    if (groups.length === 0) {
      const trEmptyGroup = document.createElement('tr');
      trEmptyGroup.innerHTML = `
        <td colspan="4" style="padding: 6px 10px 6px 40px; font-size: 0.8rem; color: var(--text-secondary); font-style: italic;">
          ↳ 🚫 Sin grupos registrados en esta institución
        </td>
      `;
      tbody.appendChild(trEmptyGroup);
    } else {
      groups.forEach(groupName => {
        const groupStudents = allUsers.filter(u => {
          const userSchool = (u.school || '').trim().toLowerCase();
          const targetSchool = school.name.trim().toLowerCase();
          const userGroup = (u.group || 'Sin Grupo').trim().toLowerCase();
          const targetGroup = groupName.trim().toLowerCase();
          return (userSchool === targetSchool) && (userGroup === targetGroup);
        });

        const trGroup = document.createElement('tr');
        trGroup.style.borderBottom = '1px dashed var(--border-color)';
        trGroup.style.background = 'rgba(139, 92, 246, 0.03)';

        trGroup.innerHTML = `
          <td colspan="3" style="padding: 8px 10px 8px 40px; font-size: 0.85rem;">
            <button type="button" class="btn-toggle-students" data-school="${school.name}" data-group="${groupName}" style="background: none; border: none; cursor: pointer; padding: 0; font-size: 0.85rem; font-weight: bold; color: var(--text-color);">
              ▶ 👥 <strong>${groupName}</strong> <span style="font-weight: normal; opacity: 0.8; color: #8b5cf6;">(${groupStudents.length} alumnos inscritos)</span>
            </button>
          </td>
          <td style="padding: 6px 10px;">
            <button type="button" class="btn btn-sm btn-outline btn-delete-indent-group" data-school="${school.id}" data-group="${groupName}" style="padding: 2px 8px; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;">
              🗑️ Eliminar Grupo
            </button>
          </td>
        `;
        tbody.appendChild(trGroup);

        const trStudentsContainer = document.createElement('tr');
        const safeRowId = `students-row-${school.id}-${groupName.replace(/[^a-zA-Z0-9]/g, '-')}`;
        trStudentsContainer.id = safeRowId;
        trStudentsContainer.style.display = 'none';

        let studentsListHTML = '';
        if (groupStudents.length === 0) {
          studentsListHTML = '<div style="padding: 6px 0; color: var(--text-secondary); font-style: italic;">No hay alumnos inscritos en este grupo.</div>';
        } else {
          studentsListHTML = '<table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 0.8rem;">';
          groupStudents.forEach(st => {
            const courseBadges = (st.allowedCourses || []).map(courseId => {
              const course = COURSES_CATALOG[courseId];
              return `<span class="badge badge-info" style="font-size: 0.7rem; padding: 2px 6px; margin-right: 3px;">${course ? course.icon : '📘'} ${courseId}</span>`;
            }).join(' ');

            studentsListHTML += `
              <tr style="border-bottom: 1px dotted var(--border-color);">
                <td style="padding: 6px 8px;"><strong>${st.email || st.id}</strong></td>
                <td style="padding: 6px 8px;"><span class="badge badge-role-${st.role}">${st.role || 'student'}</span></td>
                <td style="padding: 6px 8px;">${courseBadges || '<span style="opacity:0.5;">Sin Cursos</span>'}</td>
                <td style="padding: 6px 8px; text-align: right;">
                  <button type="button" class="btn btn-sm btn-outline btn-edit-user" data-id="${st.id}" style="padding: 2px 6px; font-size: 0.75rem;">✏️ Editar</button>
                  <button type="button" class="btn btn-sm btn-outline btn-move-student" data-id="${st.id}" data-school="${st.school}" data-group="${st.group}" style="padding: 2px 6px; font-size: 0.75rem; color: #3b82f6; border-color: #3b82f6;">📦 Mover</button>
                  <button type="button" class="btn btn-sm btn-danger btn-delete-user" data-id="${st.id}" style="padding: 2px 6px; font-size: 0.75rem;">🗑️ Borrar</button>
                </td>
              </tr>
            `;
          });
          studentsListHTML += '</table>';
        }

        trStudentsContainer.innerHTML = `
          <td colspan="4" style="padding: 8px 10px 10px 60px; background: var(--card-bg);">
            <div style="border-left: 3px solid #8b5cf6; padding-left: 12px;">
              ${studentsListHTML}
            </div>
          </td>
        `;
        tbody.appendChild(trStudentsContainer);
      });
    }
  });

  document.querySelectorAll('.btn-toggle-students').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.currentTarget;
      const schoolName = targetBtn.getAttribute('data-school');
      const groupName = targetBtn.getAttribute('data-group');
      const schoolObj = allSchools.find(s => s.name === schoolName);
      if (!schoolObj) return;

      const rowId = `students-row-${schoolObj.id}-${groupName.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const targetRow = document.getElementById(rowId);

      if (targetRow) {
        const isHidden = targetRow.style.display === 'none';
        targetRow.style.display = isHidden ? 'table-row' : 'none';
        targetBtn.innerHTML = `${isHidden ? '▼' : '▶'} 👥 <strong>${groupName}</strong>`;
      }
    });
  });

  document.querySelectorAll('.btn-move-student').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const studentId = e.target.getAttribute('data-id');
      const currentSchool = e.target.getAttribute('data-school');
      const currentGroup = e.target.getAttribute('data-group');

      const schoolObj = allSchools.find(s => s.name === currentSchool);
      const availableGroups = schoolObj ? (schoolObj.groups || []) : [];

      if (availableGroups.length === 0) {
        showToast("No hay otros grupos en esta escuela", "error");
        return;
      }

      const newGroup = prompt(`Mover alumno ${studentId}\nGrupos disponibles:\n• ${availableGroups.join('\n• ')}\n\nIngresa el nuevo grupo:`, currentGroup);

      if (newGroup && newGroup.trim() !== '' && newGroup !== currentGroup) {
        try {
          await updateDoc(doc(db, "assigned_roles", studentId), { group: newGroup.trim() });
          showToast(`Alumno movido al grupo '${newGroup.trim()}'`, "success");
        } catch (err) {
          showToast("Error al mover alumno: " + err.message, "error");
        }
      }
    });
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
      if (confirm(`¿Eliminar esta institución?`)) {
        try {
          await deleteDoc(doc(db, "schools", schoolId));
          showToast("Institución eliminada", "success");
        } catch (err) {
          showToast("Error: " + err.message, "error");
        }
      }
    });
  });

  document.querySelectorAll('.btn-delete-indent-group').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const schoolId = e.target.getAttribute('data-school');
      const groupName = e.target.getAttribute('data-group');
      const schoolObj = allSchools.find(s => s.id === schoolId);

      if (schoolObj && confirm(`¿Eliminar el grupo '${groupName}'?`)) {
        const updatedGroups = (schoolObj.groups || []).filter(g => g !== groupName);
        try {
          await updateDoc(doc(db, "schools", schoolId), { groups: updatedGroups });
          showToast(`Grupo '${groupName}' eliminado`, "success");
        } catch (err) {
          showToast("Error: " + err.message, "error");
        }
      }
    });
  });

  setupRowActionButtons();
}

function renderGroupsPreview() {
  const container = document.getElementById('groups-preview-container');
  const countSpan = document.getElementById('groups-preview-count');
  const studentsCountSpan = document.getElementById('students-preview-count');
  const chipsContainer = document.getElementById('groups-preview-chips');
  const summaryDiv = document.getElementById('students-preview-summary');

  if (!container || !chipsContainer) return;

  if (pendingExcelGroups.length === 0 && pendingExcelGroupStudents.length === 0) {
    container.style.display = 'none';
    chipsContainer.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  if (countSpan) countSpan.textContent = pendingExcelGroups.length;
  if (studentsCountSpan) studentsCountSpan.textContent = pendingExcelGroupStudents.length;

  chipsContainer.innerHTML = '';
  pendingExcelGroups.forEach((groupName, idx) => {
    const chip = document.createElement('span');
    chip.className = 'badge badge-info';
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = '6px';
    chip.style.padding = '4px 8px';
    chip.innerHTML = `${groupName} <button type="button" class="btn-remove-group-chip" data-index="${idx}" style="background:none; border:none; color:red; cursor:pointer; font-weight:bold;">×</button>`;
    chipsContainer.appendChild(chip);
  });

  if (summaryDiv) {
    summaryDiv.innerHTML = pendingExcelGroupStudents.length > 0 
      ? `Se registrarán ${pendingExcelGroupStudents.length} alumnos validados con el dominio institucional.` 
      : `No se encontraron correos válidos para el dominio de la escuela en el archivo.`;
  }

  document.querySelectorAll('.btn-remove-group-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      pendingExcelGroups.splice(index, 1);
      renderGroupsPreview();
    });
  });
}

// ==========================================================================
// AUTOCOMPLETADO Y BÚSQUEDA EN TIEMPO REAL DE CORREOS
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
    renderUsersGeneralTable(allUsers);
    renderSchoolsTable();
  });
}

function renderUsersGeneralTable(users) {
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
      return `<span class="badge badge-info" style="margin-right: 4px; display: inline-flex; align-items: center; gap: 3px;">${course ? course.icon : '📘'} ${courseId}</span>`;
    }).join(' ');

    tr.innerHTML = `
      <td style="padding: 10px;"><strong>${user.email || user.id}</strong></td>
      <td style="padding: 10px;"><span class="badge badge-role-${user.role}">${user.role || 'student'}</span></td>
      <td style="padding: 10px;">${user.school || 'General'}</td>
      <td style="padding: 10px;"><span class="badge badge-info">${user.group || 'Sin Grupo'}</span></td>
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
      
      const schoolSelect = document.getElementById('admin-user-school-select');
      if (schoolSelect) {
        schoolSelect.value = user.school || 'General';
        updateGroupSelectDropdown(schoolSelect.value, 'admin-user-group-select');
      }

      document.getElementById('admin-user-group-select').value = user.group || 'Sin Grupo';
      setSelectAdminCourses(user.allowedCourses || []);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.getAttribute('data-id');
      if (confirm(`¿Eliminar acceso para ${userId}?`)) {
        try {
          await deleteDoc(doc(db, "assigned_roles", userId));
          showToast("Usuario eliminado", "success");
        } catch (err) {
          showToast("Error: " + err.message, "error");
        }
      }
    });
  });
}

function setupAdminEventListeners() {
  // Alta Manual de Grupo
  const formGroup = document.getElementById('admin-group-form');
  if (formGroup) {
    formGroup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const schoolName = document.getElementById('group-school-select').value;
      const groupName = document.getElementById('group-name-input').value.trim();

      if (!schoolName || !groupName) {
        showToast("Selecciona la escuela e ingresa el grupo", "error");
        return;
      }

      const schoolObj = allSchools.find(s => s.name === schoolName);
      if (!schoolObj) return;

      const currentGroups = schoolObj.groups || [];
      if (currentGroups.includes(groupName)) {
        showToast(`El grupo '${groupName}' ya existe`, "error");
        return;
      }

      try {
        await updateDoc(doc(db, "schools", schoolObj.id), {
          groups: [...currentGroups, groupName]
        });
        showToast(`Grupo '${groupName}' agregado`, "success");
        formGroup.reset();
      } catch (err) {
        showToast("Error: " + err.message, "error");
      }
    });
  }

  // LECTURA DE EXCEL DE GRUPOS Y ALUMNOS (CON VALIDACIÓN DE DOMINIO)
  const excelGroupsInput = document.getElementById('admin-excel-groups-file-input');
  if (excelGroupsInput) {
    excelGroupsInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      const schoolName = document.getElementById('excel-groups-school-select').value;

      if (!schoolName) {
        showToast("Selecciona primero la escuela de destino", "error");
        excelGroupsInput.value = '';
        return;
      }

      const schoolObj = allSchools.find(s => s.name === schoolName);
      const schoolDomain = schoolObj && schoolObj.domain ? schoolObj.domain.trim().toLowerCase() : '';

      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet);

          if (rows.length === 0) {
            showToast("El archivo Excel está vacío", "error");
            return;
          }

          pendingExcelGroups = [];
          pendingExcelGroupStudents = [];

          rows.forEach(r => {
            const groupVal = (
              r.grupo || r.Grupo || r.GRUPO ||
              r.group || r.Group || r.GROUP ||
              r.nombre || r.Nombre || 
              r['Nombre del Grupo'] || r['nombre del grupo'] || ''
            ).toString().trim();

            const emailVal = (
              r.correo || r.Correo || r.CORREO ||
              r.email || r.Email || r.EMAIL || ''
            ).toString().trim().toLowerCase();

            const roleVal = (r.rol || r.Rol || r.role || r.Role || 'student').toString().trim().toLowerCase();

            if (groupVal) {
              if (!pendingExcelGroups.includes(groupVal)) {
                pendingExcelGroups.push(groupVal);
              }
              if (emailVal) {
                // VALIDACIÓN ESTRICTA DE DOMINIO INSTITUCIONAL
                if (schoolDomain && !emailVal.endsWith(schoolDomain)) {
                  console.warn(`Correo rechazado por dominio no coincidente: ${emailVal} (requiere ${schoolDomain})`);
                  return; // Omitir si no cumple con el dominio de la escuela
                }

                pendingExcelGroupStudents.push({
                  email: emailVal,
                  group: groupVal,
                  school: schoolName,
                  role: roleVal
                });
              }
            }
          });

          if (pendingExcelGroups.length === 0) {
            showToast("No se encontraron grupos en el archivo Excel", "error");
            return;
          }

          renderGroupsPreview();
          showToast(`Se leyeron ${pendingExcelGroups.length} grupos y ${pendingExcelGroupStudents.length} alumnos válidos (${schoolDomain ? 'dominio: ' + schoolDomain : 'sin dominio estricto'})`, "success");

        } catch (err) {
          showToast("Error leyendo Excel: " + err.message, "error");
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // CONFIRMAR IMPORTACIÓN DE GRUPOS Y ALUMNOS
  const btnConfirmGroups = document.getElementById('btn-confirm-groups-import');
  if (btnConfirmGroups) {
    btnConfirmGroups.addEventListener('click', async () => {
      const schoolName = document.getElementById('excel-groups-school-select').value;
      if (!schoolName || pendingExcelGroups.length === 0) return;

      const schoolObj = allSchools.find(s => s.name === schoolName);
      if (!schoolObj) return;

      const existingGroups = schoolObj.groups || [];
      const combinedGroups = Array.from(new Set([...existingGroups, ...pendingExcelGroups]));
      const allowedCourses = getSelectedCoursesFromAdmin();

      try {
        const batch = writeBatch(db);

        batch.update(doc(db, "schools", schoolObj.id), { groups: combinedGroups });

        pendingExcelGroupStudents.forEach(st => {
          const userRef = doc(db, "assigned_roles", st.email);
          batch.set(userRef, {
            email: st.email,
            role: st.role,
            school: st.school,
            group: st.group,
            allowedCourses: allowedCourses,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        });

        await batch.commit();

        showToast(`¡Grupos y ${pendingExcelGroupStudents.length} alumnos importados con éxito!`, "success");
        pendingExcelGroups = [];
        pendingExcelGroupStudents = [];
        renderGroupsPreview();
        if (excelGroupsInput) excelGroupsInput.value = '';

      } catch (err) {
        showToast("Error al guardar en Firestore: " + err.message, "error");
      }
    });
  }

  const btnCancelGroups = document.getElementById('btn-cancel-groups-preview');
  if (btnCancelGroups) {
    btnCancelGroups.addEventListener('click', () => {
      pendingExcelGroups = [];
      pendingExcelGroupStudents = [];
      renderGroupsPreview();
      if (excelGroupsInput) excelGroupsInput.value = '';
      showToast("Importación cancelada", "error");
    });
  }

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

        showToast("Institución guardada", "success");
        schoolForm.reset();
        document.getElementById('school-doc-id').value = '';
        if (btnCancelSchool) btnCancelSchool.style.display = 'none';
        document.getElementById('school-form-title').textContent = '🏫 Registrar / Editar Institución (Escuela)';
      } catch (err) {
        showToast("Error: " + err.message, "error");
      }
    });
  }

  // BÚSQUEDA Y AUTOCOMPLETADO EN TIEMPO REAL DE CORREOS
  const emailInput = document.getElementById('admin-user-email-input');
  if (emailInput) {
    emailInput.addEventListener('input', (e) => {
      const typedEmail = e.target.value.trim().toLowerCase();
      const existingUser = allUsers.find(u => (u.email || u.id).toLowerCase() === typedEmail);

      if (existingUser) {
        document.getElementById('admin-user-role-select').value = existingUser.role || 'student';
        const schSelect = document.getElementById('admin-user-school-select');
        if (schSelect) {
          schSelect.value = existingUser.school || 'General';
          updateGroupSelectDropdown(schSelect.value, 'admin-user-group-select');
        }
        document.getElementById('admin-user-group-select').value = existingUser.group || 'Sin Grupo';
        setSelectAdminCourses(existingUser.allowedCourses || []);
      } else {
        allSchools.forEach(sch => {
          if (sch.domain && typedEmail.endsWith(sch.domain.toLowerCase())) {
            const schSelect = document.getElementById('admin-user-school-select');
            if (schSelect) {
              schSelect.value = sch.name;
              updateGroupSelectDropdown(sch.name, 'admin-user-group-select');
            }
          }
        });
      }
    });
  }

  // Formulario Individual Alumno con Validación de Dominio y Notificación Válida EmailJS
  const formSingle = document.getElementById('admin-single-user-form');
  if (formSingle) {
    formSingle.addEventListener('submit', async (e) => {
      e.preventDefault();
      const roleSelect = document.getElementById('admin-user-role-select');
      const schoolSelect = document.getElementById('admin-user-school-select');
      const groupSelect = document.getElementById('admin-user-group-select');

      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const role = roleSelect ? roleSelect.value : 'student';
      const school = schoolSelect ? schoolSelect.value : 'General';
      const group = groupSelect ? groupSelect.value : 'Sin Grupo';
      const allowedCourses = getSelectedCoursesFromAdmin();

      if (!email) return;

      // VALIDACIÓN DE DOMINIO EN ALTA INDIVIDUAL
      const schoolObj = allSchools.find(s => s.name === school);
      if (schoolObj && schoolObj.domain && schoolObj.domain.trim() !== '') {
        const requiredDomain = schoolObj.domain.trim().toLowerCase();
        if (!email.endsWith(requiredDomain)) {
          showToast(`El correo debe pertenecer al dominio institucional (${requiredDomain})`, "error");
          return;
        }
      }

      try {
        await setDoc(doc(db, "assigned_roles", email), {
          email: email,
          role: role,
          school: school,
          group: group,
          allowedCourses: allowedCourses,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await sendNotificationEmail(email, role, school);
        showToast(`Acceso guardado y notificado para ${email}`, "success");
        formSingle.reset();
        setSelectAdminCourses([]);
      } catch (err) {
        showToast("Error: " + err.message, "error");
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('admin.html')) {
    initAdminPanel();
  }
});