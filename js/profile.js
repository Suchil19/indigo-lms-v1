import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initNavbar } from './navbar.js';

// Inicializar el Menú Desplegable con soporte de Tema y Autenticación
initNavbar();

const formProfile = document.getElementById('form-profile');
const nameInput = document.getElementById('profile-name');
const aliasInput = document.getElementById('profile-alias');
const photoInput = document.getElementById('profile-photo-url');
const avatarPreview = document.getElementById('avatar-preview');
const btnGooglePhoto = document.getElementById('btn-use-google-photo');
const statusMsg = document.getElementById('profile-status-msg');

let currentUser = null;
let googlePhotoURL = '';
let currentRole = 'student';

// 1. Escuchar cambios de sesión y cargar los datos del Admin o Estudiante
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = user;
  googlePhotoURL = user.photoURL || '';

  try {
    const userDocRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      currentRole = data.role || 'student';
      
      nameInput.value = data.displayName || user.displayName || user.email;
      aliasInput.value = data.alias || '';
      
      googlePhotoURL = data.googlePhotoURL || user.photoURL || '';
      const currentPhoto = data.photoURL || googlePhotoURL;
      
      photoInput.value = currentPhoto;
      avatarPreview.src = currentPhoto || 'https://via.placeholder.com/100';
    } else {
      // Si el perfil no existe aún en la colección 'users', autocompletar con los datos de Google
      nameInput.value = user.displayName || user.email;
      photoInput.value = googlePhotoURL;
      avatarPreview.src = googlePhotoURL || 'https://via.placeholder.com/100';
    }
  } catch (error) {
    console.error("Error al cargar los datos del perfil:", error);
  }
});

// Previsualización de la foto en tiempo real al ingresar la URL
if (photoInput) {
  photoInput.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    avatarPreview.src = url || 'https://via.placeholder.com/100';
  });
}

// Botón para restaurar la foto original de la cuenta de Google
if (btnGooglePhoto) {
  btnGooglePhoto.addEventListener('click', () => {
    if (googlePhotoURL) {
      photoInput.value = googlePhotoURL;
      avatarPreview.src = googlePhotoURL;
    }
  });
}

// 2. Guardar actualizaciones (Funciona para Admin y Estudiantes)
if (formProfile) {
  formProfile.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const newName = nameInput.value.trim();
    const newAlias = aliasInput.value.trim();
    const newPhoto = photoInput.value.trim();

    try {
      const userDocRef = doc(db, "users", currentUser.uid);

      // Usamos setDoc con { merge: true } para crear o actualizar el documento sin fallar
      await setDoc(userDocRef, {
        uid: currentUser.uid,
        email: currentUser.email.toLowerCase(),
        displayName: newName,
        alias: newAlias,
        photoURL: newPhoto,
        googlePhotoURL: googlePhotoURL,
        role: currentRole,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      statusMsg.style.color = '#15803d';
      statusMsg.textContent = '¡Perfil actualizado correctamente!';

      // Actualizar inmediatamente la barra de navegación superior
      const displayNameToShow = newAlias ? `${newName} (${newAlias})` : newName;
      const navUserName = document.getElementById('nav-user-name');
      const navUserAvatar = document.getElementById('nav-user-avatar');

      if (navUserName) navUserName.textContent = displayNameToShow;
      if (navUserAvatar) navUserAvatar.src = newPhoto || 'https://via.placeholder.com/32';

    } catch (error) {
      console.error("Error al guardar el perfil en Firestore:", error);
      statusMsg.style.color = '#b91c1c';
      statusMsg.textContent = 'Ocurrió un error al guardar los cambios. Revisa la consola o las reglas de Firestore.';
    }
  });
}