import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { COURSES_CATALOG } from './courses-data.js';
import { initNavbar } from './navbar.js';

initNavbar();

// Credenciales Reales de EmailJS
const EMAILJS_SERVICE_ID = "service_dsymu5l";
const EMAILJS_TEMPLATE_ID = "template_pcm3pus";
const EMAILJS_PUBLIC_KEY = "Sme5UkbtF9t2q26pn";

// Elementos DOM - Escuelas
const formCreateSchool = document.getElementById('form-create-school');
const editingSchoolIdInput = document.getElementById('editing-school-id');
const newSchoolNameInput = document.getElementById('new-school-name');
const newSchoolDomainInput = document.getElementById('new-school-domain');
const newSchoolLogoInput = document.getElementById('new-school-logo');
const schoolFormTitle = document.getElementById('school-form-title');
const btnSaveSchool = document.getElementById('btn-save-school');
const btnCancelEditSchool = document.getElementById('btn-cancel-edit-school');
const schoolStatusMsg = document.getElementById('school-status-msg');
const schoolsGridContainer = document.getElementById('schools-grid-container');

// Elementos DOM - Excel
const excelFileInput = document.getElementById('excel-file-input');
const btnImportExcel = document.getElementById('btn-import-excel');
const excelPreviewContainer = document.getElementById('excel-preview-container');
const excelPreviewBody = document.getElementById('excel-preview-body');
const excelRowsCount = document.getElementById('excel-rows-count');
const excelStatusMsg = document.getElementById('excel-status-msg');

// Elementos DOM - Alumnos y Acciones en Lote
const formRole = document.getElementById('form-assign-role');
const emailInput = document.getElementById('user-email');
const userSchoolSelect = document.getElementById('user-school-select');
const dataListUsers = document.getElementById('users-datalist');
const filterSchoolSelect = document.getElementById('filter-school');
const modalFilterSchoolSelect = document.getElementById('modal-filter-school');
const statusMsg = document.getElementById('role-status-msg');
const tableBody = document.getElementById('users-table-body');
const btnReset = document.getElementById('btn-reset-form');

const selectAllCheckbox = document.getElementById('select-all-students');
const batchActionsContainer = document.getElementById('batch-actions-container');
const batchActionSelect = document.getElementById('batch-action-select');
const batchTargetSchoolSelect = document.getElementById('batch-target-school');
const btnApplyBatchAction = document.getElementById('btn-apply-batch-action');
const selectedCountSpan = document.getElementById('selected-count');

// Elementos DOM - Modal Simulación
const previewModal = document.getElementById('preview-student-modal');
const btnOpenPreviewModal = document.getElementById('btn-open-preview-modal');
const btnClosePreviewModal = document.getElementById('btn-close-preview-modal');
const btnPreviewGeneric = document.getElementById('btn-preview-generic');
const searchPreviewInput = document.getElementById('search-preview-input');
const previewStudentsList = document.getElementById('preview-students-list');

let allRegisteredStudents = [];
let availableSchoolsList = [];
let parsedExcelData = [];
let selectedStudentEmails = new Set();

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

  let userRole = 'student';
  if (docSnap.exists() && docSnap.data().role) {
    userRole = docSnap.data().role;
  } else if (assignedSnap.exists() && assignedSnap.data().role) {
    userRole = assignedSnap.data().role;
  }

  // Redirección si es profesor o estudiante
  if (userRole === 'teacher') {
    window.location.href = 'teacher.html';
    return;
  } else if (userRole !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  await loadSchools();
  await refreshUsersTable();
});

