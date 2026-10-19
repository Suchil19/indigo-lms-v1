import { auth, db } from './firebase-config.js';
import { COURSES_CATALOG } from './courses-data.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

// Variables de Paginación Globales (Por defecto 20)
let currentPage = 1;
let rowsPerPage = 20;

let lastSentEmailTime = {};

function showToast(message, type = 'success') {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast-notification show ${type === 'success' ? 'toast-success' : 'toast-error'}`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

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

async function sendNotificationEmail(recipientEmail, role, school) {
  if (!window.emailjs || !EMAILJS_CONFIG.PUBLIC_KEY) return;

  const now = Date.now();
  if (lastSentEmailTime[recipientEmail] && (now - lastSentEmailTime[recipientEmail] < 10000)) {
    console.log(`Correo a ${recipientEmail} omitido para evitar duplicidad.`);
    return;
  }
  lastSentEmailTime[recipientEmail] = now;

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
  } catch (err) {
    console.error(`Error enviando notificación a ${recipientEmail}:`, err);
  }
}

// 📊 Actualizar estadísticas en tiempo real
function updateAdminStatistics() {
  const totalUsersEl = document.getElementById('stat-total-users');
  const totalSchoolsEl = document.getElementById('stat-total-schools');
  const totalCoursesEl = document.getElementById('stat-total-courses');

  if (totalUsersEl) totalUsersEl.textContent = allUsers.length;
  if (totalSchoolsEl) totalSchoolsEl.textContent = allSchools.length;
  if (totalCoursesEl) {
    const courseCount = Object.keys(COURSES_CATALOG || {}).length;
    totalCoursesEl.textContent = courseCount;
  }
}

export async function initAdminPanel() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    try {
      const userEmail = user.email.trim().toLowerCase();
      const roleRef = doc(db, "assigned_roles", userEmail);
      const roleSnap = await getDoc(roleRef);

      let userRole = 'student';
      if (roleSnap.exists()) {
        userRole = (roleSnap.data().role || 'student').trim().toLowerCase();
      }

      if (userRole !== 'admin') {
        alert("⛔ Acceso no autorizado. Tu cuenta no cuenta con permisos de administrador.");
        window.location.href = 'dashboard.html';
        return;
      }

      renderAdminCoursesSelector();
      await loadSchoolsCatalog();
      listenToUsersRealtime();
      setupAdminEventListeners();
      setupUserSearchFilter();
      setupModalListeners();

    } catch (err) {
      console.error("Error verificando permisos de administrador:", err);
      window.location.href = 'dashboard.html';
    }
  });
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
      updateAdminStatistics();
    });
  } catch (err) {
    console.error("Error al cargar escuelas:", err);
  }
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
      <td style="padding: 10px; text-align: right;">
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
          const userSchools = (u.schools || [u.school || 'General']).map(s => s.toString().trim().toLowerCase());
          const userGroups = (u.groups || [u.group || 'Sin Grupo']).map(g => g.toString().trim().toLowerCase());
          
          const targetSchool = school.name.trim().toLowerCase();
          const targetGroup = groupName.trim().toLowerCase();

          const belongsToSchool = userSchools.includes(targetSchool) || userSchools.includes('general');
          const belongsToGroup = userGroups.includes(targetGroup);

          return belongsToSchool && belongsToGroup;
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
          <td style="padding: 6px 10px; text-align: right;">
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
            const validStudentCourses = [...new Set(st.allowedCourses || [])].filter(id => COURSES_CATALOG[id]);
            const courseBadges = validStudentCourses.map(courseId => {
              const course = COURSES_CATALOG[courseId];
              return `<span class="badge badge-info" style="font-size: 0.7rem; padding: 2px 6px; margin-right: 3px;">${course ? course.icon : '📘'} ${courseId}</span>`;
            }).join(' ');

            studentsListHTML += `
              <tr style="border-bottom: 1px dotted var(--border-color);">
                <td style="padding: 6px 8px;"><strong>${st.email || st.id}</strong></td>
                <td style="padding: 6px 8px;"><span class="badge badge-role-${st.role}">${st.role || 'student'}</span></td>
                <td style="padding: 6px 8px;">${courseBadges || '<span style="opacity:0.5;">Sin Cursos</span>'}</td>
                <td style="padding: 6px 8px; text-align: right;">
                  <button type="button" class="btn btn-sm btn-outline btn-impersonate-user" data-email="${st.email || st.id}" style="padding: 2px 6px; font-size: 0.75rem; color: #8b5cf6; border-color: #8b5cf6;">👁️ Ver Vista</button>
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
          showToast("Error al eliminar grupo: " + err.message, "error");
        }
      }
    });
  });

  setupRowActionButtons();
}

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
  if (unsubscribeUsersListener) unsubscribeUsersListener();

  unsubscribeUsersListener = onSnapshot(collection(db, "assigned_roles"), (snapshot) => {
    allUsers = [];
    snapshot.forEach(docSnap => {
      allUsers.push({ id: docSnap.id, ...docSnap.data() });
    });
    
    updateEmailDatalist(allUsers);
    updateAdminStatistics();
    
    const searchInput = document.getElementById('admin-user-search-input');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    filterAndRenderUsers(searchTerm);

    renderSchoolsTable();
  });
}

