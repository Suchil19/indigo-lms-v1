import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { COURSES_CATALOG } from './courses-data.js';
import { initNavbar } from './navbar.js';

initNavbar();

const teacherSchoolBadge = document.getElementById('teacher-school-badge');
const tableBody = document.getElementById('teacher-students-table-body');
const teacherStatusMsg = document.getElementById('teacher-status-msg');
const filterClassroomSelect = document.getElementById('filter-classroom');

const selectAllCheckbox = document.getElementById('select-all-classroom-students');
const teacherBatchContainer = document.getElementById('teacher-batch-container');
const batchClassroomInput = document.getElementById('batch-classroom-input');
const btnApplyClassroomBatch = document.getElementById('btn-apply-classroom-batch');
const teacherSelectedCount = document.getElementById('teacher-selected-count');

let currentTeacherSchool = '';
let currentTeacherDomain = '';
let schoolStudents = [];
let selectedStudentEmails = new Set();
let availableClassrooms = new Set();

// 1. Validar sesión, obtener la institución y el DOMINIO del Profesor
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const teacherEmail = user.email.toLowerCase();

  try {
    const assignedRef = doc(db, "assigned_roles", teacherEmail);
    const assignedSnap = await getDoc(assignedRef);

    let userRole = 'student';

    if (assignedSnap.exists()) {
      const data = assignedSnap.data();
      currentTeacherSchool = data.school || 'Sin Institución Asignada';
      userRole = data.role || 'student';
    }

    // Redirigir a estudiantes si intentan acceder a esta vista
    if (userRole === 'student') {
      window.location.href = 'dashboard.html';
      return;
    }

    if (currentTeacherSchool === 'Sin Institución Asignada') {
      if (teacherSchoolBadge) teacherSchoolBadge.textContent = 'Sin Institución';
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No tienes una institución asignada a tu perfil de profesor. Contacta al administrador.</td></tr>`;
      return;
    }

    // Obtener el dominio oficial registrado para la institución del profesor
    await fetchTeacherSchoolDomain();

    if (teacherSchoolBadge) {
      const domainDisplay = currentTeacherDomain ? ` (${currentTeacherDomain})` : '';
      teacherSchoolBadge.textContent = `${currentTeacherSchool}${domainDisplay}`;
    }

    // Cargar únicamente los alumnos vinculados por el dominio o la escuela
    await loadDomainStudentsOnly();

  } catch (error) {
    console.error("Error al validar perfil de profesor:", error);
    showTeacherStatus("❌ Error al obtener tu institución asignada.", "#b91c1c", "#fef2f2");
  }
});

// Consulta el dominio registrado de la escuela en la colección "schools"
async function fetchTeacherSchoolDomain() {
  try {
    const schoolsSnap = await getDocs(collection(db, "schools"));
    schoolsSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.name && data.name.trim().toLowerCase() === currentTeacherSchool.trim().toLowerCase()) {
        let dom = (data.domain || '').trim().toLowerCase();
        if (dom.startsWith('@')) dom = dom.substring(1);
        currentTeacherDomain = dom;
      }
    });
  } catch (err) {
    console.error("Error al consultar el dominio de la escuela:", err);
  }
}

// 2. Cargar ÚNICAMENTE los alumnos cuyo correo coincida con el DOMINIO de la institución
async function loadDomainStudentsOnly() {
  try {
    const assignedSnapshot = await getDocs(collection(db, "assigned_roles"));
    schoolStudents = [];
    selectedStudentEmails.clear();
    availableClassrooms.clear();
    updateBatchUI();

    assignedSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const email = (data.email || docSnap.id).trim().toLowerCase();
      const studentSchool = data.school || 'Sin Institución';
      const userRole = data.role || 'student';

      // Extraer dominio del correo del alumno
      const studentEmailDomain = email.includes('@') ? email.split('@')[1] : '';

      // FILTRO POR DOMINIO E INSTITUCIÓN:
      // Debe ser un alumno (role === 'student' o no definido)
      // Y debe coincidir por dominio del correo O por el nombre explícito de la escuela
      const matchesDomain = currentTeacherDomain && (studentEmailDomain === currentTeacherDomain || studentEmailDomain.endsWith(`.${currentTeacherDomain}`));
      const matchesSchoolName = studentSchool.trim().toLowerCase() === currentTeacherSchool.trim().toLowerCase();

      if (userRole === 'student' && (matchesDomain || matchesSchoolName)) {
        const classroom = data.classroom || 'Sin Salón';
        const allowedCourses = data.allowedCourses || [];

        schoolStudents.push({ email, classroom, allowedCourses });
        if (classroom !== 'Sin Salón') {
          availableClassrooms.add(classroom);
        }
      }
    });

    updateClassroomFilterDropdown();
    renderFilteredTable();

  } catch (error) {
    console.error("Error al consultar alumnos del dominio:", error);
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center">Error al consultar los alumnos de tu dominio.</td></tr>`;
  }
}

