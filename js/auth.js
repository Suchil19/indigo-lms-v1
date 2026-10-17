import { auth, db } from './firebase-config.js';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const btnGoogle = document.getElementById('btn-google-login');
const errorDiv = document.getElementById('auth-error');

export async function syncUserProfile(user) {
  try {
    const emailKey = user.email.toLowerCase();
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);

    const assignedRoleRef = doc(db, "assigned_roles", emailKey);
    const assignedSnap = await getDoc(assignedRoleRef);

    let finalRole = "student";
    if (assignedSnap.exists() && assignedSnap.data().role) {
      finalRole = assignedSnap.data().role;
    } else if (userSnap.exists() && userSnap.data().role) {
      finalRole = userSnap.data().role;
    }

    // Datos base de Google
    const googlePhoto = user.photoURL || '';
    const googleName = user.displayName || user.email;

    if (!userSnap.exists()) {
      // Guardado inicial con foto de Gmail/Google
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: googleName,
        alias: '',
        photoURL: googlePhoto,
        googlePhotoURL: googlePhoto,
        role: finalRole,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });
    } else {
      // Si ya existe, actualizamos última conexión sin borrar alias o foto personalizada
      await setDoc(userDocRef, {
        lastLogin: new Date().toISOString()
      }, { merge: true });
    }

    return finalRole;
  } catch (error) {
    console.error("Error al sincronizar el perfil:", error);
    return "student";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const role = await syncUserProfile(user);
    if (role === "admin") {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  }
});

if (btnGoogle) {
  btnGoogle.addEventListener('click', async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error en la autenticación:", error);
      if (errorDiv) {
        errorDiv.textContent = "Ocurrió un error al iniciar sesión.";
        errorDiv.hidden = false;
      }
    }
  });
}