function filterAndRenderUsers(searchTerm) {
  let filtered = allUsers;

  if (searchTerm) {
    filtered = allUsers.filter(user => {
      const email = (user.email || user.id || '').toLowerCase();
      const role = (user.role || '').toLowerCase();
      const school = (user.school || '').toLowerCase();
      const group = (user.group || '').toLowerCase();

      return email.includes(searchTerm) || 
             role.includes(searchTerm) || 
             school.includes(searchTerm) || 
             group.includes(searchTerm);
    });
  }

  renderUsersGeneralTable(filtered);
}

function setupUserSearchFilter() {
  const searchInput = document.getElementById('admin-user-search-input');
  const perPageSelect = document.getElementById('users-per-page-select');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentPage = 1;
      const term = e.target.value.trim().toLowerCase();
      filterAndRenderUsers(term);
    });
  }

  if (perPageSelect) {
    perPageSelect.addEventListener('change', (e) => {
      rowsPerPage = parseInt(e.target.value);
      currentPage = 1; // Reiniciar a la primera página al cambiar cantidad
      const searchInput = document.getElementById('admin-user-search-input');
      const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
      filterAndRenderUsers(term);
    });
  }
}

function renderUsersGeneralTable(users) {
  const tbody = document.getElementById('admin-users-tbody');
  const infoDiv = document.getElementById('users-pagination-info');
  const paginationDiv = document.getElementById('users-pagination-buttons');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 20px; color: var(--text-secondary);">No se encontraron usuarios coincidentes.</td></tr>';
    if (infoDiv) infoDiv.textContent = 'Mostrando 0 - 0 de 0';
    if (paginationDiv) paginationDiv.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(users.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedUsers = users.slice(startIndex, endIndex);

  tbody.innerHTML = '';
  paginatedUsers.forEach(user => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    
    const validUserCourses = [...new Set(user.allowedCourses || [])].filter(id => COURSES_CATALOG[id]);
    const courseBadges = validUserCourses.map(courseId => {
      const course = COURSES_CATALOG[courseId];
      return `<span class="badge badge-info" style="margin-right: 4px; display: inline-flex; align-items: center; gap: 3px;">${course ? course.icon : '📘'} ${courseId}</span>`;
    }).join(' ');

    tr.innerHTML = `
      <td style="padding: 10px;"><strong>${user.email || user.id}</strong></td>
      <td style="padding: 10px;"><span class="badge badge-role-${user.role}">${user.role || 'student'}</span></td>
      <td style="padding: 10px;">${user.school || 'General'}</td>
      <td style="padding: 10px;"><span class="badge badge-info">${user.group || 'Sin Grupo'}</span></td>
      <td style="padding: 10px;">${courseBadges || '<span style="opacity:0.5;">Sin Cursos</span>'}</td>
      <td style="padding: 10px; text-align: right;">
        <button type="button" class="btn btn-sm btn-outline btn-impersonate-user" data-email="${user.email || user.id}" style="padding: 2px 6px; font-size: 0.75rem; color: #8b5cf6; border-color: #8b5cf6;">👁️ Ver</button>
        <button type="button" class="btn btn-sm btn-outline btn-edit-user" data-id="${user.id}" style="padding: 2px 6px; font-size: 0.75rem;">✏️</button>
        <button type="button" class="btn btn-sm btn-danger btn-delete-user" data-id="${user.id}" style="padding: 2px 6px; font-size: 0.75rem;">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (infoDiv) {
    infoDiv.textContent = `Mostrando ${startIndex + 1} - ${Math.min(endIndex, users.length)} de ${users.length} usuarios`;
  }

  if (paginationDiv) {
    paginationDiv.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.type = 'button';
      pageBtn.textContent = i;
      pageBtn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}`;
      pageBtn.style.padding = '4px 10px';
      pageBtn.addEventListener('click', () => {
        currentPage = i;
        renderUsersGeneralTable(users);
      });
      paginationDiv.appendChild(pageBtn);
    }
  }

  setupRowActionButtons();
}

