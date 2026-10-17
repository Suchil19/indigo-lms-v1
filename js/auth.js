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

    // 1. Si el usuario YA existe en la base de datos y YA es admin, MANTENER el rol de admin
    if (userSnap.exists() && userSnap.data().role === 'admin') {
      await setDoc(userDocRef, {
        lastLogin: new Date().toISOString()
      }, { merge: true });
      return 'admin';
    }

    // 2. Si no es admin en "users", buscar si tiene un rol pre-asignado en "assigned_roles"
    const assignedRoleRef = doc(db, "assigned_roles", emailKey);
    const assignedSnap = await getDoc(assignedRoleRef);

    let finalRole = "student"; // Valor por defecto

    if (assignedSnap.exists() && assignedSnap.data().role) {
      finalRole = assignedSnap.data().role;
    } else if (userSnap.exists() && userSnap.data().role) {
      // Conservar el rol existente si no hay cambio en assigned_roles
      finalRole = userSnap.data().role;
    }

    // 3. Actualizar el documento en Firestore sin perder el rol
    await setDoc(userDocRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: finalRole,
      lastLogin: new Date().toISOString()
    }, { merge: true });

    return finalRole;
  } catch (error) {
    console.error("Error al sincronizar el perfil:", error);
    return "student";
  }
}

// Redirección según estado de autenticación
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