// 2. Cargar lista de usuarios desde Firestore
async function refreshUsersTable() {
  try {
    const assignedSnapshot = await getDocs(collection(db, "assigned_roles"));
    allRegisteredStudents = [];
    selectedStudentEmails.clear();
    updateBatchUI();

    if (dataListUsers) dataListUsers.innerHTML = '';

    assignedSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const email = data.email || docSnap.id;
      const role = data.role || 'student';
      const school = data.school || 'Sin Institución';
      const allowedCourses = data.allowedCourses || [];

      allRegisteredStudents.push({ email, role, school, allowedCourses });

      if (dataListUsers) {
        const optUser = document.createElement('option');
        optUser.value = email;
        dataListUsers.appendChild(optUser);
      }
    });

    renderFilteredTable();
    renderSchoolCards();

  } catch (error) {
    console.error("Error al cargar usuarios:", error);
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center">Error al cargar usuarios.</td></tr>`;
  }
}

// 3. Cargar instituciones desde Firestore
async function loadSchools() {
  try {
    const schoolsSnap = await getDocs(collection(db, "schools"));
    availableSchoolsList = [];

    schoolsSnap.forEach(docSnap => {
      const data = docSnap.data();
      availableSchoolsList.push({
        id: docSnap.id,
        name: data.name || docSnap.id,
        domain: (data.domain || '').toLowerCase().trim(),
        logo: data.logo || ''
      });
    });

    availableSchoolsList.sort((a, b) => a.name.localeCompare(b.name));
    updateSchoolDropdowns();
    renderSchoolCards();
  } catch (error) {
    console.error("Error al cargar escuelas desde Firestore:", error);
  }
}

function updateSchoolDropdowns() {
  const schoolOptionsHTML = availableSchoolsList.map(s => 
    `<option value="${s.name}">${s.domain ? `${s.name} (${s.domain})` : s.name}</option>`
  ).join('');

  if (userSchoolSelect) {
    userSchoolSelect.innerHTML = '<option value="">-- Selecciona una institución --</option>' + schoolOptionsHTML;
  }

  if (batchTargetSchoolSelect) {
    batchTargetSchoolSelect.innerHTML = '<option value="">-- Selecciona destino --</option>' + schoolOptionsHTML;
  }

  if (filterSchoolSelect && modalFilterSchoolSelect) {
    const currentFilter = filterSchoolSelect.value;
    const currentModalFilter = modalFilterSchoolSelect.value;

    const allOptionsHTML = '<option value="ALL">Todas las escuelas</option>' + 
      availableSchoolsList.map(s => `<option value="${s.name}">${s.name}</option>`).join('');

    filterSchoolSelect.innerHTML = allOptionsHTML;
    modalFilterSchoolSelect.innerHTML = allOptionsHTML;

    const schoolNames = availableSchoolsList.map(s => s.name);
    if (schoolNames.includes(currentFilter)) filterSchoolSelect.value = currentFilter;
    if (schoolNames.includes(currentModalFilter)) modalFilterSchoolSelect.value = currentModalFilter;
  }
}