function setupRowActionButtons() {
  document.querySelectorAll('.btn-impersonate-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetEmail = e.target.getAttribute('data-email');
      if (!targetEmail) return;

      localStorage.setItem('impersonate_user_email', targetEmail);
      localStorage.setItem('is_impersonating', 'true');

      showToast(`Cambiando a la vista de: ${targetEmail}`, "success");

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 400);
    });
  });

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
      const targetUser = allUsers.find(u => u.id === userId);
      
      if (!targetUser) return;

      const SUPER_ADMIN_EMAIL = "suchiltv@gmail.com"; 
      const currentAdminEmail = auth.currentUser ? auth.currentUser.email.trim().toLowerCase() : '';
      const isSuperAdmin = currentAdminEmail === SUPER_ADMIN_EMAIL.toLowerCase();

      if (targetUser.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        showToast("⚠️ No se puede eliminar al Super Administrador del sistema.", "error");
        return;
      }

      const targetRole = (targetUser.role || 'student').trim().toLowerCase();
      if (targetRole === 'admin' && !isSuperAdmin) {
        showToast("⛔ Solo el Super Usuario puede eliminar cuentas con rol de Administrador.", "error");
        return;
      }

      if (confirm(`¿Estás seguro de eliminar el acceso para ${userId}?`)) {
        try {
          await deleteDoc(doc(db, "assigned_roles", userId));
          showToast("Usuario eliminado correctamente", "success");
        } catch (err) {
          showToast("Error al eliminar: " + err.message, "error");
        }
      }
    });
  });
}

function renderGroupsPreview() {
  const modal = document.getElementById('excel-preview-modal');
  const countSpan = document.getElementById('modal-groups-count');
  const studentsCountSpan = document.getElementById('modal-students-count');
  const chipsContainer = document.getElementById('modal-groups-chips');
  const studentsTbody = document.getElementById('modal-students-tbody');

  if (!modal || !chipsContainer) return;

  if (pendingExcelGroups.length === 0 && pendingExcelGroupStudents.length === 0) {
    modal.style.display = 'none';
    return;
  }

  modal.style.display = 'flex';
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

  if (studentsTbody) {
    if (pendingExcelGroupStudents.length === 0) {
      studentsTbody.innerHTML = '<tr><td colspan="4" style="padding: 10px; text-align: center; color: var(--text-secondary);">No hay alumnos en la lista.</td></tr>';
    } else {
      studentsTbody.innerHTML = '';
      pendingExcelGroupStudents.forEach((st, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px dotted var(--border-color)';
        tr.innerHTML = `
          <td style="padding: 6px 8px;"><strong>${st.email}</strong></td>
          <td style="padding: 6px 8px;"><span class="badge badge-info">${st.group}</span></td>
          <td style="padding: 6px 8px;">${st.school}</td>
          <td style="padding: 6px 8px; text-align: right;">
            <button type="button" class="btn btn-sm btn-outline btn-remove-student-row" data-index="${idx}" style="padding: 2px 6px; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;">🗑️ Quitar</button>
          </td>
        `;
        studentsTbody.appendChild(tr);
      });
    }
  }

  document.querySelectorAll('.btn-remove-group-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      pendingExcelGroups.splice(index, 1);
      renderGroupsPreview();
    });
  });

  document.querySelectorAll('.btn-remove-student-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      pendingExcelGroupStudents.splice(index, 1);
      renderGroupsPreview();
    });
  });
}

