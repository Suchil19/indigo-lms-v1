import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const userNameSpan = document.getElementById('user-name');
const btnLogout = document.getElementById('btn-logout');
const formRole = document.getElementById('form-assign-role');
const emailInput = document.getElementById('user-email');
const dataList = document.getElementById('users-datalist');
const statusMsg = document.getElementById('role-status-msg');

let registeredUsers = [];

// 1. Verificar sesión y cargar la lista general de usuarios para el autocompletado
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const userDocRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userDocRef);

  if (!docSnap.exists() || docSnap.data().role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  if (userNameSpan) {
    userNameSpan.textContent = `${user.displayName} (Admin)`;
  }

  // Cargar catálogo de usuarios para la búsqueda
  loadUsersDatalist();
});

// Carga los correos disponibles desde Firestore a la lista de búsqueda
async function loadUsersDatalist() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    dataList.innerHTML = '';
    registeredUsers = [];

    usersSnapshot.forEach((docSnap) => {
      const userData = docSnap.data();
      if (userData.email) {
        registeredUsers.push(userData.email.toLowerCase());
        const option = document.createElement('option');
        option.value = userData.email.toLowerCase();
        dataList.appendChild(option);
      }
    });
  } catch (error) {
    console.error("Error al cargar la lista de usuarios:", error);
  }
}

// 2. Función para buscar y cargar los cursos asignados a un correo dado
async function fetchUserPermissions(email) {
  if (!email) return;

  const checkboxes = document.querySelectorAll('input[name="courses"]');
  // Desmarcar por defecto antes de cargar
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
      statusMsg.textContent = `Permisos cargados para ${email}. Modifica y guarda las casillas según corresponda.`;
    } else {
      statusMsg.style.color = '#4b5563';
      statusMsg.textContent = `El correo ${email} no tiene permisos previos configurados. Selecciona sus cursos.`;
    }
  } catch (error) {
    console.error("Error al obtener los permisos del usuario:", error);
  }
}

// Escuchar cambios de escritura/selección en el buscador
if (emailInput) {
  emailInput.addEventListener('input', (e) => {
    const value = e.target.value.trim().toLowerCase();
    // Si el valor coincide exactamente con un correo de la lista o es un correo válido
    if (value.includes('@')) {
      fetchUserPermissions(value);
    }
  });

  emailInput.addEventListener('blur', (e) => {
    const value = e.target.value.trim().toLowerCase();
    if (value) {
      fetchUserPermissions(value);
    }
  });
}

// 3. Guardar cambios en Firestore
if (formRole) {
  formRole.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const role = document.getElementById('user-role').value;

    const selectedCourses = [];
    const checkboxes = document.querySelectorAll('input[name="courses"]:checked');
    checkboxes.forEach(cb => selectedCourses.push(cb.value));

    try {
      await setDoc(doc(db, "assigned_roles", email), {
        email: email,
        role: role,
        allowedCourses: selectedCourses,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      statusMsg.style.color = '#15803d';
      statusMsg.textContent = `Guardado con éxito: ${email} tiene acceso a ${selectedCourses.length} curso(s).`;
      
      // Recargar la lista de autocompletado si era un usuario nuevo
      loadUsersDatalist();
    } catch (error) {
      console.error("Error al guardar permisos:", error);
      statusMsg.style.color = '#b91c1c';
      statusMsg.textContent = "Error al actualizar los accesos en Firestore.";
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}