function renderSchoolCards() {
  if (!schoolsGridContainer) return;
  schoolsGridContainer.innerHTML = '';

  if (availableSchoolsList.length === 0) {
    schoolsGridContainer.innerHTML = '<p style="color: var(--text-secondary);">No hay instituciones registradas aún.</p>';
    return;
  }

  const btnAll = document.createElement('button');
  btnAll.type = 'button';
  btnAll.style.cssText = 'padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); font-weight: bold; cursor: pointer; transition: all 0.2s ease;';
  btnAll.innerHTML = `🌐 Todas (${allRegisteredStudents.length})`;
  btnAll.addEventListener('click', () => {
    if (filterSchoolSelect) filterSchoolSelect.value = 'ALL';
    renderFilteredTable();
    highlightActiveSchoolCard('ALL');
  });
  schoolsGridContainer.appendChild(btnAll);

  availableSchoolsList.forEach(school => {
    const studentCount = allRegisteredStudents.filter(s => s.school === school.name).length;
    
    const cardContainer = document.createElement('div');
    cardContainer.setAttribute('data-school', school.name);
    cardContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); font-weight: 600; transition: all 0.2s ease;';
    
    const logoHTML = school.logo 
      ? `<img src="${school.logo}" alt="Logo" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">` 
      : '🏫';

    const domainBadge = school.domain ? `<span style="font-size: 0.75rem; opacity: 0.7;">(${school.domain})</span>` : '';

    cardContainer.innerHTML = `
      <span class="btn-select-school" style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
        ${logoHTML}
        <span>${school.name}</span> ${domainBadge}
        <span style="background: rgba(37, 99, 235, 0.15); color: #2563eb; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">${studentCount}</span>
      </span>
      <span style="opacity: 0.3;">|</span>
      <button type="button" class="btn-edit-school" title="Editar Institución" style="background: none; border: none; cursor: pointer; padding: 2px; font-size: 0.85rem;">✏️</button>
      <button type="button" class="btn-delete-school" title="Eliminar Institución" style="background: none; border: none; cursor: pointer; padding: 2px; font-size: 0.85rem;">🗑️</button>
    `;

    cardContainer.querySelector('.btn-select-school').addEventListener('click', () => {
      if (filterSchoolSelect) filterSchoolSelect.value = school.name;
      renderFilteredTable();
      highlightActiveSchoolCard(school.name);
    });

    cardContainer.querySelector('.btn-edit-school').addEventListener('click', () => {
      editingSchoolIdInput.value = school.id;
      newSchoolNameInput.value = school.name;
      if (newSchoolDomainInput) newSchoolDomainInput.value = school.domain || '';
      newSchoolLogoInput.value = school.logo || '';
      
      schoolFormTitle.textContent = "✏️ Editar Institución";
      btnSaveSchool.textContent = "💾 Actualizar Institución";
      btnCancelEditSchool.style.display = "inline-block";
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    cardContainer.querySelector('.btn-delete-school').addEventListener('click', async () => {
      const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar la institución "${school.name}"?`);
      if (confirmDelete) {
        try {
          await deleteDoc(doc(db, "schools", school.id));
          showSchoolStatus(`🗑️ Institución "${school.name}" eliminada correctamente.`, "#15803d", "#f0fdf4");
          await loadSchools();
        } catch (error) {
          console.error("Error al eliminar:", error);
          showSchoolStatus("❌ Error al eliminar la institución.", "#b91c1c", "#fef2f2");
        }
      }
    });

    schoolsGridContainer.appendChild(cardContainer);
  });
}

function highlightActiveSchoolCard(selectedSchool) {
  const cards = schoolsGridContainer.querySelectorAll('div[data-school]');
  cards.forEach(card => {
    const schoolAttr = card.getAttribute('data-school');
    if ((selectedSchool === 'ALL' && !schoolAttr) || schoolAttr === selectedSchool) {
      card.style.borderColor = '#2563eb';
      card.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
    } else {
      card.style.borderColor = 'var(--border-color)';
      card.style.backgroundColor = 'var(--card-bg)';
    }
  });
}

// 4. RENDERIZADO DE TABLA DE USUARIOS Y ROLES (ADMIN, TEACHER, STUDENT)
function renderFilteredTable() {
  if (!tableBody) return;
  const selectedSchool = filterSchoolSelect ? filterSchoolSelect.value : 'ALL';
  tableBody.innerHTML = '';
  selectedStudentEmails.clear();
  updateBatchUI();

  if (selectAllCheckbox) selectAllCheckbox.checked = false;

  const filtered = selectedSchool === 'ALL' 
    ? allRegisteredStudents 
    : allRegisteredStudents.filter(s => s.school === selectedSchool);

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center">No hay usuarios registrados en esta escuela.</td></tr>`;
    return;
  }

  filtered.forEach(student => {
    const tr = document.createElement('tr');
    
    const coursesHTML = student.allowedCourses.map(id => {
      const title = COURSES_CATALOG[id] ? COURSES_CATALOG[id].title : id;
      return `<span class="course-tag-item">${title}</span>`;
    }).join(' ') || '<em class="text-center">Sin cursos asignados</em>';

    // Formato visual para badges de roles
    let roleBadgeClass = 'badge-student';
    let roleLabel = 'Estudiante';

    if (student.role === 'admin') {
      roleBadgeClass = 'badge-admin';
      roleLabel = 'Administrador';
    } else if (student.role === 'teacher') {
      roleBadgeClass = 'badge-teacher';
      roleLabel = 'Profesor';
    }

    tr.innerHTML = `
      <td class="text-center" style="text-align: center;">
        <input type="checkbox" class="student-select-checkbox" data-email="${student.email}">
      </td>
      <td><strong>${student.email}</strong></td>
      <td><span class="school-tag">${student.school}</span></td>
      <td><span class="badge-role ${roleBadgeClass}" style="${student.role === 'teacher' ? 'background: #0284c7; color: #fff; padding: 3px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;' : ''}">${roleLabel}</span></td>
      <td>${coursesHTML}</td>
      <td>
        <button class="btn-secondary btn-sm btn-edit" data-email="${student.email}">Editar</button>
        <button class="btn-preview btn-sm btn-sim" data-email="${student.email}">Simular Vista</button>
        <button class="btn-secondary btn-sm text-danger btn-delete-single" data-email="${student.email}" style="border-color: #b91c1c; color: #b91c1c;">Eliminar</button>
      </td>
    `;

    const chk = tr.querySelector('.student-select-checkbox');
    chk.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedStudentEmails.add(student.email);
      } else {
        selectedStudentEmails.delete(student.email);
      }
      updateBatchUI();
    });

    tr.querySelector('.btn-edit').addEventListener('click', () => {
      emailInput.value = student.email;
      fetchUserPermissions(student.email);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    tr.querySelector('.btn-sim').addEventListener('click', () => {
      window.location.href = `dashboard.html?preview=student&previewEmail=${encodeURIComponent(student.email)}`;
    });

    tr.querySelector('.btn-delete-single').addEventListener('click', async () => {
      if (confirm(`¿Estás seguro de que deseas eliminar el usuario ${student.email}?`)) {
        try {
          await deleteDoc(doc(db, "assigned_roles", student.email));
          showOnScreenMessage(`🗑️ Usuario ${student.email} eliminado.`, "#15803d", "#f0fdf4");
          await refreshUsersTable();
        } catch (err) {
          console.error("Error al eliminar:", err);
          showOnScreenMessage("❌ Error al eliminar el usuario.", "#b91c1c", "#fef2f2");
        }
      }
    });

    tableBody.appendChild(tr);
  });
}

// Seleccionar/deseleccionar todos
if (selectAllCheckbox) {
  selectAllCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const checkboxes = tableBody.querySelectorAll('.student-select-checkbox');

    selectedStudentEmails.clear();
    checkboxes.forEach(chk => {
      chk.checked = isChecked;
      if (isChecked) {
        selectedStudentEmails.add(chk.getAttribute('data-email'));
      }
    });

    updateBatchUI();
  });
}

function updateBatchUI() {
  const count = selectedStudentEmails.size;
  if (selectedCountSpan) selectedCountSpan.textContent = count;

  if (batchActionsContainer) {
    batchActionsContainer.style.display = count > 0 ? 'flex' : 'none';
  }
}

if (batchActionSelect) {
  batchActionSelect.addEventListener('change', (e) => {
    if (batchTargetSchoolSelect) {
      batchTargetSchoolSelect.style.display = e.target.value === 'move' ? 'inline-block' : 'none';
    }
  });
}

// PROCESAMIENTO EN LOTE (Mover, Cambiar Rol o Eliminar)
if (btnApplyBatchAction) {
  btnApplyBatchAction.addEventListener('click', async () => {
    const count = selectedStudentEmails.size;
    if (count === 0) return;

    const action = batchActionSelect ? batchActionSelect.value : 'move';

    if (action === 'delete') {
      const confirmDelete = confirm(`⚠️ ¿Estás seguro de que deseas eliminar a los ${count} usuarios seleccionados?`);
      if (!confirmDelete) return;

      showOnScreenMessage("⏳ Eliminando usuarios seleccionados...", "#2563eb", "#eff6ff");

      try {
        const batch = writeBatch(db);
        selectedStudentEmails.forEach(email => {
          batch.delete(doc(db, "assigned_roles", email));
        });
        await batch.commit();

        showOnScreenMessage(`🗑️ Se eliminaron ${count} usuarios.`, "#15803d", "#f0fdf4");
        await refreshUsersTable();
      } catch (error) {
        console.error("Error al eliminar selección múltiple:", error);
        showOnScreenMessage("❌ Error al eliminar usuarios.", "#b91c1c", "#fef2f2");
      }

    } else if (action === 'move') {
      const targetSchool = batchTargetSchoolSelect ? batchTargetSchoolSelect.value : '';
      if (!targetSchool) {
        alert("Por favor, selecciona la institución destino.");
        return;
      }

      showOnScreenMessage(`⏳ Moviendo ${count} usuarios a "${targetSchool}"...`, "#2563eb", "#eff6ff");

      try {
        const batch = writeBatch(db);
        selectedStudentEmails.forEach(email => {
          const studentRef = doc(db, "assigned_roles", email);
          batch.set(studentRef, {
            school: targetSchool,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        });

        await batch.commit();

        showOnScreenMessage(`🏫 ¡${count} usuarios movidos con éxito a "${targetSchool}"!`, "#15803d", "#f0fdf4");
        await refreshUsersTable();

      } catch (error) {
        console.error("Error al mover usuarios:", error);
        showOnScreenMessage("❌ Ocurrió un error al intentar mover los usuarios.", "#b91c1c", "#fef2f2");
      }

    } else if (action.startsWith('role-')) {
      const newRole = action.replace('role-', ''); // 'student', 'teacher' o 'admin'
      showOnScreenMessage(`⏳ Cambiando rol de ${count} usuarios a "${newRole}"...`, "#2563eb", "#eff6ff");

      try {
        const batch = writeBatch(db);
        selectedStudentEmails.forEach(email => {
          const userRef = doc(db, "assigned_roles", email);
          batch.set(userRef, {
            role: newRole,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        });

        await batch.commit();

        showOnScreenMessage(`🎉 ¡Rol cambiado a ${newRole} para ${count} usuarios!`, "#15803d", "#f0fdf4");
        await refreshUsersTable();

      } catch (error) {
        console.error("Error al cambiar rol en lote:", error);
        showOnScreenMessage("❌ Error al cambiar el rol de los usuarios.", "#b91c1c", "#fef2f2");
      }
    }
  });
}

if (filterSchoolSelect) {
  filterSchoolSelect.addEventListener('change', () => {
    renderFilteredTable();
    highlightActiveSchoolCard(filterSchoolSelect.value);
  });
}

// 5. DETECCIÓN DE DOMINIO Y EXCEL
function detectSchoolByEmail(email) {
  if (!email || !email.includes('@')) return "Sin Institución";

  const emailClean = email.trim().toLowerCase();
  const emailDomain = emailClean.split('@')[1]; 

  if (!emailDomain) return "Sin Institución";

  const matchedSchool = availableSchoolsList.find(school => {
    if (!school.domain) return false;

    let registeredDomain = school.domain.trim().toLowerCase();
    if (registeredDomain.startsWith('@')) {
      registeredDomain = registeredDomain.substring(1);
    }

    return emailDomain === registeredDomain || emailDomain.endsWith(`.${registeredDomain}`);
  });

  return matchedSchool ? matchedSchool.name : "Sin Institución";
}

if (excelFileInput) {
  excelFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    await loadSchools();

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        parsedExcelData = rawRows.map(row => {
          const email = (row.email || row.Email || row.correo || "").toString().trim().toLowerCase();
          const rawSchoolInExcel = (row.school || row.School || row.escuela || "").toString().trim();
          const rawCourses = (row.courses || row.Courses || row.cursos || "").toString().trim();
          const rawRole = (row.role || row.Role || row.rol || "student").toString().trim().toLowerCase();

          let detectedSchool = detectSchoolByEmail(email);

          if (detectedSchool === "Sin Institución" && rawSchoolInExcel) {
            detectedSchool = rawSchoolInExcel;
          }

          const coursesList = rawCourses 
            ? rawCourses.split(',').map(c => c.trim()).filter(c => COURSES_CATALOG[c]) 
            : [];

          return { email, school: detectedSchool, role: rawRole, courses: coursesList };
        }).filter(item => item.email.includes('@'));

        if (parsedExcelData.length === 0) {
          showExcelStatus("No se encontraron filas válidas en el archivo.", "#b91c1c", "#fef2f2");
          if (btnImportExcel) btnImportExcel.disabled = true;
          if (excelPreviewContainer) excelPreviewContainer.setAttribute('hidden', '');
          return;
        }

        if (excelRowsCount) excelRowsCount.textContent = parsedExcelData.length;
        if (excelPreviewBody) {
          excelPreviewBody.innerHTML = '';
          parsedExcelData.forEach(item => {
            const tr = document.createElement('tr');
            const coursesText = item.courses.length > 0 ? item.courses.join(', ') : '<em>Sin cursos</em>';
            const schoolBadgeColor = item.school !== "Sin Institución" ? "#15803d" : "#b45309";

            tr.innerHTML = `
              <td>${item.email}</td>
              <td><strong style="color: ${schoolBadgeColor};">${item.school}</strong></td>
              <td>${coursesText}</td>
            `;
            excelPreviewBody.appendChild(tr);
          });
        }

        if (excelPreviewContainer) excelPreviewContainer.removeAttribute('hidden');
        if (btnImportExcel) btnImportExcel.disabled = false;
        showExcelStatus(`Archivo procesado. Se detectaron ${parsedExcelData.length} registros.`, "#2563eb", "#eff6ff");

      } catch (err) {
        console.error("Error al leer Excel:", err);
        showExcelStatus("Error al procesar el archivo Excel.", "#b91c1c", "#fef2f2");
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

// Importación masiva desde Excel
if (btnImportExcel) {
  btnImportExcel.addEventListener('click', async () => {
    if (parsedExcelData.length === 0) return;

    btnImportExcel.disabled = true;
    showExcelStatus("⏳ Importando usuarios y enviando notificaciones...", "#2563eb", "#eff6ff");

    try {
      const batch = writeBatch(db);
      const originUrl = window.location.origin;

      parsedExcelData.forEach(item => {
        const assignedRef = doc(db, "assigned_roles", item.email);
        batch.set(assignedRef, {
          email: item.email,
          school: item.school,
          role: item.role || "student",
          allowedCourses: item.courses,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();

      parsedExcelData.forEach(item => {
        if (typeof emailjs !== 'undefined' && item.courses.length > 0) {
          const coursesLinksFormatted = item.courses.map(id => {
            const course = COURSES_CATALOG[id];
            return course ? `- ${course.title}: ${originUrl}/${course.folderPath}` : '';
          }).filter(Boolean).join('\n');

          emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            {
              to_email: item.email,
              school_name: item.school,
              courses_list: coursesLinksFormatted,
              dashboard_url: `${originUrl}/dashboard.html`
            },
            EMAILJS_PUBLIC_KEY
          ).catch(err => console.warn(`Error enviando correo a ${item.email}:`, err));
        }
      });

      showExcelStatus(`🎉 ¡Importación exitosa! ${parsedExcelData.length} usuarios registrados.`, "#15803d", "#f0fdf4");

      excelFileInput.value = '';
      parsedExcelData = [];
      if (excelPreviewContainer) excelPreviewContainer.setAttribute('hidden', '');

      await refreshUsersTable();

    } catch (error) {
      console.error("Error en importación:", error);
      showExcelStatus("❌ Error al guardar en Firestore.", "#b91c1c", "#fef2f2");
      btnImportExcel.disabled = false;
    }
  });
}

function showExcelStatus(message, textColor, bgColor) {
  if (!excelStatusMsg) return;
  excelStatusMsg.style.display = 'block';
  excelStatusMsg.style.color = textColor;
  excelStatusMsg.style.backgroundColor = bgColor;
  excelStatusMsg.style.border = `1px solid ${textColor}`;
  excelStatusMsg.textContent = message;
}

// 6. Guardar / Editar Escuela
if (btnCancelEditSchool) {
  btnCancelEditSchool.addEventListener('click', () => {
    resetSchoolForm();
  });
}

function resetSchoolForm() {
  editingSchoolIdInput.value = "";
  newSchoolNameInput.value = "";
  if (newSchoolDomainInput) newSchoolDomainInput.value = "";
  newSchoolLogoInput.value = "";
  schoolFormTitle.textContent = "🏫 Registrar Nueva Institución";
  btnSaveSchool.textContent = "➕ Guardar Institución";
  btnCancelEditSchool.style.display = "none";
}

if (formCreateSchool) {
  formCreateSchool.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newSchoolNameInput.value.trim();
    let domain = newSchoolDomainInput ? newSchoolDomainInput.value.trim().toLowerCase() : '';
    const logo = newSchoolLogoInput.value.trim();
    const existingId = editingSchoolIdInput.value;

    if (!name) return;

    if (domain && !domain.startsWith('@')) {
      domain = `@${domain}`;
    }

    showSchoolStatus("⏳ Guardando datos de la institución...", "#2563eb", "#eff6ff");

    try {
      const schoolId = existingId || name.toLowerCase().replace(/\s+/g, '-');
      
      await setDoc(doc(db, "schools", schoolId), {
        name: name,
        domain: domain,
        logo: logo,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      showSchoolStatus(`🏫 ¡Institución "${name}" guardada con éxito! Dominio: ${domain || 'Sin dominio'}`, "#15803d", "#f0fdf4");
      resetSchoolForm();

      await loadSchools();
    } catch (error) {
      console.error("Error al guardar escuela:", error);
      showSchoolStatus("❌ Error al guardar la institución.", "#b91c1c", "#fef2f2");
    }
  });
}

function showSchoolStatus(message, textColor, bgColor) {
  if (!schoolStatusMsg) return;
  schoolStatusMsg.style.display = 'block';
  schoolStatusMsg.style.color = textColor;
  schoolStatusMsg.style.backgroundColor = bgColor;
  schoolStatusMsg.style.border = `1px solid ${textColor}`;
  schoolStatusMsg.textContent = message;

  setTimeout(() => {
    schoolStatusMsg.style.display = 'none';
  }, 6000);
}

// 7. Guardar usuario individual con Rol (Estudiante, Profesor, Admin)
if (formRole) {
  formRole.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    const school = userSchoolSelect ? userSchoolSelect.value : 'Sin Institución';
    const role = document.getElementById('user-role').value;

    if (!school) {
      showOnScreenMessage("⚠️ Por favor, selecciona una institución.", "#b91c1c", "#fef2f2");
      return;
    }

    const selectedCourses = [];
    const checkboxes = document.querySelectorAll('input[name="courses"]:checked');
    checkboxes.forEach(cb => selectedCourses.push(cb.value));

    showOnScreenMessage("⏳ Guardando accesos y notificando...", "#2563eb", "#eff6ff");

    try {
      await setDoc(doc(db, "assigned_roles", email), {
        email: email,
        school: school,
        role: role,
        allowedCourses: selectedCourses,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const originUrl = window.location.origin;
      const coursesLinksFormatted = selectedCourses.map(id => {
        const course = COURSES_CATALOG[id];
        return course ? `- ${course.title}: ${originUrl}/${course.folderPath}` : '';
      }).filter(Boolean).join('\n');

      if (typeof emailjs !== 'undefined' && selectedCourses.length > 0) {
        emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            to_email: email,
            school_name: school,
            courses_list: coursesLinksFormatted,
            dashboard_url: `${originUrl}/dashboard.html`
          },
          EMAILJS_PUBLIC_KEY
        ).then(() => {
          showOnScreenMessage(`✉️ ¡Correo enviado con éxito a ${email}! Registrado como ${role} en ${school}.`, "#15803d", "#f0fdf4");
        }).catch(err => {
          console.error("Error EmailJS:", err);
          showOnScreenMessage(`⚠️ Accesos guardados en Firestore, pero hubo un detalle al enviar el correo.`, "#b45309", "#fffbeb");
        });
      } else {
        showOnScreenMessage(`✅ Datos guardados para ${email}.`, "#15803d", "#f0fdf4");
      }

      resetForm();
      await refreshUsersTable();
    } catch (error) {
      console.error("Error al guardar:", error);
      showOnScreenMessage("❌ Error al actualizar los accesos en Firestore.", "#b91c1c", "#fef2f2");
    }
  });
}

function showOnScreenMessage(message, textColor, bgColor) {
  if (!statusMsg) return;
  statusMsg.style.display = 'block';
  statusMsg.style.color = textColor;
  statusMsg.style.backgroundColor = bgColor;
  statusMsg.style.border = `1px solid ${textColor}`;
  statusMsg.textContent = message;

  setTimeout(() => {
    statusMsg.style.display = 'none';
  }, 6000);
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
      if (userSchoolSelect) userSchoolSelect.value = data.school || '';

      const allowedCourses = data.allowedCourses || [];
      checkboxes.forEach(cb => cb.checked = allowedCourses.includes(cb.value));

      showOnScreenMessage(`Modificando accesos para ${email}.`, "#2563eb", "#eff6ff");
    }
  } catch (error) {
    console.error("Error al consultar permisos:", error);
  }
}

if (emailInput) {
  emailInput.addEventListener('input', (e) => {
    const value = e.target.value.trim().toLowerCase();
    if (value.includes('@')) fetchUserPermissions(value);
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
    if (statusMsg) statusMsg.style.display = 'none';
  });
}

// Modal de Simulación
if (btnOpenPreviewModal) {
  btnOpenPreviewModal.addEventListener('click', () => {
    renderPreviewStudentsList();
    previewModal.removeAttribute('hidden');
  });
}

if (btnClosePreviewModal) {
  btnClosePreviewModal.addEventListener('click', () => {
    previewModal.setAttribute('hidden', '');
  });
}

window.addEventListener('click', (e) => {
  if (e.target === previewModal) previewModal.setAttribute('hidden', '');
});

if (btnPreviewGeneric) {
  btnPreviewGeneric.addEventListener('click', () => {
    window.location.href = 'dashboard.html?preview=student';
  });
}

function renderPreviewStudentsList() {
  if (!previewStudentsList) return;
  const query = searchPreviewInput ? searchPreviewInput.value.trim().toLowerCase() : '';
  const selectedSchool = modalFilterSchoolSelect ? modalFilterSchoolSelect.value : 'ALL';

  previewStudentsList.innerHTML = '';

  const filtered = allRegisteredStudents.filter(s => {
    const matchesEmail = s.email.toLowerCase().includes(query);
    const matchesSchool = selectedSchool === 'ALL' || s.school === selectedSchool;
    return matchesEmail && matchesSchool;
  });

  if (filtered.length === 0) {
    previewStudentsList.innerHTML = `<p class="text-center">No se encontraron estudiantes.</p>`;
    return;
  }

  filtered.forEach(student => {
    const item = document.createElement('div');
    item.className = 'preview-student-item';
    item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer;';
    item.innerHTML = `
      <div>
        <div style="font-weight: bold;">${student.email}</div>
        <div style="font-size: 0.8rem; opacity: 0.8;">🏫 ${student.school} | ${student.allowedCourses.length} curso(s)</div>
      </div>
      <button type="button" class="btn-primary btn-sm">Ver Vista</button>
    `;

    item.addEventListener('click', () => {
      window.location.href = `dashboard.html?preview=student&previewEmail=${encodeURIComponent(student.email)}`;
    });

    previewStudentsList.appendChild(item);
  });
}

if (searchPreviewInput) searchPreviewInput.addEventListener('input', renderPreviewStudentsList);
if (modalFilterSchoolSelect) modalFilterSchoolSelect.addEventListener('change', renderPreviewStudentsList);