function setupModalListeners() {
  const modal = document.getElementById('excel-preview-modal');
  const btnCloseX = document.getElementById('btn-close-modal-x');
  const btnCancel = document.getElementById('btn-cancel-modal');
  const btnConfirm = document.getElementById('btn-confirm-modal-import');
  const excelGroupsInput = document.getElementById('admin-excel-groups-file-input');

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
    pendingExcelGroups = [];
    pendingExcelGroupStudents = [];
    if (excelGroupsInput) excelGroupsInput.value = '';
  };

  if (btnCloseX) btnCloseX.addEventListener('click', closeModal);
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      closeModal();
      showToast("Importación cancelada", "error");
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      const schoolName = document.getElementById('excel-groups-school-select').value;
      if (!schoolName || pendingExcelGroups.length === 0) {
        showToast("Selecciona una escuela y asegúrate de tener grupos válidos", "error");
        return;
      }

      const schoolObj = allSchools.find(s => s.name === schoolName);
      if (!schoolObj) {
        showToast("Institución no encontrada", "error");
        return;
      }

      const existingGroups = schoolObj.groups || [];
      const combinedGroups = Array.from(new Set([...existingGroups, ...pendingExcelGroups]));
      const allowedCourses = getSelectedCoursesFromAdmin();

      try {
        let newCount = 0;
        let existingCount = 0;

        for (const st of pendingExcelGroupStudents) {
          const userRef = doc(db, "assigned_roles", st.email);
          const userSnap = await getDoc(userRef);

          let schoolsList = [st.school];
          let groupsList = [st.group];
          let coursesList = allowedCourses;

          if (userSnap.exists()) {
            existingCount++;
            const existingData = userSnap.data();
            const prevSchools = existingData.schools || [existingData.school || 'General'];
            const prevGroups = existingData.groups || [existingData.group || 'Sin Grupo'];
            const prevCourses = existingData.allowedCourses || [];

            schoolsList = Array.from(new Set([...prevSchools, st.school]));
            groupsList = Array.from(new Set([...prevGroups, st.group]));
            coursesList = Array.from(new Set([...prevCourses, ...allowedCourses]));
          } else {
            newCount++;
          }

          await setDoc(userRef, {
            email: st.email,
            role: st.role,
            school: st.school,
            schools: schoolsList,
            group: st.group,
            groups: groupsList,
            allowedCourses: coursesList,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }

        await updateDoc(doc(db, "schools", schoolObj.id), { groups: combinedGroups });

        closeModal();
        showToast(`✅ Importación exitosa: ${newCount} nuevos, ${existingCount} ya existían (datos actualizados).`, "success");

      } catch (err) {
        console.error("Error en importación masiva:", err);
        showToast("Error al guardar en Firestore: " + err.message, "error");
      }
    });
  }
}

function setupAdminEventListeners() {
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

  const schoolSelectElement = document.getElementById('admin-user-school-select');
  if (schoolSelectElement) {
    schoolSelectElement.addEventListener('change', (e) => {
      const selectedSchoolName = e.target.value;
      updateGroupSelectDropdown(selectedSchoolName, 'admin-user-group-select');
    });
  }

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
              if (emailVal && emailVal.includes('@')) {
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
            showToast("No se encontraron grupos en las columnas del Excel", "error");
            return;
          }

          renderGroupsPreview();
          showToast(`Se leyeron ${pendingExcelGroups.length} grupos y ${pendingExcelGroupStudents.length} alumnos correctamente`, "success");

        } catch (err) {
          showToast("Error leyendo Excel: " + err.message, "error");
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

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
      }
    });
  }

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
      const newAllowedCourses = getSelectedCoursesFromAdmin();

      if (!email) return;

      const schoolObj = allSchools.find(s => s.name === school);
      const isTeacherOrAdmin = ['teacher', 'profesor', 'docente', 'maestro', 'admin'].includes(role.toLowerCase());

      if (schoolObj && schoolObj.domain && schoolObj.domain.trim() !== '' && !isTeacherOrAdmin) {
        const requiredDomain = schoolObj.domain.trim().toLowerCase();
        if (!email.endsWith(requiredDomain)) {
          showToast(`El correo del alumno debe pertenecer al dominio institucional (${requiredDomain})`, "error");
          return;
        }
      }

      try {
        const userRef = doc(db, "assigned_roles", email);
        const userSnap = await getDoc(userRef);

        let schoolsList = [school];
        let groupsList = [group];
        let coursesList = newAllowedCourses;

        if (userSnap.exists()) {
          const existingData = userSnap.data();
          const prevSchools = existingData.schools || [existingData.school || 'General'];
          const prevGroups = existingData.groups || [existingData.group || 'Sin Grupo'];
          const prevCourses = existingData.allowedCourses || [];

          schoolsList = Array.from(new Set([...prevSchools, school]));
          groupsList = Array.from(new Set([...prevGroups, group]));
          coursesList = Array.from(new Set([...prevCourses, ...newAllowedCourses]));
        }

        await setDoc(userRef, {
          email: email,
          role: role,
          school: school,
          schools: schoolsList,
          group: group,
          groups: groupsList,
          allowedCourses: coursesList,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await sendNotificationEmail(email, role, school);
        showToast(`Acceso guardado y acumulado correctamente para ${email}`, "success");
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