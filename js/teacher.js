import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentTeacherData = null;
let domainStudents = [];

export function initTeacherPanel() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.warn("Usuario no autenticado, redirigiendo a index.html");
      window.location.href = 'index.html';
      return;
    }

    // Normalizar correo a minúsculas
    const teacherEmail = user.email.trim().toLowerCase();
    console.log("Iniciando verificación para el profesor:", teacherEmail);

    try {
      // 1. Consultar el documento del profesor en assigned_roles
      const teacherDocRef = doc(db, "assigned_roles", teacherEmail);
      const teacherSnap = await getDoc(teacherDocRef);

      if (!teacherSnap.exists()) {
        console.error(`No existe el documento 'assigned_roles/${teacherEmail}' en Firestore.`);
        alert(`Tu cuenta (${teacherEmail}) no está registrada en 'assigned_roles'. Contacta al Administrador.`);
        window.location.href = 'dashboard.html';
        return;
      }

      currentTeacherData = teacherSnap.data();
      console.log("Datos del profesor recuperados:", currentTeacherData);

      const userRole = (currentTeacherData.role || '').toLowerCase();
      if (userRole !== 'teacher' && userRole !== 'admin') {
        alert(`Permiso denegado. Tu rol actual es: '${userRole}'. Se requiere 'teacher' o 'admin'.`);
        window.location.href = 'dashboard.html';
        return;
      }

      // Extraer el dominio del profesor (ej. "@ipn.mx")
      const domainMatch = teacherEmail.match(/@[\w.-]+/);
      const teacherDomain = domainMatch ? domainMatch[0].toLowerCase() : '';

      // Actualizar encabezados visuales
      const teacherSchoolLabel = document.getElementById('teacher-school-label');
      const teacherDomainLabel = document.getElementById('teacher-domain-label');
      
      if (teacherSchoolLabel) teacherSchoolLabel.textContent = currentTeacherData.school || 'Institución Asignada';
      if (teacherDomainLabel) teacherDomainLabel.textContent = teacherDomain || 'Dominio General';

      // 2. Cargar todos los alumnos pertenecientes al dominio del profesor
      await loadStudentsByDomain(teacherDomain);

    } catch (err) {
      console.error("Error crítico al inicializar el panel del profesor:", err);
      alert("Error de conexión con la base de datos: " + err.message);
    }
  });
}

// Cargar y filtrar estudiantes por dominio en JavaScript (sin requerir índices compuestos)
async function loadStudentsByDomain(teacherDomain) {
  const studentsTableBody = document.getElementById('teacher-students-tbody');
  const totalStudentsCount = document.getElementById('total-students-count');
  if (!studentsTableBody) return;

  studentsTableBody.innerHTML = `<tr><td colspan="5" class="text-center">Cargando lista de alumnos (${teacherDomain})...</td></tr>`;

  try {
    // Obtener todos los documentos de assigned_roles
    const querySnapshot = await getDocs(collection(db, "assigned_roles"));

    domainStudents = [];

    querySnapshot.forEach((docSnap) => {
      const studentData = docSnap.data();
      const studentEmail = (studentData.email || docSnap.id).trim().toLowerCase();
      const studentRole = (studentData.role || 'student').toLowerCase();

      // FILTRO DE SEGURIDAD Y DOMINIO:
      // Debe ser rol 'student' y su correo debe terminar en el dominio del profesor (ej. @ipn.mx)
      if (studentRole === 'student' && teacherDomain && studentEmail.endsWith(teacherDomain)) {
        domainStudents.push({
          id: docSnap.id,
          ...studentData,
          email: studentEmail
        });
      }
    });

    console.log(`Se encontraron ${domainStudents.length} alumnos para el dominio ${teacherDomain}:`, domainStudents);

    if (totalStudentsCount) {
      totalStudentsCount.textContent = domainStudents.length;
    }

    renderStudentsTable(domainStudents, teacherDomain);

  } catch (err) {
    console.error("Error al obtener la lista de alumnos desde Firestore:", err);
    studentsTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar la lista de alumnos: ${err.message}</td></tr>`;
  }
}

// Renderizar la tabla con los estudiantes filtrados
function renderStudentsTable(students, teacherDomain) {
  const tbody = document.getElementById('teacher-students-tbody');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center" style="padding: 20px;">
          No se encontraron alumnos registrados con el dominio <strong>${teacherDomain}</strong> en la base de datos.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = '';
  students.forEach((student) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="student-checkbox" value="${student.id}"></td>
      <td><strong>${student.email}</strong></td>
      <td>
        <span class="badge badge-info">${student.school || currentTeacherData.school || 'General'}</span>
      </td>
      <td>
        <span class="badge ${student.classroom ? 'badge-success' : 'badge-warning'}">
          ${student.classroom || 'Sin Salón'}
        </span>
      </td>
      <td>
        <button type="button" class="btn btn-sm btn-outline btn-edit-classroom" data-email="${student.id}" data-classroom="${student.classroom || ''}">
          ✏️ Asignar Salón
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  setupBatchActions();
}

// Asignación de salones/grupos en lote por el profesor
function setupBatchActions() {
  const btnAssignClassroomBatch = document.getElementById('btn-assign-classroom-batch');
  const inputClassroomBatch = document.getElementById('input-classroom-batch');
  const selectAllCheckbox = document.getElementById('select-all-students');

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.student-checkbox');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
  }

  if (btnAssignClassroomBatch && inputClassroomBatch) {
    btnAssignClassroomBatch.addEventListener('click', async () => {
      const newClassroom = inputClassroomBatch.value.trim();
      if (!newClassroom) {
        alert("Por favor ingresa un nombre o número de salón.");
        return;
      }

      const selectedCheckboxes = document.querySelectorAll('.student-checkbox:checked');
      if (selectedCheckboxes.length === 0) {
        alert("Selecciona al menos un alumno de la lista.");
        return;
      }

      if (!confirm(`¿Deseas asignar el salón "${newClassroom}" a ${selectedCheckboxes.length} alumno(s)?`)) {
        return;
      }

      try {
        const batch = writeBatch(db);
        selectedCheckboxes.forEach((cb) => {
          const studentEmail = cb.value;
          const studentRef = doc(db, "assigned_roles", studentEmail);
          batch.update(studentRef, {
            classroom: newClassroom,
            school: currentTeacherData.school || 'Institución'
          });
        });

        await batch.commit();
        alert("¡Salón asignado correctamente!");
        inputClassroomBatch.value = '';

        const domainMatch = currentTeacherData.email ? currentTeacherData.email.match(/@[\w.-]+/) : null;
        const teacherDomain = domainMatch ? domainMatch[0].toLowerCase() : '';
        await loadStudentsByDomain(teacherDomain);

      } catch (err) {
        console.error("Error al actualizar salones:", err);
        alert("Error al actualizar los salones: " + err.message);
      }
    });
  }
}

// Auto-inicialización al cargar el HTML
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('teacher.html')) {
    initTeacherPanel();
  }
});