function updateClassroomFilterDropdown() {
  if (!filterClassroomSelect) return;
  const currentVal = filterClassroomSelect.value;

  filterClassroomSelect.innerHTML = '<option value="ALL">Todos los salones</option><option value="NONE">Sin Salón Asignado</option>';

  Array.from(availableClassrooms).sort().forEach(room => {
    const opt = document.createElement('option');
    opt.value = room;
    opt.textContent = room;
    filterClassroomSelect.appendChild(opt);
  });

  if (Array.from(availableClassrooms).includes(currentVal) || currentVal === 'NONE') {
    filterClassroomSelect.value = currentVal;
  }
}

// 3. Renderizar la tabla de alumnos filtrada por salón
function renderFilteredTable() {
  if (!tableBody) return;
  const selectedClassroom = filterClassroomSelect ? filterClassroomSelect.value : 'ALL';
  tableBody.innerHTML = '';
  selectedStudentEmails.clear();
  updateBatchUI();

  if (selectAllCheckbox) selectAllCheckbox.checked = false;

  const filtered = schoolStudents.filter(student => {
    if (selectedClassroom === 'ALL') return true;
    if (selectedClassroom === 'NONE') return student.classroom === 'Sin Salón';
    return student.classroom === selectedClassroom;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay alumnos registrados con el dominio de tu institución en este salón.</td></tr>`;
    return;
  }

  filtered.forEach(student => {
    const tr = document.createElement('tr');

    const coursesHTML = student.allowedCourses.map(id => {
      const title = COURSES_CATALOG[id] ? COURSES_CATALOG[id].title : id;
      return `<span class="course-tag-item">${title}</span>`;
    }).join(' ') || '<em class="text-center">Sin cursos</em>';

    tr.innerHTML = `
      <td class="text-center" style="text-align: center;">
        <input type="checkbox" class="student-select-checkbox" data-email="${student.email}">
      </td>
      <td><strong>${student.email}</strong></td>
      <td><span class="school-tag" style="background: rgba(37, 99, 235, 0.1); color: #2563eb;">${student.classroom}</span></td>
      <td>${coursesHTML}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <input type="text" class="single-classroom-input" placeholder="Nuevo salón..." style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-size: 0.85rem; width: 130px;">
          <button type="button" class="btn-primary btn-sm btn-save-single-room" data-email="${student.email}">Guardar</button>
        </div>
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

    const btnSaveSingle = tr.querySelector('.btn-save-single-room');
    const inputSingle = tr.querySelector('.single-classroom-input');

    btnSaveSingle.addEventListener('click', async () => {
      const newRoom = inputSingle.value.trim();
      if (!newRoom) return;

      try {
        await setDoc(doc(db, "assigned_roles", student.email), {
          classroom: newRoom,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        showTeacherStatus(`🏫 Alumno ${student.email} asignado al salón "${newRoom}".`, "#15803d", "#f0fdf4");
        await loadDomainStudentsOnly();

      } catch (err) {
        console.error("Error al actualizar salón:", err);
        showTeacherStatus("❌ Error al mover al estudiante de salón.", "#b91c1c", "#fef2f2");
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
  if (teacherSelectedCount) teacherSelectedCount.textContent = count;
  if (teacherBatchContainer) {
    teacherBatchContainer.style.display = count > 0 ? 'flex' : 'none';
  }
}

// 4. Mover selección múltiple a un Salón
if (btnApplyClassroomBatch) {
  btnApplyClassroomBatch.addEventListener('click', async () => {
    const count = selectedStudentEmails.size;
    const targetRoom = batchClassroomInput ? batchClassroomInput.value.trim() : '';

    if (count === 0) return;
    if (!targetRoom) {
      alert("Por favor, escribe el nombre del salón o grupo destino.");
      return;
    }

    showTeacherStatus(`⏳ Moviendo ${count} alumnos a "${targetRoom}"...`, "#2563eb", "#eff6ff");

    try {
      const batch = writeBatch(db);

      selectedStudentEmails.forEach(email => {
        const studentRef = doc(db, "assigned_roles", email);
        batch.set(studentRef, {
          classroom: targetRoom,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();

      showTeacherStatus(`🎉 ¡${count} alumnos movidos al salón "${targetRoom}" con éxito!`, "#15803d", "#f0fdf4");
      if (batchClassroomInput) batchClassroomInput.value = '';

      await loadDomainStudentsOnly();

    } catch (error) {
      console.error("Error en asignación masiva de salón:", error);
      showTeacherStatus("❌ Error al mover los alumnos de salón.", "#b91c1c", "#fef2f2");
    }
  });
}

if (filterClassroomSelect) {
  filterClassroomSelect.addEventListener('change', renderFilteredTable);
}

function showTeacherStatus(message, textColor, bgColor) {
  if (!teacherStatusMsg) return;
  teacherStatusMsg.style.display = 'block';
  teacherStatusMsg.style.color = textColor;
  teacherStatusMsg.style.backgroundColor = bgColor;
  teacherStatusMsg.style.border = `1px solid ${textColor}`;
  teacherStatusMsg.textContent = message;

  setTimeout(() => {
    teacherStatusMsg.style.display = 'none';
  }, 6000);
}